import type { RelayFallbackCliOptions } from './types';

export function parseRelayFallbackArgs(argv: string[]): RelayFallbackCliOptions {
  let streamLog: string | undefined;
  let childLogPath: string | undefined;
  let watch = false;
  let timeoutSec = 75;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--watch') {
      watch = true;
      continue;
    }

    if (current === '--stream-log' && next) {
      streamLog = next;
      index += 1;
      continue;
    }

    if (current === '--child-log' && next) {
      childLogPath = next;
      index += 1;
      continue;
    }

    if (current === '--timeout' && next) {
      const parsed = Number.parseInt(next, 10);
      timeoutSec = Number.isNaN(parsed) ? 75 : parsed;
      index += 1;
    }
  }

  return {
    streamLog,
    childLogPath,
    watch,
    timeoutSec
  };
}
