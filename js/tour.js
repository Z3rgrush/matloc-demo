/* Guided walkthrough: a spotlight tour that drives the live app.
   Every action step has a "Do it for me" button so a presenter can run the story one-handed. */
(function () {
  "use strict";
  const A = window.APP;
  const go = (r) => { if (location.hash.replace(/^#/, "") !== r) location.hash = r; A.render(); };
  const prop = (key) => { const p = A.findProposal(key); return p ? `[data-prop="${p.proposal_id}"]` : null; };
  const approve = (key) => { const p = A.findProposal(key); if (p && (p.status === "pending" || p.status === "partially_approved")) A.ACT.approve({ dataset: { id: p.proposal_id } }); };
  const openSugg = (key) => { const p = A.findProposal(key) || A.S.blocked.find((x) => x.key === key); if (p) A.UI.openSugg[p.proposal_id] = true; };
  const ORCHARD = "9781250990066";
  const genFor = () => { const L = A.openLaunch(ORCHARD); if (!L.launched) { L.mode = "generate"; if (!L.variants) { A.ACT.fast = true; A.ACT.gen(); A.ACT.fast = false; } } };
  const signAll = () => { genFor(); const L = A.UI.launch; const t = window.ARGUS.titleById(ORCHARD); window.ARGUS.approversForPlan(L.brief.budget, t).forEach((r) => { if (!L.launched && !L.signed.includes(r)) A.ACT.signoff({ dataset: { role: r } }); }); };

  const STEPS = [
    { route: "", title: "Meet Argus", body: "<p>ARGUS is an always-on advertising specialist for Macmillan imprints. It launches campaigns on Meta, Google, TikTok and Amazon Ads using proven settings, watches them every day, and brings you the changes worth making.</p><p>This tour takes about five minutes. Daggerbound's details are real; all ad and sales numbers are illustrative.</p>" },
    { route: "", target: '[data-tour="title-head"]', title: "One title, one page", body: "<p>The landing page shows everything for a single title: who it's by, which imprint, and a <b>Launch ad</b> button to start a new campaign for it.</p>" },
    { route: "", target: '[data-tour="title-tiles"]', title: "Spent, pacing, results, health", body: "<p>Spend across every campaign for the title, how the live campaign is pacing against its plan, retailer click-outs plus Amazon orders, and a 0 to 100 health score with the main reason.</p>" },
    { route: "", target: '[data-tour="landing-suggestions"]', title: "Every suggestion in one list", body: "<p>Each suggestion is one line; click it to see the evidence, expected impact and the approve button. The page keeps it to the top three: decisions first, then lessons from ended campaigns.</p>" },
    { route: "", target: '[data-tour="title-campaigns"]', title: "Campaigns and platforms", body: "<p>Below: every campaign the title has run, then how spend and results break down by platform across all of them.</p>" },
    { route: "", target: '[data-tour="sales-chart"]', title: "Spend next to sales", body: "<p>Weekly ad spend against unit sales, with pre-orders before on-sale week. Argus calls this context, not proof; a holdout test is how it would measure true lift.</p>" },
    { route: "menu", target: '[data-tour="home-rows"]', title: "Three paths", body: "<p>The menu has the rest: <b>Reporting center</b> for every campaign, <b>Launch center</b> to start from an ISBN, and <b>Title reporting</b> for any other title.</p>" },
    { route: "reporting", target: '[data-tour="rep-rows"]', title: "Reporting center", body: "<p>Every active and ended campaign, worst health first. The number on the right is how many suggestions Argus has for that campaign.</p>" },
    { route: "campaign/cmp_dagger", prep: () => openSugg("fatigue_cr_g1"), target: () => prop("fatigue_cr_g1"), title: "A suggestion", body: "<p>Open a campaign to see every suggestion as a headline. Expand one for the evidence, the expected impact, its confidence and how to undo it.</p><p>Here the cover-led Meta ad is wearing out: CTR is falling while frequency rises.</p>", do: () => approve("fatigue_cr_g1"), doLabel: "Approve it for me" },
    { route: "campaign/cmp_dagger", target: () => prop("fatigue_cr_g1"), title: "Done and verified", body: "<p>Argus made the change through the platform's API, read it back to confirm it stuck, logged it, and will measure the result in three days.</p><p>In Phase 1 every change waits for a person. Opt-in autonomy for low-risk changes comes later.</p>" },
    { route: "campaign/cmp_dagger", prep: () => openSugg("glass_meta_up60"), target: "[data-held]", title: "Guardrails come first", body: "<p>This idea never reached anyone. A plain-code policy engine blocked it: too big a step and too little evidence. The AI suggests; deterministic rules decide what is allowed.</p>" },
    { route: "reporting", target: '[data-tour="advance"]', title: "A runaway day", body: "<p>Let's move the clock forward a day. Overnight, TikTok on Salt and Signal will spend about three times its plan.</p>", do: () => { if (!A.S.spiked) A.ACT.advance(); }, doLabel: "Simulate next day" },
    { route: "campaign/cmp_salt", target: '[data-tour="suggestions"]', title: "Caught and paused", body: "<p>Argus paused TikTok the moment it hit the spending cap, then wrote a suggestion for how to resume. Safety stops only ever reduce spend; turning it back on is your call.</p>" },
    { route: "campaign/cmp_ninefold", target: '[data-tour="next-time"]', title: "Ended campaigns", body: "<p>When a flight ends, Argus writes the report and turns what it learned into suggestions for next time. Add the good ones to the imprint's playbook.</p>" },
    { route: "titles", target: '[data-tour="title-rows"]', title: "Title reporting", body: "<p>Every title, with its total ad spend, sales and the number of campaigns it has had.</p>" },
    { route: "launch", target: '[data-tour="isbn"]', title: "Launch from an ISBN", body: "<p>Type an ISBN. Argus pulls the title's metadata from the feed.</p>", do: () => { A.UI.launchQ = "978-1-250-99006-6"; go("launch/" + ORCHARD); }, doLabel: "Search 978-1-250-99006-6" },
    { route: "launch/" + ORCHARD, target: '[data-tour="creative-choice"]', title: "Upload or generate", body: "<p>Bring your own images and video, or let CHAPTR Amplify draft an ad for every platform from the cover and metadata.</p>", do: genFor, doLabel: "Generate creative" },
    { route: "launch/" + ORCHARD, prep: genFor, target: '[data-tour="variants"]', title: "Ready-to-run ads", body: "<p>Four ads, each sized and written for its platform and checked against character limits, plus keywords and an Amazon subtitle from CHAPTR Reedy.</p>" },
    { route: "launch/" + ORCHARD, prep: genFor, target: '[data-tour="signoff"]', title: "Plan and sign-off", body: "<p>Set a budget and goal and Argus drafts the split across platforms, explains why, and runs compliance checks. Budgets over $25,000 also need the marketing director.</p>", do: signAll, doLabel: "Sign off for me" },
    { route: "launch/" + ORCHARD, prep: signAll, target: '[data-tour="launched"]', title: "It's queued", body: "<p>Argus builds the campaign paused on every platform, reads each setting back, and starts on the scheduled date. From here it shows up in the reporting center.</p>" },
    { route: "", title: "That's Argus", body: "<p>One page per title, plus three paths: see what needs changing, launch from an ISBN, and understand any title. Argus does the busywork, and people make the calls.</p><p>Use <b>Reset</b> at the bottom of the page to start over.</p>" }
  ];

  let i = -1, spot, card;
  function build() {
    spot = document.createElement("div"); spot.className = "tour-spot none";
    card = document.createElement("div"); card.className = "tour-card"; card.setAttribute("role", "dialog"); card.setAttribute("aria-labelledby", "tour-title");
    document.body.append(spot, card);
  }
  function targetEl(st) {
    if (!st.target) return null;
    const sel = typeof st.target === "function" ? st.target() : st.target;
    return sel ? document.querySelector(sel) : null;
  }
  function place() {
    if (i < 0) return;
    const el = targetEl(STEPS[i]);
    const vw = window.innerWidth, vh = window.innerHeight;
    if (!el) { spot.className = "tour-spot none"; card.className = "tour-card center"; card.style.left = card.style.top = ""; return; }
    const r = el.getBoundingClientRect(), pad = 6;
    const top = Math.max(4, r.top - pad), bottom = Math.min(vh - 4, r.bottom + pad);
    spot.className = "tour-spot";
    Object.assign(spot.style, { left: r.left - pad + "px", top: top + "px", width: r.width + pad * 2 + "px", height: Math.max(0, bottom - top) + "px" });
    card.className = "tour-card";
    const cw = card.offsetWidth, ch = card.offsetHeight;
    let x, y;
    if (vw < 760) { x = 16; y = vh - ch - 16; }
    else if (r.right + 20 + cw < vw) { x = r.right + 20; y = Math.min(Math.max(16, r.top), vh - ch - 16); }
    else if (vh - r.bottom > ch + 30) { x = Math.min(Math.max(16, r.right - cw), vw - cw - 16); y = r.bottom + 16; }
    else if (r.top > ch + 30) { x = Math.min(Math.max(16, r.right - cw), vw - cw - 16); y = r.top - ch - 16; }
    else { x = vw - cw - 24; y = vh - ch - 24; }
    card.style.left = x + "px"; card.style.top = y + "px";
  }
  function show(n) {
    i = Math.max(0, Math.min(STEPS.length - 1, n));
    const st = STEPS[i];
    if (st.prep) st.prep();
    go(st.route);
    card.innerHTML = `<div class="progress"><span style="width:${((i + 1) / STEPS.length) * 100}%"></span></div>
      <div class="row-flex" style="justify-content:space-between"><span class="eyebrow">Step ${i + 1} of ${STEPS.length}</span><button class="btn sm" data-tour-act="close" aria-label="Exit tour">Exit</button></div>
      <h2 id="tour-title">${st.title}</h2><div class="body">${st.body}</div>
      <div class="nav-row">${i > 0 ? '<button class="btn sm" data-tour-act="back">Back</button>' : ""}<span class="spacer"></span>${st.do ? `<button class="btn sm solid" data-tour-act="do">${st.doLabel}</button>` : ""}<button class="btn sm${st.do ? "" : " solid"}" data-tour-act="next">${i === STEPS.length - 1 ? "Finish" : st.do ? "Skip" : i === 0 ? "Start" : "Next"}</button></div>`;
    requestAnimationFrame(() => {
      const el = targetEl(st);
      if (el) {
        const r = el.getBoundingClientRect();
        if (r.top < 20 || r.bottom > window.innerHeight - 20) el.scrollIntoView({ block: r.height > window.innerHeight * 0.6 ? "start" : "center", behavior: "instant" });
      } else window.scrollTo(0, 0);
      place(); setTimeout(place, 80);
    });
  }
  function close() { i = -1; spot.style.display = "none"; card.style.display = "none"; }
  function open(n = 0) { spot.style.display = ""; card.style.display = ""; show(n); }
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
  window.addEventListener("argus:render", () => { if (i >= 0) requestAnimationFrame(place); });
  document.addEventListener("click", (e) => { if (e.target.closest("[data-tour-open]")) open(0); });
  document.getElementById("tour-start").addEventListener("click", () => open(0));
  document.getElementById("reset").addEventListener("click", () => { close(); A.reset(); A.toast("Reset."); });
  window.TOUR = { open, close, steps: STEPS };
  if (location.hash === "#tour") { history.replaceState(null, "", location.pathname); open(0); }
})();
