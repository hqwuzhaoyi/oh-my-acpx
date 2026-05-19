import test from "node:test";
import assert from "node:assert/strict";

import { buildSelfScheduleMessage, buildSelfScheduleOutput, inspectPlan, selectNextStory } from "../../src/core/scheduler";

test("missing plan returns NO_PLAN", () => {
  const result = inspectPlan("/tmp/definitely-missing-plan.json");
  assert.equal(result.status, "NO_PLAN");
});

test("all done plan returns ALL_DONE", () => {
  const result = selectNextStory({
    project: "demo",
    stories: [
      { id: "S-1", title: "done", priority: 1, passes: true },
      { id: "S-2", title: "done too", priority: 2, passes: true }
    ]
  });

  assert.equal(result.status, "ALL_DONE");
});

test("pending plan selects lowest priority unfinished story", () => {
  const result = selectNextStory({
    project: "demo",
    stories: [
      { id: "S-2", title: "later", priority: 2, passes: false },
      { id: "S-1", title: "first", priority: 1, passes: false }
    ]
  });

  assert.equal(result.status, "PENDING");
  assert.equal(result.nextStory?.id, "S-1");
});

test("self-schedule message points to .oma plan path", () => {
  const message = buildSelfScheduleMessage({
    id: "S-1",
    title: "first",
    priority: 1,
    passes: false
  });

  assert.match(message, /\.oma\/plans\/plan\.json/);
});

test("buildSelfScheduleOutput formats NO_PLAN / ALL_DONE / PENDING states", () => {
  const noPlan = buildSelfScheduleOutput({
    kind: "NO_PLAN",
    status: "NO_PLAN",
    planPath: ".oma/plans/plan.json"
  });
  assert.deepEqual(noPlan.lines, ["NO_PLAN"]);

  const allDone = buildSelfScheduleOutput({
    kind: "ALL_DONE",
    status: "ALL_DONE",
    planPath: ".oma/plans/plan.json",
    totalStories: 2
  });
  assert.match(allDone.lines[0], /ALL_DONE/);

  const pending = buildSelfScheduleOutput({
    kind: "PENDING",
    status: "PENDING",
    planPath: ".oma/plans/plan.json",
    pendingCount: 1,
    nextStory: {
      id: "S-1",
      title: "first",
      priority: 1,
      passes: false
    },
    message: "continue"
  });
  assert.equal(pending.kind, "PENDING");
  assert.match(pending.lines[0], /PENDING/);
  assert.equal(pending.message, "continue");
});
