/* ARGUS app: a three-path index (reporting, launch, title reporting).
   Views are plain template strings; clicks go through one delegated [data-act] handler. */
(function () {
  "use strict";
  const D = window.ARGUS_DATA, E = window.ARGUS, C = window.ARGUS_CHARTS;
  const { esc, money } = C;
  const KEY = "argus-state-v4";

  // ---------------- state ----------------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* storage unavailable */ } }
  };
  let S;
  try { S = JSON.parse(store.get(KEY)); } catch (e) { S = null; }
  if (!S || !S.campaigns) S = E.makeState();
  const save = () => store.set(KEY, JSON.stringify(S));

  const UI = { openSugg: {}, rep: "active", launchQ: "", titleQ: "", launch: null, playbook: {}, spiked: !!S.spiked };

  // ---------------- helpers ----------------
  const $ = (sel, el = document) => el.querySelector(sel);
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const fmt = (d, year) => { const [y, m, dd] = d.split("-").map(Number); return `${MONTHS[m - 1]} ${dd}${year ? ", " + y : ""}`; };
  const int = (n) => Math.round(n).toLocaleString("en-US");
  const titleById = (id) => D.TITLES.find((t) => t.id === id);
  const imprintName = (id) => D.IMPRINTS.find((i) => i.id === id).name;
  const campaignById = (id) => S.campaigns.find((c) => c.id === id);
  const campaignsFor = (tid) => S.campaigns.filter((c) => c.titleId === tid);
  const pname = (p) => D.PLATFORMS[p].name;
  const cname = (c) => { const n = c.name.split(": ")[1] || c.name; return n[0].toUpperCase() + n.slice(1); };
  const usedPlatforms = (c) => D.PLATFORM_ORDER.filter((p) => c.platformBudget[p]);
  const isOpen = (p) => (p.status === "pending" || p.status === "partially_approved") && !(p.snoozed_until && p.snoozed_until > S.today);
  const openProps = (c) => S.proposals.filter((p) => p.campaign_id === c.id && isOpen(p)).sort((x, y) => (/^resume_/.test(y.key || "") ? 1 : 0) - (/^resume_/.test(x.key || "") ? 1 : 0));
  const statusWord = (c) => ({ live: "Live", scheduled: "Scheduled", completed: "Ended" }[c.status] || c.status);
  const suggestionCount = (c) => (c.status === "live" ? openProps(c).length : c.status === "completed" ? E.report(S, c).next.length : 0);
  const nextRole = (p) => p.requires_approval_from.find((r) => !p.approvals.includes(r));
  const split = (all) => {
    const co = all.filter((x) => x.p !== "amazon");
    return { clickouts: co.reduce((t, x) => t + x.actions, 0), orders: (all.find((x) => x.p === "amazon") || { actions: 0 }).actions };
  };
  function results(c) {
    const rows = usedPlatforms(c).map((p) => ({ p, ...E.totals(c, p) }));
    return { rows, ...split(rows), spend: rows.reduce((t, r) => t + r.spend, 0), sales: rows.reduce((t, r) => t + (r.sales || 0), 0) };
  }

  function toast(msg, link) {
    const old = $(".toast"); if (old) old.remove();
    const t = document.createElement("div"); t.className = "toast"; t.setAttribute("role", "status");
    t.innerHTML = `<span>${esc(msg)}</span>${link ? `<a href="${link.href}">${esc(link.label)} →</a>` : ""}`;
    document.body.appendChild(t); setTimeout(() => t.remove(), link ? 6000 : 3500);
  }

  const wordmark = () => `<a class="wordmark" href="#" aria-label="ARGUS home"><svg viewBox="0 18 1000 262" aria-hidden="true"><text x="2" y="214" textLength="996" lengthAdjust="spacingAndGlyphs" font-size="292">argus</text></svg></a>`;
  function top(active) {
    const l = (r, label) => `<a href="#${r}"${active === r ? ' aria-current="page"' : ""}>${label}</a>`;
    return `<header class="top"><a class="mark-sm" href="#" aria-label="ARGUS home">argus</a>
      <nav class="seg" aria-label="Sections">${l("", "Overview")}${l("reporting", "Reporting")}${l("launch", "Launch")}${l("titles", "Titles")}</nav><a class="btn sm" href="#menu">Menu</a>
      <span class="spacer"></span><span class="pill num" title="Today">${fmt(S.today, true)}</span></header>`;
  }
  const back = (href, label) => `<a class="btn sm" href="${href}">← ${label}</a>`;
  function healthBits(c) {
    const h = E.titleHealth(S, c);
    if (c.status !== "live") return "";
    return `<span class="row-flex" style="gap:6px"><span class="dot ${h.status}"></span><span class="score">${h.score}</span> ${h.label}</span>`;
  }

  // ---------------- HOME ----------------
  function renderHome() {
    const live = S.campaigns.filter((c) => c.status !== "completed").length, ended = S.campaigns.length - live;
    const sugg = S.campaigns.filter((c) => c.status === "live").reduce((t, c) => t + openProps(c).length, 0);
    const ready = D.TITLES.filter((t) => !campaignsFor(t.id).length).length;
    const row = (href, label, sub, count, tour, solid) => `<a class="row" href="${href}" data-tour="${tour}"><span class="row-main"><span class="row-label">${label} <span class="arrow">→</span></span><span class="home-sub">${sub}</span></span><span class="count${solid ? " solid" : ""}">${count}</span></a>`;
    return `<section class="home">${wordmark()}
      <div class="toolbar"><a class="pill" href="#">← Daggerbound overview</a>
        <button class="pill" data-tour-open>Guided tour</button></div>
      <div class="rows" data-tour="home-rows">
        ${row("#reporting", "Reporting center", `${live} active, ${ended} ended${sugg ? ` · <b>${sugg} suggestion${sugg === 1 ? "" : "s"} waiting for you</b>` : ""}`, S.campaigns.length, "home-reporting", false)}
        ${row("#launch", "Launch center", "Search an ISBN, add or generate creative, set a budget and goal", ready, "home-launch")}
        ${row("#titles", "Title reporting", "Every campaign and every sale, title by title", D.TITLES.length, "home-titles")}
      </div></section>`;
  }

  // ---------------- REPORTING CENTER ----------------
  function renderReporting() {
    const groups = { active: S.campaigns.filter((c) => c.status !== "completed"), ended: S.campaigns.filter((c) => c.status === "completed"), all: S.campaigns };
    const order = { live: 0, scheduled: 1, completed: 2 };
    const list = groups[UI.rep].slice().sort((a, b) => order[a.status] - order[b.status] || E.titleHealth(S, a).score - E.titleHealth(S, b).score);
    const f = (k, label) => `<button data-act="rep" data-k="${k}" aria-pressed="${UI.rep === k}">${label} ${groups[k].length}</button>`;
    const rows = list.map((c) => {
      const t = titleById(c.titleId), agg = E.campaignPacing(S, c), n = suggestionCount(c);
      const paused = c.status === "live" && agg.rows.some((r) => r.status === "paused_safety");
      return `<a class="row" href="#campaign/${c.id}" data-campaign="${c.id}">${C.cover(t, 46)}
        <span class="row-main"><span class="row-label md">${esc(t.title)}</span>
        <span class="row-sub row-flex"><span class="tag${c.status === "live" ? " solid" : ""}">${statusWord(c)}</span>${paused ? '<span class="tag signal">Paused at cap</span>' : ""}<span>${esc(imprintName(t.imprint))} · ${fmt(c.start)} to ${fmt(c.end, true)} · ${money(agg.spent)} of ${money(c.budget)}</span>${healthBits(c)}</span></span>
        <span class="row-end"><span class="count sm${n && c.status === "live" ? " solid" : ""}">${n}</span></span></a>`;
    }).join("") || `<div class="row empty">No campaigns here yet.</div>`;
    return `${top("reporting")}<p class="eyebrow">Reporting center</p><h1 class="display">reporting</h1>
      <p class="lede">Every active and ended campaign. Open one to see what Argus suggests changing, with the evidence behind it.</p>
      <div class="toolbar"><span class="seg" role="group" aria-label="Filter">${f("active", "Active")}${f("ended", "Ended")}${f("all", "All")}</span>
        <button class="pill" data-act="advance" data-tour="advance" title="Run one simulated day: pull spend, check pacing, draft suggestions">Simulate next day</button></div>
      <div class="rows-head"><span>Campaign</span><span>Suggestions</span></div>
      <div class="rows" data-tour="rep-rows">${rows}</div>`;
  }

  // ---------------- CAMPAIGN ----------------
  // Collapsible suggestion: a one-line headline that expands to evidence and actions.
  function sugg(id, tag, title, meta, body, attrs = "") {
    return `<details class="sugg" data-sid="${id}" ${attrs}${UI.openSugg[id] ? " open" : ""}><summary><span class="sum-tag">${tag}</span><span class="sum-title">${esc(title)}</span><span class="sum-meta">${meta}</span><span class="chev" aria-hidden="true"></span></summary><div class="sugg-body">${body}</div></details>`;
  }
  function propCard(p, i, withCampaign) {
    const nr = nextRole(p);
    const partial = p.status === "partially_approved";
    const body = `<div class="meta">${esc(p.agent || "Optimizer")}${withCampaign === true ? " · " + esc(cname(campaignById(p.campaign_id))) + " campaign" : ""} · expires ${fmt(p.expires_at)}</div>
      <ul class="why">${p.evidence.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>
      <div class="impact"><div><b>Expected</b>${esc(p.expected_impact.estimate)} ${esc(p.expected_impact.metric)}</div><div><b>Confidence</b>${esc(p.expected_impact.confidence)}</div><div><b>If it doesn't work</b>${esc(p.rollback)}</div></div>
      ${partial ? `<div class="small">Approved by ${p.approvals.map((r) => E.ROLES[r]).join(", ")}. This one also needs ${esc(E.ROLES[nr])}.</div>` : ""}
      <div class="btns"><button class="btn solid" data-act="approve" data-id="${p.proposal_id}">${nr === "imprint_marketer" ? "Approve" : "Approve as " + esc(E.ROLES[nr])}</button>
        <button class="btn" data-act="snooze" data-id="${p.proposal_id}">Not now</button><button class="btn" data-act="dismiss" data-id="${p.proposal_id}">Dismiss</button></div>`;
    return sugg(p.proposal_id, `<span class="tag${p.risk === "high" ? " signal" : ""}">${p.risk} risk</span>`, p.summary, partial ? "Needs one more sign-off" : "Waiting on you", body, `data-prop="${p.proposal_id}" data-key="${p.key || ""}"`);
  }
  function doneCard(p) {
    const body = `<p class="small">Applied ${fmt(p.executed_at)} and read back from ${p.platform.includes("→") ? "both platforms" : pname(p.platform)}. ${p.outcome ? "Result: " + esc(p.outcome) + "." : "Argus measures the result on " + fmt(p.outcome_due) + "."}</p>`;
    return sugg(p.proposal_id, '<span class="tag solid">✓ Done</span>', p.summary, "Applied and verified", body, `data-prop="${p.proposal_id}"`);
  }
  function heldCard(p) {
    const body = `<p class="small muted">Never reached anyone's queue. The policy engine blocked it:</p><ul class="why">${p.policy.errors.map((e) => `<li>${esc(e)}</li>`).join("")}</ul>`;
    return sugg(p.proposal_id, '<span class="tag">Held</span>', p.summary, "Blocked by guardrails", body, 'data-held="1"');
  }
  function nextCard(k, text, from) {
    const on = UI.playbook[k];
    const body = `<p class="small muted">From the Reporter${from ? ", based on the ended " + esc(from) + " campaign" : ""}.</p><div class="btns"><button class="btn${on ? "" : " solid"}" data-act="playbook" data-k="${k}">${on ? "✓ Added to the imprint playbook" : "Add to playbook"}</button></div>`;
    return sugg("nt_" + k, `<span class="tag${on ? " good" : ""}">${on ? "✓ In playbook" : "Next time"}</span>`, text, on ? "Added" : "Lesson learned", body);
  }

  function platformTable(c) {
    const agg = E.campaignPacing(S, c);
    const rows = agg.rows.map((r) => {
      const t = E.totals(c, r.platform), amazon = r.platform === "amazon";
      const dev = Math.round((r.ratio - 1) * 100);
      const pace = r.status === "paused_safety" ? '<span class="tag signal">Paused at cap</span>' : c.status !== "live" ? statusWord(c) : Math.abs(dev) < 10 ? "On plan" : `${Math.abs(dev)}% ${dev > 0 ? "ahead" : "behind"}`;
      return `<div class="prow"><span class="pname">${pname(r.platform)}</span>
        <span class="meter-cell"><div class="meter" title="Spent vs budget; red tick is the plan to date"><span style="width:${Math.min(100, (r.spent / r.budget) * 100)}%"></span>${c.status === "live" ? `<i style="left:${Math.min(100, (r.planned / r.budget) * 100)}%"></i>` : ""}</div><div class="small muted" style="margin-top:6px">${money(r.spent)} of ${money(r.budget)}</div></span>
        <span>${pace}</span><span class="r">${int(t.actions)} ${amazon ? "orders" : "click-outs"}</span><span class="r hide-md">${t.actions ? "$" + (t.spend / t.actions).toFixed(2) + " each" : "-"}</span></div>`;
    }).join("");
    return `<div class="ptable"><div class="prow h"><span>Platform</span><span>Spend</span><span>Pacing</span><span class="r">Results</span><span class="r hide-md">Cost per result</span></div>${rows}</div>`;
  }
  function renderCampaign(id) {
    const c = campaignById(id);
    if (!c) return renderReporting();
    const t = titleById(c.titleId), agg = E.campaignPacing(S, c), h = E.titleHealth(S, c), res = results(c);
    const dev = Math.round((agg.ratio - 1) * 100);
    const tiles = c.status === "completed" ? (() => {
      const r = E.report(S, c);
      return [["Spent", money(agg.spent), `of ${money(c.budget)}`], ["Results", int(r.all.actions), `${int(res.clickouts)} click-outs · ${int(res.orders)} Amazon orders`], ["Cost per result", "$" + r.all.cpa.toFixed(2), `goal was ${int(r.goal)} results`], ["Most efficient", pname(r.best.p), "$" + r.best.cpa.toFixed(2) + " per click-out"]];
    })() : [
      ["Spent", money(agg.spent), `of ${money(c.budget)} · ${Math.round(agg.consumed * 100)}% used`, true],
      ["Pacing", c.status === "scheduled" ? "Not started" : Math.abs(dev) < 5 ? "On plan" : `${Math.abs(dev)}% ${dev > 0 ? "ahead" : "behind"}`, "against the pub-date spend curve"],
      ["Results", int(res.clickouts + res.orders), `${int(res.clickouts)} click-outs · ${int(res.orders)} Amazon orders`],
      ["Health", c.status === "live" ? String(h.score) : h.label, c.status === "live" ? h.label + (h.reasons[0] ? " · " + h.reasons[0].text : "") : ""]
    ];
    const tileHtml = tiles.map(([k, v, s, m]) => `<div class="tile"><span class="k">${k}</span><span class="v">${esc(v)}</span>${m ? `<div class="meter"><span style="width:${Math.min(100, agg.consumed * 100)}%"></span><i style="left:${Math.min(100, (agg.planned / c.budget) * 100)}%"></i></div>` : ""}<span class="s">${esc(s)}</span></div>`).join("");

    let sugg;
    if (c.status === "live") {
      const open = openProps(c);
      const done = S.proposals.filter((p) => p.campaign_id === c.id && p.status === "executed");
      const held = S.blocked.filter((p) => p.campaign_id === c.id);
      sugg = `<div class="sec-head"><h2 class="sec">Suggestions from Argus</h2><span class="count${open.length ? " solid" : ""}">${open.length}</span></div>
        <div class="cards" data-tour="suggestions">${open.map(propCard).join("") || `<div class="card quiet"><h3>Nothing to change right now.</h3><p class="muted">Argus checks spend and performance again tomorrow and will suggest a change here if one is worth making.</p></div>`}
        ${done.map(doneCard).join("")}${held.map(heldCard).join("")}</div>`;
    } else if (c.status === "scheduled") {
      sugg = `<div class="sec-head"><h2 class="sec">Suggestions from Argus</h2><span class="count">0</span></div><div class="card quiet"><h3>Starts ${fmt(c.start, true)}.</h3><p class="muted">Argus built and verified the campaign on ${usedPlatforms(c).length} platforms. Suggestions appear once it has a few days of data.</p></div>`;
    } else {
      const r = E.report(S, c);
      sugg = `<div class="sec-head"><h2 class="sec">What happened</h2></div><div class="card"><p style="font-size:18px">${esc(r.summary)}</p>${r.amazonLine ? `<p class="muted">${esc(r.amazonLine)}</p>` : ""}</div>
        <div class="sec-head"><h2 class="sec">Suggestions for next time</h2><span class="count solid">${r.next.length}</span></div>
        <div class="cards" data-tour="next-time">${r.next.map((n, i) => nextCard(c.id + i, n)).join("")}</div>
        <details class="card quiet" style="margin-top:14px"><summary class="small up">How to read these numbers</summary><ul class="why">${r.caveats.map((x) => `<li>${esc(x)}</li>`).join("")}</ul></details>`;
    }
    return `${top("reporting")}<div class="row-flex" style="margin-bottom:18px">${back("#reporting", "Reporting center")}<a class="btn sm" href="#title/${t.id}">Title reporting →</a></div>
      <p class="eyebrow">${esc(imprintName(t.imprint))} · ${esc(c.name)}</p><h1 class="display md">${esc(t.title)}</h1>
      <div class="row-flex" style="margin:4px 0 22px"><span class="tag${c.status === "live" ? " solid" : ""}">${statusWord(c)}</span><span class="muted">${fmt(c.start)} to ${fmt(c.end, true)} · ${usedPlatforms(c).map(pname).join(", ")}</span></div>
      <div class="tiles">${tileHtml}</div>${sugg}
      <div class="sec-head"><h2 class="sec">By platform</h2></div>${platformTable(c)}`;
  }

  // ---------------- LAUNCH CENTER ----------------
  const digits = (s) => s.replace(/\D/g, "");
  function matchTitles(q) {
    const d = digits(q), l = q.trim().toLowerCase();
    const list = D.TITLES.filter((t) => !l || (d.length >= 3 && t.id.includes(d)) || t.title.toLowerCase().includes(l) || t.author.toLowerCase().includes(l));
    return list.sort((a, b) => campaignsFor(a.id).length - campaignsFor(b.id).length);
  }
  function launchRows(q) {
    const list = matchTitles(q);
    return list.map((t) => {
      const cs = campaignsFor(t.id), live = cs.find((c) => c.status !== "completed");
      const state = !cs.length ? '<span class="tag solid">Ready to launch</span>' : live ? `<span class="tag">${statusWord(live)} campaign</span>` : '<span class="tag">Past campaign</span>';
      return `<a class="row" href="#launch/${t.id}" data-title="${t.id}">${C.cover(t, 46)}<span class="row-main"><span class="row-label md">${esc(t.title)}</span><span class="row-sub">ISBN ${t.isbn} · ${esc(t.author)} · ${esc(imprintName(t.imprint))} · Pub ${fmt(t.pubDate, true)}</span></span><span class="row-end">${state}</span></a>`;
    }).join("") || `<div class="row empty">No title matches "${esc(q)}". Try the full 13-digit ISBN.</div>`;
  }
  function defaultBrief(t) {
    const pre = t.pubDate > S.today;
    const objective = pre ? "preorder" : E.daysBetween(t.pubDate, S.today) < 60 ? "launch" : "backlist";
    const start = objective === "backlist" ? E.addDays(S.today, 7) : [E.addDays(S.today, 7), E.addDays(t.pubDate, -49)].sort()[1];
    const end = objective === "backlist" ? E.addDays(start, 56) : E.addDays(t.pubDate, 21);
    return { objective, budget: pre ? 35000 : 20000, start, end, destination: "Imprint where-to-buy page", notes: "" };
  }
  function genCopy(t, objective) {
    const verb = objective === "preorder" ? "Pre-order" : "Get";
    const hook = { "Fantasy": "A map that redraws the world", "Thriller": "One signal. One night. No way back", "YA Romance": "Two rivals, one summer, zero chill", "Nonfiction (Policy)": "How the numbers really move", "Science Fiction": "Nine harbors. One way home", "Literary / Book Club": "A family orchard, one impossible tide" }[t.genre] || "Your next great read";
    let amazon = `From ${t.author}, for fans of ${t.comps[0]}`;
    if (amazon.length > 50) amazon = `For fans of ${t.comps[0]}`;
    return {
      meta: `${hook}. ${verb} ${t.title} by ${t.author}.`,
      google: t.title.length <= 30 ? t.title : t.title.slice(0, 30),
      tiktok: `If you loved ${t.comps[0]}, this is your next read. ${verb} now.`,
      amazon
    };
  }
  function reedy(t) {
    const yr = t.pubDate.slice(0, 4);
    const g = t.genre.split(" / ")[0].toLowerCase();
    return {
      keywords: [`${g} books ${yr}`, t.title.toLowerCase(), t.author.toLowerCase(), `books like ${t.comps[0].toLowerCase()}`, t.comps[1].toLowerCase(), `new ${g} ${t.format.toLowerCase()}`],
      subtitle: { "Fantasy": "An Epic Fantasy", "Thriller": "A Thriller", "YA Romance": "A Summer Romance", "Nonfiction (Policy)": "How Public Money Really Works", "Science Fiction": "A Novel of the Outer Harbors", "Literary / Book Club": "A Novel of Three Sisters and the Sea" }[t.genre] || "A Novel"
    };
  }
  const FORMATS = { meta: "Meta · 4:5 feed", google: "Google · Demand Gen", tiktok: "TikTok · 9:16", amazon: "Amazon · Sponsored Brands" };
  function adSvg(t, p, headline, cta) {
    const inner = t.coverImg ? `<image href="${t.coverImg}" width="100" height="150" preserveAspectRatio="xMidYMid slice"/>` : C.cover(t, 100).replace(/^<svg[^>]*>/, "").replace(/<\/svg>$/, "");
    const words = headline.split(" "), lines = [];
    words.forEach((w) => { const l = lines[lines.length - 1]; if (l && (l + " " + w).length <= 20) lines[lines.length - 1] = l + " " + w; else lines.push(w); });
    const fg = t.cover.fg, bg = t.cover.bg;
    return `<svg class="ad" viewBox="0 0 400 500" role="img" aria-label="Generated ${pname(p)} ad for ${esc(t.title)}"><rect width="400" height="500" fill="${bg}"/><rect width="400" height="500" fill="#000" opacity=".18"/>
      <svg x="130" y="40" width="140" height="210" viewBox="0 0 100 150">${inner}</svg>
      ${lines.slice(0, 3).map((l, i) => `<text x="200" y="${304 + i * 38}" text-anchor="middle" fill="${fg}" font-family="Inter Tight, Arial, sans-serif" font-size="32" font-weight="600">${esc(l)}</text>`).join("")}
      <rect x="130" y="430" width="140" height="42" rx="21" fill="${fg}"/><text x="200" y="457" text-anchor="middle" fill="${bg}" font-family="Inter Tight, Arial, sans-serif" font-size="17" font-weight="600">${esc(cta.toUpperCase())}</text></svg>`;
  }
  function aspectFit(w, h) {
    const r = w / h;
    if (Math.abs(r - 1) < 0.06) return "1:1 · fits Meta, Amazon";
    if (Math.abs(r - 0.8) < 0.05) return "4:5 · fits Meta feed";
    if (Math.abs(r - 0.5625) < 0.05) return "9:16 · fits TikTok, Reels";
    if (r > 1.6 && r < 2) return "Wide · fits Google Demand Gen";
    return `${w}×${h} · Argus will crop per platform`;
  }

  function renderLaunchHome() {
    return `${top("launch")}<p class="eyebrow">Launch center</p><h1 class="display">launch</h1>
      <p class="lede">Find the product by ISBN, add creative, set a budget and a goal. Argus builds the campaign with best-practice settings on every platform, and nothing goes live until you sign off.</p>
      <form class="search" id="launch-form" style="margin:28px 0 22px" data-tour="isbn" role="search"><input id="launch-q" placeholder="Search by ISBN or title" value="${esc(UI.launchQ)}" autocomplete="off" aria-label="Search by ISBN or title"><button class="btn solid lg" type="submit">Search</button></form>
      <div class="rows" id="launch-results">${launchRows(UI.launchQ)}</div>`;
  }
  function ensureLaunch(t) {
    if (!UI.launch || UI.launch.titleId !== t.id) UI.launch = { titleId: t.id, mode: null, uploads: [], variants: null, generating: false, brief: defaultBrief(t), signed: [], launched: null };
    return UI.launch;
  }
  function creativePanel(t, L) {
    if (L.mode === "upload") {
      const thumbs = L.uploads.map((u, i) => `<div class="thumb"><div class="img" ${u.kind === "image" ? `style="background-image:url('${u.url}')"` : ""}>${u.kind === "video" ? `<video src="${u.url}" muted playsinline></video>` : ""}</div><span class="name" title="${esc(u.name)}">${esc(u.name)}</span><span class="muted small">${esc(u.fit)}</span><button class="btn sm" data-act="rm-upload" data-i="${i}">Remove</button></div>`).join("");
      return `<div class="panel"><label class="drop" id="drop"><input type="file" id="file-in" accept="image/*,video/*" multiple><span class="row-label md">Drop files or click to choose</span><span class="muted">JPG, PNG or MP4. Square, 4:5 and 9:16 work best. Files stay in your browser.</span></label>
        ${thumbs ? `<div class="thumbs">${thumbs}</div>` : ""}
        <p class="small muted">Ad copy for each platform is drafted with CHAPTR Amplify and checked against platform limits on the plan step.</p></div>`;
    }
    if (L.mode === "generate") {
      if (L.generating) return `<div class="panel"><p class="row-label md">Amplify is drafting four ads…</p><p class="muted">Using the cover, metadata, comps and the Macmillan creative playbook.</p></div>`;
      if (!L.variants) return `<div class="panel"><p>CHAPTR Amplify drafts one ad per platform from the cover, metadata and comp titles, sized and written to each platform's limits.</p><div><button class="btn solid lg" data-act="gen">Generate creative</button></div></div>`;
      const R = reedy(t);
      const cards = D.PLATFORM_ORDER.map((p) => { const v = L.variants[p], lim = E.LIMITS[p]; return `<div class="variant">${adSvg(t, p, v.headline, v.cta)}<div class="fit"><span>${FORMATS[p]}</span><span>${v.copy.length}/${lim.max}</span></div><div class="copy">${esc(v.copy)}</div></div>`; }).join("");
      return `<div class="panel" data-tour="variants"><div class="variants">${cards}</div>
        <div><div class="field"><span>Keywords and subtitle from CHAPTR Reedy</span></div><div class="checks" style="margin-top:8px">${R.keywords.map((k) => `<span class="tag">${esc(k)}</span>`).join("")}</div><p class="small" style="margin-top:10px">Amazon subtitle suggestion: <i>${esc(R.subtitle)}</i></p></div>
        <div class="row-flex"><button class="btn" data-act="gen">Regenerate</button><span class="small muted">Drafted by CHAPTR Amplify and Reedy.</span></div></div>`;
    }
    return "";
  }
  function planSection(t, L) {
    const b = L.brief;
    const plan = E.draftPlan(t, b);
    const copy = genCopy(t, b.objective);
    const checks = E.runCompliance(t, copy, [], b.budget, b.destination);
    const pass = checks.filter((c) => c.result === "pass").length;
    const issues = checks.filter((c) => c.result !== "pass");
    const approvers = E.approversForPlan(b.budget, t);
    const nxt = approvers.find((r) => !L.signed.includes(r));
    const rows = D.PLATFORM_ORDER.filter((p) => plan.allocation[p]).map((p) => `<div class="srow"><span class="pname">${pname(p)}</span><span class="meter-cell"><div class="meter"><span style="width:${plan.split[p] * 100}%"></span></div></span><span class="r">${Math.round(plan.split[p] * 100)}%</span><span class="r">${money(plan.allocation[p])}<br><span class="small muted">${int(plan.outcomes[p][0])} to ${int(plan.outcomes[p][1])} ${p === "amazon" ? "orders" : "click-outs"}</span></span></div>`).join("");
    return `<div class="sec-head"><h2 class="sec">3 · The plan</h2><span class="tag">${money(b.budget)} · ${fmt(b.start)} to ${fmt(b.end, true)}</span></div>
      <div class="two"><div class="panel" style="margin:0"><div class="split">${rows}</div><p class="small muted">Projections are ranges from Macmillan benchmarks by genre, not promises.</p></div>
        <div class="panel" style="margin:0"><span class="eyebrow">Why this plan</span><ul class="why">${(b.notes ? [`Your note: "${b.notes}"`] : []).concat(plan.why).map((w) => `<li>${esc(w)}</li>`).join("")}</ul></div></div>
      <div class="panel" data-tour="signoff"><div class="row-flex"><span class="tag ${issues.some((c) => c.result === "fail") ? "signal" : "good"}">${pass} of ${checks.length} checks passed</span><span class="small muted">Claims, character limits, clearances, age and political flags, tracking, platform access</span></div>
        ${issues.length ? `<ul class="why">${issues.map((c) => `<li>${esc(c.group)}: ${esc(c.text)}</li>`).join("")}</ul>` : ""}
        <div class="signoff"><span class="small up">Sign-off</span>${approvers.map((r) => `<span class="tag${L.signed.includes(r) ? " good" : ""}">${L.signed.includes(r) ? "✓ " : ""}${E.ROLES[r]}</span>`).join("")}<span class="spacer"></span>
        <button class="btn solid lg" data-act="signoff" data-role="${nxt}">${approvers.length - L.signed.length === 1 ? "Approve and schedule" : "Approve as " + E.ROLES[nxt]}</button></div>
        <p class="small muted">${approvers.length > 1 ? `Budgets over $25,000 need the marketing director${approvers.includes("compliance") ? ", and this title also needs compliance review" : ""}. ` : ""}Nothing is created on any platform until every sign-off is in.</p></div>`;
  }
  function renderLaunchTitle(id) {
    const t = titleById(id);
    if (!t) return renderLaunchHome();
    const L = ensureLaunch(t);
    const cs = campaignsFor(t.id), live = cs.find((c) => c.status !== "completed");
    const product = `<div class="product">${C.cover(t, 150)}<div><p class="eyebrow">${esc(imprintName(t.imprint))}</p><h1 class="display md" style="margin:6px 0 8px">${esc(t.title)}</h1><p class="lede">${esc(t.author)}</p>
      <div class="facts"><div><b>ISBN</b><span>${t.isbn}</span></div><div><b>Publication</b><span>${fmt(t.pubDate, true)}</span></div><div><b>Format</b><span>${t.format} · $${t.price.toFixed(2)}</span></div><div><b>Category</b><span>${esc(t.genre)} · ${esc(t.ageBand)}</span></div><div><b>Comps</b><span>${esc(t.comps.join(", "))}</span></div></div>
      ${live ? `<p class="small" style="margin-top:16px">This title already has a ${statusWord(live).toLowerCase()} campaign. <a href="#campaign/${live.id}">See it in reporting</a>.</p>` : ""}</div></div>`;
    if (L.launched) {
      const c = campaignById(L.launched);
      return `${top("launch")}<div style="margin-bottom:18px">${back("#launch", "Launch center")}</div>${product}
        <div class="success" style="margin-top:14px" data-tour="launched"><p class="eyebrow" style="color:inherit;opacity:.7">Scheduled</p><h2 class="display md">it's queued.</h2>
        <p style="font-size:18px;max-width:60ch">Argus built ${esc(t.title)} on ${usedPlatforms(c).length} platforms in a paused state, read every setting back, and will start spending on ${fmt(c.start, true)}. It will appear in the reporting center with suggestions once data comes in.</p>
        <div class="row-flex"><a class="btn" href="#campaign/${c.id}">Open in reporting</a><a class="btn" href="#launch" data-act="launch-reset">Launch another</a></div></div>`;
    }
    const hasCreative = (L.mode === "upload" && L.uploads.length) || (L.mode === "generate" && L.variants);
    const b = L.brief;
    const obj = (k, label) => `<button data-act="obj" data-k="${k}" aria-pressed="${b.objective === k}">${label}</button>`;
    return `${top("launch")}<div style="margin-bottom:18px">${back("#launch", "Launch center")}</div>${product}
      <div class="sec-head"><h2 class="sec">1 · Creative</h2></div>
      <div class="choices" data-tour="creative-choice">
        <button class="choice" data-act="cr-mode" data-mode="upload" aria-pressed="${L.mode === "upload"}"><span class="row-main"><span class="row-label">Upload creative</span><span class="row-sub">Your own images or video. Argus checks sizes for each platform.</span></span><span class="count sm">${L.uploads.length}</span></button>
        <button class="choice" data-act="cr-mode" data-mode="generate" aria-pressed="${L.mode === "generate"}"><span class="row-main"><span class="row-label">Generate creative</span><span class="row-sub">CHAPTR Amplify drafts an ad for every platform from the cover and metadata.</span></span><span class="count sm">${L.variants ? 4 : "AI"}</span></button>
      </div>${creativePanel(t, L)}
      ${hasCreative ? `<div class="sec-head"><h2 class="sec">2 · Budget and goal</h2></div>
      <div class="panel" style="margin-top:0" data-tour="brief"><span class="seg" role="group" aria-label="Goal">${obj("preorder", "Pre-orders")}${obj("launch", "Launch")}${obj("backlist", "Backlist")}</span>
        <div class="form"><label class="field"><span>Budget (USD)</span><input type="number" min="1000" step="500" data-brief="budget" value="${b.budget}"></label>
        <label class="field"><span>Start</span><input type="date" data-brief="start" value="${b.start}"></label><label class="field"><span>End</span><input type="date" data-brief="end" value="${b.end}"></label>
        <label class="field wide"><span>Anything Argus should know? (optional)</span><input type="text" data-brief="notes" value="${esc(b.notes)}" placeholder="e.g. lean into book clubs; the author is touring in March"></label></div></div>
      ${planSection(t, L)}` : ""}`;
  }

  // ---------------- TITLE REPORTING ----------------
  function titleSummary(t) {
    const cs = campaignsFor(t.id);
    const r = cs.map(results);
    const sales = E.titleSales(S, t.id);
    return {
      cs, spend: r.reduce((a, x) => a + x.spend, 0), clickouts: r.reduce((a, x) => a + x.clickouts, 0), orders: r.reduce((a, x) => a + x.orders, 0),
      amzSales: r.reduce((a, x) => a + x.sales, 0), sales, units: sales.reduce((a, w) => a + w.units, 0), pre: sales.reduce((a, w) => a + w.preorders, 0)
    };
  }
  function titleRows(q) {
    const l = q.trim().toLowerCase(), d = digits(q);
    return D.TITLES.filter((t) => !l || t.title.toLowerCase().includes(l) || t.author.toLowerCase().includes(l) || (d.length >= 3 && t.id.includes(d))).map((t) => {
      const s = titleSummary(t);
      return `<a class="row" href="#title/${t.id}" data-title="${t.id}">${C.cover(t, 46)}<span class="row-main"><span class="row-label md">${esc(t.title)}</span><span class="row-sub">${esc(t.author)} · ${esc(imprintName(t.imprint))} · ${money(s.spend)} ad spend · ${s.units ? int(s.units) + " units sold in 16 weeks" : int(s.pre) + " pre-orders so far"}</span></span><span class="row-end"><span class="count sm">${s.cs.length}</span></span></a>`;
    }).join("") || `<div class="row empty">No title matches "${esc(q)}".</div>`;
  }
  function renderTitles() {
    return `${top("titles")}<p class="eyebrow">Title reporting</p><h1 class="display">titles</h1>
      <p class="lede">All the advertising and all the sales for each title in one place.</p>
      <form class="search" id="title-form" style="margin:28px 0 22px" role="search"><input id="title-q" placeholder="Search titles, authors or ISBNs" value="${esc(UI.titleQ)}" autocomplete="off" aria-label="Search titles"></form>
      <div class="rows-head"><span>Title</span><span>Campaigns</span></div><div class="rows" id="title-results" data-tour="title-rows">${titleRows(UI.titleQ)}</div>`;
  }
  function salesChart(t, weeks) {
    const W = 1000, H = 300, m = { l: 54, r: 54, t: 14, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = weeks.length, bw = iw / n;
    const maxS = Math.max(1000, ...weeks.map((w) => w.spend)) * 1.1;
    const maxU = Math.max(50, ...weeks.map((w) => Math.max(w.units, w.preorders))) * 1.1;
    const x = (i) => m.l + bw * i + bw / 2;
    const yS = (v) => m.t + ih - (ih * v) / maxS, yU = (v) => m.t + ih - (ih * v) / maxU;
    const bars = weeks.map((w, i) => `<rect x="${m.l + bw * i + bw * 0.18}" y="${yS(w.spend)}" width="${bw * 0.64}" height="${m.t + ih - yS(w.spend)}" rx="3" fill="var(--ink-3)" opacity=".38"><title>Week ending ${fmt(w.end)}: ${money(w.spend)} ad spend</title></rect>`).join("");
    const line = (key, dash) => { const pts = weeks.map((w, i) => (w[key] || (key === "units" && weeks.slice(0, i + 1).some((z) => z.units)) ? `${x(i)},${yU(w[key])}` : null)).filter(Boolean); return pts.length > 1 ? `<polyline points="${pts.join(" ")}" fill="none" stroke="var(--ink)" stroke-width="3"${dash ? ' stroke-dasharray="6 6"' : ""} stroke-linejoin="round"/>` : ""; };
    const dots = weeks.map((w, i) => (w.units ? `<circle cx="${x(i)}" cy="${yU(w.units)}" r="4.5" fill="var(--ink)"><title>Week ending ${fmt(w.end)}: ${int(w.units)} units</title></circle>` : "")).join("");
    const pubI = weeks.findIndex((w) => w.pubWeek);
    const pub = pubI >= 0 ? `<line x1="${x(pubI)}" x2="${x(pubI)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--signal)" stroke-width="1.5" stroke-dasharray="3 4"/><text class="axis" x="${x(pubI) + 6}" y="${m.t + 12}" text-anchor="end" style="fill:var(--signal)" transform="translate(-12 0)">ON SALE</text>` : "";
    const ticks = [0, 0.5, 1].map((f) => `<text class="axis" x="${m.l - 8}" y="${yS(maxS * f / 1.1) + 4}" text-anchor="end">${C.kfmt(maxS * f / 1.1)}</text><text class="axis" x="${W - m.r + 8}" y="${yU(maxU * f / 1.1) + 4}">${int(maxU * f / 1.1)}</text>`).join("");
    const xl = weeks.map((w, i) => (i % 3 === 0 ? `<text class="axis" x="${x(i)}" y="${H - 10}" text-anchor="middle">${fmt(w.end)}</text>` : "")).join("");
    return `<div class="chart" data-tour="sales-chart"><div class="legend"><span><i style="background:var(--ink-3);opacity:.38"></i>Weekly ad spend (left)</span><span><i style="background:var(--ink);height:3px"></i>Units sold (right)</span><span><i style="border-top:3px dashed var(--ink);height:0"></i>Pre-orders</span></div>
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Weekly ad spend and unit sales for ${esc(t.title)}"><line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih}" y2="${m.t + ih}" stroke="var(--hair)"/>${bars}${pub}${line("preorders", true)}${line("units")}${dots}${ticks}${xl}</svg>
      <p class="note">Units are simulated BookScan point-of-sale data. Sales next to spend is context, not proof that the ads caused the sales; a holdout test is how Argus would measure that.</p></div>`;
  }
  function renderTitle(id) {
    const t = titleById(id);
    if (!t) return renderTitles();
    const s = titleSummary(t);
    const tiles = [
      ["Ad spend", money(s.spend), `${s.cs.length} campaign${s.cs.length === 1 ? "" : "s"}`],
      [s.units ? "Units sold" : "Pre-orders", int(s.units || s.pre), "last 16 weeks · BookScan (simulated)"],
      ["Retailer click-outs", int(s.clickouts), "from Meta, Google and TikTok"],
      ["Amazon orders", int(s.orders), `${money(s.amzSales)} attributed by Amazon`]
    ].map(([k, v, x]) => `<div class="tile"><span class="k">${k}</span><span class="v">${v}</span><span class="s">${x}</span></div>`).join("");
    const efforts = s.cs.map((c) => {
      const agg = E.campaignPacing(S, c), r = results(c);
      return `<a class="row" href="#campaign/${c.id}"><span class="row-main"><span class="row-label md">${esc(cname(c))}</span><span class="row-sub row-flex"><span class="tag${c.status === "live" ? " solid" : ""}">${statusWord(c)}</span><span>${fmt(c.start)} to ${fmt(c.end, true)} · ${usedPlatforms(c).map(pname).join(", ")} · ${money(agg.spent)} of ${money(c.budget)} · ${int(r.clickouts)} click-outs, ${int(r.orders)} Amazon orders</span></span></span><span class="row-end"><span class="arrow" style="opacity:1;transform:none;font-size:28px">→</span></span></a>`;
    }).join("") || `<div class="card quiet"><h3>No campaigns yet.</h3><div><a class="btn solid" href="#launch/${t.id}">Launch one</a></div></div>`;
    const creatives = s.cs.flatMap((c) => c.creatives.map((cr) => `<div class="tl"><span class="when">${pname(cr.platform)}</span><span>${esc(cr.name)}</span><span class="tag">${cr.status === "active" ? "Running" : cr.status || "Ran"}</span></div>`)).join("") || `<div class="tl"><span class="when">-</span><span class="muted">No creative has run yet.</span><span></span></div>`;
    const changes = S.audit.filter((a) => a.entity && a.entity.startsWith(t.title)).slice(0, 8).map((a) => `<div class="tl"><span class="when">${fmt(a.ts.slice(0, 10))}</span><span>${esc(a.action)}${a.after && a.after !== "-" ? `<br><span class="small muted">${esc(a.after)}</span>` : ""}</span><span class="small muted">${esc(a.who)}</span></div>`).join("")
      || `<div class="tl"><span class="when">-</span><span class="muted">No changes yet. Approved suggestions show up here.</span><span></span></div>`;
    return `${top("titles")}<div class="row-flex" style="margin-bottom:18px">${back("#titles", "Title reporting")}${s.cs.length ? "" : `<a class="btn sm" href="#launch/${t.id}">Launch a campaign →</a>`}</div>
      <div class="product">${C.cover(t, 120)}<div><p class="eyebrow">${esc(imprintName(t.imprint))} · ISBN ${t.isbn}</p><h1 class="display md" style="margin:6px 0 8px">${esc(t.title)}</h1><p class="lede">${esc(t.author)} · ${t.format} · Pub ${fmt(t.pubDate, true)}</p></div></div>
      <div class="tiles" style="margin-top:14px">${tiles}</div>
      ${salesChart(t, s.sales)}
      <div class="sec-head"><h2 class="sec">Every effort</h2><span class="count">${s.cs.length}</span></div><div class="rows" data-tour="efforts">${efforts}</div>
      <div class="two" style="margin-top:14px"><div><div class="sec-head" style="margin-top:26px"><h2 class="sec">Creative that ran</h2></div><div class="timeline">${creatives}</div></div>
        <div><div class="sec-head" style="margin-top:26px"><h2 class="sec">Changes Argus made</h2></div><div class="timeline">${changes}</div></div></div>`;
  }

  // ---------------- TITLE LANDING ----------------
  const FEATURED = "9781250400086";
  function renderLanding(id) {
    const t = titleById(id);
    const cs = campaignsFor(id), live = cs.filter((c) => c.status === "live"), ended = cs.filter((c) => c.status === "completed");
    const all = cs.map((c) => ({ c, agg: E.campaignPacing(S, c), res: results(c) }));
    const spent = all.reduce((a, x) => a + x.agg.spent, 0), budget = cs.reduce((a, c) => a + c.budget, 0);
    const liveAgg = all.filter((x) => x.c.status === "live");
    const lSpent = liveAgg.reduce((a, x) => a + x.agg.spent, 0), lPlanned = liveAgg.reduce((a, x) => a + x.agg.planned, 0);
    const dev = lPlanned ? Math.round((lSpent / lPlanned - 1) * 100) : 0;
    const co = all.reduce((a, x) => a + x.res.clickouts, 0), orders = all.reduce((a, x) => a + x.res.orders, 0);
    const health = live.map((c) => E.titleHealth(S, c)).sort((a, b) => a.score - b.score)[0];
    const tiles = [
      ["Spent", money(spent), `of ${money(budget)} across ${cs.length} campaign${cs.length === 1 ? "" : "s"}`, `<div class="meter"><span style="width:${budget ? Math.min(100, (spent / budget) * 100) : 0}%"></span></div>`],
      ["Pacing", !live.length ? "No live campaign" : Math.abs(dev) < 5 ? "On plan" : `${Math.abs(dev)}% ${dev > 0 ? "ahead" : "behind"}`, live.length ? `live campaign vs its spend curve · ${money(lSpent)} of ${money(lPlanned)} planned to date` : ""],
      ["Results", int(co + orders), `${int(co)} retailer click-outs · ${int(orders)} Amazon orders`],
      ["Health", health ? String(health.score) : "-", health ? `${health.label}${health.reasons[0] ? " · " + health.reasons[0].text : ""}` : "No live campaign to score"]
    ].map(([k, v, x, extra]) => `<div class="tile"><span class="k">${k}</span><span class="v">${esc(v)}</span>${extra || ""}<span class="s">${esc(x)}</span></div>`).join("");

    const open = S.proposals.filter((p) => cs.some((c) => c.id === p.campaign_id) && isOpen(p))
      .sort((x, y) => (/^resume_/.test(y.key || "") ? 1 : 0) - (/^resume_/.test(x.key || "") ? 1 : 0));
    const done = S.proposals.filter((p) => cs.some((c) => c.id === p.campaign_id) && p.status === "executed");
    const held = S.blocked.filter((p) => cs.some((c) => c.id === p.campaign_id));
    const nextTime = ended.flatMap((c) => E.report(S, c).next.map((n, i) => ({ c, n, k: c.id + i })));
    // The landing page shows three suggestions: decisions first, then recent changes, then lessons.
    const items = open.map((p, i) => propCard(p, i, true)).concat(done.map(doneCard), nextTime.map((x) => nextCard(x.k, x.n, cname(x.c).toLowerCase()))).slice(0, 3);
    const suggestions = items.join("");

    const order = { live: 0, scheduled: 1, completed: 2 };
    const campRows = all.slice().sort((a, b) => order[a.c.status] - order[b.c.status] || (a.c.start < b.c.start ? 1 : -1)).map(({ c, agg, res }) => {
      const n = res.clickouts + res.orders;
      return `<a class="prow" href="#campaign/${c.id}"><span><b style="font-weight:600">${esc(cname(c))}</b><br><span class="small muted">${usedPlatforms(c).map(pname).join(", ")}</span></span>
        <span><span class="tag${c.status === "live" ? " solid" : ""}">${statusWord(c)}</span></span>
        <span class="meter-cell"><div class="meter"><span style="width:${Math.min(100, agg.consumed * 100)}%"></span>${c.status === "live" ? `<i style="left:${Math.min(100, (agg.planned / c.budget) * 100)}%"></i>` : ""}</div><div class="small muted" style="margin-top:6px">${money(agg.spent)} of ${money(c.budget)} · ${fmt(c.start)} to ${fmt(c.end)}</div></span>
        <span class="r">${int(n)} results</span><span class="r">${n ? "$" + (agg.spent / n).toFixed(2) + " each" : "-"}</span></a>`;
    }).join("");

    const plat = D.PLATFORM_ORDER.map((p) => {
      const rows = cs.filter((c) => c.platformBudget[p]).map((c) => E.totals(c, p));
      const sp = rows.reduce((a, r) => a + r.spend, 0), act = rows.reduce((a, r) => a + r.actions, 0);
      const lr = live.filter((c) => c.platformBudget[p]).map((c) => E.platformPacing(S, c, p)).filter(Boolean)[0];
      const ldev = lr ? Math.round((lr.ratio - 1) * 100) : null;
      const pace = !lr ? "Not live" : lr.status === "paused_safety" ? '<span class="tag signal">Paused at cap</span>' : Math.abs(ldev) < 10 ? "On plan" : `${Math.abs(ldev)}% ${ldev > 0 ? "ahead" : "behind"}`;
      return { p, sp, act, pace };
    }).filter((x) => x.sp > 0);
    const totalSp = plat.reduce((a, x) => a + x.sp, 0);
    const platRows = plat.map((x) => `<div class="prow"><span class="pname">${pname(x.p)}</span><span class="meter-cell"><div class="meter"><span style="width:${(x.sp / totalSp) * 100}%"></span></div><div class="small muted" style="margin-top:6px">${money(x.sp)} · ${Math.round((x.sp / totalSp) * 100)}% of spend</div></span><span>${x.pace}</span><span class="r">${int(x.act)} ${x.p === "amazon" ? "orders" : "click-outs"}</span><span class="r hide-md">${x.act ? "$" + (x.sp / x.act).toFixed(2) + " each" : "-"}</span></div>`).join("");

    return `${top("")}
      <div class="title-head" data-tour="title-head">${C.cover(t, 54)}<div class="info"><h1>${esc(t.title)}<span class="sep">–</span><span class="by">${esc(t.author)}</span><span class="sep">–</span><span class="by">${esc(imprintName(t.imprint))}</span></h1>
        <span class="small muted">${t.series ? esc(t.series) + " · " : ""}${t.format} · On sale ${fmt(t.pubDate, true)} · ISBN ${t.isbn}</span></div>
        <a class="btn solid lg" href="#launch/${t.id}" data-tour="launch-ad">Launch ad</a></div>
      <div class="tiles" style="margin-top:14px" data-tour="title-tiles">${tiles}</div>
      <div class="sec-head"><h2 class="sec">Suggestions</h2><span class="note">${open.length ? open.length + " waiting on you" : ""}<span class="see-all">${open.length ? " · " : ""}<a href="#campaign/${(live[0] || cs[0] || {}).id}">See all</a></span></span></div>
      <div class="cards" data-tour="landing-suggestions">${suggestions || `<div class="card quiet"><h3>No suggestions right now.</h3></div>`}</div>
      <div class="sec-head"><h2 class="sec">Title campaigns</h2><span class="note">${cs.length} total</span></div>
      <div class="ptable ctable" data-tour="title-campaigns"><div class="prow h"><span>Campaign</span><span>Status</span><span>Spend</span><span class="r">Results</span><span class="r">Cost per result</span></div>${campRows || '<div class="prow"><span class="muted">No campaigns yet.</span></div>'}</div>
      <div class="sec-head"><h2 class="sec">Platform breakdown</h2><span class="note">All campaigns combined</span></div>
      <div class="ptable" data-tour="platforms"><div class="prow h"><span>Platform</span><span>Spend</span><span>Live pacing</span><span class="r">Results</span><span class="r hide-md">Cost per result</span></div>${platRows}</div>
      <div class="sec-head"><h2 class="sec">Sales</h2><span class="note">Last 16 weeks</span></div>
      ${salesChart(t, E.titleSales(S, id))}
      ${t.real ? `<p class="small muted title-real" style="margin-top:14px">Title details are from us.macmillan.com. All ad and sales numbers on this page are illustrative.</p>` : ""}`;
  }

  // ---------------- router ----------------
  let lastRoute = null;
  function parse() { const [r, a] = location.hash.replace(/^#/, "").split("/"); return { r: r || "home", a }; }
  function render() {
    const { r, a } = parse();
    const html = r === "reporting" ? renderReporting() : r === "campaign" ? renderCampaign(a) : r === "launch" ? (a ? renderLaunchTitle(a) : renderLaunchHome())
      : r === "titles" ? renderTitles() : r === "title" ? renderTitle(a) : r === "menu" ? renderHome() : renderLanding(FEATURED);
    $("#view").innerHTML = html;
    const key = r + "/" + (a || "");
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    document.title = r === "home" ? "ARGUS" : "ARGUS · " + ({ menu: "Menu", reporting: "Reporting", campaign: "Campaign", launch: "Launch", titles: "Titles", title: "Title" }[r] || "Overview");
    window.dispatchEvent(new Event("argus:render"));
  }
  window.addEventListener("hashchange", render);

  // ---------------- actions ----------------
  const ACT = {
    noop() {},
    rep(el) { UI.rep = el.dataset.k; render(); },
    approve(el) {
      const p = S.proposals.find((x) => x.proposal_id === el.dataset.id); if (!p) return;
      const role = nextRole(p);
      const r = E.decide(S, p.proposal_id, role, "approve");
      save(); render();
      if (!r.ok) toast(r.reason);
      else if (r.status === "executed") toast("Done. Applied and read back from the platform.");
      else toast(`Approved. Now waiting on ${E.ROLES[nextRole(p)]}.`);
    },
    snooze(el) { E.decide(S, el.dataset.id, "imprint_marketer", "snooze"); save(); render(); toast("Snoozed until tomorrow."); },
    dismiss(el) { E.decide(S, el.dataset.id, "imprint_marketer", "reject", { tags: ["Not useful"] }); save(); render(); toast("Dismissed. Argus logs the reason so it learns."); },
    playbook(el) { UI.playbook[el.dataset.k] = !UI.playbook[el.dataset.k]; render(); },
    advance() {
      const first = !S.spiked;
      if (first) { S.injectSpike = { campaign_id: "cmp_salt", platform: "tiktok" }; S.spiked = true; }
      const found = E.advanceDay(S); save(); render();
      if (found.some((a) => a.type === "hard_cap")) toast("TikTok on Salt and Signal hit its spending cap overnight and was paused automatically.", { href: "#campaign/cmp_salt", label: "See the suggestion" });
      else toast(`Now ${fmt(S.today, true)}. Spend pulled and pacing checked.`);
    },
    "cr-mode"(el) { const L = UI.launch; L.mode = el.dataset.mode; render(); },
    gen() {
      const L = UI.launch, t = titleById(L.titleId);
      L.generating = true;
      const finish = () => {
        const copy = genCopy(t, L.brief.objective);
        const cta = L.brief.objective === "preorder" ? "Pre-order" : "Buy now";
        const heads = { meta: `For readers of ${t.comps[0]}`, google: t.title, tiktok: "Your next obsession", amazon: copy.amazon };
        L.variants = {}; D.PLATFORM_ORDER.forEach((p) => (L.variants[p] = { copy: copy[p], headline: heads[p], cta }));
        L.generating = false; render();
      };
      if (ACT.fast) finish(); else { render(); setTimeout(finish, 700); }
    },
    "rm-upload"(el) { const L = UI.launch; const u = L.uploads.splice(Number(el.dataset.i), 1)[0]; if (u) URL.revokeObjectURL(u.url); render(); },
    obj(el) { UI.launch.brief.objective = el.dataset.k; if (UI.launch.variants) ACT.gen(); else render(); },
    signoff(el) {
      const L = UI.launch, t = titleById(L.titleId);
      if (!L.signed.includes(el.dataset.role)) L.signed.push(el.dataset.role);
      const need = E.approversForPlan(L.brief.budget, t);
      if (need.every((r) => L.signed.includes(r))) {
        const plan = E.draftPlan(t, L.brief);
        const c = E.launchCampaign(S, t, L.brief, plan);
        L.launched = c.id; save(); render(); toast("Scheduled and verified on every platform.");
      } else { render(); toast(`Signed. Now ${E.ROLES[need.find((r) => !L.signed.includes(r))]}.`); }
    },
    "launch-reset"() { UI.launch = null; UI.launchQ = ""; }
  };
  document.addEventListener("click", (e) => {
    const el = e.target.closest("[data-act]"); if (!el) return;
    const fn = ACT[el.dataset.act]; if (!fn) return;
    if (el.tagName === "BUTTON") e.preventDefault();
    fn(el);
  });
  document.addEventListener("toggle", (e) => { const d = e.target; if (d.classList && d.classList.contains("sugg")) UI.openSugg[d.dataset.sid] = d.open; }, true);
  document.addEventListener("input", (e) => {
    if (e.target.id === "launch-q") { UI.launchQ = e.target.value; $("#launch-results").innerHTML = launchRows(UI.launchQ); }
    if (e.target.id === "title-q") { UI.titleQ = e.target.value; $("#title-results").innerHTML = titleRows(UI.titleQ); }
  });
  document.addEventListener("submit", (e) => {
    e.preventDefault();
    if (e.target.id === "launch-form") { const m = matchTitles(UI.launchQ); if (m.length === 1 || (UI.launchQ && m.length)) location.hash = "launch/" + m[0].id; }
    if (e.target.id === "title-form") { const m = $("#title-results a.row"); if (m) location.hash = m.getAttribute("href").slice(1); }
  });
  document.addEventListener("change", (e) => {
    const k = e.target.dataset && e.target.dataset.brief;
    if (k && UI.launch) {
      const v = e.target.value;
      if (k === "budget") UI.launch.brief.budget = Math.max(1000, Number(v) || 1000);
      else if ((k === "start" || k === "end") && v) UI.launch.brief[k] = v;
      else if (k === "notes") UI.launch.brief.notes = v.trim();
      UI.launch.signed = []; render();
    }
    if (e.target.id === "file-in") addFiles(e.target.files);
  });
  function addFiles(files) {
    const L = UI.launch; if (!L) return;
    Array.from(files || []).forEach((f) => {
      const kind = f.type.startsWith("video") ? "video" : f.type.startsWith("image") ? "image" : null;
      if (!kind) return;
      const u = { name: f.name, kind, url: URL.createObjectURL(f), fit: kind === "video" ? "Video · Argus checks length on upload" : "Checking size…" };
      L.uploads.push(u);
      if (kind === "image") { const img = new Image(); img.onload = () => { u.fit = aspectFit(img.naturalWidth, img.naturalHeight); render(); }; img.src = u.url; }
    });
    render();
  }
  document.addEventListener("dragover", (e) => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); d.classList.add("over"); } });
  document.addEventListener("dragleave", (e) => { const d = e.target.closest && e.target.closest("#drop"); if (d) d.classList.remove("over"); });
  document.addEventListener("drop", (e) => { const d = e.target.closest && e.target.closest("#drop"); if (d) { e.preventDefault(); addFiles(e.dataTransfer.files); } });

  function reset() { store.del(KEY); S = E.makeState(); UI.launch = null; UI.playbook = {}; UI.launchQ = ""; UI.titleQ = ""; UI.rep = "active"; location.hash = ""; render(); }

  window.APP = {
    render, UI, ACT, toast, reset, save,
    get S() { return S; },
    findProposal: (key) => S.proposals.find((p) => p.key === key),
    openLaunch: (id) => { const t = titleById(id); ensureLaunch(t); return UI.launch; }
  };
  render();
})();
