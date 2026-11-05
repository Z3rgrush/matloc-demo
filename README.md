# MATLOC demo

**MATLOC** (Macmillan Ad Toolkit: Launching, Optimizing, Converting) is an approval-gated advertising specialist for Macmillan imprints. This repository is a clickable demo of the Phase 1 toolkit described in the scoping plan (Draft v0.1, November 5, 2026), plus a guided walkthrough.

> All imprints, titles, ISBNs, people and numbers in this demo are fictional.

## Run it

No build step and no dependencies. Either:

- open `index.html` in a browser, or
- serve the folder: `npm start` (then open http://localhost:8080), or
- turn on GitHub Pages for the `main` branch (root folder).

Open `index.html#tour` to start straight into the guided tour, or press **Guided tour** in the top bar.

Run the engine tests with `npm test` (Node 20+).

## What the demo covers

The left menu keeps **Action center** and **Approvals** pinned, then offers three modes: **Reporting** (portfolio, budget and pacing, reports, audit log), **Launch** (new campaign, titles ready to launch, scheduled campaigns) and **Titles** (search any title's dashboard, sorted by health). It collapses to icons and becomes a drawer on phones.

| Screen | What it shows | Scoping plan |
|---|---|---|
| **Action center** (home) | An ordered to-do list built from live state: safety stops first, then decisions with the agent's recommendation, reminders, launches due, reports to read. Title health for every live title | §3.1 G2, G5, §7.7 |
| **Portfolio** | Live budget, spend, forecast, approvals waiting, alerts, what the agents did overnight | §7.6 Portfolio, §3.1 G2 |
| **Approvals** | Structured proposals (evidence, impact, risk, rollback, expiry), approve / edit / reject with reasons / snooze, multi-role approval chains, proposals held by guardrails | §7.3, §7.4 |
| **Budget & pacing** | Imprint → title → platform budgets, pacing against the pub-date curve, forecast, guardrail tiers, emergency auto-pause, kill switch, reconciliation | §7.7 |
| **Title dashboard** | Health score (0 to 100) with plain-language reasons and a fix button for each, funnel with honest source labels, native vs. normalized metrics, creative leaderboard with fatigue, optimization log | §7.6, §8 |
| **Launch a campaign** | 7-step title-first wizard: metadata, brief, Planner draft, copy with limits, blocking compliance checks, threshold approvals, post-launch read-back | §7.5, §10.1 |
| **Campaign report** | Auto-generated end-of-campaign report with caveats and next-time plan | §7.6, §3.1 G6 |
| **Audit log** | Every approval, edit, execution and safety stop, with before/after state | §3.1 G7, §10.2 |

**Guidance everywhere:** the top bar always shows the single next step, each screen has a "Next best action" banner, the launch wizard explains what to do on each step, and every confirmation says what to do next.

**Title health** (`titleHealth()` in `js/engine.js`) starts at 100 and deducts for a paused platform (35), a platform 20%+ off its curve (22), a fatigued creative (12), a platform on watch (6) and each open decision (4). 80+ is Healthy, 60 to 79 Needs attention, under 60 At risk.

The **Advance one day** button runs a simulated day: connectors "pull" spend, the Budget steward and Monitor check pacing and caps, proposals expire, and executed changes get measured outcomes.

## Guided walkthrough

- **In-app tour** (`js/tour.js`): 32 steps that drive the live demo, with a "Do it for me" button on every action so a presenter can run the whole story with one hand. Each step cites the scoping-plan section it demonstrates.
- **Presenter script** ([docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)): a 10-minute talk track, what to click, what to say, and likely questions.

## How it's built

```
index.html         shell (rail, command bar, view)
css/styles.css     tokens + components, light and dark
js/data.js         fictional titles, imprints, campaigns, benchmarks, assets
js/engine.js       agents + policy engine + execution (no DOM; unit-tested)
js/charts.js       hand-built SVG charts and generated covers
js/app.js          router, views, actions
js/tour.js         guided walkthrough
tests/             node:test suite for the guardrails
```

The engine follows the plan's architecture (§7.1):

- **Agents reason.** Planner, Budget steward, Monitor, Optimizer and Reporter produce structured proposals in the §7.3 schema. In this demo they are deterministic heuristics seeded from the Appendix A playbook so every run is repeatable. In production they are LLM calls with read-only tools.
- **The policy engine decides.** `validateProposal()` is plain code. It assigns risk from the action taxonomy, escalates minors-flagged and political titles, enforces the single-step limit, evidence minimums, budget ceilings and the kill switch, and sets the approval chain by risk and dollar impact. Proposals that fail never reach a queue.
- **Adapters act, then verify.** `execute()` runs only after every required approver signs, uses an idempotency key, reads the change back, writes the audit log and schedules an outcome check.
- **Safety stops only reduce spend.** On a hard-cap breach the system pauses the platform (if auto-pause is on), alerts, and drafts a one-click resume proposal.

## What is real and what is simulated

| Real (runs in the browser) | Simulated |
|---|---|
| Policy engine rules and approval chains | Platform APIs (Meta, Google Ads, TikTok, Amazon Ads) |
| Pacing curve, forecast and guardrail tiers | LLM reasoning (seeded heuristics) |
| Hard-cap auto-pause and kill switch | Title metadata feed (ONIX) and asset library |
| Compliance checks (claims, limits, clearances, flags) | Sales data (BookScan), reconciliation figures |
| Report generation from campaign data | Notifications (email, Slack, SMS) |

## Next steps toward a real build

These follow §12 and §15 of the scoping plan: Phase 0 discovery and platform access applications, then read-only connectors and the budget and pacing dashboard as the first deliverable (Phase 1), then launch on Meta and Amazon (Phase 2).
