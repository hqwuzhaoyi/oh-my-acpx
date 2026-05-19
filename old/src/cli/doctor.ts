import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';

type CheckResult = {
  name: string;
  ok: boolean;
  detail: string;
};

function commandExists(command: string): CheckResult {
  const lookup = process.platform === 'win32' ? 'where' : 'which';
  const result = spawnSync(lookup, [command], { encoding: 'utf8' });

  return {
    name: command,
    ok: result.status === 0,
    detail: result.status === 0 ? (result.stdout.trim().split('\n')[0] ?? 'found') : 'not found in PATH'
  };
}

export function runDoctorCommand(): number {
  const checks: CheckResult[] = [
    {
      name: 'node',
      ok: true,
      detail: process.version
    },
    commandExists('openclaw'),
    commandExists('acpx'),
    {
      name: 'config/acpx-config.json',
      ok: existsSync(join(process.cwd(), 'config', 'acpx-config.json')),
      detail: existsSync(join(process.cwd(), 'config', 'acpx-config.json')) ? 'present' : 'missing'
    }
  ];

  const ok = checks.every((check) => check.ok);
  console.log(JSON.stringify({ ok, checks }, null, 2));
  return ok ? 0 : 1;
}
