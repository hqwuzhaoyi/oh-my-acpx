import test from "node:test";
import assert from "node:assert/strict";

import { buildRunPlanReport } from "../../src/cli/run-plan";

test("buildRunPlanReport keeps NO_PLAN status untouched", () => {
  const report = buildRunPlanReport({
    kind: "NO_PLAN",
    status: "NO_PLAN",
    planPath: ".oma/plans/plan.json"
  });

  assert.equal(report.status, "NO_PLAN");
  assert.equal(report.planPath, ".oma/plans/plan.json");
});

test("buildRunPlanReport adds route decision and suggested action for pending story", () => {
  const report = buildRunPlanReport({
    kind: "PENDING",
    status: "PENDING",
    planPath: ".oma/plans/plan.json",
    pendingCount: 2,
    nextStory: {
      id: "S-001",
      title: "Design architecture",
      priority: 1,
      passes: false,
      category: "deep"
    },
    message: "continue"
  });

  assert.equal(report.status, "PENDING");
  assert.equal(report.kind, "PENDING");
  if (report.kind !== "PENDING") {
    throw new Error("expected pending report");
  }
  assert.equal(report.route.category, "deep");
  assert.equal(report.route.agentId, "claude");
  assert.equal(report.suggestedAction.kind, "route_and_spawn");
  assert.match(report.suggestedAction.summary, /S-001/);
});

test("buildRunPlanReport falls back to standard routing when story category is missing", () => {
  const report = buildRunPlanReport({
    kind: "PENDING",
    status: "PENDING",
    planPath: ".oma/plans/plan.json",
    pendingCount: 1,
    nextStory: {
      id: "S-002",
      title: "Implement API",
      priority: 2,
      passes: false
    },
    message: "continue"
  });

  assert.equal(report.kind, "PENDING");
  if (report.kind !== "PENDING") {
    throw new Error("expected pending report");
  }
  assert.equal(report.route.category, "standard");
  assert.equal(report.route.agentId, "codex");
});
