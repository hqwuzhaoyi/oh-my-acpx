import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const REPO_ROOT = path.resolve(__dirname, "..", "..", "..");

function runNodeScript(scriptRelativePath: string, cwd: string) {
  return spawnSync("node", [path.join(REPO_ROOT, scriptRelativePath)], {
    cwd,
    encoding: "utf8"
  });
}

test("self-schedule defaults to .oma/plans/plan.json and returns NO_PLAN in empty directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-self-schedule-"));

  try {
    const result = runNodeScript("scripts/self-schedule.js", tempDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /NO_PLAN/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("stall-detector defaults to .oma/plans/plan.json and returns NO_PLAN in empty directory", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-stall-detector-"));

  try {
    const result = runNodeScript("scripts/stall-detector.js", tempDir);

    assert.equal(result.status, 0);
    assert.match(result.stdout, /NO_PLAN/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("README / docs / PRD all expose the capability matrix", () => {
  const read = (file: string) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8");

  const readme = read("README.md");
  const workflows = read("docs/workflows.md");
  const prd = read(".omx/plans/prd-redesign-goals.md");

  assert.match(readme, /核心能力矩阵/);
  assert.match(readme, /plan 是任务源，ralph 是默认执行循环，diagnose 是运维诊断层，team 是后续并行扩展层/);
  assert.match(workflows, /Core Capability Model/);
  assert.match(prd, /Core Capability Model/);
  assert.match(prd, /\| `plan` \|/);
  assert.match(prd, /\| `ralph` \|/);
  assert.match(prd, /\| `diagnose` \|/);
  assert.match(prd, /\| `team` \|/);
});

test("script disposition matrix is documented and referenced", () => {
  const read = (file: string) => fs.readFileSync(path.join(REPO_ROOT, file), "utf8");

  const matrix = read("docs/script-disposition.md");
  const readme = read("README.md");
  const workflows = read("docs/workflows.md");
  const prd = read(".omx/plans/prd-redesign-goals.md");

  assert.match(matrix, /Keep scripts, move logic/);
  assert.match(matrix, /scripts\/runtime-router\.js/);
  assert.match(matrix, /scripts\/stall-detector\.js/);
  assert.match(matrix, /scripts\/relay-fallback\.js/);
  assert.match(matrix, /test-runtime-stability\.sh/);
  assert.match(readme, /docs\/script-disposition\.md/);
  assert.match(workflows, /docs\/script-disposition\.md/);
  assert.match(prd, /Script disposition/);
});

test("send-feishu-notification reports missing env through the compatibility script", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-feishu-"));

  try {
    const env = {
      ...process.env,
      FEISHU_APP_ID: "",
      FEISHU_APP_SECRET: "",
      FEISHU_DEFAULT_CHAT_ID: ""
    };

    const result = spawnSync("node", [path.join(REPO_ROOT, "scripts/send-feishu-notification.js")], {
      cwd: tempDir,
      encoding: "utf8",
      env
    });

    assert.equal(result.status, 2);
    assert.match(result.stderr, /Missing required environment variable: FEISHU_APP_ID/);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
