# ARGUS demo

**ARGUS** (formerly MATLOC, named for the hundred-eyed watchman who never slept) will be an agentic advertising specialist that gives every Macmillan imprint an ad toolbox built around its own budget, workflow, and goals. Most ad operators at Macmillan are generalists, so ARGUS will launch campaigns using proven best practices, setting up each ad correctly instead of whatever way is quickest. Once campaigns are live, it will monitor and optimize them, either making changes itself or sending recommendations to a human operator for approval. It will be able to tie ad spend to sales movement when needed, and build in-house audiences that keep improving over time. Through integration with CHAPTR's Reedy keyword and subtitle generation and Amplify content creation, an imprint will be able to launch a full slate of optimized ads just by typing in an ISBN, a budget, and a quick description of its goals. This will save time and standardize ad processes to improve every KPI.

This repository is a clickable demo of the Phase 1 toolkit described in the scoping plan (Draft v0.1, November 5, 2026), plus a guided walkthrough. Phase 1 executes only human-approved changes; opt-in autonomy for low-risk actions is planned for later.

> Daggerbound's title details are real. Every other title, imprint and person, and every ad and sales number, is fictional.

## Run it

No build step and no dependencies. Either:

- open `index.html` in a browser, or
- serve the folder: `npm start` (then open http://localhost:8080), or
- turn on GitHub Pages for the `main` branch (root folder).

Open `index.html#tour` to start straight into the guided tour, or press **Guided tour** on the home screen.

Run the engine tests with `npm test` (Node 20+).

## What the demo covers

The landing page is a single title's report, using a real Macmillan title (**Daggerbound** by T. Kingfisher, Bramble; details from us.macmillan.com, every ad and sales number illustrative). Top to bottom: title, author and imprint with a **Launch ad** button; Spent, Pacing, Results and Health tiles; every suggestion from the title's campaigns (live-campaign changes to approve, then next-time lessons from ended campaigns); the title's campaigns; a platform breakdown across them; and weekly sales next to ad spend.

The **Menu** (`#menu`) has three paths.

| Path | What it does |
|---|---|
| **Reporting center** | Every active and ended campaign, sorted worst health first, with a count of suggestions. Open a campaign to see spend, pacing, results and health, then Argus's suggested changes with evidence, expected impact, confidence and rollback. Approve, snooze or dismiss each one. Ended campaigns show a report and suggestions for next time. **Simulate next day** runs the overnight checks (the first run triggers a spend spike and an automatic pause). |
| **Launch center** | Search by ISBN or title, see the product metadata, then **Upload creative** (Argus checks each file's size for each platform) or **Generate creative** (simulated CHAPTR Amplify ads plus CHAPTR Reedy keywords and subtitle). Set a budget, goal and dates, review the platform split and compliance checks, and sign off to schedule. |
| **Title reporting** | Every title with its total ad spend, sales and campaigns. A title page shows weekly ad spend next to unit sales (pre-orders before pub week), every campaign, the creative that ran, and every change Argus made. |

**Title health** (`titleHealth()` in `js/engine.js`) starts at 100 and deducts for a paused platform (35), a platform 20%+ off its curve (22), a fatigued creative (12), a platform on watch (6) and each open suggestion (4). 80+ is Healthy, 60 to 79 Needs attention, under 60 At risk.

## Guided walkthrough

- **In-app tour** (`js/tour.js`): 21 steps that drive the live demo, with a "Do it for me" button on every action.
- **Presenter script** ([docs/WALKTHROUGH.md](docs/WALKTHROUGH.md)): a 5 to 7 minute talk track and likely questions.

## How it's built

```
index.html         shell (view + footer)
css/styles.css     tokens + components, light and dark
js/data.js         fictional titles, imprints, campaigns, benchmarks, assets
js/engine.js       agents + policy engine + execution (no DOM; unit-tested)
js/charts.js       hand-built SVG charts and generated covers
js/app.js          router, home, reporting, launch and title views
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
| Hard-cap auto-pause and kill switch | Title metadata feed (ONIX), CHAPTR Amplify and Reedy |
| Compliance checks (claims, limits, clearances, flags) | Sales data (BookScan), reconciliation figures |
| Report generation from campaign data | Notifications (email, Slack, SMS) |

## Next steps toward a real build

These follow §12 and §15 of the scoping plan: Phase 0 discovery and platform access applications, then read-only connectors and the budget and pacing dashboard as the first deliverable (Phase 1), then launch on Meta and Amazon (Phase 2).
