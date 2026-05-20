import { spawnSync } from "node:child_process";

export type OpenClawSystemEventOptions = {
  timeoutMs?: number;
  stdio?: "inherit" | "pipe";
};

export function buildOpenClawSystemEventArgs(message: string, timeoutMs?: number): string[] {
  const args = ["system", "event", "--text", message, "--mode", "now"];

  if (typeof timeoutMs === "number") {
    args.push("--timeout", String(Math.floor(timeoutMs / 1000)));
  }

  return args;
}

export function runOpenClawSystemEvent(
  message: string,
  options: OpenClawSystemEventOptions = {}
): ReturnType<typeof spawnSync> {
  const args = buildOpenClawSystemEventArgs(message, options.timeoutMs);
  return spawnSync("openclaw", args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
    timeout: options.timeoutMs
  });
}
