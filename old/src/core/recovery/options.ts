import type { StallDetectorCliOptions } from './types';

export function parseStallDetectorArgs(argv: string[], defaultPlanPath: string): StallDetectorCliOptions {
  let planPath = defaultPlanPath;
  let timeoutSec = 120;
  let dryRun = false;
  let watch = false;

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    const next = argv[index + 1];

    if (current === '--dry-run') {
      dryRun = true;
      continue;
    }

    if (current === '--watch') {
      watch = true;
      continue;
    }

    if (current === '--timeout' && next) {
      const parsed = Number.parseInt(next, 10);
      timeoutSec = Number.isNaN(parsed) ? 120 : parsed;
      index += 1;
      continue;
    }

    if (!current.startsWith('--')) {
      planPath = current;
    }
  }

  return {
    planPath,
    timeoutSec,
    dryRun,
    watch
  };
}
