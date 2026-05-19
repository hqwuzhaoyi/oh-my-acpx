import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import {
  appendRelayFallbackTelemetry,
  appendTelemetryEntry,
  buildTelemetryEntry,
  getOpenClawTelemetryDir
} from "../../src/integrations/telemetry/ndjson";

test("getOpenClawTelemetryDir points to ~/.openclaw/telemetry", () => {
  assert.equal(getOpenClawTelemetryDir("/tmp/home"), path.join("/tmp/home", ".openclaw", "telemetry"));
});

test("buildTelemetryEntry includes event and timestamp", () => {
  const entry = buildTelemetryEntry("relay_watch_start", { streamLog: "/tmp/log" });

  assert.equal(entry.event, "relay_watch_start");
  assert.equal(typeof entry.ts, "string");
  assert.equal(entry.streamLog, "/tmp/log");
});

test("appendTelemetryEntry writes NDJSON line to telemetry file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-telemetry-"));

  try {
    const entry = appendTelemetryEntry(
      "relay_completed",
      { streamLog: "/tmp/log", eventCount: 2 },
      { homeDir: tempDir, fileName: "test.ndjson" }
    );

    const telemetryPath = path.join(tempDir, ".openclaw", "telemetry", "test.ndjson");
    assert.equal(fs.existsSync(telemetryPath), true);

    const lines = fs.readFileSync(telemetryPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), entry);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("appendRelayFallbackTelemetry writes to relay-fallback.ndjson", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "oh-my-acpx-telemetry-"));

  try {
    const entry = appendRelayFallbackTelemetry(
      "relay_watch_start",
      { streamLog: "/tmp/log" },
      { homeDir: tempDir }
    );

    const telemetryPath = path.join(tempDir, ".openclaw", "telemetry", "relay-fallback.ndjson");
    assert.equal(fs.existsSync(telemetryPath), true);

    const lines = fs.readFileSync(telemetryPath, "utf8").trim().split("\n");
    assert.equal(lines.length, 1);
    assert.deepEqual(JSON.parse(lines[0]), entry);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
