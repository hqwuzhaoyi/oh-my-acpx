import fs from "node:fs";
import path from "node:path";

export type TelemetryEntry = {
  ts: string;
  event: string;
  [key: string]: unknown;
};

export function getOpenClawTelemetryDir(homeDir: string = process.env.HOME || "~"): string {
  return path.join(homeDir, ".openclaw", "telemetry");
}

export function buildTelemetryEntry(event: string, data: Record<string, unknown> = {}): TelemetryEntry {
  return {
    ts: new Date().toISOString(),
    event,
    ...data
  };
}

export function appendTelemetryEntry(
  event: string,
  data: Record<string, unknown> = {},
  options: { homeDir?: string; fileName?: string } = {}
): TelemetryEntry {
  const entry = buildTelemetryEntry(event, data);
  const logDir = getOpenClawTelemetryDir(options.homeDir);
  const fileName = options.fileName || "relay-fallback.ndjson";

  fs.mkdirSync(logDir, { recursive: true });
  fs.appendFileSync(path.join(logDir, fileName), `${JSON.stringify(entry)}\n`);

  return entry;
}

export function appendRelayFallbackTelemetry(
  event: string,
  data: Record<string, unknown> = {},
  options: { homeDir?: string } = {}
): TelemetryEntry {
  return appendTelemetryEntry(event, data, {
    homeDir: options.homeDir,
    fileName: "relay-fallback.ndjson"
  });
}
