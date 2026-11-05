/* Guided walkthrough: a spotlight tour that drives the live demo.
   Each step can navigate, prepare state, highlight an element, and offer a
   "Do it for me" action so a presenter can run the whole story with one button. */
(function () {
  "use strict";
  const A = window.APP, E = window.MATLOC;
  const go = (r) => { if (location.hash !== "#" + r) location.hash = r; A.render(); };
  const prop = (key) => { const p = A.findProposal(key); return p ? `[data-prop="${p.proposal_id}"]` : null; };
  const ensureWizard = (step) => {
    const W = A.UI.wiz;
    if (W.launched && step < 6) return;
    if (step >= 1 && !W.titleId) A.wiz.pick("9781250990066");
    if (step >= 2 && !W.plan) A.wiz.plan();
    if (step >= 4 && !W.checks) A.wiz.check();
    if (step >= 5 && W.checks.some((c) => c.result === "fail")) A.wiz.fixAll();
    if (step >= 5 && !W.launched) A.wiz.signAll();
    if (step >= 6 && !W.launched) A.wiz.launch();
    W.step = W.launched ? 6 : step;
  };

  const STEPS = [
    { title: "Welcome to MATLOC", ref: "Scoping plan §1", body: `<p>MATLOC is an approval-gated advertising specialist for Macmillan imprints. It plans and launches campaigns on <b>Meta, Google, TikTok and Amazon Ads</b>, watches spend and performance around the clock, proposes optimizations, and only executes what a person approves.</p><p>This tour runs the live demo for you: 27 short steps, about 8 to 10 minutes. Use <b>Do it for me</b> to perform each action, or click around yourself. All titles and numbers are fictional.</p>`, route: "portfolio" },
    { route: "portfolio", target: '[data-tour="kpis"]', title: "One screen instead of four platforms", ref: "§3.1 G2, §7.6", body: "<p>The portfolio rolls up every live title: approved budget, spend to date, the end-of-flight forecast, items waiting for a decision, and open alerts. Marketers stop logging into four ad managers to check spend.</p>" },
    { route: "portfolio", target: '[data-tour="campaigns"]', title: "Pacing against the pub-date curve", ref: "§7.7", body: "<p>Each bar shows spend against budget; the black tick is what the plan expected by today. Launch weeks are deliberately front-loaded, so MATLOC compares spend with each title's own curve, not a flat daily average.</p><p><b>Salt and Signal</b> is on <i>Alert</i> (TikTok over-pacing) and <b>Small Wild Hearts</b> is behind plan on Google.</p>" },
    { route: "portfolio", target: '[data-tour="activity"]', title: "The agents work overnight", ref: "§7.2", body: "<p>Seven agent roles share the work: the <b>Budget steward</b> pulls spend hourly and reconciles it, the <b>Monitor</b> looks for anomalies, the <b>Optimizer</b> drafts proposals, and the <b>Reporter</b> writes the results. Here is what they did since yesterday.</p>" },
    { route: "budget", prep: () => { A.UI.budgetCampaign = "cmp_salt"; A.UI.expanded.cmp_salt = true; }, target: '[data-tour="hierarchy"]', title: "Budget at every level", ref: "§7.7 Budget hierarchy", body: "<p>Imprint → title → platform → flight phase. Every node has approved, planned-to-date, spent, forecast and cap headroom, so finance and marketing see the same numbers. Salt and Signal is expanded: TikTok is running more than 20% ahead of its curve.</p>" },
    { route: "budget", target: '[data-tour="pacing-chart"]', title: "Planned vs. actual vs. forecast", ref: "§7.7 Pacing and forecasting", body: "<p>The grey line is the plan, the solid line is actual spend, and the dashed line is the forecast from recent delivery. Shaded bands are pre-order and launch week. Hover the chart for daily values.</p>" },
    { route: "budget", target: '[data-tour="guardrails"]', title: "Three guardrail tiers", ref: "§7.7 Guardrail tiers, §7.4", body: "<p><b>Watch</b> appears in the digest. <b>Alert</b> notifies the owner now. <b>Hard cap</b> pauses automatically. The thresholds are configurable per imprint; the emergency stop can only reduce spend, never raise or move it.</p>" },
    { route: "budget", target: '[data-tour="spike"]', title: "Simulate a runaway spend day", ref: "§7.4 Emergency safety stops", body: "<p>Let's make TikTok on Salt and Signal spend about three times its plan overnight, then advance the clock one day.</p>", doLabel: "Simulate the spike", do: () => { if (!A.S.alerts.some((a) => a.type === "hard_cap")) A.ACT.spike(); } },
    { route: "budget", prep: () => { A.UI.budgetCampaign = "cmp_salt"; A.UI.expanded.cmp_salt = true; }, target: '[data-tour="hierarchy"]', title: "Caught and paused, then handed to a human", ref: "§7.4, §10.4 R6", body: "<p>The Budget steward saw TikTok cross its approved allocation plus tolerance, and the policy engine paused it. The owner is notified, the audit log records it, and a <b>resume</b> proposal is already in the approval queue, so undoing it is one click once someone decides what to do with the budget.</p>" },
    { route: "approvals", prep: () => A.setRole("imprint_marketer"), target: '[data-tour="queue-mine"]', title: "The approval queue", ref: "§7.3, §7.4", body: "<p>Every proposal uses the same schema: action, evidence, expected impact with confidence, risk, rollback, required approvers and an expiry. You are acting as the <b>imprint marketer</b> (see the top bar).</p>" },
    { route: "approvals", target: () => prop("fatigue_cr_g1"), title: "Approve a low-risk fix", ref: "Appendix A: Creative", body: "<p>The Optimizer found creative fatigue: the cover-led Meta ad's CTR fell while frequency rose. It proposes pausing it and rotating in a pre-approved carousel. Low risk, marketer can approve alone.</p>", doLabel: "Approve it", do: () => { const p = A.findProposal("fatigue_cr_g1"); if (p.status === "pending") A.approve(p.proposal_id); } },
    { route: "approvals", target: () => prop("fatigue_cr_g1"), title: "Execute, then read back", ref: "§7.1 Idempotent, verifiable execution", body: "<p>Approval goes to the execution engine, not the AI. It re-validates the proposal, calls the platform adapter with an idempotency key, reads the setting back to confirm it took, and schedules an outcome check so the Optimizer learns whether the change worked.</p>" },
    { route: "approvals", prep: () => { const p = A.findProposal("shift_glass"); if (p.status === "pending") A.UI.edit[p.proposal_id] = { per_day: p.params.per_day * 3 }; }, target: () => prop("shift_glass"), title: "Edit-and-approve, with guardrails", ref: "§7.4 Edit-and-approve, Appendix A: Budget moves", body: "<p>Marketers can change a proposal's numbers before approving. Here we tripled the budget shift. The policy engine re-checks the edit live and blocks it, because a single step that large resets the platform's learning phase.</p><p>Change the number back to something smaller and the button unlocks.</p>", doLabel: "Approve the original amount", do: () => { const p = A.findProposal("shift_glass"); delete A.UI.edit[p.proposal_id]; if (p.status === "pending") A.approve(p.proposal_id); } },
    { route: "approvals", target: '[data-tour="queue-blocked"]', title: "The LLM reasons; deterministic code acts", ref: "§7.1 Key architectural decisions", body: "<p>This idea from the Optimizer (raise Meta 60%) never reached anyone's queue. The policy engine is ordinary code with hard rules: step limits, evidence minimums, budget ceilings, the kill switch. The AI has no direct write access to any ad platform.</p>" },
    { route: "approvals", target: () => prop("hearts_google_bid"), title: "Higher risk means more approvers", ref: "§7.3, §10.1 Minors", body: "<p>A +10% bid change is normally low risk. But <b>Small Wild Hearts</b> is a YA title, so the policy engine escalates it to high risk and adds a marketing director and a compliance reviewer to the chain.</p>", doLabel: "Approve as all three roles", do: () => { const p = A.findProposal("hearts_google_bid"); ["imprint_marketer", "marketing_director", "compliance"].forEach((r) => { if (p.status === "pending" || p.status === "partially_approved") { A.UI.role = r; A.approve(p.proposal_id); } }); A.setRole("imprint_marketer"); } },
    { route: "title", prep: () => { A.UI.titleCampaign = "cmp_glass"; }, target: '[data-tour="funnel"]', title: "Honest measurement", ref: "§8 Measurement strategy", body: "<p>Most book sales happen at retailers Macmillan cannot see. The funnel labels every number by source: platform-reported, first-party click-outs from the where-to-buy page, Amazon-attributed orders. Retail sales elsewhere are shown as unknown, measured by BookScan lift and holdouts, never claimed per click.</p>" },
    { route: "title", target: '[data-tour="creatives"]', title: "Creative leaderboard and fatigue", ref: "§7.6 Title and Creative views", body: "<p>Every creative's CTR trend is tracked. The cover-led static you just paused shows the fatigue curve; the map-detail carousel that replaced it is now live. Native platform metrics sit next to normalized ones in the table above.</p>" },
    { route: "launch", prep: () => { const W = A.UI.wiz; if (!W.launched) W.step = 0; }, target: '[data-tour="wiz-titles"]', title: "Launch: start from the title", ref: "§7.5 Launch interface", body: "<p>Launches are title-first, not platform-first. Pick a title and MATLOC fills in ISBN, pub date, BISAC, comps, price and ASIN from the metadata feed.</p>", doLabel: "Pick The Orchard at Low Tide", do: () => ensureWizard(1) },
    { route: "launch", prep: () => ensureWizard(1), target: '[data-tour="wiz-brief"]', title: "A short brief", ref: "§7.5 step 2", body: "<p>Objective, budget, flight dates, destination and exclusions. That's all the marketer types. $35,000 is above the director threshold, which matters in a minute.</p>", doLabel: "Draft the plan", do: () => ensureWizard(2) },
    { route: "launch", prep: () => ensureWizard(2), target: '[data-tour="wiz-plan"]', title: "The Planner's draft", ref: "§7.2 Planner, §7.5 step 3", body: "<p>A four-platform split built from genre benchmarks, with the reasoning written out, projected outcomes as ranges, platform structures that match each platform's current automation-first formats, a pub-date pacing curve and UTM conventions. Every share is editable.</p>", doLabel: "Accept and draft creative", do: () => { ensureWizard(2); A.UI.wiz.step = 3; } },
    { route: "launch", prep: () => { ensureWizard(2); if (!A.UI.wiz.launched && A.UI.wiz.step < 3) A.UI.wiz.step = 3; }, target: '[data-tour="wiz-copy"]', title: "Copy variants with live limits", ref: "§7.5 step 4", body: "<p>Copy is drafted per platform with character limits. The drafts deliberately include problems a busy marketer might miss: an unsubstantiated <i>#1 bestseller</i> claim, a headline that's too long, and a pull quote still waiting on clearance.</p>", doLabel: "Run compliance checks", do: () => ensureWizard(4) },
    { route: "launch", prep: () => ensureWizard(4), target: '[data-tour="wiz-compliance"]', title: "Pre-flight compliance blocks the launch", ref: "§10.1", body: "<p>Claim substantiation, quote clearance, likeness rights, minors, political content, tracking, platform access. Failures block launch. Each failure comes with a suggested fix, such as replacing the claim with one that maps to a verified source.</p>", doLabel: "Apply all fixes", do: () => { ensureWizard(4); A.wiz.fixAll(); } },
    { route: "launch", prep: () => { ensureWizard(4); A.wiz.fixAll(); A.UI.wiz.step = 5; }, target: '[data-tour="wiz-approve"]', title: "Approvals by threshold", ref: "§7.4, §14 Q4", body: "<p>The policy engine sets the approval chain from budget size and title flags. This plan needs the imprint marketer and, because it's over $25,000, the marketing director.</p>", doLabel: "Sign off and build", do: () => ensureWizard(6) },
    { route: "launch", prep: () => ensureWizard(6), target: '[data-tour="wiz-verify"]', title: "Post-launch verification", ref: "§7.5 step 7", body: "<p>Campaigns are created paused or scheduled, then every setting is read back. One mismatch surfaced: Meta's Advantage+ placements came back off. One click re-applies it, and it's logged.</p>" },
    { route: "report", prep: () => { A.UI.reportCampaign = "cmp_ninefold"; }, target: '[data-tour="report"]', title: "The end-of-campaign report writes itself", ref: "§7.6, §3.1 G6", body: "<p>When a flight ends, the Reporter produces the summary: goal vs. actual, spend and efficiency by platform, best and worst creative with hypotheses, what was changed and its measured effect, measurement caveats in plain language, and a plan for next time.</p>" },
    { route: "audit", target: '[data-tour="audit"]', title: "Everything is traceable", ref: "§3.1 G7, §10.2", body: "<p>Every approval, edit, execution and automatic stop from this tour is here, with before and after state. Filter by actor: people, agents, or the system acting on an approval. Agents never appear as the actor on a live-account change.</p>" },
    { title: "That's MATLOC", ref: "§12, §15", route: "portfolio", body: `<p><b>Real in this demo:</b> the policy engine rules, approval chains, pacing and forecast math, guardrail tiers, compliance checks and the report logic all run live in your browser.</p><p><b>Simulated:</b> platform APIs (adapters return synthetic data), the LLM reasoning (seeded from the Appendix A playbook so the demo is repeatable), and the title feed.</p><p>Next: Phase 0 discovery and platform access applications. Press <b>Reset</b> in the top bar to run the tour again.</p>` }
  ];

  let i = -1, spot, card;
  function build() {
    spot = document.createElement("div"); spot.className = "tour-spot none";
    card = document.createElement("div"); card.className = "tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-modal", "false"); card.setAttribute("aria-labelledby", "tour-title");
    document.body.append(spot, card);
  }
  function targetEl(st) {
    if (!st.target) return null;
    const sel = typeof st.target === "function" ? st.target() : st.target;
    return sel ? document.querySelector(sel) : null;
  }
  function place() {
    if (i < 0) return;
    const st = STEPS[i];
    const el = targetEl(st);
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!el) { spot.className = "tour-spot none"; card.className = "tour-card center"; card.style.left = card.style.top = ""; return; }
    const r = el.getBoundingClientRect();
    spot.className = "tour-spot";
    const pad = 6;
    const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
    Object.assign(spot.style, { left: r.left - pad + "px", top: top + "px", width: r.width + pad * 2 + "px", height: Math.max(0, bottom - top) + "px" });
    card.className = "tour-card";
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y;
    if (vw < 700) { x = 16; y = vh - ch - 16; }
    else if (r.right + 20 + cw < vw) { x = r.right + 20; y = Math.min(Math.max(16, r.top), vh - ch - 16); }
    else if (r.left - 20 - cw > 0) { x = r.left - 20 - cw; y = Math.min(Math.max(16, r.top), vh - ch - 16); }
    else if (vh - r.bottom > ch + 30) { x = Math.min(Math.max(16, r.left), vw - cw - 16); y = r.bottom + 16; }
    else if (r.top > ch + 30) { x = Math.min(Math.max(16, r.left), vw - cw - 16); y = r.top - ch - 16; }
    else { x = vw - cw - 16; y = vh - ch - 16; }
    card.style.left = x + "px"; card.style.top = y + "px";
  }
  function show(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    try { localStorage.setItem("matloc-tour-step", String(i)); } catch (e) { /* storage unavailable */ }
    const st = STEPS[i];
    if (st.prep) st.prep();
    if (st.route) go(st.route); else A.render();
    card.innerHTML = `<div class="progress"><span style="width:${((i + 1) / STEPS.length) * 100}%"></span></div>
      <div class="row" style="justify-content:space-between"><div class="eyebrow">Step ${i + 1} of ${STEPS.length}</div><button class="btn ghost sm" data-tour-act="close" aria-label="Exit tour">Exit</button></div>
      <h2 id="tour-title">${st.title}</h2><div class="body">${st.body}</div>${st.ref ? `<div class="plan-ref">Scoping plan reference: ${st.ref}</div>` : ""}
      <div class="nav-row">${i > 0 ? '<button class="btn sm" data-tour-act="back">Back</button>' : ""}<span style="flex:1"></span>${st.do ? `<button class="btn sm" data-tour-act="do">${st.doLabel}</button>` : ""}<button class="btn sm primary" data-tour-act="next">${i === STEPS.length - 1 ? "Finish" : st.do ? "Skip" : i === 0 ? "Start the tour" : "Next"}</button></div>`;
    requestAnimationFrame(() => {
      const el = targetEl(st);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 70 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "instant" });
      } else window.scrollTo(0, 0);
      place();
      setTimeout(place, 60);
    });
  }
  function close() { i = -1; spot.className = "tour-spot none"; spot.style.display = "none"; card.style.display = "none"; }
  function open(n = 0) { spot.style.display = ""; card.style.display = ""; show(n); }
  card = null;
  build(); close();
  card.addEventListener("click", (e) => {
    const b = e.target.closest("[data-tour-act]"); if (!b) return;
    const a = b.dataset.tourAct;
    if (a === "close") close();
    if (a === "back") show(i - 1);
    if (a === "next") { if (i === STEPS.length - 1) close(); else show(i + 1); }
    if (a === "do") { STEPS[i].do(); show(i + 1); }
  });
  document.addEventListener("keydown", (e) => {
    if (i < 0) return;
    if (e.key === "Escape") close();
    if (e.target.matches("input, textarea, select")) return;
    if (e.key === "ArrowRight") show(i + 1);
    if (e.key === "ArrowLeft") show(i - 1);
  });
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, { passive: true });
  window.addEventListener("matloc:render", () => {
    if (i >= 0) requestAnimationFrame(place);
    // invite on the portfolio
    if (location.hash.replace("#", "") === "portfolio" || !location.hash) {
      const head = document.querySelector(".view-head");
      if (head && !document.getElementById("tour-invite")) {
        const d = document.createElement("div"); d.id = "tour-invite"; d.className = "policy row"; d.style.justifyContent = "space-between";
        d.innerHTML = `<span><b style="display:inline">New here?</b> The guided tour runs the whole story in about 8 minutes: spend monitoring, a safety stop, approvals, a launch, and the final report.</span><button class="btn primary sm" data-tour-open>Start the guided tour</button>`;
        head.after(d);
      }
    }
  });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-tour-open]")) open(0); });
  document.getElementById("tour-start").addEventListener("click", () => open(0));
  document.getElementById("reset").addEventListener("click", () => { close(); A.reset(); A.toast("Demo data reset."); });
  window.TOUR = { open, close, steps: STEPS };
  A.render();
  if (location.hash === "#tour") open(0);
})();
