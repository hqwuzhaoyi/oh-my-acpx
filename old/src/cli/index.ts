#!/usr/bin/env node
import { runDiagnoseCommand } from './diagnose';
import { runDoctorCommand } from './doctor';
import { runPlanCommand } from './run-plan';
import { runRouteCommand } from './route';
import { runSetupCommand } from './setup';

type ParsedArgs = {
  command?: string;
  positionals: string[];
  flags: Record<string, string | boolean>;
};

function parseArgs(argv: string[]): ParsedArgs {
  const [command, ...rest] = argv;
  const positionals: string[] = [];
  const flags: Record<string, string | boolean> = {};

  for (let index = 0; index < rest.length; index += 1) {
    const current = rest[index];
    if (!current.startsWith('--')) {
      positionals.push(current);
      continue;
    }

    const key = current.slice(2);
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      flags[key] = true;
      continue;
    }

    flags[key] = next;
    index += 1;
  }

  return { command, positionals, flags };
}

function printHelp(): void {
  console.log(`oax <command>

Commands:
  setup
  route --category <name> [--force-runtime <runtime>]
  diagnose relay --stream-log <path> [--child-log <path>] [--watch] [--timeout <sec>]
  diagnose stall [plan-path] [--timeout <sec>]
  doctor
  run [plan-path]
  run-plan [plan-path]   # compatibility alias
`);
}

function main(): number {
  const parsed = parseArgs(process.argv.slice(2));

  switch (parsed.command) {
    case 'route':
      return runRouteCommand({
        category: typeof parsed.flags.category === 'string' ? parsed.flags.category : undefined,
        forceRuntime: typeof parsed.flags['force-runtime'] === 'string' ? parsed.flags['force-runtime'] : undefined
      });
    case 'diagnose':
      return runDiagnoseCommand({
        subcommand: parsed.positionals[0],
        planPath: parsed.positionals[1],
        streamLog: typeof parsed.flags['stream-log'] === 'string' ? parsed.flags['stream-log'] : undefined,
        childLog: typeof parsed.flags['child-log'] === 'string' ? parsed.flags['child-log'] : undefined,
        watch: parsed.flags.watch === true,
        timeoutSec: typeof parsed.flags.timeout === 'string' ? Number.parseInt(parsed.flags.timeout, 10) : undefined
      });
    case 'setup':
      return runSetupCommand();
    case 'doctor':
      return runDoctorCommand();
    case 'run':
    case 'run-plan':
      return runPlanCommand(parsed.positionals[0]);
    case 'help':
    case '--help':
    case '-h':
    case undefined:
      printHelp();
      return 0;
    default:
      console.error(`Unknown command: ${parsed.command}`);
      printHelp();
      return 2;
  }
}

process.exitCode = main();
