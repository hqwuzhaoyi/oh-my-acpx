import test from "node:test";
import assert from "node:assert/strict";

import { buildOpenClawSystemEventArgs } from "../../src/integrations/openclaw/system-event";

test("buildOpenClawSystemEventArgs builds the default now-mode event command", () => {
  assert.deepEqual(buildOpenClawSystemEventArgs("hello"), [
    "system",
    "event",
    "--text",
    "hello",
    "--mode",
    "now"
  ]);
});

test("buildOpenClawSystemEventArgs converts timeoutMs to seconds", () => {
  assert.deepEqual(buildOpenClawSystemEventArgs("hello", 15000), [
    "system",
    "event",
    "--text",
    "hello",
    "--mode",
    "now",
    "--timeout",
    "15"
  ]);
});
