// Run with: node --test tests/
// Covers the deterministic guardrails the scoping plan treats as non-negotiable.
const test = require("node:test");
const assert = require("node:assert");
require("../js/data.js");
const E = require("../js/engine.js");

const fresh = () => E.makeState();
const byKey = (s, k) => s.proposals.concat(s.blocked).find((p) => p.key === k);

test("seeded proposals follow the §7.3 schema", () => {
  const s = fresh();
  for (const p of s.proposals) {
    for (const f of ["proposal_id", "title_id", "platform", "action_type", "summary", "evidence", "expected_impact", "risk", "rollback", "requires_approval_from", "expires_at"]) {
      assert.ok(p[f] !== undefined, `${p.proposal_id} missing ${f}`);
    }
  }
});

test("policy engine blocks oversized steps, thin evidence and budget overruns", () => {
  const s = fresh();
  const p = byKey(s, "glass_meta_up60");
  assert.strictEqual(p.status, "blocked");
  assert.ok(p.policy.errors.some((e) => /single-step limit/.test(e)));
  assert.ok(p.policy.errors.some((e) => /clicks of evidence/.test(e)));
  assert.ok(!s.proposals.includes(p), "blocked proposals never reach the queue");
});

test("minors-flagged titles escalate to high risk with director and compliance", () => {
  const s = fresh();
  const p = byKey(s, "hearts_google_bid");
  assert.strictEqual(p.risk, "high");
  assert.deepStrictEqual(p.requires_approval_from, ["imprint_marketer", "marketing_director", "compliance"]);
});

test("nothing executes until every required approver signs", () => {
  const s = fresh();
  const p = byKey(s, "hearts_google_bid");
  let r = E.decide(s, p.proposal_id, "imprint_marketer", "approve");
  assert.strictEqual(r.status, "partially_approved");
  r = E.decide(s, p.proposal_id, "marketing_director", "approve");
  assert.strictEqual(r.status, "partially_approved");
  assert.ok(!p.executed);
  r = E.decide(s, p.proposal_id, "compliance", "approve");
  assert.strictEqual(r.status, "executed");
  assert.ok(r.steps.some((x) => /Read-back/.test(x)));
});

test("roles outside the chain cannot approve", () => {
  const s = fresh();
  const p = byKey(s, "fatigue_cr_g1");
  const r = E.decide(s, p.proposal_id, "compliance", "approve");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(p.status, "pending");
});

test("edit-and-approve is re-validated; an oversized edit is refused", () => {
  const s = fresh();
  const p = byKey(s, "shift_glass");
  const r = E.decide(s, p.proposal_id, "imprint_marketer", "edit", { params: { per_day: p.params.per_day * 3 } });
  assert.strictEqual(r.ok, false);
  assert.ok(!p.executed);
});

test("hard-cap breach pauses automatically and drafts a resume proposal", () => {
  const s = fresh();
  s.injectSpike = { campaign_id: "cmp_salt", platform: "tiktok" };
  const found = E.advanceDay(s);
  assert.ok(found.some((a) => a.type === "hard_cap"));
  const salt = s.campaigns.find((c) => c.id === "cmp_salt");
  assert.strictEqual(salt.platforms.tiktok.status, "paused_safety");
  assert.ok(s.proposals.some((p) => p.action_type === "resume_platform" && p.status === "pending"));
  assert.ok(s.audit.some((a) => a.actor === "system" && /hard-cap/.test(a.action)));
});

test("with auto-pause off, a breach alerts but does not pause", () => {
  const s = fresh();
  s.settings.autoPause = false;
  s.injectSpike = { campaign_id: "cmp_salt", platform: "tiktok" };
  E.advanceDay(s);
  const salt = s.campaigns.find((c) => c.id === "cmp_salt");
  assert.strictEqual(salt.platforms.tiktok.status, "active");
  assert.ok(s.alerts.some((a) => a.type === "hard_cap"));
});

test("kill switch blocks approvals", () => {
  const s = fresh();
  s.killSwitch = true;
  const p = byKey(s, "fatigue_cr_g1");
  const r = E.decide(s, p.proposal_id, "imprint_marketer", "approve");
  assert.strictEqual(r.ok, false);
});

test("proposals expire when left undecided", () => {
  const s = fresh();
  for (let i = 0; i < 5; i++) E.advanceDay(s);
  assert.ok(s.proposals.some((p) => p.status === "expired"));
});

test("budget shifts keep the campaign total unchanged", () => {
  const s = fresh();
  const p = byKey(s, "shift_glass");
  const c = s.campaigns.find((x) => x.id === p.campaign_id);
  const before = E.sum(Object.values(c.platformBudget));
  E.decide(s, p.proposal_id, "imprint_marketer", "approve");
  assert.strictEqual(E.sum(Object.values(c.platformBudget)), before);
});

test("compliance blocks unsubstantiated claims and pending quotes", () => {
  const t = E.titleById("9781250990066");
  const checks = E.runCompliance(t, { meta: "The #1 bestseller.", google: "Short", tiktok: "ok", amazon: "ok" }, ["as_3"], 35000, "page");
  assert.ok(checks.some((c) => c.id === "claim_meta" && c.result === "fail"));
  assert.ok(checks.some((c) => c.id === "quotes" && c.result === "fail"));
  assert.deepStrictEqual(E.approversForPlan(35000, t), ["imprint_marketer", "marketing_director"]);
});

test("planner splits sum to the budget and zero TikTok for political titles", () => {
  const pol = E.titleById("9781250990042");
  const plan = E.draftPlan(pol, { objective: "backlist", budget: 20000, start: "2026-12-01", end: "2026-12-31" });
  assert.strictEqual(plan.allocation.tiktok, 0);
  const total = E.sum(Object.values(plan.allocation));
  assert.ok(Math.abs(total - 20000) <= 4);
});
