import fs from 'node:fs';
import path from 'node:path';

export type OmaSetupResult = {
  root: string;
  created: string[];
};

const OMA_DIRECTORIES = ['plans', 'state', 'logs', 'telemetry', 'context', 'interviews', 'specs'] as const;

export function ensureOmaRoot(baseDir: string = process.cwd()): OmaSetupResult {
  const root = path.join(baseDir, '.oma');
  const created: string[] = [];

  fs.mkdirSync(root, { recursive: true });

  for (const entry of OMA_DIRECTORIES) {
    const target = path.join(root, entry);
    const existed = fs.existsSync(target);
    fs.mkdirSync(target, { recursive: true });
    if (!existed) {
      created.push(entry);
    }
  }

  const templatePlanPath = path.join(baseDir, 'templates', 'plan.json');
  const targetPlanPath = path.join(root, 'plans', 'plan.json');

  if (!fs.existsSync(targetPlanPath) && fs.existsSync(templatePlanPath)) {
    fs.copyFileSync(templatePlanPath, targetPlanPath);
    created.push('plans/plan.json');
  }

  return { root, created };
}

export function runSetupCommand(): number {
  const result = ensureOmaRoot();
  console.log(JSON.stringify(result, null, 2));
  return 0;
}
