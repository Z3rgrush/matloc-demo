/* ARGUS agent + governance engine.
 *
 * Layering mirrors §7.1 of the scoping plan:
 *   - "Agents" (Planner, Budget steward, Monitor, Optimizer, Reporter) REASON and emit
 *     structured proposals. In production these are LLM calls with tools; here they are
 *     deterministic heuristics seeded from the Appendix A playbook so every run is repeatable.
 *   - The POLICY ENGINE is plain deterministic code. It validates every proposal and is the
 *     only thing that decides who must approve and whether an action may execute.
 *   - PLATFORM ADAPTERS execute approved actions only, then read back to verify.
 *
 * No function in this file touches the DOM, so it can be unit-tested in Node.
 */
(function (root) {
  "use strict";
  const D = root.ARGUS_DATA || (typeof require !== "undefined" ? require("./data.js") : null);

  // ---------- small utilities ----------
  const DAY = 86400000;
  const toDate = (s) => new Date(s + "T12:00:00Z");
  const iso = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => iso(new Date(toDate(s).getTime() + n * DAY));
  const daysBetween = (a, b) => Math.round((toDate(b) - toDate(a)) / DAY);
  const sum = (arr, f) => arr.reduce((t, x) => t + (f ? f(x) : x), 0);
  const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
  const round = (x, n = 0) => { const p = Math.pow(10, n); return Math.round(x * p) / p; };

  function hash(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); }
    return h >>> 0;
  }
  // deterministic noise in [lo, hi] for a given key
  function noise(key, lo = 0.9, hi = 1.1) {
    let t = hash(key) + 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    const r = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    return lo + r * (hi - lo);
  }

  const DEFAULT_SETTINGS = {
    watchPct: 0.10,          // §7.7 Watch tier
    alertPct: 0.20,          // §7.7 Alert tier
    capTolerance: 0.02,      // allowed platform overdelivery before hard cap
    autoPause: true,         // §7.4 emergency safety stop (configurable, default on)
    minClicksPerArm: 300,    // Appendix A evidence threshold
    maxStepChange: 0.25,     // Appendix A: cap single-step budget changes
    directorThreshold: 5000, // $ impact above which a director must also approve
    lowRiskMarketerLimit: 1000,
    proposalTtlDays: 3
  };

  // ---------- title / campaign helpers ----------
  const titleById = (id) => D.TITLES.find((t) => t.id === id);
  const imprintById = (id) => D.IMPRINTS.find((i) => i.id === id);

  // Publication-date pacing curve (§7.7, Appendix A): pre-order builds, launch week
  // concentrates, sustain shifts to efficiency. Backlist pushes are flat.
  function curveWeight(campaign, date) {
    if (campaign.objective === "backlist") return 1;
    const t = titleById(campaign.titleId);
    const d = daysBetween(t.pubDate, date);
    if (d < -14) return 0.55;
    if (d < 0) return 0.55 + (0.45 * (d + 14)) / 14; // ramp into launch
    if (d === 0) return 2.9;
    if (d <= 6) return 2.4 - d * 0.12;
    if (d <= 13) return 1.2;
    return 0.8;
  }
  function phaseOf(campaign, date) {
    if (campaign.objective === "backlist") return "sustain";
    const d = daysBetween(titleById(campaign.titleId).pubDate, date);
    if (d < 0) return "pre-order";
    if (d <= 6) return "launch week";
    return "sustain";
  }
  function flightDates(c) {
    const n = daysBetween(c.start, c.end) + 1;
    return Array.from({ length: n }, (_, i) => addDays(c.start, i));
  }
  function curveTotal(c) { return sum(flightDates(c), (d) => curveWeight(c, d)); }
  function plannedDaily(c, platform, date) {
    const pb = c.platformBudget[platform] || 0;
    if (!pb) return 0;
    // Planned spend redistributes the *remaining* platform budget over remaining weight
    // only after a human-approved reallocation; otherwise use the original curve.
    return (pb * curveWeight(c, date)) / curveTotal(c);
  }

  // ---------- synthesize platform data (stand-in for connector pulls) ----------
  function dayMetrics(c, platform, date, spend) {
    const t = titleById(c.titleId);
    const b = D.BENCHMARKS[platform];
    const p = (c.perf && c.perf[platform]) || {};
    const dayN = daysBetween(c.start, date);
    const cpm = b.cpm * (p.cpmMult || 1) * noise(`${c.id}${platform}${date}cpm`, 0.92, 1.08);
    const imps = (spend / cpm) * 1000;
    const decay = clamp(1 - (p.ctrDecay || 0) * Math.max(0, dayN - 14), 0.55, 1);
    const ctr = (b.ctr * (p.ctrMult || 1) * decay * noise(`${c.id}${platform}${date}ctr`, 0.9, 1.1)) / 100;
    const clicks = imps * ctr;
    const actionRate = b.actionRate * (p.actionMult || 1) * noise(`${c.id}${platform}${date}ar`, 0.88, 1.12);
    const actions = clicks * actionRate;
    const sales = platform === "amazon" ? actions * t.price * 1.08 : null; // platform-attributed only
    const freq = 1.3 + Math.min(2.6, dayN * 0.045) * (p.ctrDecay ? 1.4 : 1);
    return { date, spend, imps, clicks, actions, sales, freq, ctrBase: ctr / decay };
  }

  function makeState() {
    const today = D.DEMO_TODAY;
    const campaigns = D.CAMPAIGNS.map((cfg) => {
      const c = JSON.parse(JSON.stringify(cfg));
      c.platformBudget = {};
      c.platforms = {};
      D.PLATFORM_ORDER.forEach((p) => {
        c.platformBudget[p] = Math.round(c.budget * (c.alloc[p] || 0));
        c.platforms[p] = { status: c.alloc[p] ? "active" : "off", daily: [], deliver: c.deliver[p] || 0 };
      });
      c.creatives = JSON.parse(JSON.stringify(D.CREATIVES[c.id] || [])).map((x) => ({ ...x, status: "active" }));
      // backfill history up to yesterday (or flight end)
      const last = c.status === "completed" ? c.end : addDays(today, -1);
      flightDates(c).filter((d) => d <= last).forEach((d) => simulateDay(c, d));
      return c;
    });
    const s = {
      today, campaigns, proposals: [], blocked: [], alerts: [], audit: [], activity: [],
      settings: { ...DEFAULT_SETTINGS }, seq: 100, launched: [], injectSpike: null, killSwitch: false
    };
    // seed audit log with history so the log is not empty on first open
    s.audit.push(
      { ts: "2026-10-01T09:02:00Z", actor: "human", who: "Imprint marketer, Bramble", action: "Approved plan", entity: "Daggerbound", before: "Draft", after: "Approved, $120,000" },
      { ts: "2026-10-01T09:20:00Z", actor: "system", who: "Builder", action: "Created campaigns (paused) on 4 platforms", entity: "Daggerbound", before: "-", after: "4 campaigns, verified by read-back" },
      { ts: "2026-10-12T10:05:00Z", actor: "human", who: "Marketing director", action: "Approved plan above $25k threshold", entity: "Salt and Signal", before: "Draft", after: "Approved, $45,000" },
      { ts: "2026-10-28T15:41:00Z", actor: "agent", who: "Optimizer", action: "Proposed: add 14 negative keywords", entity: "The Quiet Ledger · Amazon", before: "-", after: "Approved by marketer, executed" }
    );
    seedProposals(s);
    runMonitor(s, { silent: true });
    return s;
  }

  // Generate one day's delivery for every active platform of a campaign.
  function simulateDay(c, date, spike) {
    D.PLATFORM_ORDER.forEach((p) => {
      const pl = c.platforms[p];
      if (pl.status !== "active") return;
      let spend = plannedDaily(c, p, date) * pl.deliver * noise(`${c.id}${p}${date}`, 0.9, 1.1);
      if (spike && spike.platform === p) spend = spike.amount;
      pl.daily.push(dayMetrics(c, p, date, spend));
    });
  }

  // ---------- budget steward: pacing + forecast ----------
  function platformPacing(s, c, p) {
    const pl = c.platforms[p];
    const budget = c.platformBudget[p];
    if (!budget) return null;
    const spent = sum(pl.daily, (x) => x.spend);
    const asOf = c.status === "completed" ? c.end : addDays(s.today, -1);
    const dates = flightDates(c);
    const past = dates.filter((d) => d <= asOf);
    const future = dates.filter((d) => d > asOf);
    const planned = sum(past, (d) => plannedDaily(c, p, d));
    const ratio = planned ? spent / planned : 1;
    const recent = pl.daily.slice(-3);
    const recentPlanned = sum(recent, (x) => plannedDaily(c, p, x.date));
    const recentRatio = pl.status === "active" ? (recentPlanned ? sum(recent, (x) => x.spend) / recentPlanned : 1) : 0;
    const forecast = spent + sum(future, (d) => plannedDaily(c, p, d)) * recentRatio;
    const cap = budget * (1 + s.settings.capTolerance);
    return { platform: p, budget, spent, planned, ratio, forecast, cap, status: pl.status, remaining: budget - spent };
  }

  function campaignPacing(s, c) {
    const rows = D.PLATFORM_ORDER.map((p) => platformPacing(s, c, p)).filter(Boolean);
    const spent = sum(rows, (r) => r.spent);
    const planned = sum(rows, (r) => r.planned);
    const forecast = sum(rows, (r) => r.forecast);
    const dates = flightDates(c);
    const asOf = c.status === "completed" ? c.end : addDays(s.today, -1);
    const elapsedDays = dates.filter((d) => d <= asOf).length;
    const plannedFrac = sum(dates.filter((d) => d <= asOf), (d) => curveWeight(c, d)) / curveTotal(c);
    const res = {
      budget: c.budget, spent, planned, forecast, rows,
      ratio: planned ? spent / planned : 1, elapsedDays, totalDays: dates.length,
      elapsedFrac: elapsedDays / dates.length, plannedFrac, consumed: spent / c.budget
    };
    res.tier = tierFor(s, res, rows);
    return res;
  }

  // Guardrail tiers from §7.7.
  function tierFor(s, agg, rows) {
    const st = s.settings;
    if (rows.some((r) => r.status === "paused_safety")) return "capped";
    const worst = Math.max(...rows.map((r) => (r.status === "active" ? Math.abs(r.ratio - 1) : 0)), Math.abs(agg.ratio - 1));
    if (worst >= st.alertPct || (agg.consumed >= 0.8 && agg.elapsedFrac < 0.7)) return "alert";
    if (worst >= st.watchPct || Math.abs(agg.forecast / agg.budget - 1) >= st.watchPct) return "watch";
    return "ok";
  }
  function rowTier(s, r) {
    if (r.status === "paused_safety") return "capped";
    if (r.status !== "active") return "paused";
    const dev = Math.abs(r.ratio - 1);
    if (dev >= s.settings.alertPct) return "alert";
    if (dev >= s.settings.watchPct || Math.abs(r.forecast / r.budget - 1) >= s.settings.watchPct) return "watch";
    return "ok";
  }

  // last-N-day performance per platform
  function windowStats(c, p, n = 7) {
    const rows = c.platforms[p].daily.slice(-n);
    const spend = sum(rows, (x) => x.spend), clicks = sum(rows, (x) => x.clicks), actions = sum(rows, (x) => x.actions);
    return { spend, clicks, actions, cpa: actions ? spend / actions : Infinity, ctr: sum(rows, (x) => x.imps) ? clicks / sum(rows, (x) => x.imps) : 0 };
  }
  function totals(c, p) {
    const rows = p ? c.platforms[p].daily : D.PLATFORM_ORDER.flatMap((q) => c.platforms[q].daily);
    const o = { spend: 0, imps: 0, clicks: 0, actions: 0, sales: 0 };
    rows.forEach((x) => { o.spend += x.spend; o.imps += x.imps; o.clicks += x.clicks; o.actions += x.actions; o.sales += x.sales || 0; });
    o.ctr = o.imps ? o.clicks / o.imps : 0; o.cpa = o.actions ? o.spend / o.actions : 0;
    return o;
  }

  // Creative-level stats: split platform delivery across active creatives, apply fatigue.
  function creativeStats(c, cr) {
    const pl = c.platforms[cr.platform];
    const days = pl.daily.filter((x) => daysBetween(c.start, x.date) >= cr.launchedDay);
    const peers = c.creatives.filter((x) => x.platform === cr.platform).length || 1;
    const hookMult = { cover: 1.0, quote: 1.12, author: 1.05, trailer: 1.1, search: 1 }[cr.hook] || 1;
    const series = days.map((x, i) => {
      const f = clamp(1 - cr.fatigue * Math.max(0, i - 6), 0.45, 1);
      return { date: x.date, ctr: (x.ctrBase || x.clicks / x.imps) * hookMult * f * noise(cr.id + x.date, 0.95, 1.05), spend: x.spend / peers, imps: x.imps / peers };
    });
    const spend = sum(series, (x) => x.spend), imps = sum(series, (x) => x.imps);
    const clicks = sum(series, (x) => x.imps * x.ctr);
    const first = series.slice(0, 7), last = series.slice(-7);
    const ctrFirst = sum(first, (x) => x.ctr) / (first.length || 1), ctrLast = sum(last, (x) => x.ctr) / (last.length || 1);
    return { series, spend, imps, clicks, ctr: imps ? clicks / imps : 0, ctrDrop: ctrFirst ? 1 - ctrLast / ctrFirst : 0 };
  }

  // ---------- proposals ----------
  function newProposal(s, fields) {
    const p = Object.assign({
      proposal_id: "prop_0" + (++s.seq), status: "pending", created_at: s.today,
      expires_at: addDays(s.today, s.settings.proposalTtlDays), approvals: [], history: []
    }, fields);
    const c = s.campaigns.find((x) => x.id === p.campaign_id);
    p.title_id = c.titleId;
    const v = validateProposal(s, p);
    p.policy = v;
    p.requires_approval_from = v.approvers;
    p.risk = v.risk;
    if (!v.valid) { p.status = "blocked"; s.blocked.push(p); }
    else s.proposals.push(p);
    return p;
  }

  // Optimizer seed run: draws on current data so numbers in evidence are real.
  function seedProposals(s) {
    const glass = s.campaigns.find((c) => c.id === "cmp_dagger");
    const salt = s.campaigns.find((c) => c.id === "cmp_salt");
    const hearts = s.campaigns.find((c) => c.id === "cmp_hearts");
    const ledger = s.campaigns.find((c) => c.id === "cmp_ledger");

    // 1. Fatigue on Daggerbound cover-led Meta ad
    const cr = glass.creatives.find((x) => x.id === "cr_g1");
    const cs = creativeStats(glass, cr);
    newProposal(s, {
      campaign_id: glass.id, platform: "meta", action_type: "pause_creative", key: "fatigue_cr_g1",
      params: { creative_id: "cr_g1", rotate_in: "Swordheart fans carousel (pre-approved)" },
      summary: `Pause "${cr.name}" and rotate in the pre-approved Swordheart fans carousel`,
      evidence: [
        `CTR down ${round(cs.ctrDrop * 100)}% from its first 7 days to the last 7 days`,
        `Average frequency now ${round(glass.platforms.meta.daily.slice(-1)[0].freq, 1)} (playbook flag: rising frequency with falling CTR)`,
        `${Math.round(cs.clicks).toLocaleString()} clicks on this creative to date`
      ],
      expected_impact: { metric: "Meta CTR", estimate: "+8% to +14%", confidence: "medium" },
      rollback: "Re-activate the cover-led static; pause the carousel", dollar_impact: 0, agent: "Optimizer"
    });

    // 2. Budget shift between platforms on Daggerbound, from worse to better cost per click-out
    const plats = ["meta", "google", "tiktok"].map((p) => ({ p, ...windowStats(glass, p) }));
    plats.sort((a, b) => a.cpa - b.cpa);
    const best = plats[0], worst = plats[plats.length - 1];
    const daily = Math.round(glass.platforms[worst.p].daily.slice(-3).reduce((t, x) => t + x.spend, 0) / 3);
    const move = Math.round((daily * 0.22) / 10) * 10;
    const remainDays = daysBetween(addDays(s.today, -1), glass.end);
    newProposal(s, {
      campaign_id: glass.id, platform: `${worst.p}→${best.p}`, action_type: "budget_shift", key: "shift_glass",
      params: { from: worst.p, to: best.p, per_day: move, days: remainDays },
      summary: `Move $${move}/day from ${D.PLATFORMS[worst.p].name} to ${D.PLATFORMS[best.p].name} for the rest of the flight`,
      evidence: [
        `${D.PLATFORMS[best.p].name} cost per click-out is $${best.cpa.toFixed(2)} vs $${worst.cpa.toFixed(2)} on ${D.PLATFORMS[worst.p].name} over the last 7 days`,
        `${Math.round(best.clicks).toLocaleString()} vs ${Math.round(worst.clicks).toLocaleString()} clicks per arm (minimum ${s.settings.minClicksPerArm})`,
        `Shift is ${round((move / daily) * 100)}% of the source's daily spend, inside the 25% single-step limit`
      ],
      evidence_clicks: Math.min(best.clicks, worst.clicks), step_pct: move / daily,
      expected_impact: { metric: "click-outs", estimate: "+6% to +11%", confidence: "medium" },
      rollback: "Restore prior platform budgets", dollar_impact: move * remainDays, agent: "Optimizer"
    });

    // 3. TikTok over-pacing on Salt and Signal: reduce daily budget
    const tk = platformPacing(s, salt, "tiktok");
    newProposal(s, {
      campaign_id: salt.id, platform: "tiktok", action_type: "daily_budget_change", key: "salt_tiktok_down",
      params: { pct: -0.2 },
      summary: "Cut the TikTok daily budget 20% to bring it back onto the launch curve",
      evidence: [
        `TikTok spend is ${round((tk.ratio - 1) * 100)}% ahead of the planned curve ($${Math.round(tk.spent).toLocaleString()} vs $${Math.round(tk.planned).toLocaleString()} planned to date)`,
        `Forecast end-of-flight TikTok spend $${Math.round(tk.forecast).toLocaleString()} against a $${tk.budget.toLocaleString()} allocation`,
        "CPMs are 25% above benchmark, so the extra spend is buying fewer impressions"
      ],
      step_pct: 0.2, expected_impact: { metric: "TikTok pacing", estimate: "back within ±10% in 4 to 6 days", confidence: "high" },
      rollback: "Restore prior daily budget", dollar_impact: Math.round(tk.forecast - tk.budget), agent: "Budget steward"
    });

    // 4. Google under-delivery on a minors-flagged YA title: bid adjustment escalates to high risk
    const gg = platformPacing(s, hearts, "google");
    newProposal(s, {
      campaign_id: hearts.id, platform: "google", action_type: "bid_adjust", key: "hearts_google_bid",
      params: { pct: 0.1 },
      summary: "Raise Google Search target CPC 10% on author + series terms (limited by bid)",
      evidence: [
        `Google is ${round((1 - gg.ratio) * 100)}% behind plan; diagnosis: limited by bid, not by budget or audience (unintentional underspend)`,
        "Search impression share lost to rank is 41% on exact-match author terms",
        `${Math.round(windowStats(hearts, "google").clicks).toLocaleString()} clicks in the last 7 days`
      ],
      evidence_clicks: windowStats(hearts, "google").clicks, step_pct: 0.1,
      expected_impact: { metric: "Google delivery", estimate: "+25% to +40% daily spend toward plan", confidence: "medium" },
      rollback: "Restore prior target CPC", dollar_impact: Math.round(gg.budget - gg.forecast), agent: "Optimizer"
    });

    // 5. Amazon search-term harvest on the backlist title
    const am = windowStats(ledger, "amazon", 14);
    newProposal(s, {
      campaign_id: ledger.id, platform: "amazon", action_type: "harvest_keywords", key: "ledger_harvest",
      params: { add_exact: 6, add_negative: 9 },
      summary: "Harvest 6 converting search terms into exact match and add 9 negatives",
      evidence: [
        `${Math.round(am.actions)} attributed orders in 14 days; 6 auto-campaign terms each have 4+ orders`,
        "9 terms spent $212 with zero orders (competitor-brand and off-topic)",
        "Playbook: harvest converting terms into exact-match, add negatives for irrelevant terms"
      ],
      evidence_clicks: am.clicks,
      expected_impact: { metric: "ACoS", estimate: "-6 to -10 points", confidence: "medium" },
      rollback: "Remove the added keywords and negatives", dollar_impact: 0, agent: "Optimizer"
    });

    // 6. An over-reaching idea the policy engine blocks (shows the LLM never acts directly)
    newProposal(s, {
      campaign_id: glass.id, platform: "meta", action_type: "daily_budget_change", key: "glass_meta_up60",
      params: { pct: 0.6 },
      summary: "Raise the Meta daily budget 60% while the quote-led carousel is winning",
      evidence: ["Quote-led carousel cost per click-out is 31% below the ad set average"],
      evidence_clicks: 180, step_pct: 0.6,
      expected_impact: { metric: "click-outs", estimate: "+20% to +35%", confidence: "low" },
      rollback: "Restore prior daily budget", dollar_impact: 3900, agent: "Optimizer"
    });
  }

  // ---------- POLICY ENGINE (deterministic) ----------
  const ACTION_RISK = {
    pause_creative: "low", rotate_creative: "low", bid_adjust: "low", add_negatives: "low", harvest_keywords: "low",
    budget_shift: "medium", daily_budget_change: "medium", creative_test: "medium", conversion_event: "medium",
    flight_change: "high", budget_increase: "high", destination_change: "high", resume_platform: "medium"
  };
  const RISK_RANK = { low: 0, medium: 1, high: 2 };

  function validateProposal(s, p) {
    const st = s.settings;
    const errors = [], warnings = [], checks = [];
    const c = s.campaigns.find((x) => x.id === p.campaign_id);
    const t = titleById(c.titleId);
    let risk = ACTION_RISK[p.action_type];
    if (!risk) { errors.push(`Unknown action type "${p.action_type}"`); risk = "high"; }
    checks.push(`Action type "${p.action_type}" is in the taxonomy (default risk: ${risk})`);

    // bid changes beyond ±10% are medium (taxonomy §7.3)
    if (p.action_type === "bid_adjust" && Math.abs(p.params.pct) > 0.1) risk = "medium";

    // Appendix A: single-step limit
    if (p.step_pct != null) {
      if (Math.abs(p.step_pct) > st.maxStepChange + 1e-9) errors.push(`Step change of ${round(Math.abs(p.step_pct) * 100)}% exceeds the ${st.maxStepChange * 100}% single-step limit (resets learning phase). Split into smaller steps.`);
      else checks.push(`Step change ${round(Math.abs(p.step_pct) * 100)}% is within the ${st.maxStepChange * 100}% limit`);
    }
    // Evidence threshold
    if (p.evidence_clicks != null) {
      if (p.evidence_clicks < st.minClicksPerArm) errors.push(`Only ${Math.round(p.evidence_clicks)} clicks of evidence; minimum is ${st.minClicksPerArm} per arm.`);
      else checks.push(`Evidence: ${Math.round(p.evidence_clicks).toLocaleString()} clicks (minimum ${st.minClicksPerArm})`);
    }
    // Never push a campaign above its approved total without a budget_increase
    if (p.action_type === "daily_budget_change" && p.params.pct > 0) {
      const agg = campaignPacing(s, c);
      if (agg.forecast * (1 + p.params.pct * 0.4) > c.budget * (1 + st.capTolerance)) errors.push("Projected spend would exceed the approved campaign budget. Request a budget increase instead.");
    }
    if (p.action_type === "budget_shift") {
      const src = platformPacing(s, c, p.params.from);
      const need = p.params.per_day * p.params.days;
      if (need > src.remaining) errors.push(`Shift of $${need.toLocaleString()} exceeds ${D.PLATFORMS[p.params.from].name}'s remaining $${Math.round(src.remaining).toLocaleString()}.`);
      else checks.push(`Shift total $${need.toLocaleString()} fits inside the source's remaining budget; campaign total unchanged`);
    }
    // Title flags
    if (t.flags.includes("minors")) { risk = "high"; warnings.push("Minors-flagged title (age band " + t.ageBand + "): escalated to high risk and routed to compliance review."); }
    if (t.flags.includes("political") && /copy|creative|audience/.test(p.action_type)) { risk = "high"; warnings.push("Political/issue title: creative and audience changes route to review."); }
    if (s.killSwitch) errors.push("Kill switch is on: no changes execute until an admin turns it off.");

    // Approval chain
    const approvers = ["imprint_marketer"];
    if (risk === "high" || (p.dollar_impact || 0) > st.directorThreshold) approvers.push("marketing_director");
    if (t.flags.includes("minors")) approvers.push("compliance");
    checks.push(`Approvers by threshold: ${approvers.join(", ")} (risk ${risk}, $${(p.dollar_impact || 0).toLocaleString()} impact)`);

    return { valid: errors.length === 0, errors, warnings, checks, risk, approvers };
  }

  const ROLES = {
    imprint_marketer: "Imprint marketer",
    marketing_director: "Marketing director",
    compliance: "Compliance reviewer",
    admin: "Central paid media admin"
  };

  function log(s, entry) { s.audit.unshift(Object.assign({ ts: s.today + "T" + new Date().toISOString().slice(11, 19) + "Z" }, entry)); }
  function activity(s, agent, text, kind = "info") { s.activity.unshift({ day: s.today, agent, text, kind }); }

  // Record one approver's decision. Executes when every required role has approved.
  function decide(s, id, role, decision, extra = {}) {
    const p = s.proposals.find((x) => x.proposal_id === id);
    if (!p) throw new Error("No proposal " + id);
    const c = s.campaigns.find((x) => x.id === p.campaign_id);
    const ent = `${titleById(c.titleId).title} · ${p.platform}`;
    if (p.status !== "pending" && p.status !== "partially_approved") return { ok: false, reason: "Proposal is " + p.status };
    if (p.expires_at < s.today) { p.status = "expired"; return { ok: false, reason: "Expired: evidence is stale" }; }

    if (decision === "reject") {
      p.status = "rejected"; p.reject_tags = extra.tags || [];
      p.history.push({ role, decision, tags: extra.tags, day: s.today });
      log(s, { actor: "human", who: ROLES[role], action: "Rejected proposal " + id, entity: ent, before: p.summary, after: "Rejected: " + (extra.tags || []).join(", ") });
      return { ok: true, status: p.status };
    }
    if (decision === "snooze") {
      p.expires_at = addDays(p.expires_at, 1); p.snoozed_until = addDays(s.today, 1);
      p.history.push({ role, decision, day: s.today });
      log(s, { actor: "human", who: ROLES[role], action: "Snoozed proposal " + id + " for 24h", entity: ent, before: "-", after: "-" });
      return { ok: true, status: p.status };
    }
    if (decision === "edit") {
      const before = JSON.stringify(p.params);
      Object.assign(p.params, extra.params);
      if (p.action_type === "budget_shift") {
        const src = c.platforms[p.params.from].daily.slice(-3);
        p.step_pct = p.params.per_day / (sum(src, (x) => x.spend) / 3);
        p.dollar_impact = p.params.per_day * p.params.days;
        p.summary = `Move $${p.params.per_day}/day from ${D.PLATFORMS[p.params.from].name} to ${D.PLATFORMS[p.params.to].name} for the rest of the flight`;
      }
      if (p.action_type === "daily_budget_change") { p.step_pct = Math.abs(p.params.pct); p.summary = `Change the ${D.PLATFORMS[p.platform].name} daily budget ${p.params.pct > 0 ? "+" : ""}${round(p.params.pct * 100)}%`; }
      p.policy = validateProposal(s, p); p.risk = p.policy.risk; p.requires_approval_from = p.policy.approvers;
      p.edited = true;
      log(s, { actor: "human", who: ROLES[role], action: "Edited proposal " + id, entity: ent, before, after: JSON.stringify(p.params) });
      p.history.push({ role, decision: "edit", day: s.today });
      if (!p.policy.valid) return { ok: false, reason: p.policy.errors.join(" ") };
      // an edit by an approver counts as their approval
    }
    // approve (or edit-and-approve)
    p.policy = validateProposal(s, p);
    if (!p.policy.valid) return { ok: false, reason: p.policy.errors.join(" ") };
    if (!p.requires_approval_from.includes(role)) return { ok: false, reason: `${ROLES[role]} is not an approver for this proposal` };
    if (!p.approvals.includes(role)) p.approvals.push(role);
    p.history.push({ role, decision: "approve", day: s.today });
    log(s, { actor: "human", who: ROLES[role], action: (decision === "edit" ? "Edited and approved " : "Approved ") + id, entity: ent, before: "-", after: p.summary });
    const missing = p.requires_approval_from.filter((r) => !p.approvals.includes(r));
    if (missing.length) { p.status = "partially_approved"; return { ok: true, status: p.status, waitingOn: missing }; }
    return execute(s, p);
  }

  // Platform adapter: apply → read back → verify → log. Idempotent by proposal id.
  function execute(s, p) {
    const c = s.campaigns.find((x) => x.id === p.campaign_id);
    const ent = `${titleById(c.titleId).title} · ${p.platform}`;
    const steps = [];
    const idem = "idem_" + p.proposal_id;
    if (p.executed) return { ok: true, status: p.status, steps: ["Already executed (idempotency key " + idem + ")"] };
    steps.push("Policy engine re-validated: pass");
    let before = "", after = "";
    switch (p.action_type) {
      case "pause_creative": {
        const cr = c.creatives.find((x) => x.id === p.params.creative_id);
        cr.status = "paused"; before = cr.name + ": active"; after = cr.name + ": paused";
        c.creatives.push({ id: "cr_new_" + p.proposal_id, platform: cr.platform, name: p.params.rotate_in.replace(" (pre-approved)", ""), hook: "quote", rights: "cleared", launchedDay: daysBetween(c.start, s.today), fatigue: 0.004, status: "active" });
        if (c.perf.meta) c.perf.meta.ctrDecay = 0.004;
        steps.push(`Meta adapter: apply_change(ad ${cr.id} status=PAUSED; new ad from asset library) [${idem}]`);
        break;
      }
      case "budget_shift": {
        const tot = p.params.per_day * p.params.days;
        before = `${p.params.from} $${c.platformBudget[p.params.from].toLocaleString()} / ${p.params.to} $${c.platformBudget[p.params.to].toLocaleString()}`;
        c.platformBudget[p.params.from] -= tot; c.platformBudget[p.params.to] += tot;
        after = `${p.params.from} $${c.platformBudget[p.params.from].toLocaleString()} / ${p.params.to} $${c.platformBudget[p.params.to].toLocaleString()}`;
        steps.push(`${D.PLATFORMS[p.params.from].name} adapter: apply_change(daily_budget -$${p.params.per_day}) [${idem}-a]`);
        steps.push(`${D.PLATFORMS[p.params.to].name} adapter: apply_change(daily_budget +$${p.params.per_day}) [${idem}-b]`);
        break;
      }
      case "daily_budget_change": {
        const pl = c.platforms[p.platform];
        before = "delivery x" + pl.deliver.toFixed(2); pl.deliver = pl.deliver * (1 + p.params.pct); after = "delivery x" + pl.deliver.toFixed(2);
        steps.push(`${D.PLATFORMS[p.platform].name} adapter: apply_change(daily_budget ${round(p.params.pct * 100)}%) [${idem}]`);
        break;
      }
      case "bid_adjust": {
        const pl = c.platforms[p.platform];
        before = "target CPC baseline"; pl.deliver = Math.min(1.0, pl.deliver * 1.45); after = `target CPC +${round(p.params.pct * 100)}%`;
        steps.push(`${D.PLATFORMS[p.platform].name} adapter: apply_change(target_cpc +${round(p.params.pct * 100)}%) [${idem}]`);
        break;
      }
      case "harvest_keywords": {
        c.perf.amazon.actionMult = (c.perf.amazon.actionMult || 1) * 1.1;
        before = "auto campaign only"; after = `+${p.params.add_exact} exact, +${p.params.add_negative} negatives`;
        steps.push(`Amazon Ads adapter: create keywords (v3 Sponsored Products) [${idem}]`);
        break;
      }
      case "resume_platform": {
        c.platforms[p.platform].status = "active"; c.platformBudget[p.platform] += p.params.topup || 0;
        before = "paused (safety stop)"; after = "active" + (p.params.topup ? `, +$${p.params.topup} cap headroom` : "");
        steps.push(`${D.PLATFORMS[p.platform].name} adapter: apply_change(status=ACTIVE) [${idem}]`);
        break;
      }
    }
    steps.push("Read-back: platform state matches requested change ✓");
    steps.push("Audit log written; outcome check scheduled in 3 days");
    p.status = "executed"; p.executed = true; p.executed_at = s.today; p.outcome_due = addDays(s.today, 3);
    log(s, { actor: "system", who: "Execution engine", action: "Executed " + p.proposal_id + " (" + p.action_type + ")", entity: ent, before, after });
    activity(s, "Execution engine", `Executed ${p.proposal_id}: ${p.summary}. Read-back verified.`, "good");
    return { ok: true, status: "executed", steps };
  }

  // ---------- MONITOR + BUDGET STEWARD ----------
  function runMonitor(s, opts = {}) {
    const found = [];
    s.campaigns.filter((c) => c.status === "live").forEach((c) => {
      const t = titleById(c.titleId);
      D.PLATFORM_ORDER.forEach((p) => {
        const r = platformPacing(s, c, p);
        if (!r) return;
        // Hard cap: emergency safety stop (pause only, never increase)
        if (c.platforms[p].status === "active" && r.spent >= r.cap) {
          if (s.settings.autoPause) {
            c.platforms[p].status = "paused_safety";
            const a = { id: "al_" + (++s.seq), day: s.today, severity: "critical", campaign_id: c.id, platform: p, type: "hard_cap",
              text: `${t.title}: ${D.PLATFORMS[p].name} hit its hard cap ($${Math.round(r.spent).toLocaleString()} of $${r.budget.toLocaleString()} + ${s.settings.capTolerance * 100}% tolerance). Paused automatically.`, open: true };
            s.alerts.unshift(a); found.push(a);
            log(s, { actor: "system", who: "Policy engine (safety stop)", action: "Auto-paused on hard-cap breach", entity: `${t.title} · ${p}`, before: "active", after: "paused_safety" });
            activity(s, "Budget steward", `Hard cap breached on ${t.title} · ${D.PLATFORMS[p].name}. Paused automatically and notified the owner and approver.`, "crit");
            // Draft a resume proposal so the human can undo in one click
            newProposal(s, {
              campaign_id: c.id, platform: p, action_type: "resume_platform", key: "resume_" + c.id + p,
              params: { topup: 0 }, summary: `Resume ${D.PLATFORMS[p].name} after the safety stop (no extra budget)`,
              evidence: [`Spend spike on ${addDays(s.today, -1)}: $${Math.round(c.platforms[p].daily.slice(-1)[0].spend).toLocaleString()} in one day vs ~$${Math.round(plannedDaily(c, p, addDays(s.today, -1))).toLocaleString()} planned`, "Platform has $0 remaining in its allocation; resuming without a reallocation will re-trigger the cap", "Consider moving budget from an under-pacing platform first"],
              expected_impact: { metric: "delivery", estimate: "restored", confidence: "high" },
              rollback: "Pause again", dollar_impact: 0, agent: "Budget steward"
            });
          } else {
            const a = { id: "al_" + (++s.seq), day: s.today, severity: "critical", campaign_id: c.id, platform: p, type: "hard_cap", text: `${t.title}: ${D.PLATFORMS[p].name} over hard cap. Auto-pause is off; action needed now.`, open: true };
            s.alerts.unshift(a); found.push(a);
          }
          return;
        }
        if (opts.silent) return;
        const tier = rowTier(s, r);
        if (tier === "alert" && !s.alerts.some((a) => a.open && a.campaign_id === c.id && a.platform === p && a.type === "pacing")) {
          const a = { id: "al_" + (++s.seq), day: s.today, severity: "warning", campaign_id: c.id, platform: p, type: "pacing", text: `${t.title}: ${D.PLATFORMS[p].name} is ${round((r.ratio - 1) * 100)}% off the pacing curve.`, open: true };
          s.alerts.unshift(a); found.push(a);
        }
      });
    });
    return found;
  }

  // Seed alerts present at start
  function seedAlerts(s) {
    const salt = s.campaigns.find((c) => c.id === "cmp_salt");
    const hearts = s.campaigns.find((c) => c.id === "cmp_hearts");
    const tk = platformPacing(s, salt, "tiktok"), gg = platformPacing(s, hearts, "google");
    s.alerts.push(
      { id: "al_1", day: s.today, severity: "warning", campaign_id: salt.id, platform: "tiktok", type: "pacing", text: `Salt and Signal: TikTok is ${round((tk.ratio - 1) * 100)}% ahead of the launch-week curve. Proposal drafted.`, open: true },
      { id: "al_2", day: s.today, severity: "warning", campaign_id: hearts.id, platform: "google", type: "pacing", text: `Small Wild Hearts: Google is ${round((1 - gg.ratio) * 100)}% behind plan (limited by bid). Proposal drafted.`, open: true },
      { id: "al_3", day: addDays(s.today, -1), severity: "info", campaign_id: "cmp_dagger", platform: "meta", type: "fatigue", text: "Daggerbound: cover-led Meta ad shows creative fatigue. Proposal drafted.", open: true },
      { id: "al_4", day: addDays(s.today, -2), severity: "info", campaign_id: "cmp_ledger", platform: "all", type: "platform_watch", text: "Platform watcher: Amazon legacy report pages retire Dec 31, 2026. ARGUS already reads unified reporting; no action needed.", open: true }
    );
    activity(s, "Budget steward", "Pulled hourly spend from Meta, Google Ads, TikTok and Amazon Ads. 4 live campaigns, 15 platform campaigns.");
    activity(s, "Monitor", "Daily performance check: 2 pacing alerts, 1 creative-fatigue signal, 0 disapprovals, 0 tracking breaks.");
    activity(s, "Optimizer", "Drafted 6 proposals. 1 was held by the policy engine (exceeds single-step budget limit).");
    activity(s, "Reconciliation", "October ledger vs. platform-reported spend: 3 discrepancies explained (TikTok tax line, Meta $41.20 invalid-traffic credit, Google timezone cut-off).");
  }

  // Advance the simulated clock one day: connectors pull, steward + monitor + optimizer run.
  function advanceDay(s) {
    const date = s.today;
    const spike = s.injectSpike;
    s.campaigns.filter((c) => c.status === "live" && date <= c.end).forEach((c) => {
      let sp = null;
      if (spike && spike.campaign_id === c.id) {
        const r = platformPacing(s, c, spike.platform);
        sp = { platform: spike.platform, amount: Math.max(plannedDaily(c, spike.platform, date) * 3.2, r.cap - r.spent + 180) };
      }
      simulateDay(c, date, sp);
    });
    s.injectSpike = null;
    s.today = addDays(s.today, 1);
    activity(s, "Budget steward", `Pulled spend for ${date} from all platforms; ledger updated.`);
    const found = runMonitor(s);
    const n = found.filter((a) => a.severity === "critical").length;
    activity(s, "Monitor", found.length ? `Raised ${found.length} alert${found.length > 1 ? "s" : ""}${n ? ` (${n} critical)` : ""}.` : "No new anomalies.", n ? "crit" : "info");
    // expire stale proposals
    s.proposals.forEach((p) => { if ((p.status === "pending" || p.status === "partially_approved") && p.expires_at < s.today) { p.status = "expired"; activity(s, "Policy engine", `${p.proposal_id} expired undecided (stale evidence).`, "warn"); } });
    // measure outcomes for executed proposals
    s.proposals.forEach((p) => {
      if (p.status === "executed" && p.outcome_due && p.outcome_due <= s.today && !p.outcome) {
        p.outcome = { "pause_creative": "Meta CTR +11% vs. prior 3 days", "budget_shift": "Click-outs +8% vs. forecast", "daily_budget_change": "TikTok pacing now within 7% of curve", "bid_adjust": "Google daily spend +34%", "harvest_keywords": "ACoS -7.5 points", "resume_platform": "Delivery restored" }[p.action_type] || "Measured";
        activity(s, "Optimizer", `Outcome recorded for ${p.proposal_id}: ${p.outcome}. Added to the learning log.`, "good");
      }
    });
    return found;
  }

  // ---------- PLANNER ----------
  const BASE_SPLIT = {
    preorder: { meta: 0.35, google: 0.2, tiktok: 0.2, amazon: 0.25 },
    launch:   { meta: 0.35, google: 0.2, tiktok: 0.2, amazon: 0.25 },
    backlist: { meta: 0.2, google: 0.3, tiktok: 0, amazon: 0.5 },
    event:    { meta: 0.45, google: 0.25, tiktok: 0.2, amazon: 0.1 },
    award:    { meta: 0.4, google: 0.3, tiktok: 0.1, amazon: 0.2 }
  };
  function draftPlan(title, brief) {
    const split = { ...BASE_SPLIT[brief.objective] };
    const why = [];
    const g = title.genre.toLowerCase();
    if (/fantasy|romance|ya|science/.test(g)) { split.tiktok += 0.08; split.google -= 0.08; why.push(`${title.genre} over-indexes on TikTok in Macmillan history (cost per click-out 18% below average), so TikTok gets +8 points.`); }
    if (/literary|book club/.test(g)) { split.meta += 0.07; split.tiktok -= 0.07; why.push("Literary / book-club readers respond best to quote-led and author-led Meta creative (+7 points to Meta, from TikTok)."); }
    if (/nonfiction/.test(g)) { split.google += 0.05; split.meta -= 0.05; why.push("Nonfiction converts on search intent, so Google gets +5 points."); }
    if (title.flags.includes("political")) { split.meta += split.tiktok; split.tiktok = 0; why.push("Politically themed title: TikTok restricts political ads, so TikTok is set to 0."); }
    if (title.flags.includes("minors")) why.push("Minors-flagged title: no behavioral targeting of under-18s; adult gift-buyer and broad audiences only.");
    if (brief.objective === "preorder") why.push("Pre-order objective: front half builds audiences and click-outs at lower intensity; spend concentrates in launch week (curve below).");
    why.push(`Amazon keeps ${Math.round(split.amazon * 100)}% because it has the cleanest sales attribution (Sponsored Products on the ${title.format.toLowerCase()} ASIN).`);
    const allocation = {};
    D.PLATFORM_ORDER.forEach((p) => (allocation[p] = Math.round(brief.budget * split[p])));
    const outcomes = {};
    D.PLATFORM_ORDER.forEach((p) => {
      const b = D.BENCHMARKS[p];
      const n = (allocation[p] / b.cpm) * 1000 * (b.ctr / 100) * b.actionRate;
      outcomes[p] = [Math.round(n * 0.75), Math.round(n * 1.25)];
    });
    const camp = { titleId: title.id, objective: brief.objective, start: brief.start, end: brief.end };
    const curve = flightDates(camp).map((d) => ({ date: d, w: curveWeight(camp, d), phase: phaseOf(camp, d) }));
    const tw = sum(curve, (x) => x.w);
    curve.forEach((x) => (x.planned = (brief.budget * x.w) / tw));
    const utm = (p) => `utm_source=${p}&utm_medium=paid_${p === "google" || p === "amazon" ? "search" : "social"}&utm_campaign=${title.id}_${brief.objective}`;
    const structure = {
      meta: "1 Advantage+ campaign (campaign budget + Advantage+ audience + Advantage+ placements), 2 ad sets: broad and comp-title affinity",
      google: "Search (title, author, comp terms; brand terms protected) + Demand Gen with 15s video",
      tiktok: title.flags.includes("political") ? "Not used" : "Smart+ campaign, targeting automation on, budget automation off (we keep pacing control)",
      amazon: "Sponsored Products auto + manual exact; Sponsored Brands with cover and headline"
    };
    return { split, allocation, why, outcomes, curve, utm, structure };
  }

  // ---------- COMPLIANCE ----------
  const LIMITS = { meta: { label: "Primary text", max: 125 }, google: { label: "RSA headline", max: 30 }, tiktok: { label: "Ad text", max: 100 }, amazon: { label: "Sponsored Brands headline", max: 50 } };
  const CLAIM_RX = /(#\s?1\b|number one|best-?sell(er|ing)|award-winning|most anticipated|everyone is talking|instant classic|must-read of the year)/i;

  function runCompliance(title, copy, assetsSelected, budget, destination) {
    const out = [];
    const sources = D.CLAIM_SOURCES[title.id] || [];
    D.PLATFORM_ORDER.forEach((p) => {
      const txt = copy[p] || "";
      const m = txt.match(CLAIM_RX);
      if (m) {
        const ok = sources.some((s) => txt.toLowerCase().includes(s.claim.toLowerCase()) && s.claim.toLowerCase().includes(m[0].toLowerCase()));
        out.push({ id: "claim_" + p, group: "Claim substantiation", platform: p, result: ok ? "pass" : "fail",
          text: ok ? `"${m[0]}" maps to a verified source.` : `"${m[0]}" has no verified source (list name and week) for this title.${p === "tiktok" ? " Also breaches TikTok's exaggerated-claims policy." : ""}`,
          fix: ok ? null : { kind: "copy", platform: p, label: "Use substantiated claim", value: suggestCopy(title, p) } });
      } else out.push({ id: "claim_" + p, group: "Claim substantiation", platform: p, result: "pass", text: "No unsubstantiated claims." });
      const lim = LIMITS[p];
      const len = txt.length;
      out.push({ id: "len_" + p, group: "Character limits", platform: p, result: len > lim.max ? (p === "google" ? "fail" : "warn") : "pass",
        text: `${lim.label}: ${len}/${lim.max} characters${len > lim.max ? (p === "google" ? " (rejected by the platform)" : " (will truncate)") : ""}.`,
        fix: len > lim.max ? { kind: "copy", platform: p, label: "Use shortened variant", value: suggestCopy(title, p) } : null });
    });
    const assets = (D.ASSETS[title.id] || []).filter((a) => assetsSelected.includes(a.id));
    const pending = assets.filter((a) => a.rights !== "cleared");
    out.push({ id: "quotes", group: "Blurb and quote clearance", result: pending.length ? "fail" : "pass",
      text: pending.length ? `${pending.map((a) => a.type).join(", ")}: clearance pending. Remove it or wait for clearance.` : "All selected quotes and endorsements are cleared for advertising.",
      fix: pending.length ? { kind: "assets", remove: pending.map((a) => a.id), label: "Remove pending asset" } : null });
    out.push({ id: "likeness", group: "Author likeness and cover art", result: "pass", text: "Cover and author photo cleared for US paid media; photographer credit added to Meta caption." });
    out.push({ id: "minors", group: "Minors and age-sensitive", result: title.flags.includes("minors") ? "warn" : "pass", text: title.flags.includes("minors") ? "YA title: restricted targeting applied; compliance review required." : `Age band ${title.ageBand}: no minors-directed targeting.` });
    out.push({ id: "political", group: "Political and issue content", result: title.flags.includes("political") ? "warn" : "pass", text: title.flags.includes("political") ? "Political/issue title: routed to review; TikTok excluded." : "Not a political/issue title." });
    out.push({ id: "tracking", group: "Landing page and tracking", result: "pass", text: `${destination} resolves (200), Meta Pixel + CAPI and TikTok Pixel fire, UTMs present on all 4 platforms.` });
    out.push({ id: "access", group: "Platform access", result: "pass", text: "Write access verified: Meta (app review approved), Google (Cloud project Standard access), TikTok (Business Center authorized), Amazon (vendor 1P scopes)." });
    return out;
  }
  function suggestCopy(title, p) {
    return {
      meta: `An Indie Next List pick. A family orchard, one impossible tide. Pre-order The Orchard at Low Tide.`,
      google: `The Orchard at Low Tide`,
      tiktok: `An Indie Next List pick. The book club novel of the spring. Pre-order now.`,
      amazon: `An Indie Next List pick from the author of Winter Kept`
    }[p];
  }
  function approversForPlan(budget, title) {
    const a = ["imprint_marketer"];
    if (budget > 25000) a.push("marketing_director");
    if (title.flags.includes("minors") || title.flags.includes("political")) a.push("compliance");
    return a;
  }

  // Turn an approved launch plan into a live campaign in state.
  function launchCampaign(s, title, brief, plan) {
    const cfg = {
      id: "cmp_" + title.id.slice(-4), titleId: title.id, name: `${title.title}: ${brief.objective}`, objective: brief.objective,
      budget: brief.budget, start: brief.start, end: brief.end, destination: brief.destination, status: "scheduled",
      alloc: plan.split, deliver: { meta: 1, google: 1, tiktok: 1, amazon: 1 }, perf: { meta: {}, google: {}, tiktok: {}, amazon: {} }
    };
    const c = JSON.parse(JSON.stringify(cfg));
    c.platformBudget = { ...plan.allocation };
    c.platforms = {};
    D.PLATFORM_ORDER.forEach((p) => (c.platforms[p] = { status: plan.allocation[p] ? "scheduled" : "off", daily: [], deliver: 1 }));
    c.creatives = [];
    s.campaigns.push(c);
    title.unlaunched = false;
    log(s, { actor: "system", who: "Builder", action: "Created campaigns in scheduled state on " + D.PLATFORM_ORDER.filter((p) => plan.allocation[p]).length + " platforms", entity: title.title, before: "-", after: `$${brief.budget.toLocaleString()}, ${brief.start} to ${brief.end}` });
    activity(s, "Builder", `Built ${title.title} on all platforms (scheduled for ${brief.start}). Post-launch verification passed after 1 fix.`, "good");
    return c;
  }

  // ---------- REPORTER ----------
  function report(s, c) {
    const t = titleById(c.titleId);
    const agg = campaignPacing(s, c);
    const rows = D.PLATFORM_ORDER.filter((p) => c.platformBudget[p]).map((p) => ({ p, ...totals(c, p), budget: c.platformBudget[p] }));
    const all = totals(c);
    const co = rows.filter((r) => r.p !== "amazon");
    const best = co.slice().sort((a, b) => a.cpa - b.cpa)[0];
    const worst = co.slice().sort((a, b) => b.cpa - a.cpa)[0];
    const crs = c.creatives.map((cr) => ({ cr, ...creativeStats(c, cr) })).sort((a, b) => b.ctr - a.ctr);
    const amazon = rows.find((r) => r.p === "amazon");
    const goal = Math.round(c.budget / 2.75); // planned qualified actions at plan
    return {
      title: t, campaign: c, agg, rows, all, best, worst, crs, goal,
      summary: `${t.title} spent $${Math.round(all.spend).toLocaleString()} of a $${c.budget.toLocaleString()} budget (${round((all.spend / c.budget) * 100, 1)}%) across ${rows.length} platforms and drove ${Math.round(all.actions).toLocaleString()} qualified actions (retailer click-outs plus Amazon attributed orders) at a blended $${all.cpa.toFixed(2)} each, ${all.actions >= goal ? "ahead of" : "short of"} the plan's goal of ${goal.toLocaleString()}. Among click-out platforms, ${D.PLATFORMS[best.p].name} was the most efficient at $${best.cpa.toFixed(2)} per click-out and ${D.PLATFORMS[worst.p].name} the least efficient at $${worst.cpa.toFixed(2)}.`,
      amazonLine: amazon ? `Amazon Ads attributed ${Math.round(amazon.actions).toLocaleString()} orders and $${Math.round(amazon.sales).toLocaleString()} in platform-attributed sales (ACoS ${round((amazon.spend / amazon.sales) * 100, 1)}%).` : "",
      actions: [
        "Rotated the author video into Meta on day 8 after the cover-led static fatigued (CTR recovered +12%).",
        "Shifted $90/day from Google Demand Gen to TikTok in launch week; TikTok cost per click-out was 29% lower.",
        "Paused one Sponsored Brands ad for 6 hours after a cover-image disapproval; resubmitted and approved the same day."
      ],
      caveats: [
        "Meta, Google and TikTok results are platform-reported click-outs from the where-to-buy page, not retail sales. Most purchases happen at retailers ARGUS cannot see.",
        "Amazon attributed sales use Amazon's 14-day window and are not incremental. They are not added to other platforms' numbers.",
        "BookScan shows launch-week units 22% above the comp-title average, but this is context, not proof of ad impact; no holdout test ran on this campaign."
      ],
      next: [
        `Lead with ${D.PLATFORMS[best.p].name} and trailer-style creative from day one; it beat plan by the widest margin.`,
        "Launch with 4 Meta creatives rather than 2 so fatigue rotation does not depend on a mid-flight build.",
        "Run a 2-week geo holdout on the paperback campaign to measure incremental sales.",
        "Re-use the harvested exact-match Amazon keywords for the paperback ASIN."
      ]
    };
  }


  // ---------- TITLE SALES (stand-in for a BookScan / retailer feed) ----------
  // Weekly units for the last N weeks. Before publication the number is pre-orders,
  // which BookScan reports in pub week. Deterministic so every run is repeatable.
  const GENRE_BASE = { "Fantasy / Romance": 640, "Fantasy": 150, "Thriller": 130, "YA Romance": 110, "Nonfiction (Policy)": 45, "Science Fiction": 95, "Literary / Book Club": 100 };
  function titleSales(s, titleId, weeks = 16) {
    const t = titleById(titleId);
    const camps = s.campaigns.filter((c) => c.titleId === titleId);
    const base = GENRE_BASE[t.genre] || 80;
    const out = [];
    let preorders = 0;
    for (let w = weeks - 1; w >= 0; w--) {
      const end = addDays(s.today, -1 - 7 * w), start = addDays(end, -6);
      let spend = 0;
      camps.forEach((c) => D.PLATFORM_ORDER.forEach((p) => (c.platforms[p] ? c.platforms[p].daily : []).forEach((r) => { if (r.date >= start && r.date <= end) spend += r.spend; })));
      const sincePub = daysBetween(t.pubDate, end);
      const n = noise(titleId + end + "units", 0.95, 1.05);
      let units = 0, pre = 0;
      if (sincePub < 0) { pre = Math.round((4 + base * 0.05 + spend * 0.15) * n); preorders += pre; }
      else if (sincePub < 7) { units = Math.round((base * 2 + spend * 0.2) * n) + preorders; preorders = 0; }
      else { const wk = Math.floor(sincePub / 7); units = Math.round((base * (0.35 + 1.2 * Math.pow(0.55, wk)) + spend * 0.2) * n); }
      out.push({ start, end, spend, units, preorders: pre, pubWeek: sincePub >= 0 && sincePub < 7 });
    }
    return out;
  }

  // ---------- TITLE HEALTH ----------
  // One score per campaign that rolls up pacing, creative fatigue, open decisions and alerts.
  // Each reason carries the action that fixes it, so the UI can always offer a next step.
  function titleHealth(s, c) {
    const t = titleById(c.titleId);
    const reasons = [];
    let score = 100;
    if (c.status === "scheduled") return { score: 100, status: "scheduled", label: "Scheduled", reasons: [{ sev: "info", text: `Starts ${c.start}. All settings verified.` }] };
    if (c.status === "completed") return { score: 100, status: "done", label: "Completed", reasons: [{ sev: "info", text: "Flight ended. Report ready.", action: { kind: "report", id: c.id, label: "Read the report" } }] };
    const agg = campaignPacing(s, c);
    agg.rows.forEach((r) => {
      const tier = rowTier(s, r);
      const name = D.PLATFORMS[r.platform].name;
      if (tier === "capped") { score -= 35; reasons.push({ sev: "crit", text: `${name} paused at its hard cap`, action: { kind: "proposal", key: "resume_" + c.id + r.platform, label: "Decide on resume" } }); }
      else if (tier === "alert") { score -= 22; reasons.push({ sev: "warn", text: `${name} is ${Math.round(Math.abs(r.ratio - 1) * 100)}% ${r.ratio > 1 ? "ahead of" : "behind"} its pacing curve`, action: { kind: "approvals", id: c.id, label: "See the fix" } }); }
      else if (tier === "watch") { score -= 6; reasons.push({ sev: "info", text: `${name} is drifting from plan (watch)` }); }
    });
    c.creatives.filter((cr) => cr.status === "active").forEach((cr) => {
      const st = creativeStats(c, cr);
      if (st.series.length >= 4 && st.ctrDrop > 0.25) { score -= 12; reasons.push({ sev: "warn", text: `"${cr.name}" is fatigued (CTR ${Math.round(-st.ctrDrop * 100)}%)`, action: { kind: "approvals", id: c.id, label: "Rotate creative" } }); }
    });
    const pend = s.proposals.filter((p) => p.campaign_id === c.id && (p.status === "pending" || p.status === "partially_approved"));
    if (pend.length) { score -= 4 * pend.length; reasons.push({ sev: "info", text: `${pend.length} decision${pend.length > 1 ? "s" : ""} waiting in the approval queue`, action: { kind: "approvals", id: c.id, label: "Review" } }); }
    if (t.flags.includes("minors")) reasons.push({ sev: "info", text: "YA title: changes route to compliance review" });
    score = clamp(Math.round(score), 0, 100);
    const status = score >= 80 ? "healthy" : score >= 60 ? "attention" : "risk";
    if (!reasons.length) reasons.push({ sev: "good", text: "Pacing on plan, creative fresh, nothing waiting on you" });
    return { score, status, label: { healthy: "Healthy", attention: "Needs attention", risk: "At risk" }[status], reasons };
  }

  const api = {
    titleHealth, titleSales,
    DEFAULT_SETTINGS, ROLES, LIMITS, addDays, daysBetween, flightDates, curveWeight, phaseOf, plannedDaily,
    makeState: () => { const s = makeState(); seedAlerts(s); return s; },
    platformPacing, campaignPacing, rowTier, totals, windowStats, creativeStats,
    validateProposal, decide, execute, runMonitor, advanceDay, newProposal,
    draftPlan, runCompliance, approversForPlan, launchCampaign, report, titleById, imprintById, round, sum
  };
  root.ARGUS = api;
  if (typeof module !== "undefined") module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
