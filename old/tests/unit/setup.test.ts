import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { ensureOmaRoot } from "../../src/cli/setup";

test("ensureOmaRoot creates the .oma directory structure", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-"));

  try {
    const templatesDir = path.join(tempDir, "templates");
    fs.mkdirSync(templatesDir, { recursive: true });
    fs.writeFileSync(
      path.join(templatesDir, "plan.json"),
      JSON.stringify(
        {
          project: "demo",
          stories: [{ id: "S-001", title: "Example", priority: 1, passes: false }]
        },
        null,
        2
      )
    );

    const result = ensureOmaRoot(tempDir);

    assert.equal(result.root, path.join(tempDir, ".oma"));
    assert.deepEqual(result.created.sort(), [
      "context",
      "interviews",
      "logs",
      "plans",
      "plans/plan.json",
      "specs",
      "state",
      "telemetry"
    ]);

    for (const entry of result.created) {
      assert.equal(fs.existsSync(path.join(result.root, entry)), true);
    }
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
