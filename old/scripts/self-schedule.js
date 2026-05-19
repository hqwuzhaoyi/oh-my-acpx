#!/usr/bin/env node
/**
 * Compatibility shim for self-schedule checks.
 *
 * Canonical implementation now lives in:
 *   src/core/scheduler/*
 *
 * Build first:
 *   npm run build
 */

let inspectPlan;
let buildSelfScheduleOutput;
let runOpenClawSystemEvent;

try {
  ({ inspectPlan, buildSelfScheduleOutput } = require('../dist/src/core/scheduler'));
  ({ runOpenClawSystemEvent } = require('../dist/src/integrations/openclaw/system-event'));
} catch {
  console.error('Missing compiled scheduler/system-event module. Run `npm run build` first.');
  process.exit(2);
}

const planPath = process.argv[2] || '.oma/plans/plan.json';
const result = inspectPlan(planPath);
const output = buildSelfScheduleOutput(result);
for (const line of output.lines) {
  console.log(line);
}

if (output.kind !== 'PENDING') {
  process.exit(0);
}

try {
  const eventResult = runOpenClawSystemEvent(output.message, { stdio: 'inherit' });
  if (eventResult.status !== 0) {
    throw new Error(eventResult.stderr || eventResult.stdout || `openclaw exited with status ${eventResult.status}`);
  }
  console.log('TRIGGERED: 已触发下一轮');
} catch (error) {
  console.error('TRIGGER_FAILED: ' + error.message);
  process.exit(1);
}
