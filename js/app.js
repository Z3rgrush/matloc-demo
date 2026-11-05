/* MATLOC demo UI: hash router, views, and delegated actions. */
(function () {
  "use strict";
  const E = window.MATLOC, D = window.MATLOC_DATA, C = window.MATLOC_CHARTS;
  const { money, esc, cover } = C;
  const pct = (x, d = 0) => (x * 100).toFixed(d) + "%";
  const signed = (x) => (x >= 0 ? "+" : "") + Math.round(x * 100) + "%";
  const fmtDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
  const shortDate = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
  const plat = (p) => (D.PLATFORMS[p] ? `<span class="plat ${p}"><i></i>${D.PLATFORMS[p].name}</span>` : p.split("→").map((q) => plat(q)).join(" → "));
  const TIER = { ok: "On track", watch: "Watch", alert: "Alert", capped: "Paused at cap", paused: "Paused", scheduled: "Scheduled" };
  const pill = (tier) => `<span class="pill ${tier}">${TIER[tier] || tier}</span>`;

  let S = E.makeState();
  const UI = {
    role: "imprint_marketer", budgetCampaign: "cmp_salt", titleCampaign: "cmp_glass", reportCampaign: "cmp_ninefold",
    edit: {}, reject: {}, exec: {}, auditFilter: "all", expanded: { cmp_salt: true }, wiz: null
  };
  function freshWizard() {
    return {
      step: 0, titleId: null,
      brief: { objective: "preorder", budget: 35000, start: "2027-01-12", end: "2027-03-23", destination: "Imprint where-to-buy page", exclusions: "Existing newsletter subscribers; recent purchasers (Amazon)" },
      plan: null, splitEdit: null,
      copy: {
        meta: "The most anticipated novel of the spring. A family orchard, one impossible tide, and three sisters who must decide what to save. Pre-order today.",
        google: "The Orchard at Low Tide: A Novel",
        tiktok: "The #1 bestseller everyone is talking about. Pre-order now.",
        amazon: "An Indie Next pick from the author of Winter Kept"
      },
      assets: ["as_1", "as_3", "as_4", "as_5"], checks: null, approvals: [], launched: false, verify: null
    };
  }
  UI.wiz = freshWizard();

  const $ = (sel, el = document) => el.querySelector(sel);
  const view = () => $("#view");
  function toast(msg) {
    const old = document.querySelector(".toast"); if (old) old.parentNode.removeChild(old);
    const t = document.createElement("div"); t.className = "toast"; t.textContent = msg; t.setAttribute("role", "status");
    document.body.appendChild(t); setTimeout(() => t.remove(), 3200);
  }
  const campaignById = (id) => S.campaigns.find((c) => c.id === id);
  const liveCampaigns = () => S.campaigns.filter((c) => c.status === "live");
  const needsMe = () => S.proposals.filter((p) => (p.status === "pending" || p.status === "partially_approved") && p.requires_approval_from.includes(UI.role) && !p.approvals.includes(UI.role));

  // ---------------- shell ----------------
  const ROUTES = {
    portfolio: { label: "Portfolio", render: renderPortfolio },
    approvals: { label: "Approvals", render: renderApprovals },
    budget: { label: "Budget & pacing", render: renderBudget },
    title: { label: "Title dashboard", render: renderTitle },
    launch: { label: "Launch a campaign", render: renderLaunch },
    report: { label: "Campaign report", render: renderReport },
    audit: { label: "Audit log", render: renderAudit }
  };
  const ICONS = {
    portfolio: '<path d="M2 13h12M4 13V7m4 6V3m4 10V9" />',
    approvals: '<path d="M3 8.5l3 3 7-7" />',
    budget: '<circle cx="8" cy="8" r="6"/><path d="M8 4v4l3 2" />',
    title: '<path d="M4 2h7l1 1v11H4z M6 5h4" />',
    launch: '<path d="M8 2v9m-4-4l4-5 4 5M3 14h10" />',
    report: '<path d="M3 2h10v12H3z M6 6h4M6 9h4" />',
    audit: '<path d="M2 4h12M2 8h12M2 12h8" />'
  };
  function renderNav() {
    const r = route();
    $("#nav").innerHTML = Object.entries(ROUTES).map(([k, v]) => {
      const count = k === "approvals" ? needsMe().length : 0;
      return `<a href="#${k}" data-tour="nav-${k}" ${r === k ? 'aria-current="page"' : ""}><svg class="ico" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${ICONS[k]}</svg>${v.label}${count ? `<span class="count">${count}</span>` : ""}</a>`;
    }).join("");
    $("#clock").textContent = fmtDate(S.today);
    $("#role").value = UI.role;
    $("#kill").hidden = !S.killSwitch;
  }
  function route() { const h = location.hash.replace("#", ""); return ROUTES[h] ? h : "portfolio"; }
  function render() {
    renderNav();
    const r = route();
    view().innerHTML = ROUTES[r].render();
    after[r] && after[r]();
    document.title = "MATLOC · " + ROUTES[r].label;
    window.dispatchEvent(new CustomEvent("matloc:render", { detail: r }));
  }
  const after = {};

  // ---------------- PORTFOLIO ----------------
  function renderPortfolio() {
    const live = liveCampaigns();
    const aggs = live.map((c) => ({ c, a: E.campaignPacing(S, c), t: E.titleById(c.titleId) }));
    const budget = E.sum(aggs, (x) => x.c.budget), spent = E.sum(aggs, (x) => x.a.spent), fc = E.sum(aggs, (x) => x.a.forecast);
    const pending = S.proposals.filter((p) => p.status === "pending" || p.status === "partially_approved");
    const alerts = S.alerts.filter((a) => a.open);
    const crit = alerts.filter((a) => a.severity === "critical").length;
    const platSpend = D.PLATFORM_ORDER.map((p) => ({ p, v: E.sum(live, (c) => E.totals(c, p).spend) }));
    const tot = E.sum(platSpend, (x) => x.v);
    const sched = S.campaigns.filter((c) => c.status === "scheduled");
    return `
    <div class="view-head"><div><div class="eyebrow">Portfolio · all imprints</div><h1>Good morning. Here is where every title stands.</h1>
      <p>The agents checked spend on all four platforms overnight. You only need to act on the items in your approval queue; everything else is on track or already handled.</p></div>
      <div class="row"><a class="btn primary" href="#approvals">Review ${needsMe().length} approval${needsMe().length === 1 ? "" : "s"}</a><a class="btn" href="#launch">Launch a campaign</a></div></div>

    <div class="kpis" data-tour="kpis">
      <div class="kpi"><div class="lbl">Live budget approved</div><div class="val num">${money(budget)}</div><div class="sub">${live.length} titles, ${E.sum(live, (c) => D.PLATFORM_ORDER.filter((p) => c.platformBudget[p]).length)} platform campaigns</div></div>
      <div class="kpi"><div class="lbl">Spent to date</div><div class="val num">${money(spent)}</div><div class="sub">${pct(spent / budget)} of approved</div></div>
      <div class="kpi"><div class="lbl">Forecast at flight end</div><div class="val num">${money(fc)}</div><div class="sub">${signed(fc / budget - 1)} vs. budget</div></div>
      <div class="kpi"><div class="lbl">Waiting for a decision</div><div class="val num">${pending.length}</div><div class="sub">${needsMe().length} need you as ${E.ROLES[UI.role]}</div></div>
      <div class="kpi"><div class="lbl">Open alerts</div><div class="val num">${alerts.length}</div><div class="sub">${crit ? `<span style="color:var(--crit);font-weight:600">${crit} critical</span>` : "none critical"}</div></div>
    </div>

    <div class="grid g-main">
      <div class="stack">
        <div class="panel" data-tour="campaigns"><div class="panel-h"><h3>Live campaigns</h3><span class="muted small">Pacing compares spend with each title's publication-date curve, not a flat daily average.</span></div>
          <div class="panel-b tbl-wrap"><table><thead><tr><th>Title</th><th>Phase</th><th>Spend vs. budget</th><th class="n">Forecast</th><th>Pacing</th><th class="n">Open items</th></tr></thead><tbody>
          ${aggs.map(({ c, a, t }) => {
            const open = S.proposals.filter((p) => p.campaign_id === c.id && (p.status === "pending" || p.status === "partially_approved")).length;
            return `<tr class="click" data-act="open-title" data-id="${c.id}"><td><div class="tcell">${cover(t)}<div><b>${esc(t.title)}</b><span>${esc(E.imprintById(t.imprint).name)} · pub ${shortDate(t.pubDate)}</span></div></div></td>
            <td><span class="tag">${E.phaseOf(c, S.today)}</span></td>
            <td><div class="meter ${a.tier}" title="${pct(a.consumed)} spent; marker shows planned to date"><span style="width:${Math.min(100, a.consumed * 100)}%"></span><i style="left:${Math.min(100, a.plannedFrac * 100)}%"></i></div><div class="small muted num" style="margin-top:4px">${money(a.spent)} of ${money(c.budget)}</div></td>
            <td class="n">${money(a.forecast)}<div class="small muted">${signed(a.forecast / c.budget - 1)}</div></td>
            <td>${pill(a.tier)}</td><td class="n">${open || "-"}</td></tr>`;
          }).join("")}
          ${sched.map((c) => { const t = E.titleById(c.titleId); return `<tr><td><div class="tcell">${cover(t)}<div><b>${esc(t.title)}</b><span>${esc(E.imprintById(t.imprint).name)} · pub ${shortDate(t.pubDate)}</span></div></div></td><td><span class="tag">starts ${shortDate(c.start)}</span></td><td><div class="small muted num">${money(0)} of ${money(c.budget)}</div></td><td class="n">-</td><td>${pill("scheduled")}</td><td class="n">-</td></tr>`; }).join("")}
          </tbody></table></div></div>

        <div class="panel"><div class="panel-h"><h3>Spend to date by platform</h3><span class="muted small">Platform-reported, live campaigns</span></div>
          <div class="panel-b stack"><div class="stackbar">${platSpend.filter((x) => x.v).map((x) => `<span style="width:${(x.v / tot) * 100}%;background:var(--${x.p})" title="${D.PLATFORMS[x.p].name}: ${money(x.v)}"></span>`).join("")}</div>
          <div class="legend">${platSpend.map((x) => `<span><i style="background:var(--${x.p});height:9px;width:9px"></i>${D.PLATFORMS[x.p].name} <b class="num">${money(x.v)}</b> <span class="muted">${pct(x.v / tot)}</span></span>`).join("")}</div></div></div>
      </div>
      <div class="stack">
        <div class="panel" data-tour="alerts"><div class="panel-h"><h3>Alerts</h3><span class="muted small">Pushed only when action or awareness is needed</span></div>
          <div class="panel-b">${alerts.length ? alerts.slice(0, 6).map((a) => `<div class="alert-row ${a.severity}"><span class="sev"></span><div class="small">${esc(a.text)}<div class="muted">${shortDate(a.day)}</div></div><button class="btn sm ghost" data-act="dismiss-alert" data-id="${a.id}" aria-label="Dismiss alert">Dismiss</button></div>`).join("") : '<p class="muted">No open alerts.</p>'}</div></div>
        <div class="panel" data-tour="activity"><div class="panel-h"><h3>What the agents did</h3><span class="muted small">Latest first</span></div>
          <div class="panel-b feed">${S.activity.slice(0, 9).map((x) => `<div class="feed-item ${x.kind}"><div class="who">${esc(x.agent)}<div class="muted" style="font-weight:400">${shortDate(x.day)}</div></div><div>${esc(x.text)}</div></div>`).join("")}</div></div>
      </div>
    </div>`;
  }

  // ---------------- APPROVALS ----------------
  function propCard(p) {
    const c = campaignById(p.campaign_id), t = E.titleById(c.titleId);
    const mine = p.requires_approval_from.includes(UI.role) && !p.approvals.includes(UI.role);
    const open = p.status === "pending" || p.status === "partially_approved";
    const ed = UI.edit[p.proposal_id], rj = UI.reject[p.proposal_id], ex = UI.exec[p.proposal_id];
    const editable = open && (p.action_type === "budget_shift" || p.action_type === "daily_budget_change");
    let editBox = "";
    if (ed) {
      const preview = previewEdit(p, ed);
      editBox = `<div class="edit-box">${p.action_type === "budget_shift"
        ? `<label class="f" for="ed-${p.proposal_id}">Dollars per day to move<input class="input num" id="ed-${p.proposal_id}" type="number" step="10" min="0" value="${ed.per_day}" data-edit="${p.proposal_id}" data-field="per_day"></label>`
        : `<label class="f" for="ed-${p.proposal_id}">Daily budget change (%)<input class="input num" id="ed-${p.proposal_id}" type="number" step="5" value="${Math.round(ed.pct * 100)}" data-edit="${p.proposal_id}" data-field="pct"></label>`}
        <button class="btn primary sm" data-act="edit-approve" data-id="${p.proposal_id}" ${preview.valid && mine ? "" : "disabled"}>Save and approve</button><button class="btn ghost sm" data-act="edit-cancel" data-id="${p.proposal_id}">Cancel</button>
        <div class="policy ${preview.valid ? "" : "bad"}" style="flex-basis:100%" data-tour="edit-policy"><b>Policy engine: ${preview.valid ? "passes" : "blocked"}</b>${preview.valid ? preview.checks.slice(1, 3).join(". ") : `<ul>${preview.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`}</div></div>`;
    }
    const rejectBox = rj ? `<div class="edit-box" style="flex-direction:column;align-items:stretch"><span class="small muted">Pick a reason. The Optimizer learns your imprint's preferences from these.</span><div class="tags">${["Evidence too thin", "Brand or author sensitivity", "Wait until after pub date", "Already handled", "Disagree with diagnosis"].map((tg) => `<button data-act="reject-tag" data-id="${p.proposal_id}" data-tag="${tg}" aria-pressed="${rj.includes(tg)}">${tg}</button>`).join("")}</div><div class="row"><button class="btn sm danger" data-act="reject-confirm" data-id="${p.proposal_id}" ${rj.length ? "" : "disabled"}>Reject proposal</button><button class="btn ghost sm" data-act="reject-cancel" data-id="${p.proposal_id}">Cancel</button></div></div>` : "";
    const statusPill = { pending: '<span class="pill neutral">Pending</span>', partially_approved: '<span class="pill watch">Partly approved</span>', executed: '<span class="pill ok">Executed</span>', rejected: '<span class="pill neutral">Rejected</span>', expired: '<span class="pill neutral">Expired</span>', blocked: '<span class="pill alert">Held by policy</span>' }[p.status];
    return `<article class="prop ${p.status === "blocked" ? "blocked" : ""}" data-prop="${p.proposal_id}">
      <div class="prop-h"><div class="meta-row"><span class="mono">${p.proposal_id}</span><span>${esc(p.agent)}</span>${plat(p.platform)}<span class="risk ${p.risk}">${p.risk} risk</span>${statusPill}</div>
      <div class="small muted">${esc(t.title)} · ${esc(E.imprintById(t.imprint).name)}</div>
      <h4>${esc(p.summary)}</h4></div>
      <div class="prop-b">
        <div><div class="small muted" style="margin-bottom:3px">Evidence</div><ul>${p.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>
        <dl class="kv"><dt>Expected impact</dt><dd>${esc(p.expected_impact.metric)}: <b>${esc(p.expected_impact.estimate)}</b> <span class="muted">(${p.expected_impact.confidence} confidence)</span></dd>
        <dt>Rollback</dt><dd>${esc(p.rollback)}</dd>${open ? `<dt>Expires</dt><dd>${shortDate(p.expires_at)} <span class="muted">(stale evidence is not acted on)</span></dd>` : ""}
        ${p.outcome ? `<dt>Measured outcome</dt><dd><b style="color:var(--good)">${esc(p.outcome)}</b></dd>` : ""}
        ${p.reject_tags ? `<dt>Rejected for</dt><dd>${p.reject_tags.map(esc).join(", ")}</dd>` : ""}</dl>
        ${p.status !== "blocked" ? `<div><div class="small muted" style="margin-bottom:4px">Approval chain</div><div class="chain">${p.requires_approval_from.map((r) => `<span class="${p.approvals.includes(r) ? "done" : ""}">${E.ROLES[r]}</span>`).join("")}</div></div>` : ""}
        ${p.policy.warnings.length ? `<div class="policy"><b>Policy engine notes</b>${p.policy.warnings.map(esc).join(" ")}</div>` : ""}
        ${p.status === "blocked" ? `<div class="policy bad"><b>Blocked by the policy engine. This never reaches a platform.</b><ul>${p.policy.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul></div>` : `<details class="small"><summary class="muted" style="cursor:pointer">Policy checks passed (${p.policy.checks.length})</summary><ul style="margin-top:6px">${p.policy.checks.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`}
        ${ex ? `<div class="exec">${ex.map((x) => `<div>${esc(x)}</div>`).join("")}</div>` : ""}
        ${editBox}${rejectBox}
      </div>
      ${open && !ed && !rj ? `<div class="prop-f">
        <button class="btn primary" data-act="approve" data-id="${p.proposal_id}" ${mine ? "" : "disabled"}>Approve as ${E.ROLES[UI.role]}</button>
        ${editable ? `<button class="btn" data-act="edit" data-id="${p.proposal_id}" ${mine ? "" : "disabled"}>Edit</button>` : ""}
        <button class="btn" data-act="reject" data-id="${p.proposal_id}" ${mine ? "" : "disabled"}>Reject</button>
        <button class="btn ghost" data-act="snooze" data-id="${p.proposal_id}" ${mine ? "" : "disabled"}>Snooze 24h</button>
        ${!mine ? `<span class="small muted">${p.approvals.includes(UI.role) ? "You approved. " : ""}Waiting on ${p.requires_approval_from.filter((r) => !p.approvals.includes(r)).map((r) => E.ROLES[r]).join(", ")}.${p.requires_approval_from.includes(UI.role) ? "" : " Switch role in the top bar to act."}</span>` : ""}
      </div>` : ""}
    </article>`;
  }
  function previewEdit(p, ed) {
    const clone = JSON.parse(JSON.stringify(p));
    const c = campaignById(p.campaign_id);
    if (p.action_type === "budget_shift") {
      clone.params.per_day = ed.per_day;
      const src = c.platforms[p.params.from].daily.slice(-3);
      clone.step_pct = ed.per_day / (E.sum(src, (x) => x.spend) / 3);
      clone.dollar_impact = ed.per_day * p.params.days;
    } else { clone.params.pct = ed.pct; clone.step_pct = Math.abs(ed.pct); }
    return E.validateProposal(S, clone);
  }
  function renderApprovals() {
    const open = S.proposals.filter((p) => p.status === "pending" || p.status === "partially_approved");
    const mine = open.filter((p) => p.requires_approval_from.includes(UI.role) && !p.approvals.includes(UI.role));
    const others = open.filter((p) => !mine.includes(p));
    const done = S.proposals.filter((p) => !open.includes(p)).slice().reverse();
    return `<div class="view-head"><div><div class="eyebrow">Approval queue</div><h1>The agent proposes. You decide.</h1>
      <p>Every change to spend, targeting or creative waits here for a person. Each proposal carries its evidence, expected impact, risk and a rollback. The policy engine, which is ordinary code and not the AI, decides who must approve and blocks anything outside the guardrails.</p></div>
      <div class="role" style="font-size:13px">Acting as <b>${E.ROLES[UI.role]}</b></div></div>
    <section class="stack" data-tour="queue-mine"><h3>Needs you (${mine.length})</h3>${mine.length ? `<div class="cards">${mine.map(propCard).join("")}</div>` : `<p class="muted">Nothing needs ${E.ROLES[UI.role]} right now.</p>`}</section>
    ${others.length ? `<section class="stack" data-tour="queue-others"><h3>Waiting on someone else (${others.length})</h3><div class="cards">${others.map(propCard).join("")}</div></section>` : ""}
    <section class="stack" data-tour="queue-blocked"><h3>Held by guardrails (${S.blocked.length})</h3><p class="muted small" style="max-width:70ch">The Optimizer suggested these, but the deterministic policy engine refused them before they reached anyone's queue. They are shown so you can see the guardrails working.</p><div class="cards">${S.blocked.map(propCard).join("")}</div></section>
    ${done.length ? `<section class="stack"><h3>Decided (${done.length})</h3><div class="cards">${done.map(propCard).join("")}</div></section>` : ""}`;
  }

  // ---------------- BUDGET ----------------
  function renderBudget() {
    const live = S.campaigns.filter((c) => c.status === "live");
    const sel = campaignById(UI.budgetCampaign) || live[0];
    const imps = D.IMPRINTS.map((im) => {
      const cs = S.campaigns.filter((c) => E.titleById(c.titleId).imprint === im.id && c.status !== "completed");
      const done = S.campaigns.filter((c) => E.titleById(c.titleId).imprint === im.id && c.status === "completed");
      const committed = E.sum(cs, (c) => c.budget) + E.sum(done, (c) => E.totals(c).spend);
      const spent = E.sum(cs.concat(done), (c) => E.totals(c).spend);
      const fc = E.sum(cs, (c) => (c.status === "live" ? E.campaignPacing(S, c).forecast : c.budget)) + E.sum(done, (c) => E.totals(c).spend);
      return { im, committed, spent, fc };
    });
    const st = S.settings;
    return `<div class="view-head"><div><div class="eyebrow">Budget steward</div><h1>Budget and pacing</h1>
      <p>MATLOC watches spend hourly so marketers do not have to log into four ad platforms. Every level of the budget (imprint, title, platform, flight phase) shows approved, spent and forecast, so finance and marketing see the same numbers.</p></div></div>

    <div class="panel" data-tour="imprint-budgets"><div class="panel-h"><h3>Imprint budgets (fiscal year)</h3><span class="muted small">Finance view</span></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Imprint</th><th class="n">Annual budget</th><th class="n">Committed</th><th class="n">Spent</th><th class="n">Forecast</th><th class="n">Uncommitted</th></tr></thead><tbody>
      ${imps.map((x) => `<tr><td>${esc(x.im.name)}</td><td class="n">${money(x.im.annualBudget)}</td><td class="n">${money(x.committed)}</td><td class="n">${money(x.spent)}</td><td class="n">${money(x.fc)}</td><td class="n">${money(x.im.annualBudget - x.committed)}</td></tr>`).join("")}
    </tbody></table></div></div>

    <div class="panel" data-tour="hierarchy"><div class="panel-h"><h3>Title and platform budgets</h3><span class="muted small">Select a row to chart it. Expand to see platforms.</span></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Title / platform</th><th class="n">Approved</th><th class="n">Planned to date</th><th class="n">Spent</th><th class="n">vs. curve</th><th class="n">Forecast</th><th class="n">Cap headroom</th><th>Status</th></tr></thead><tbody>
      ${live.map((c) => {
        const a = E.campaignPacing(S, c), t = E.titleById(c.titleId), exp = UI.expanded[c.id];
        return `<tr class="click" data-act="budget-select" data-id="${c.id}" ${sel.id === c.id ? 'style="box-shadow:inset 3px 0 0 var(--accent)"' : ""}><td><div class="tcell"><button class="btn ghost sm" data-act="toggle-exp" data-id="${c.id}" aria-label="${exp ? "Collapse" : "Expand"} platforms" aria-expanded="${!!exp}">${exp ? "−" : "+"}</button>${cover(t, 26)}<div><b>${esc(t.title)}</b><span>${E.phaseOf(c, S.today)} · ${a.elapsedDays}/${a.totalDays} days</span></div></div></td>
          <td class="n">${money(c.budget)}</td><td class="n">${money(a.planned)}</td><td class="n">${money(a.spent)}</td><td class="n">${signed(a.ratio - 1)}</td><td class="n">${money(a.forecast)}</td><td class="n">${money(E.sum(a.rows, (r) => r.cap - r.spent))}</td><td>${pill(a.tier)}</td></tr>
          ${exp ? a.rows.map((r) => `<tr class="sub"><td>${plat(r.platform)}</td><td class="n">${money(r.budget)}</td><td class="n">${money(r.planned)}</td><td class="n">${money(r.spent)}</td><td class="n">${r.status === "active" ? signed(r.ratio - 1) : "-"}</td><td class="n">${money(r.forecast)}</td><td class="n" ${r.cap - r.spent < r.budget * 0.05 ? 'style="color:var(--crit);font-weight:600"' : ""}>${money(r.cap - r.spent)}</td><td>${pill(E.rowTier(S, r))}${r.status === "paused_safety" ? ` <a href="#approvals" class="small">resume</a>` : ""}</td></tr>`).join("") : ""}`;
      }).join("")}
    </tbody></table></div></div>

    <div class="grid g-main">
      <div class="panel" data-tour="pacing-chart"><div class="panel-h"><h3>${esc(E.titleById(sel.titleId).title)}: cumulative spend vs. curve</h3><div class="legend"><span><i style="background:var(--ink-3)"></i>Planned curve</span><span><i style="background:var(--ink)"></i>Actual</span><span><i class="dash"></i>Forecast</span><span><i style="background:var(--crit)"></i>Hard cap</span></div></div>
        <div class="panel-b"><div class="chart" id="pacing"></div><p class="small muted" style="margin-top:8px">Shaded bands are flight phases. Launch week is front-loaded on purpose, so a flat daily average would raise false alarms. Hover for daily values.</p></div></div>
      <div class="panel" data-tour="guardrails"><div class="panel-h"><h3>Guardrails</h3></div><div class="panel-b stack">
        <div class="tbl-wrap"><table class="small"><tbody>
          <tr><td>${pill("watch")}</td><td>±<input class="input num" style="width:56px;display:inline-block;padding:3px 6px" type="number" id="set-watch" value="${Math.round(st.watchPct * 100)}" data-set="watchPct">% from curve or forecast. Shows on dashboard and digest.</td></tr>
          <tr><td>${pill("alert")}</td><td>±<input class="input num" style="width:56px;display:inline-block;padding:3px 6px" type="number" id="set-alert" value="${Math.round(st.alertPct * 100)}" data-set="alertPct">% from curve, or 80% spent before 70% of flight. Notifies owner now.</td></tr>
          <tr><td>${pill("capped")}</td><td>Spend reaches approved budget + <input class="input num" style="width:56px;display:inline-block;padding:3px 6px" type="number" id="set-cap" value="${Math.round(st.capTolerance * 100)}" data-set="capTolerance">% tolerance. Pauses automatically, one click to resume.</td></tr>
        </tbody></table></div>
        <label class="switch"><input type="checkbox" id="set-autopause" ${st.autoPause ? "checked" : ""} data-toggle="autoPause"> Emergency auto-pause on hard cap <span class="muted small">(pause only, never increases spend)</span></label>
        <label class="switch"><input type="checkbox" id="set-kill" ${S.killSwitch ? "checked" : ""} data-toggle="killSwitch"> Kill switch: block all agent-proposed changes</label>
        <div class="policy small" data-tour="spike"><b>Try it: simulate a runaway spend day</b>TikTok on <i>Salt and Signal</i> will spend about 3x plan tomorrow. Watch the safety stop catch it.<div class="row" style="margin-top:8px"><button class="btn primary sm" data-act="spike">Simulate spend spike and advance a day</button></div></div>
      </div></div>
    </div>

    <div class="panel" data-tour="recon"><div class="panel-h"><h3>Reconciliation: October</h3><span class="muted small">Ledger vs. platform-reported vs. invoice</span></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Platform</th><th class="n">Platform-reported</th><th class="n">MATLOC ledger</th><th class="n">Invoice</th><th class="n">Difference</th><th>Explanation</th><th>Status</th></tr></thead><tbody>
      <tr><td>${plat("meta")}</td><td class="n">$18,412.60</td><td class="n">$18,412.60</td><td class="n">$18,371.40</td><td class="n">−$41.20</td><td class="small">Invalid-traffic credit applied on invoice</td><td><span class="pill ok">Explained</span></td></tr>
      <tr><td>${plat("google")}</td><td class="n">$9,880.15</td><td class="n">$9,880.15</td><td class="n">$9,902.77</td><td class="n">+$22.62</td><td class="small">Account timezone (PT) vs. ledger (ET) day cut-off</td><td><span class="pill ok">Explained</span></td></tr>
      <tr><td>${plat("tiktok")}</td><td class="n">$9,105.33</td><td class="n">$9,105.33</td><td class="n">$9,742.70</td><td class="n">+$637.37</td><td class="small">Sales tax line on invoice (7%)</td><td><span class="pill ok">Explained</span></td></tr>
      <tr><td>${plat("amazon")}</td><td class="n">$14,960.02</td><td class="n">$14,960.02</td><td class="n">pending</td><td class="n">-</td><td class="small">Vendor invoice posts on the 10th</td><td><span class="pill info">Waiting</span></td></tr>
    </tbody></table></div></div>`;
  }
  after.budget = () => {
    const c = campaignById(UI.budgetCampaign) || liveCampaigns()[0];
    const dates = E.flightDates(c);
    const asOf = E.addDays(S.today, -1);
    const plannedDaily = dates.map((d) => E.sum(D.PLATFORM_ORDER, (p) => E.plannedDaily(c, p, d)));
    const planned = []; plannedDaily.reduce((t, v, i) => (planned[i] = t + v), 0);
    const byDate = {};
    D.PLATFORM_ORDER.forEach((p) => c.platforms[p].daily.forEach((x) => (byDate[x.date] = (byDate[x.date] || 0) + x.spend)));
    const actual = []; let run = 0;
    dates.forEach((d, i) => { if (d <= asOf) { run += byDate[d] || 0; actual[i] = run; } else actual[i] = null; });
    const a = E.campaignPacing(S, c);
    // forecast: from last actual, add planned daily * recent ratio per platform
    const rr = {};
    D.PLATFORM_ORDER.forEach((p) => { const r = a.rows.find((x) => x.platform === p); if (!r) return; const recent = c.platforms[p].daily.slice(-3); const rp = E.sum(recent, (x) => E.plannedDaily(c, p, x.date)); rr[p] = c.platforms[p].status === "active" && rp ? E.sum(recent, (x) => x.spend) / rp : 0; });
    const forecast = []; let fr = run, started = false;
    dates.forEach((d, i) => { if (d < asOf) forecast[i] = null; else if (d === asOf) { forecast[i] = run; started = true; } else { fr += E.sum(D.PLATFORM_ORDER, (p) => E.plannedDaily(c, p, d) * (rr[p] || 0)); forecast[i] = fr; } });
    if (!started) forecast.fill(null);
    const t = E.titleById(c.titleId);
    C.pacingChart($("#pacing"), { dates, planned, actual, forecast, cap: c.budget * (1 + S.settings.capTolerance), budget: c.budget, phases: dates.map((d) => E.phaseOf(c, d)), pubIdx: dates.indexOf(t.pubDate) });
  };

  // ---------------- TITLE ----------------
  function renderTitle() {
    const options = S.campaigns.filter((c) => c.status !== "scheduled");
    const c = campaignById(UI.titleCampaign) || options[0];
    const t = E.titleById(c.titleId);
    const tot = E.totals(c);
    const a = E.campaignPacing(S, c);
    const dpub = E.daysBetween(S.today, t.pubDate);
    const nonAmazon = D.PLATFORM_ORDER.filter((p) => p !== "amazon").reduce((s, p) => s + E.totals(c, p).actions, 0);
    const amz = E.totals(c, "amazon");
    const crs = c.creatives.map((cr) => ({ cr, ...E.creativeStats(c, cr) })).sort((x, y) => y.ctr - x.ctr);
    const fun = [
      { k: "Impressions", v: tot.imps, note: "platform-reported" },
      { k: "Clicks", v: tot.clicks, note: "platform-reported" },
      { k: "Retailer click-outs", v: nonAmazon, note: "first-party, where-to-buy page" },
      { k: "Amazon attributed orders", v: amz.actions, note: "Amazon 14-day attribution" },
      { k: "Retail sales (all retailers)", v: null, note: "not attributable; see BookScan lift" }
    ];
    const maxF = Math.log10(fun[0].v || 10);
    const log = S.proposals.concat(S.blocked).filter((p) => p.campaign_id === c.id);
    return `<div class="view-head"><div><div class="eyebrow">Title dashboard</div><h1>${esc(t.title)}</h1><p>${esc(t.author)} · ${esc(E.imprintById(t.imprint).name)} · ${t.format} · ${esc(t.genre)}</p></div>
      <label class="f" for="title-sel" style="min-width:260px">Title<select class="input" id="title-sel" data-change="title-sel">${options.map((o) => `<option value="${o.id}" ${o.id === c.id ? "selected" : ""}>${esc(E.titleById(o.titleId).title)}${o.status === "completed" ? " (completed)" : ""}</option>`).join("")}</select></label></div>
    <div class="grid" style="grid-template-columns:auto minmax(0,1fr);align-items:start" data-tour="title-head">
      <div>${cover(t, 110)}</div>
      <div class="stack">
        <dl class="meta-grid"><div><dt>ISBN</dt><dd class="mono">${t.isbn}</dd></div><div><dt>Pub date</dt><dd>${fmtDate(t.pubDate)} <span class="muted">(${dpub > 0 ? dpub + " days to go" : -dpub + " days since"})</span></dd></div><div><dt>BISAC</dt><dd>${esc(t.bisac)}</dd></div><div><dt>Comp titles</dt><dd>${t.comps.map(esc).join(", ")}</dd></div><div><dt>Audience</dt><dd>${t.ageBand}${t.flags.length ? ` <span class="tag">${t.flags.join(", ")} review</span>` : ""}</dd></div><div><dt>Campaign</dt><dd>${shortDate(c.start)} to ${shortDate(c.end)} · ${pill(c.status === "completed" ? "ok" : a.tier)}</dd></div></dl>
        <div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
          <div class="kpi"><div class="lbl">Spend</div><div class="val num">${money(tot.spend)}</div><div class="sub">of ${money(c.budget)}</div></div>
          <div class="kpi"><div class="lbl">Qualified actions</div><div class="val num">${Math.round(tot.actions).toLocaleString()}</div><div class="sub">click-outs + Amazon orders</div></div>
          <div class="kpi"><div class="lbl">Cost per qualified action</div><div class="val num">$${tot.cpa.toFixed(2)}</div><div class="sub">blended, normalized</div></div>
          <div class="kpi"><div class="lbl">Amazon ACoS</div><div class="val num">${amz.sales ? pct(amz.spend / amz.sales, 1) : "-"}</div><div class="sub">platform-attributed</div></div>
        </div>
      </div>
    </div>
    <div class="grid g2">
      <div class="panel" data-tour="funnel"><div class="panel-h"><h3>Funnel</h3><span class="muted small">Log scale</span></div><div class="panel-b funnel">
        ${fun.map((f) => `<div class="funnel-row ${f.v == null ? "unknown" : ""}"><div>${f.k}<div class="small muted">${f.note}</div></div><div class="bar-f" style="width:${f.v == null ? 100 : Math.max(2, (Math.log10(Math.max(f.v, 1)) / maxF) * 100)}%"></div><div class="n num">${f.v == null ? "unknown" : Math.round(f.v).toLocaleString()}</div></div>`).join("")}
        <p class="small muted">MATLOC never presents platform-attributed sales as incremental. Retail sales outside Amazon are measured with BookScan lift and holdout tests, not per click.</p></div></div>
      <div class="panel" data-tour="native"><div class="panel-h"><h3>Platform-native vs. normalized</h3></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Platform</th><th>Native metric</th><th class="n">Native value</th><th class="n">Cost / qualified action</th><th class="n">CTR</th></tr></thead><tbody>
        ${D.PLATFORM_ORDER.filter((p) => c.platformBudget[p]).map((p) => { const x = E.totals(c, p); return `<tr><td>${plat(p)}</td><td class="small">${D.PLATFORMS[p].native.action}</td><td class="n">${Math.round(x.actions).toLocaleString()}</td><td class="n">$${x.cpa.toFixed(2)}</td><td class="n">${pct(x.ctr, 2)}</td></tr>`; }).join("")}
      </tbody></table><p class="small muted" style="margin-top:8px">Each platform grades its own homework, so the native name is always shown next to the normalized number.</p></div></div>
    </div>
    <div class="panel" data-tour="creatives"><div class="panel-h"><h3>Creative leaderboard</h3><span class="muted small">Fatigue = CTR down 25%+ from the first week</span></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Creative</th><th>Platform</th><th>Hook</th><th class="n">Spend</th><th class="n">CTR</th><th>CTR trend</th><th>Health</th><th>Status</th></tr></thead><tbody>
      ${crs.map((x) => `<tr><td>${esc(x.cr.name)}</td><td>${plat(x.cr.platform)}</td><td><span class="tag">${x.cr.hook}</span></td><td class="n">${money(x.spend)}</td><td class="n">${x.imps ? pct(x.ctr, 2) : "-"}</td><td>${C.spark(x.series.map((s) => s.ctr), 110, 26, x.ctrDrop > 0.25 ? "var(--crit)" : "var(--ink-2)")}</td><td>${x.series.length < 4 ? '<span class="pill info">New</span>' : x.ctrDrop > 0.25 ? `<span class="pill alert">Fatigued ${signed(-x.ctrDrop)}</span>` : '<span class="pill ok">Healthy</span>'}</td><td>${x.cr.status === "active" ? '<span class="pill neutral">Active</span>' : '<span class="pill paused">Paused</span>'}</td></tr>`).join("")}
    </tbody></table></div></div>
    <div class="panel"><div class="panel-h"><h3>Optimization log</h3><span class="muted small">Every proposal, decision, execution and outcome for this title</span></div><div class="panel-b tbl-wrap">${log.length ? `<table><thead><tr><th>Proposal</th><th>Summary</th><th>Risk</th><th>Status</th><th>Outcome</th></tr></thead><tbody>${log.map((p) => `<tr><td class="mono small">${p.proposal_id}</td><td>${esc(p.summary)}</td><td><span class="risk ${p.risk}">${p.risk}</span></td><td>${p.status.replace("_", " ")}</td><td class="small">${p.outcome ? esc(p.outcome) : "-"}</td></tr>`).join("")}</tbody></table>` : '<p class="muted">No proposals for this title.</p>'}</div></div>`;
  }

  // ---------------- LAUNCH WIZARD ----------------
  const WSTEPS = ["Select title", "Define campaign", "Review the plan", "Creative and copy", "Compliance", "Approve and schedule", "Verify launch"];
  function renderLaunch() {
    const W = UI.wiz;
    const t = W.titleId ? E.titleById(W.titleId) : null;
    const maxStep = !t ? 0 : !W.plan ? 1 : !W.checks ? 3 : W.launched ? 6 : 5;
    const steps = `<nav class="steps" aria-label="Launch steps" data-tour="wiz-steps">${WSTEPS.map((s, i) => `<button data-act="wiz-go" data-step="${i}" class="${i < W.step ? "done" : ""}" ${i === W.step ? 'aria-current="step"' : ""} ${i > maxStep || (W.launched && i < 6) ? "disabled" : ""}>${s}</button>`).join("")}</nav>`;
    let body = "";
    if (W.step === 0) {
      body = `<div class="panel"><div class="panel-h"><h3>Choose a title</h3><input class="input" style="max-width:280px" placeholder="Search by ISBN, title or imprint" id="title-search" aria-label="Search titles" value="978-1-250-99006-6"></div><div class="panel-b stack">
        <div class="title-pick" data-tour="wiz-titles">${D.TITLES.map((x) => `<button class="title-card" data-act="wiz-title" data-id="${x.id}" aria-pressed="${W.titleId === x.id}" ${x.unlaunched ? "" : "disabled"}>${cover(x, 44)}<div><b>${esc(x.title)}</b><div class="small muted">${esc(x.author)} · ${esc(E.imprintById(x.imprint).name)}</div><div class="small muted">pub ${shortDate(x.pubDate)} · ${x.unlaunched ? "no campaign yet" : "campaign exists"}</div></div></button>`).join("")}</div>
        ${t ? `<div class="panel" style="background:var(--surface-2);border:0"><div class="panel-b"><div class="small muted" style="margin-bottom:8px">Auto-filled from title metadata (ONIX)</div><dl class="meta-grid"><div><dt>ISBN</dt><dd class="mono">${t.isbn}</dd></div><div><dt>Pub date</dt><dd>${fmtDate(t.pubDate)}</dd></div><div><dt>Format · price</dt><dd>${t.format} · $${t.price}</dd></div><div><dt>BISAC</dt><dd>${esc(t.bisac)}</dd></div><div><dt>Comps</dt><dd>${t.comps.map(esc).join(", ")}</dd></div><div><dt>ASIN</dt><dd class="mono">${t.asin}</dd></div></dl></div></div>
        <div><button class="btn primary" data-act="wiz-go" data-step="1">Continue</button></div>` : ""}
      </div></div>`;
    } else if (W.step === 1) {
      const b = W.brief;
      body = `<div class="panel" data-tour="wiz-brief"><div class="panel-h"><h3>Campaign brief for ${esc(t.title)}</h3></div><div class="panel-b grid g2">
        <label class="f" for="b-obj">Objective<select class="input" id="b-obj" data-brief="objective">${[["preorder", "Pre-order"], ["launch", "Launch week"], ["backlist", "Backlist push"], ["event", "Event or tour"], ["award", "Award or review moment"]].map(([v, l]) => `<option value="${v}" ${b.objective === v ? "selected" : ""}>${l}</option>`).join("")}</select></label>
        <label class="f" for="b-budget">Total budget (USD)<input class="input num" id="b-budget" type="number" step="500" value="${b.budget}" data-brief="budget"></label>
        <label class="f" for="b-start">Flight start<input class="input" id="b-start" type="date" value="${b.start}" data-brief="start"></label>
        <label class="f" for="b-end">Flight end<input class="input" id="b-end" type="date" value="${b.end}" data-brief="end"></label>
        <label class="f" for="b-dest">Destination<select class="input" id="b-dest" data-brief="destination">${["Imprint where-to-buy page", "Amazon detail page", "Macmillan direct-to-consumer"].map((v) => `<option ${b.destination === v ? "selected" : ""}>${v}</option>`).join("")}</select></label>
        <label class="f" for="b-ex">Exclusions<input class="input" id="b-ex" value="${esc(b.exclusions)}" data-brief="exclusions"></label>
        <div style="grid-column:1/-1" class="row"><button class="btn primary" data-act="wiz-plan">Draft the plan</button><span class="small muted">The Planner uses title metadata, genre benchmarks and past campaigns. Budgets above $25,000 need a marketing director.</span></div>
      </div></div>`;
    } else if (W.step === 2) {
      const P = W.plan;
      const split = W.splitEdit;
      const sumSplit = Math.round(E.sum(D.PLATFORM_ORDER, (p) => split[p]));
      body = `<div class="grid g-main"><div class="stack">
        <div class="panel" data-tour="wiz-plan"><div class="panel-h"><h3>Channel mix and budget</h3><span class="small ${sumSplit === 100 ? "muted" : ""}" ${sumSplit !== 100 ? 'style="color:var(--crit);font-weight:600"' : ""}>Total ${sumSplit}%</span></div><div class="panel-b tbl-wrap"><table><thead><tr><th>Platform</th><th>Share</th><th class="n">Budget</th><th class="n">Projected click-outs / orders</th><th>Structure</th></tr></thead><tbody>
          ${D.PLATFORM_ORDER.map((p) => `<tr><td>${plat(p)}</td><td><input class="input num" style="width:70px" type="number" min="0" max="100" id="split-${p}" value="${Math.round(split[p])}" data-split="${p}" aria-label="${D.PLATFORMS[p].name} share"></td><td class="n">${money((W.brief.budget * split[p]) / 100)}</td><td class="n">${split[p] ? `${Math.round((P.outcomes[p][0] * split[p]) / (P.split[p] * 100 || 1)).toLocaleString()} to ${Math.round((P.outcomes[p][1] * split[p]) / (P.split[p] * 100 || 1)).toLocaleString()}` : "-"}</td><td class="small">${esc(P.structure[p])}</td></tr>`).join("")}
        </tbody></table><p class="small muted" style="margin-top:8px">Projections are ranges from Macmillan benchmarks by genre, not promises.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Pacing curve tied to the pub date</h3><div class="legend"><span><i style="background:var(--ink-3)"></i>Pre-order</span><span><i style="background:var(--accent)"></i>Launch week</span><span><i style="background:var(--ink-2)"></i>Sustain</span></div></div><div class="panel-b"><div class="chart" id="curve"></div></div></div>
      </div><div class="stack">
        <div class="panel"><div class="panel-h"><h3>Why this plan</h3></div><div class="panel-b"><ul style="margin:0;padding-left:18px;display:flex;flex-direction:column;gap:6px">${P.why.map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div></div>
        <div class="panel"><div class="panel-h"><h3>Tracking setup</h3></div><div class="panel-b small stack"><div>Meta Pixel + Conversions API and TikTok Pixel on the where-to-buy page; retailer click-out events; Amazon Attribution tags.</div>${D.PLATFORM_ORDER.map((p) => `<div class="mono" style="word-break:break-all">${P.utm(p)}</div>`).join("")}</div></div>
        <div class="policy"><b>What the agent will do next</b>Draft copy variants per platform, then run compliance checks. Nothing is created on any platform until you approve.</div>
        <div><button class="btn primary" data-act="wiz-go" data-step="3" ${sumSplit === 100 ? "" : "disabled"}>Accept plan and draft creative</button></div>
      </div></div>`;
    } else if (W.step === 3) {
      body = `<div class="grid g-main"><div class="panel" data-tour="wiz-copy"><div class="panel-h"><h3>Copy variants</h3><span class="small muted">Agent-drafted, editable. Limits per platform.</span></div><div class="panel-b copy-grid">
        ${D.PLATFORM_ORDER.map((p) => { const lim = E.LIMITS[p]; const len = W.copy[p].length; return `<label class="f" for="copy-${p}"><span class="row" style="justify-content:space-between">${plat(p)}<span class="muted">${lim.label}</span></span><textarea class="input" id="copy-${p}" data-copy="${p}" rows="3">${esc(W.copy[p])}</textarea><span class="counter ${len > lim.max ? "over" : ""}" id="cnt-${p}">${len}/${lim.max}</span></label>`; }).join("")}
      </div></div>
      <div class="panel" data-tour="wiz-assets"><div class="panel-h"><h3>Assets from the library</h3></div><div class="panel-b stack">
        ${(D.ASSETS[t.id] || []).map((a) => `<label class="asset" for="as-${a.id}"><input type="checkbox" id="as-${a.id}" data-asset="${a.id}" ${W.assets.includes(a.id) ? "checked" : ""}><div style="flex:1"><div>${esc(a.type)}</div><div class="small muted">${esc(a.note)}</div></div>${a.rights === "cleared" ? '<span class="pill ok">Cleared</span>' : '<span class="pill watch">Pending</span>'}</label>`).join("")}
        <button class="btn primary" data-act="wiz-check">Run compliance checks</button></div></div></div>`;
    } else if (W.step === 4) {
      const ch = W.checks;
      const fails = ch.filter((x) => x.result === "fail").length, warns = ch.filter((x) => x.result === "warn").length;
      body = `<div class="panel" data-tour="wiz-compliance"><div class="panel-h"><h3>Pre-flight compliance</h3><div class="row">${fails ? `<span class="pill alert">${fails} failing: launch blocked</span>` : '<span class="pill ok">No failures</span>'}${warns ? `<span class="pill watch">${warns} warning${warns > 1 ? "s" : ""}</span>` : ""}</div></div>
        <div class="panel-b">${ch.map((x) => `<div class="check"><span class="res ${x.result}">${x.result}</span><span><b class="small">${x.group}</b>${x.platform ? `<div>${plat(x.platform)}</div>` : ""}</span><span class="small">${esc(x.text)}${x.fix && x.fix.kind === "copy" ? `<div class="mono muted" style="margin-top:3px">Suggested: "${esc(x.fix.value)}"</div>` : ""}</span><span>${x.fix ? `<button class="btn sm" data-act="wiz-fix" data-id="${x.id}">${x.fix.label}</button>` : ""}</span></div>`).join("")}</div>
        <div class="prop-f"><button class="btn" data-act="wiz-fix-all" ${fails || warns ? "" : "disabled"} data-tour="wiz-fixall">Apply all suggested fixes</button><button class="btn primary" data-act="wiz-go" data-step="5" ${fails ? "disabled" : ""}>Continue to approval</button><span class="small muted">Failures block launch. Warnings are allowed but logged.</span></div></div>`;
    } else if (W.step === 5) {
      const req = E.approversForPlan(W.brief.budget, t);
      const all = req.every((r) => W.approvals.includes(r));
      body = `<div class="grid g2"><div class="panel" data-tour="wiz-approve"><div class="panel-h"><h3>Required approvals</h3><span class="small muted">Set by the policy engine from budget and title flags</span></div><div class="panel-b stack">
        ${req.map((r) => `<div class="row" style="justify-content:space-between;border-top:1px solid var(--line);padding-top:10px"><div><b>${E.ROLES[r]}</b><div class="small muted">${r === "marketing_director" ? `Budget ${money(W.brief.budget)} is above the $25,000 threshold` : r === "compliance" ? "Flagged title" : "Plan owner"}</div></div>${W.approvals.includes(r) ? '<span class="pill ok">Approved</span>' : `<button class="btn sm" data-act="wiz-approve" data-role="${r}">Sign off as ${E.ROLES[r]}</button>`}</div>`).join("")}
        <p class="small muted">In production each approver signs off from their own account, often on a phone. In the demo you can sign for each role.</p></div></div>
        <div class="panel"><div class="panel-h"><h3>Launch summary</h3></div><div class="panel-b stack small">
          <div><b>${esc(t.title)}</b>, ${W.brief.objective}, ${money(W.brief.budget)}, ${fmtDate(W.brief.start)} to ${fmtDate(W.brief.end)}</div>
          <div>${D.PLATFORM_ORDER.filter((p) => W.splitEdit[p]).map((p) => `${plat(p)} ${money((W.brief.budget * W.splitEdit[p]) / 100)}`).join(" · ")}</div>
          <div>Campaigns are created <b>paused or scheduled</b>, then read back and verified before they go live. Platform-side account spend limits are set as a second line of defense.</div>
          <div class="row"><button class="btn primary" data-act="wiz-launch" ${all ? "" : "disabled"}>Build and schedule on ${D.PLATFORM_ORDER.filter((p) => W.splitEdit[p]).length} platforms</button></div></div></div></div>`;
    } else if (W.step === 6) {
      const v = W.verify;
      const mism = v.filter((x) => !x.ok).length;
      body = `<div class="panel" data-tour="wiz-verify"><div class="panel-h"><h3>Post-launch verification</h3>${mism ? `<span class="pill alert">${mism} mismatch</span>` : '<span class="pill ok">All settings verified</span>'}</div><div class="panel-b verify">
        ${v.map((x) => `<div><span class="res ${x.ok ? "pass" : "fail"}" style="width:48px;flex:none">${x.ok ? "ok" : "diff"}</span><span style="flex:1">${plat(x.p)} ${esc(x.text)}</span>${x.ok ? "" : `<button class="btn sm" data-act="wiz-reapply" data-p="${x.p}">Re-apply setting</button>`}</div>`).join("")}
      </div><div class="prop-f"><a class="btn primary" href="#portfolio">See it in the portfolio</a><button class="btn ghost" data-act="wiz-reset">Start another launch</button></div></div>`;
    }
    return `<div class="view-head"><div><div class="eyebrow">Launch</div><h1>Launch a campaign, title first</h1><p>Describe the campaign once. The Planner drafts a four-platform plan, the Builder creates it through each platform's official API, and nothing goes live until compliance passes and the right people approve.</p></div></div>${steps}${body}`;
  }
  after.launch = () => {
    const W = UI.wiz;
    if (W.step === 2 && W.plan) {
      const curve = W.plan.curve.map((x) => ({ ...x }));
      C.curveBars($("#curve"), curve, W.brief.budget);
    }
  };
  function wizPlan() {
    const W = UI.wiz, t = E.titleById(W.titleId);
    W.plan = E.draftPlan(t, W.brief);
    W.splitEdit = {}; D.PLATFORM_ORDER.forEach((p) => (W.splitEdit[p] = Math.round(W.plan.split[p] * 100)));
    W.step = 2; W.checks = null;
  }
  function wizCheck() {
    const W = UI.wiz, t = E.titleById(W.titleId);
    W.checks = E.runCompliance(t, W.copy, W.assets, W.brief.budget, W.brief.destination);
    W.step = 4;
  }
  function wizFix(id) {
    const W = UI.wiz; const x = W.checks.find((c) => c.id === id); if (!x || !x.fix) return;
    if (x.fix.kind === "copy") W.copy[x.fix.platform] = x.fix.value;
    if (x.fix.kind === "assets") W.assets = W.assets.filter((a) => !x.fix.remove.includes(a));
    wizCheck();
  }
  function wizFixAll() { let guard = 0; while (UI.wiz.checks.some((c) => c.fix) && guard++ < 12) wizFix(UI.wiz.checks.find((c) => c.fix).id); }
  function wizLaunch() {
    const W = UI.wiz, t = E.titleById(W.titleId);
    const plan = { ...W.plan, split: {}, allocation: {} };
    D.PLATFORM_ORDER.forEach((p) => { plan.split[p] = W.splitEdit[p] / 100; plan.allocation[p] = Math.round((W.brief.budget * W.splitEdit[p]) / 100); });
    E.launchCampaign(S, t, W.brief, plan);
    W.launched = true; W.step = 6;
    W.verify = D.PLATFORM_ORDER.filter((p) => plan.allocation[p]).map((p) => ({
      p, ok: p !== "meta",
      text: { meta: "Advantage+ placements read back OFF; plan says ON (campaign budget and Advantage+ audience match).", google: "Search + Demand Gen created, budgets match, brand terms protected, scheduled for " + shortDate(W.brief.start) + ".", tiktok: "Smart+ campaign created, budget automation off as planned, pixel event 'ClickOut' mapped.", amazon: "Sponsored Products (auto + exact) and Sponsored Brands created on ASIN " + t.asin + "; account spend limit set." }[p]
    }));
  }

  // ---------------- REPORT ----------------
  function renderReport() {
    const options = S.campaigns.filter((c) => c.status !== "scheduled");
    const c = campaignById(UI.reportCampaign) || options[0];
    const R = E.report(S, c);
    const t = R.title;
    const live = c.status === "live";
    return `<div class="view-head"><div><div class="eyebrow">Reporter</div><h1>End-of-campaign report</h1><p>Generated automatically when a flight ends, with no manual data pulls. In production it exports to PDF and slides.</p></div>
      <label class="f" for="report-sel" style="min-width:260px">Campaign<select class="input" id="report-sel" data-change="report-sel">${options.map((o) => `<option value="${o.id}" ${o.id === c.id ? "selected" : ""}>${esc(E.titleById(o.titleId).title)}${o.status === "completed" ? " (completed)" : " (in flight: interim)"}</option>`).join("")}</select></label></div>
    <article class="report" data-tour="report">
      <header>${cover(t, 84)}<div class="stack" style="gap:6px;flex:1;min-width:220px"><div class="eyebrow" style="margin:0">${live ? "Interim report" : "Final report"} · ${esc(E.imprintById(t.imprint).name)}</div><h2 style="font-size:28px">${esc(t.title)}</h2><div class="muted">${esc(t.author)} · ${fmtDate(c.start)} to ${fmtDate(c.end)} · ${money(c.budget)} approved</div></div></header>
      <section><h3>Executive summary</h3><p class="lede">${esc(R.summary)}</p>${R.amazonLine ? `<p>${esc(R.amazonLine)}</p>` : ""}</section>
      <section><h3>Goal vs. actual</h3><div class="kpis" style="grid-template-columns:repeat(4,minmax(0,1fr))">
        <div class="kpi"><div class="lbl">Budget used</div><div class="val num">${pct(R.all.spend / c.budget, 1)}</div><div class="sub">${money(R.all.spend)}</div></div>
        <div class="kpi"><div class="lbl">Qualified actions</div><div class="val num">${Math.round(R.all.actions).toLocaleString()}</div><div class="sub">goal ${R.goal.toLocaleString()}</div></div>
        <div class="kpi"><div class="lbl">Cost per action</div><div class="val num">$${R.all.cpa.toFixed(2)}</div><div class="sub">plan $2.75</div></div>
        <div class="kpi"><div class="lbl">Changes approved</div><div class="val num">${live ? S.proposals.filter((p) => p.campaign_id === c.id && p.status === "executed").length : 3}</div><div class="sub">0 unapproved</div></div></div></section>
      <section><h3>Spend and efficiency by platform</h3><div class="tbl-wrap"><table><thead><tr><th>Platform</th><th class="n">Budget</th><th class="n">Spend</th><th class="n">Clicks</th><th class="n">Qualified actions</th><th class="n">Cost / action</th><th class="n">CTR</th></tr></thead><tbody>
        ${R.rows.map((r) => `<tr><td>${plat(r.p)}</td><td class="n">${money(r.budget)}</td><td class="n">${money(r.spend)}</td><td class="n">${Math.round(r.clicks).toLocaleString()}</td><td class="n">${Math.round(r.actions).toLocaleString()}</td><td class="n">$${r.cpa.toFixed(2)}</td><td class="n">${pct(r.ctr, 2)}</td></tr>`).join("")}
      </tbody></table></div></section>
      <section><h3>Best and worst creative</h3><div class="grid g2">
        <div class="panel"><div class="panel-b"><span class="pill ok">Best</span><h4 style="font:500 17px var(--f-display);margin:8px 0 4px">${esc(R.crs[0].cr.name)}</h4><div class="small muted">${D.PLATFORMS[R.crs[0].cr.platform].name} · CTR ${pct(R.crs[0].ctr, 2)}</div><p class="small" style="margin-top:6px">Hypothesis: ${R.crs[0].cr.hook === "trailer" ? "motion and an early hook beat static cover art for this genre." : R.crs[0].cr.hook === "quote" ? "third-party praise lowered the risk of trying a new author." : "intent-driven placements convert readers already searching."}</p></div></div>
        <div class="panel"><div class="panel-b"><span class="pill alert">Weakest</span><h4 style="font:500 17px var(--f-display);margin:8px 0 4px">${esc(R.crs[R.crs.length - 1].cr.name)}</h4><div class="small muted">${D.PLATFORMS[R.crs[R.crs.length - 1].cr.platform].name} · CTR ${pct(R.crs[R.crs.length - 1].ctr, 2)}</div><p class="small" style="margin-top:6px">Hypothesis: static cover-only creative fatigued fastest; frequency rose while CTR fell after week two.</p></div></div></div></section>
      <section><h3>Optimizations and their measured effect</h3><ul>${(live ? S.proposals.filter((p) => p.campaign_id === c.id && p.status === "executed").map((p) => `${p.summary}${p.outcome ? ": " + p.outcome : " (outcome pending)"}`) : R.actions).map((a) => `<li>${esc(a)}</li>`).join("") || "<li>No changes executed yet.</li>"}</ul></section>
      <section><h3>Measurement caveats</h3><div class="caveat stack small">${R.caveats.map((x) => `<div>${esc(x)}</div>`).join("")}</div></section>
      <section><h3>Recommended plan for next time</h3><ol>${R.next.map((x) => `<li>${esc(x)}</li>`).join("")}</ol></section>
    </article>`;
  }

  // ---------------- AUDIT ----------------
  function renderAudit() {
    const f = UI.auditFilter;
    const rows = S.audit.filter((a) => f === "all" || a.actor === f);
    return `<div class="view-head"><div><div class="eyebrow">Governance</div><h1>Audit log</h1><p>Every action is traceable: who or what acted, what changed, and the state before and after. Agents never appear as the actor on a live-account change; only people, the execution engine acting on an approval, or the safety stop.</p></div>
      <div class="seg" role="group" aria-label="Filter by actor">${["all", "human", "agent", "system"].map((k) => `<button data-act="audit-filter" data-k="${k}" aria-pressed="${f === k}">${k === "all" ? "All" : k[0].toUpperCase() + k.slice(1)}</button>`).join("")}</div></div>
    <div class="panel" data-tour="audit"><div class="panel-b tbl-wrap"><table><thead><tr><th>Time</th><th>Actor</th><th>Who</th><th>Action</th><th>Entity</th><th>Before</th><th>After</th></tr></thead><tbody>
      ${rows.map((a) => `<tr><td class="mono small" style="white-space:nowrap">${a.ts.slice(0, 10)} ${a.ts.slice(11, 16)}</td><td><span class="pill ${a.actor === "human" ? "ok" : a.actor === "agent" ? "info" : "neutral"}">${a.actor}</span></td><td class="small">${esc(a.who)}</td><td>${esc(a.action)}</td><td class="small">${esc(a.entity)}</td><td class="small mono">${esc(a.before)}</td><td class="small mono">${esc(a.after)}</td></tr>`).join("")}
    </tbody></table></div></div>`;
  }

  // ---------------- actions ----------------
  function approve(id) {
    const r = E.decide(S, id, UI.role, "approve");
    if (!r.ok) return toast(r.reason);
    if (r.steps) UI.exec[id] = r.steps;
    toast(r.status === "executed" ? "Approved and executed. Read-back verified." : `Approved. Waiting on ${r.waitingOn.map((x) => E.ROLES[x]).join(", ")}.`);
    render();
  }
  const ACT = {
    "open-title": (d) => { UI.titleCampaign = d.id; location.hash = "title"; },
    "dismiss-alert": (d) => { const a = S.alerts.find((x) => x.id === d.id); if (a) a.open = false; render(); },
    approve: (d) => approve(d.id),
    edit: (d) => { const p = S.proposals.find((x) => x.proposal_id === d.id); UI.edit[d.id] = p.action_type === "budget_shift" ? { per_day: p.params.per_day } : { pct: p.params.pct }; render(); },
    "edit-cancel": (d) => { delete UI.edit[d.id]; render(); },
    "edit-approve": (d) => {
      const r = E.decide(S, d.id, UI.role, "edit", { params: UI.edit[d.id] });
      delete UI.edit[d.id];
      if (!r.ok) toast(r.reason); else { if (r.steps) UI.exec[d.id] = r.steps; toast(r.status === "executed" ? "Edited, approved and executed." : "Edited and approved. Waiting on other approvers."); }
      render();
    },
    reject: (d) => { UI.reject[d.id] = []; render(); },
    "reject-tag": (d) => { const a = UI.reject[d.id]; const i = a.indexOf(d.tag); i >= 0 ? a.splice(i, 1) : a.push(d.tag); render(); },
    "reject-cancel": (d) => { delete UI.reject[d.id]; render(); },
    "reject-confirm": (d) => { E.decide(S, d.id, UI.role, "reject", { tags: UI.reject[d.id] }); delete UI.reject[d.id]; toast("Rejected. Reason recorded for the Optimizer."); render(); },
    snooze: (d) => { E.decide(S, d.id, UI.role, "snooze"); toast("Snoozed for 24 hours. Expiry moved by a day."); render(); },
    advance: () => { const f = E.advanceDay(S); toast(`Advanced to ${fmtDate(S.today)}. ${f.length ? f.length + " new alert(s)." : "No new alerts."}`); render(); },
    spike: () => { S.injectSpike = { campaign_id: "cmp_salt", platform: "tiktok" }; UI.budgetCampaign = "cmp_salt"; UI.expanded.cmp_salt = true; const f = E.advanceDay(S); toast(f.some((a) => a.type === "hard_cap") ? "Spend spike hit the hard cap. TikTok paused automatically." : "Advanced one day."); render(); },
    "budget-select": (d, el, ev) => { if (ev.target.closest('[data-act="toggle-exp"]')) return; UI.budgetCampaign = d.id; render(); },
    "toggle-exp": (d) => { UI.expanded[d.id] = !UI.expanded[d.id]; UI.budgetCampaign = d.id; render(); },
    "audit-filter": (d) => { UI.auditFilter = d.k; render(); },
    "wiz-title": (d) => { UI.wiz.titleId = d.id; render(); },
    "wiz-go": (d) => { UI.wiz.step = +d.step; render(); },
    "wiz-plan": () => { wizPlan(); render(); },
    "wiz-check": () => { wizCheck(); render(); },
    "wiz-fix": (d) => { wizFix(d.id); render(); },
    "wiz-fix-all": () => { wizFixAll(); toast("Applied suggested fixes and re-ran checks."); render(); },
    "wiz-approve": (d) => { UI.wiz.approvals.push(d.role); render(); },
    "wiz-launch": () => { wizLaunch(); render(); },
    "wiz-reapply": (d) => { const v = UI.wiz.verify.find((x) => x.p === d.p); v.ok = true; v.text = "Advantage+ placements re-applied and read back ON. Matches plan."; S.audit.unshift({ ts: S.today + "T09:31:00Z", actor: "system", who: "Builder", action: "Corrected setting after read-back mismatch", entity: E.titleById(UI.wiz.titleId).title + " · meta", before: "placements: manual", after: "placements: Advantage+" }); render(); },
    "wiz-reset": () => { UI.wiz = freshWizard(); render(); }
  };
  document.addEventListener("click", (ev) => {
    const el = ev.target.closest("[data-act]");
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (fn) { ev.preventDefault(); fn(el.dataset, el, ev); }
  });
  document.addEventListener("input", (ev) => {
    const el = ev.target;
    if (el.dataset.copy) { UI.wiz.copy[el.dataset.copy] = el.value; const lim = E.LIMITS[el.dataset.copy].max; const cn = $("#cnt-" + el.dataset.copy); cn.textContent = el.value.length + "/" + lim; cn.classList.toggle("over", el.value.length > lim); }
  });
  document.addEventListener("change", (ev) => {
    const el = ev.target;
    if (el.id === "role") { UI.role = el.value; render(); return; }
    if (el.dataset.change === "title-sel") { UI.titleCampaign = el.value; render(); }
    if (el.dataset.change === "report-sel") { UI.reportCampaign = el.value; render(); }
    if (el.dataset.set) { S.settings[el.dataset.set] = Math.max(0, +el.value) / 100; render(); }
    if (el.dataset.toggle === "autoPause") { S.settings.autoPause = el.checked; render(); }
    if (el.dataset.toggle === "killSwitch") { S.killSwitch = el.checked; S.audit.unshift({ ts: S.today + "T10:00:00Z", actor: "human", who: E.ROLES[UI.role], action: "Kill switch " + (el.checked ? "ON" : "OFF"), entity: "All accounts", before: el.checked ? "off" : "on", after: el.checked ? "on" : "off" }); render(); }
    if (el.dataset.edit) { const ed = UI.edit[el.dataset.edit]; if (el.dataset.field === "pct") ed.pct = +el.value / 100; else ed.per_day = +el.value; render(); setTimeout(() => { const i = $("#ed-" + el.dataset.edit); i && i.focus(); }, 0); }
    if (el.dataset.brief) { UI.wiz.brief[el.dataset.brief] = el.dataset.brief === "budget" ? +el.value : el.value; }
    if (el.dataset.split) { UI.wiz.splitEdit[el.dataset.split] = Math.max(0, +el.value); render(); }
    if (el.dataset.asset) { const a = UI.wiz.assets; el.checked ? a.push(el.dataset.asset) : a.splice(a.indexOf(el.dataset.asset), 1); }
  });
  window.addEventListener("hashchange", render);

  // ---------------- public API for the guided tour ----------------
  window.APP = {
    render, get S() { return S; }, UI, ACT, toast,
    reset() { S = E.makeState(); UI.wiz = freshWizard(); UI.edit = {}; UI.reject = {}; UI.exec = {}; UI.role = "imprint_marketer"; UI.budgetCampaign = "cmp_salt"; UI.titleCampaign = "cmp_glass"; UI.reportCampaign = "cmp_ninefold"; UI.expanded = { cmp_salt: true }; render(); },
    setRole(r) { UI.role = r; render(); },
    approve,
    findProposal(key) { return S.proposals.concat(S.blocked).find((p) => p.key === key); },
    wiz: { pick(id) { UI.wiz.titleId = id; UI.wiz.step = 1; }, plan: wizPlan, check() { UI.wiz.step = 3; wizCheck(); }, fixAll: wizFixAll, signAll() { const t = E.titleById(UI.wiz.titleId); UI.wiz.approvals = E.approversForPlan(UI.wiz.brief.budget, t); UI.wiz.step = 5; }, launch: wizLaunch }
  };
  render();
})();
