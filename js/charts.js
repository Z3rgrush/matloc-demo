/* Hand-built SVG charts and book covers (no chart library needed for the demo). */
(function (root) {
  "use strict";
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
  const money = (n) => "$" + Math.round(n).toLocaleString("en-US");
  const kfmt = (n) => (n >= 1000 ? "$" + (n / 1000).toFixed(n >= 10000 ? 0 : 1) + "k" : "$" + Math.round(n));

  // Generated book cover (fictional titles, no real artwork).
  function cover(t, w = 34) {
    const h = Math.round(w * 1.5);
    const c = t.cover;
    const motif = {
      sword: `<path d="M50 34 L54 40 L54 82 L46 82 L46 40Z" fill="${c.fg}"/><rect x="36" y="82" width="28" height="5" rx="2" fill="${c.fg}"/><rect x="47" y="87" width="6" height="12" fill="${c.fg}"/><circle cx="50" cy="102" r="4" fill="${c.fg}"/>`,
      compass: `<circle cx="50" cy="62" r="18" fill="none" stroke="${c.fg}" stroke-width="2"/><path d="M50 40 L55 62 L50 84 L45 62Z" fill="${c.fg}"/>`,
      wave: `<path d="M10 70 Q30 55 50 70 T90 70" fill="none" stroke="${c.fg}" stroke-width="3"/><path d="M10 82 Q30 67 50 82 T90 82" fill="none" stroke="${c.fg}" stroke-width="2" opacity=".6"/>`,
      heart: `<path d="M50 88 C20 66 26 44 42 46 C47 47 50 52 50 52 C50 52 53 47 58 46 C74 44 80 66 50 88Z" fill="${c.fg}"/>`,
      lines: `<g stroke="${c.fg}" stroke-width="2">${[50, 58, 66, 74, 82].map((y, i) => `<line x1="20" x2="${80 - i * 9}" y1="${y}" y2="${y}"/>`).join("")}</g>`,
      rings: `<circle cx="50" cy="64" r="11" fill="${c.fg}"/><ellipse cx="50" cy="64" rx="28" ry="7" fill="none" stroke="${c.fg}" stroke-width="2"/>`,
      tree: `<rect x="48" y="62" width="4" height="24" fill="${c.fg}"/><circle cx="50" cy="56" r="16" fill="${c.fg}" opacity=".9"/><path d="M14 92 Q50 84 86 92" stroke="${c.fg}" stroke-width="2" fill="none"/>`
    }[c.motif] || "";
    const words = t.title.split(" ");
    const l1 = words.slice(0, Math.ceil(words.length / 2)).join(" "), l2 = words.slice(Math.ceil(words.length / 2)).join(" ");
    const big = w >= 80;
    return `<svg class="cover" width="${w}" height="${h}" viewBox="0 0 100 150" role="img" aria-label="Cover of ${esc(t.title)}"><rect width="100" height="150" fill="${c.bg}"/>${motif}${big ? `<text x="50" y="112" text-anchor="middle" fill="${c.fg}" font-family="Newsreader, Georgia, serif" font-size="10.5">${esc(l1)}</text><text x="50" y="125" text-anchor="middle" fill="${c.fg}" font-family="Newsreader, Georgia, serif" font-size="10.5">${esc(l2)}</text><text x="50" y="141" text-anchor="middle" fill="${c.fg}" font-family="IBM Plex Sans, sans-serif" font-size="6.5" letter-spacing="1">${esc(t.author.toUpperCase())}</text>` : `<rect x="14" y="112" width="72" height="5" fill="${c.fg}" opacity=".8"/><rect x="26" y="124" width="48" height="3" fill="${c.fg}" opacity=".6"/>`}<rect width="5" height="150" fill="#000" opacity=".18"/></svg>`;
  }

  function niceMax(v) {
    const p = Math.pow(10, Math.floor(Math.log10(v)));
    const n = v / p;
    return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
  }

  /* Cumulative pacing chart: planned curve vs actual vs forecast, with the budget cap.
     opts: { dates, planned[], actual[] (null after today), forecast[] (null before), budget, cap, phases[], pubIdx, todayIdx } */
  function pacingChart(el, o) {
    const W = 760, H = 280, m = { l: 56, r: 18, t: 16, b: 34 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b;
    const n = o.dates.length;
    const maxV = niceMax(Math.max(o.cap, ...o.planned, ...o.actual.filter((x) => x != null), ...o.forecast.filter((x) => x != null)) * 1.04);
    const x = (i) => m.l + (iw * i) / (n - 1);
    const y = (v) => m.t + ih - (ih * v) / maxV;
    const path = (arr) => { let d = ""; arr.forEach((v, i) => { if (v == null) return; d += (d ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1); }); return d; };
    const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * maxV);
    // phase bands
    let bands = "", prev = null, startI = 0;
    const phaseFill = { "pre-order": "var(--surface-2)", "launch week": "var(--accent-soft)", sustain: "transparent" };
    o.phases.concat([null]).forEach((ph, i) => {
      if (ph !== prev) {
        if (prev != null && phaseFill[prev] !== "transparent") bands += `<rect x="${x(startI)}" y="${m.t}" width="${Math.max(0, x(Math.min(i, n - 1)) - x(startI))}" height="${ih}" fill="${phaseFill[prev]}" opacity=".9"/>`;
        if (prev != null) bands += `<text class="lbl" x="${x(startI) + 4}" y="${m.t + 12}">${prev}</text>`;
        prev = ph; startI = i;
      }
    });
    const xt = [];
    const step = Math.max(1, Math.round(n / 6));
    for (let i = 0; i < n; i += step) xt.push(i);
    const fmtD = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const lastA = o.actual.reduce((acc, v, i) => (v != null ? i : acc), -1);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumulative spend against the planned pacing curve">
      ${bands}
      <g class="grid">${ticks.map((t) => `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}"/>`).join("")}</g>
      <g class="axis">${ticks.map((t) => `<text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end">${kfmt(t)}</text>`).join("")}
      ${xt.map((i) => `<text x="${x(i)}" y="${H - 10}" text-anchor="middle">${fmtD(o.dates[i])}</text>`).join("")}</g>
      <line x1="${m.l}" x2="${W - m.r}" y1="${y(o.cap)}" y2="${y(o.cap)}" stroke="var(--crit)" stroke-width="1.5" stroke-dasharray="2 3"/>
      <text class="lbl" x="${W - m.r}" y="${y(o.cap) - 6}" text-anchor="end" style="fill:var(--crit)">hard cap ${kfmt(o.cap)}</text>
      ${o.pubIdx >= 0 && o.pubIdx < n ? `<line x1="${x(o.pubIdx)}" x2="${x(o.pubIdx)}" y1="${m.t}" y2="${m.t + ih}" stroke="var(--accent)" stroke-width="1"/><text class="lbl" x="${x(o.pubIdx) + 4}" y="${m.t + ih - 6}" style="fill:var(--accent)">pub date</text>` : ""}
      <path d="${path(o.planned)}" fill="none" stroke="var(--ink-3)" stroke-width="2"/>
      <path d="${path(o.forecast)}" fill="none" stroke="var(--ink)" stroke-width="2" stroke-dasharray="5 4"/>
      <path d="${path(o.actual)}" fill="none" stroke="var(--ink)" stroke-width="2.5"/>
      ${lastA >= 0 ? `<circle cx="${x(lastA)}" cy="${y(o.actual[lastA])}" r="4.5" fill="var(--ink)" stroke="var(--surface)" stroke-width="2"/>` : ""}
      <line class="xh" x1="0" x2="0" y1="${m.t}" y2="${m.t + ih}" stroke="var(--ink-3)" stroke-width="1" visibility="hidden"/>
      <rect x="${m.l}" y="${m.t}" width="${iw}" height="${ih}" fill="transparent" class="hit"/>
    </svg><div class="tip" hidden></div>`;
    const svg = el.querySelector("svg"), tip = el.querySelector(".tip"), xh = el.querySelector(".xh");
    const move = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ((ev.clientX - r.left) / r.width) * W;
      const i = Math.max(0, Math.min(n - 1, Math.round(((px - m.l) / iw) * (n - 1))));
      xh.setAttribute("x1", x(i)); xh.setAttribute("x2", x(i)); xh.setAttribute("visibility", "visible");
      const a = o.actual[i], f = o.forecast[i];
      tip.innerHTML = `${fmtD(o.dates[i])} · ${o.phases[i]}<br>Planned <b>${money(o.planned[i])}</b>${a != null ? `<br>Actual <b>${money(a)}</b> (${a >= o.planned[i] ? "+" : ""}${Math.round((a / o.planned[i] - 1) * 100)}%)` : ""}${f != null && a == null ? `<br>Forecast <b>${money(f)}</b>` : ""}`;
      tip.hidden = false;
      tip.style.left = (x(i) / W) * r.width + "px";
      tip.style.top = (y(a != null ? a : f != null ? f : o.planned[i]) / H) * r.height + "px";
    };
    svg.addEventListener("pointermove", move);
    svg.addEventListener("pointerleave", () => { tip.hidden = true; xh.setAttribute("visibility", "hidden"); });
  }

  // Simple area sparkline with emphasized endpoint
  function spark(values, w = 120, h = 30, color = "var(--ink-2)") {
    if (!values.length) return "";
    const max = Math.max(...values), min = Math.min(...values) * 0.9;
    const x = (i) => (i / Math.max(1, values.length - 1)) * (w - 6) + 3;
    const y = (v) => h - 3 - ((v - min) / (max - min || 1)) * (h - 8);
    const d = values.map((v, i) => (i ? "L" : "M") + x(i).toFixed(1) + " " + y(v).toFixed(1)).join("");
    const last = values.length - 1;
    return `<svg width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" aria-hidden="true"><path d="${d} L${x(last)} ${h} L${x(0)} ${h}Z" fill="${color}" opacity=".12"/><path d="${d}" fill="none" stroke="${color}" stroke-width="1.6"/><circle cx="${x(last)}" cy="${y(values[last])}" r="2.8" fill="${color}"/></svg>`;
  }

  // Planned daily curve preview for the launch wizard (bars by phase)
  function curveBars(el, curve, budget) {
    const W = 760, H = 170, m = { l: 48, r: 10, t: 10, b: 28 };
    const iw = W - m.l - m.r, ih = H - m.t - m.b, n = curve.length;
    const maxV = niceMax(Math.max(...curve.map((c) => c.planned)) * 1.05);
    const bw = Math.max(1, iw / n - 2);
    const col = { "pre-order": "var(--ink-3)", "launch week": "var(--accent)", sustain: "var(--ink-2)" };
    const fmtD = (s) => new Date(s + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const xt = []; const step = Math.max(1, Math.round(n / 6)); for (let i = 0; i < n; i += step) xt.push(i);
    el.innerHTML = `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Planned daily spend by phase">
      <g class="grid">${[0, 0.5, 1].map((f) => `<line x1="${m.l}" x2="${W - m.r}" y1="${m.t + ih - ih * f}" y2="${m.t + ih - ih * f}"/>`).join("")}</g>
      <g class="axis">${[0, 0.5, 1].map((f) => `<text x="${m.l - 6}" y="${m.t + ih - ih * f + 4}" text-anchor="end">${kfmt(maxV * f)}</text>`).join("")}
      ${xt.map((i) => `<text x="${m.l + (iw * i) / n + bw / 2}" y="${H - 8}" text-anchor="middle">${fmtD(curve[i].date)}</text>`).join("")}</g>
      ${curve.map((c, i) => { const h = (ih * c.planned) / maxV; return `<rect x="${(m.l + (iw * i) / n).toFixed(1)}" y="${(m.t + ih - h).toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="${Math.min(2, bw / 2)}" fill="${col[c.phase]}"><title>${fmtD(c.date)} · ${c.phase} · ${money(c.planned)}</title></rect>`; }).join("")}
    </svg>`;
  }

  root.ARGUS_CHARTS = { cover, pacingChart, spark, curveBars, money, kfmt, esc };
})(window);
