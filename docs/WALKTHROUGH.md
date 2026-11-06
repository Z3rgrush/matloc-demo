# ARGUS demo: guided walkthrough

A 5 to 7 minute presenter script. It follows the in-app guided tour step for step, so you can press **Guided tour** and let it drive (every action step has a "Do it for me" button), or click through yourself.

**Before you start**

- Open `index.html` (or the GitHub Pages URL) and press **Reset demo** at the bottom of the page.
- The demo date is **November 5, 2026**. All titles, imprints and numbers are fictional.

**The one idea to land:** Argus does the watching, the drafting and the busywork; plain-code guardrails decide what is allowed; people make the calls.

---

## The home screen (30 seconds)

| # | Screen | Do | Say |
|---|---|---|---|
| 1 | Home | Start the tour | "ARGUS is an always-on ad specialist for Macmillan imprints, across Meta, Google, TikTok and Amazon Ads." |
| 2 | Three rows | Point at each | "Three paths. Reporting to see what needs changing, Launch to start from an ISBN, and Title reporting for the full picture on one book." |

## Reporting center (2 to 3 minutes)

| # | Screen | Do | Say |
|---|---|---|---|
| 3 | Campaign list | Point at the numbers on the right | "Every active and ended campaign, worst health first. The number is how many suggestions Argus has." |
| 4 | The Glass Cartographer | Read the first suggestion, then **Approve** | "Each suggestion has its evidence, expected impact, confidence, and how to undo it. This ad is wearing out." |
| 5 | Same card, now done | Point at the check | "Argus made the change through the API, read it back, logged it, and will measure the result in three days. In Phase 1 every change waits for a person." |
| 6 | Held by guardrails | Point at the dashed card | "This idea never reached anyone. Too big a step, too little evidence. The AI suggests; code decides what's allowed." |
| 7 | Reporting center | **Simulate next day** | "Overnight, TikTok on Salt and Signal spends three times its plan." |
| 8 | Salt and Signal | Point at the resume suggestion | "Paused at the cap automatically, and a suggestion to resume is waiting. Safety stops only ever reduce spend." |
| 9 | Ninefold Harbor (ended) | Click **Add to playbook** | "Ended campaigns get a report and suggestions for next time." |

## Title reporting (1 minute)

| # | Screen | Do | Say |
|---|---|---|---|
| 10 | Titles list | Point at spend, sales and campaign counts | "Every title in one list." |
| 11 | Salt and Signal chart | Hover the bars | "Weekly ad spend next to unit sales, with pre-orders before pub week. We call this context, not proof; a holdout test measures true lift." |
| 12 | Every effort | Scroll | "Every campaign, every creative that ran, and every change Argus made, with who approved it." |

## Launch center (2 minutes)

| # | Screen | Do | Say |
|---|---|---|---|
| 13 | Search | Type 978-1-250-99006-6 | "Start with an ISBN. Argus pulls the metadata." |
| 14 | Upload or generate | Click **Generate creative** (or drop in your own images) | "Bring your own creative and Argus checks sizes per platform, or let CHAPTR Amplify draft one ad per platform." |
| 15 | Generated ads | Point at the character counts and Reedy keywords | "Each ad is written to its platform's limits. Reedy adds keywords and an Amazon subtitle." |
| 16 | Budget, goal and plan | Change the budget, then sign off twice | "Argus splits the budget, explains why, and runs compliance checks. Over $25,000 also needs the marketing director." |
| 17 | Scheduled | Point at "it's queued" | "Built paused on every platform, read back, and scheduled. It shows up in reporting." |

## Likely questions

- **Is the AI changing our ads on its own?** Not in Phase 1. It suggests; a person approves; deterministic code checks every change against guardrails before anything executes.
- **Where do sales numbers come from?** BookScan and Amazon Ads in production (simulated here). Retail sales outside Amazon can't be tied to a single ad, so Argus shows them as context.
- **What's real in this demo?** The guardrail rules, pacing math, health score, compliance checks and report logic run in the browser. Platform APIs, Amplify, Reedy and sales feeds are simulated.
