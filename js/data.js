/* MATLOC demo data.
 * Every imprint, title, ISBN, and number in this file is fictional and exists only
 * to drive the demo. Swap in real ONIX / platform exports later via the same shapes.
 */
(function (root) {
  "use strict";

  // The demo's "today". Spend history runs up to the day before.
  const DEMO_TODAY = "2026-11-05";

  const PLATFORMS = {
    meta:   { id: "meta",   name: "Meta",       native: { spend: "Amount spent", clicks: "Link clicks", action: "Landing page click-outs", imps: "Views" } },
    google: { id: "google", name: "Google Ads", native: { spend: "Cost", clicks: "Clicks", action: "Conversions (click-out)", imps: "Impressions" } },
    tiktok: { id: "tiktok", name: "TikTok",     native: { spend: "Cost", clicks: "Clicks (destination)", action: "Complete payment (click-out)", imps: "Impressions" } },
    amazon: { id: "amazon", name: "Amazon Ads", native: { spend: "Spend", clicks: "Clicks", action: "14-day attributed orders", imps: "Impressions" } }
  };
  const PLATFORM_ORDER = ["meta", "google", "tiktok", "amazon"];

  const IMPRINTS = [
    { id: "northlight", name: "Northlight Books", owner: "Imprint marketer, Northlight", annualBudget: 420000 },
    { id: "emberoak",   name: "Ember & Oak",      owner: "Imprint marketer, Ember & Oak", annualBudget: 310000 },
    { id: "lantern",    name: "Lantern House Young Readers", owner: "Imprint marketer, Lantern House", annualBudget: 260000 },
    { id: "granary",    name: "Granary Press",    owner: "Imprint marketer, Granary", annualBudget: 180000 }
  ];

  // Title metadata, shaped like a trimmed ONIX record.
  const TITLES = [
    {
      id: "9781250990011", isbn: "978-1-250-99001-1", title: "The Glass Cartographer", author: "Imogen Vale",
      imprint: "northlight", pubDate: "2026-10-20", format: "Hardcover", price: 29.99,
      bisac: "FIC009020 Fiction / Fantasy / Epic", genre: "Fantasy", ageBand: "Adult",
      comps: ["The Ninth Lantern", "A Map of Salt"], flags: [], asin: "B0DEMO0011",
      cover: { bg: "#1f3b57", fg: "#e9d8a6", motif: "compass" }
    },
    {
      id: "9781250990028", isbn: "978-1-250-99002-8", title: "Salt and Signal", author: "Daniel Okafor",
      imprint: "emberoak", pubDate: "2026-11-03", format: "Hardcover", price: 28.00,
      bisac: "FIC031000 Fiction / Thrillers / General", genre: "Thriller", ageBand: "Adult",
      comps: ["The Lighthouse Protocol", "Low Water"], flags: [], asin: "B0DEMO0028",
      cover: { bg: "#0e2a2f", fg: "#f2f2f2", motif: "wave" }
    },
    {
      id: "9781250990035", isbn: "978-1-250-99003-5", title: "Small Wild Hearts", author: "Priya Castell",
      imprint: "lantern", pubDate: "2026-11-10", format: "Hardcover", price: 19.99,
      bisac: "YAF052000 Young Adult Fiction / Romance / General", genre: "YA Romance", ageBand: "14+",
      comps: ["Every Summer After", "The Fox Year"], flags: ["minors"], asin: "B0DEMO0035",
      cover: { bg: "#e7a1a8", fg: "#3a1420", motif: "heart" }
    },
    {
      id: "9781250990042", isbn: "978-1-250-99004-2", title: "The Quiet Ledger", author: "Ruth Amsel",
      imprint: "granary", pubDate: "2025-03-11", format: "Paperback", price: 19.00,
      bisac: "POL024000 Political Science / Public Policy / Economic Policy", genre: "Nonfiction (Policy)", ageBand: "Adult",
      comps: ["Debt and Daylight", "The Counting House"], flags: ["political"], asin: "B0DEMO0042",
      cover: { bg: "#efe6d2", fg: "#2b2b2b", motif: "lines" }
    },
    {
      id: "9781250990059", isbn: "978-1-250-99005-9", title: "Ninefold Harbor", author: "Tomas Rhee",
      imprint: "northlight", pubDate: "2026-09-08", format: "Hardcover", price: 30.00,
      bisac: "FIC028010 Fiction / Science Fiction / Action & Adventure", genre: "Science Fiction", ageBand: "Adult",
      comps: ["The Long Orbit", "Tidewell"], flags: [], asin: "B0DEMO0059",
      cover: { bg: "#2d2140", fg: "#f6c667", motif: "rings" }
    },
    {
      id: "9781250990066", isbn: "978-1-250-99006-6", title: "The Orchard at Low Tide", author: "Marguerite Sollis",
      imprint: "emberoak", pubDate: "2027-03-02", format: "Hardcover", price: 28.99,
      bisac: "FIC019000 Fiction / Literary", genre: "Literary / Book Club", ageBand: "Adult",
      comps: ["The Salt Orchard", "Winter Kept"], flags: [], asin: "B0DEMO0066",
      cover: { bg: "#3f5e3a", fg: "#f3e9d2", motif: "tree" },
      unlaunched: true
    }
  ];

  // Platform benchmarks the Planner uses (fictional "Macmillan history" by genre).
  // cpm $, ctr %, actionRate = click-outs per click (or orders per click on Amazon)
  const BENCHMARKS = {
    meta:   { cpm: 9.5,  ctr: 1.15, actionRate: 0.34 },
    google: { cpm: 14.0, ctr: 3.20, actionRate: 0.29 },
    tiktok: { cpm: 6.8,  ctr: 0.92, actionRate: 0.22 },
    amazon: { cpm: 4.2,  ctr: 0.55, actionRate: 0.085 }
  };

  // Per-campaign behavior knobs (how each platform actually delivers vs. plan)
  // used to synthesize a believable spend history with deterministic noise.
  const CAMPAIGNS = [
    {
      id: "cmp_glass", titleId: "9781250990011", name: "Glass Cartographer: launch + sustain",
      objective: "launch", budget: 120000, start: "2026-10-01", end: "2026-11-30",
      destination: "Imprint where-to-buy page", status: "live",
      alloc: { meta: 0.38, google: 0.22, tiktok: 0.15, amazon: 0.25 },
      deliver: { meta: 1.00, google: 0.97, tiktok: 1.03, amazon: 0.99 },
      perf: { meta: { ctrDecay: 0.018 }, google: {}, tiktok: {}, amazon: {} }
    },
    {
      id: "cmp_salt", titleId: "9781250990028", name: "Salt and Signal: launch week",
      objective: "launch", budget: 45000, start: "2026-10-12", end: "2026-11-25",
      destination: "Imprint where-to-buy page", status: "live",
      alloc: { meta: 0.35, google: 0.15, tiktok: 0.25, amazon: 0.25 },
      deliver: { meta: 1.01, google: 1.0, tiktok: 1.24, amazon: 0.98 },
      perf: { meta: {}, google: {}, tiktok: { cpmMult: 1.25 }, amazon: {} }
    },
    {
      id: "cmp_hearts", titleId: "9781250990035", name: "Small Wild Hearts: pre-order to launch",
      objective: "preorder", budget: 30000, start: "2026-10-15", end: "2026-12-13",
      destination: "Imprint where-to-buy page", status: "live",
      alloc: { meta: 0.30, google: 0.25, tiktok: 0.25, amazon: 0.20 },
      deliver: { meta: 0.99, google: 0.58, tiktok: 1.0, amazon: 1.02 },
      perf: { meta: {}, google: { ctrMult: 0.8 }, tiktok: {}, amazon: {} }
    },
    {
      id: "cmp_ledger", titleId: "9781250990042", name: "The Quiet Ledger: backlist push",
      objective: "backlist", budget: 20000, start: "2026-10-01", end: "2026-11-30",
      destination: "Amazon detail page", status: "live",
      alloc: { meta: 0.20, google: 0.20, tiktok: 0.0, amazon: 0.60 },
      deliver: { meta: 0.98, google: 1.02, tiktok: 0, amazon: 1.0 },
      perf: { meta: {}, google: {}, tiktok: {}, amazon: { actionMult: 1.3 } }
    },
    {
      id: "cmp_ninefold", titleId: "9781250990059", name: "Ninefold Harbor: pre-order + launch",
      objective: "launch", budget: 40000, start: "2026-08-10", end: "2026-09-30",
      destination: "Imprint where-to-buy page", status: "completed",
      alloc: { meta: 0.40, google: 0.20, tiktok: 0.15, amazon: 0.25 },
      deliver: { meta: 1.0, google: 0.99, tiktok: 0.97, amazon: 1.0 },
      perf: { meta: {}, google: {}, tiktok: { actionMult: 1.35 }, amazon: {} }
    }
  ];

  // Creatives per campaign (only some shown in detail).
  const CREATIVES = {
    cmp_glass: [
      { id: "cr_g1", platform: "meta", name: "Cover-led static", hook: "cover", rights: "cleared", launchedDay: 0, fatigue: 0.022 },
      { id: "cr_g2", platform: "meta", name: "Quote-led carousel", hook: "quote", rights: "cleared", launchedDay: 0, fatigue: 0.006 },
      { id: "cr_g3", platform: "meta", name: "Author video (15s)", hook: "author", rights: "cleared", launchedDay: 10, fatigue: 0.003 },
      { id: "cr_g4", platform: "tiktok", name: "Map-reveal trailer", hook: "trailer", rights: "cleared", launchedDay: 0, fatigue: 0.004 },
      { id: "cr_g5", platform: "google", name: "Search: title + author", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 },
      { id: "cr_g6", platform: "amazon", name: "Sponsored Products (exact)", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 }
    ],
    cmp_salt: [
      { id: "cr_s1", platform: "tiktok", name: "Cold-open hook (9s)", hook: "trailer", rights: "cleared", launchedDay: 0, fatigue: 0.005 },
      { id: "cr_s2", platform: "meta", name: "Comp-title static", hook: "cover", rights: "cleared", launchedDay: 0, fatigue: 0.009 },
      { id: "cr_s3", platform: "meta", name: "Review pull-quote", hook: "quote", rights: "cleared", launchedDay: 5, fatigue: 0.004 },
      { id: "cr_s4", platform: "amazon", name: "Sponsored Brands video", hook: "trailer", rights: "cleared", launchedDay: 0, fatigue: 0.002 }
    ],
    cmp_hearts: [
      { id: "cr_h1", platform: "tiktok", name: "Trope list (enemies to lovers)", hook: "trailer", rights: "cleared", launchedDay: 0, fatigue: 0.006 },
      { id: "cr_h2", platform: "meta", name: "Cover + pre-order offer", hook: "cover", rights: "cleared", launchedDay: 0, fatigue: 0.007 },
      { id: "cr_h3", platform: "google", name: "Search: author + series", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 }
    ],
    cmp_ledger: [
      { id: "cr_l1", platform: "amazon", name: "Sponsored Products (auto)", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 },
      { id: "cr_l2", platform: "meta", name: "Author op-ed quote", hook: "quote", rights: "cleared", launchedDay: 0, fatigue: 0.005 }
    ],
    cmp_ninefold: [
      { id: "cr_n1", platform: "meta", name: "Cover-led static", hook: "cover", rights: "cleared", launchedDay: 0, fatigue: 0.012 },
      { id: "cr_n2", platform: "meta", name: "Author video (15s)", hook: "author", rights: "cleared", launchedDay: 8, fatigue: 0.004 },
      { id: "cr_n3", platform: "tiktok", name: "Ship-launch trailer", hook: "trailer", rights: "cleared", launchedDay: 0, fatigue: 0.006 },
      { id: "cr_n4", platform: "google", name: "Search: title + author", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 },
      { id: "cr_n5", platform: "amazon", name: "Sponsored Products (exact)", hook: "search", rights: "cleared", launchedDay: 0, fatigue: 0 }
    ]
  };

  // Asset library for the launch wizard title.
  const ASSETS = {
    "9781250990066": [
      { id: "as_1", type: "Cover (front)", rights: "cleared", note: "US territory, all platforms" },
      { id: "as_2", type: "Author photo", rights: "cleared", note: "Credit: photographer required in Meta captions" },
      { id: "as_3", type: "Pull quote: Kirkus-style trade review", rights: "pending", note: "Clearance requested 2026-10-29" },
      { id: "as_4", type: "Endorsement: blurb from a bestselling author", rights: "cleared", note: "Cleared for advertising, US only" },
      { id: "as_5", type: "15s orchard b-roll video", rights: "cleared", note: "Stock license covers paid social" }
    ]
  };

  // Verified claim sources (for substantiation checks).
  const CLAIM_SOURCES = {
    "9781250990066": [
      { claim: "Indie Next List pick", source: "Indie Next List, March 2027 (announced 2026-11-02)" },
      { claim: "from the author of Winter Kept", source: "Backlist metadata" }
    ]
  };

  root.MATLOC_DATA = {
    DEMO_TODAY, PLATFORMS, PLATFORM_ORDER, IMPRINTS, TITLES, BENCHMARKS,
    CAMPAIGNS, CREATIVES, ASSETS, CLAIM_SOURCES
  };
  if (typeof module !== "undefined") module.exports = root.MATLOC_DATA;
})(typeof window !== "undefined" ? window : globalThis);
