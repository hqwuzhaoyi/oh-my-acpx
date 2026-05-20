import test from "node:test";
import assert from "node:assert/strict";

import { getRouteDecision } from "../../src/core/router";

test("standard routes to acp/codex", () => {
  const decision = getRouteDecision("standard");
  assert.equal(decision.runtime, "acp");
  assert.equal(decision.agentId, "codex");
  assert.equal(decision.streamTo, "parent");
});

test("quick routes to acp/trae", () => {
  const decision = getRouteDecision("quick");
  assert.equal(decision.runtime, "acp");
  assert.equal(decision.agentId, "trae");
});

test("explore routes to subagent/codex", () => {
  const decision = getRouteDecision("explore");
  assert.equal(decision.runtime, "subagent");
  assert.equal(decision.agentId, "codex");
});

test("unknown category throws", () => {
  assert.throws(() => getRouteDecision("unknown" as never), /Unknown category/);
});
