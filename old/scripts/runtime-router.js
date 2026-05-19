#!/usr/bin/env node
/**
 * Compatibility shim for route decisions.
 *
 * Canonical implementation now lives in:
 *   src/core/router/*
 *
 * Build first:
 *   npm run build
 */

function arg(name) {
  const i = process.argv.indexOf(name);
  if (i === -1) return undefined;
  return process.argv[i + 1];
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

let getRouteDecision;
let TASK_CATEGORIES;

try {
  ({ getRouteDecision, TASK_CATEGORIES } = require('../dist/src/core/router'));
} catch {
  fail('Missing compiled router module. Run `npm run build` first.');
}

const category = arg('--category');
const forceRuntime = arg('--force-runtime');

if (!category) {
  console.error('Usage: node scripts/runtime-router.js --category <category> [--force-runtime <runtime>]');
  console.error('Categories:', TASK_CATEGORIES.join(', '));
  process.exit(2);
}

try {
  const result = getRouteDecision(category, forceRuntime);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}
