import fs from 'node:fs';
import path from 'node:path';
import type { ChildRecoveryResult, RelayEvent, RelayLogParseResult } from './types';

export function parseRelayLogText(raw: string): RelayLogParseResult {
  const lines = raw.split('\n').filter(Boolean);
  const events: RelayEvent[] = [];

  for (const line of lines) {
    try {
      events.push(JSON.parse(line) as RelayEvent);
    } catch {
      // Ignore malformed log lines and keep diagnostics best-effort.
    }
  }

  return { events, raw };
}

export function parseRelayLogFile(filePath: string): RelayLogParseResult {
  if (!fs.existsSync(filePath)) {
    return { events: [], raw: '' };
  }

  return parseRelayLogText(fs.readFileSync(filePath, 'utf8'));
}

export function recoverChildLogText(raw: string, childLogPath?: string): ChildRecoveryResult {
  const { events } = parseRelayLogText(raw);

  const assistantMessages = events.filter((event) => {
    const record = event as Record<string, any>;

    if (record.method === 'session/update') {
      const update = (record.params ?? {}).update ?? {};
      return update.sessionUpdate === 'agent_message_chunk';
    }

    return record.kind === 'assistant_delta' || record.type === 'assistant' || record.role === 'assistant';
  });

  const hasEndTurn = events.some((event) => {
    const record = event as Record<string, any>;

    if (record.result && record.result.stopReason === 'end_turn') {
      return true;
    }

    return record.stopReason === 'end_turn' || (record.data && record.data.stopReason === 'end_turn');
  });

  const textParts: string[] = [];
  for (const message of assistantMessages) {
    const record = message as Record<string, any>;
    const update = (record.params ?? {}).update ?? {};
    const content = update.content ?? {};

    if (content.text) {
      textParts.push(String(content.text));
      continue;
    }

    if (record.text) {
      textParts.push(String(record.text));
      continue;
    }

    if (record.content) {
      textParts.push(typeof record.content === 'string' ? record.content : JSON.stringify(record.content));
      continue;
    }

    if (record.delta) {
      textParts.push(typeof record.delta === 'string' ? record.delta : JSON.stringify(record.delta));
    }
  }

  return {
    found: assistantMessages.length > 0,
    messageCount: assistantMessages.length,
    hasEndTurn,
    text: textParts.join(''),
    childLogPath
  };
}

export function recoverChildLogFile(childLogPath?: string | null): ChildRecoveryResult | null {
  if (!childLogPath || !fs.existsSync(childLogPath)) {
    return null;
  }

  return recoverChildLogText(fs.readFileSync(childLogPath, 'utf8'), childLogPath);
}

export function findLatestAcpxChildLog(homeDir: string = process.env.HOME || '~'): string | null {
  const acpxDir = path.join(homeDir, '.acpx', 'sessions');
  if (!fs.existsSync(acpxDir)) {
    return null;
  }

  try {
    const files = fs
      .readdirSync(acpxDir)
      .filter((file) => file.endsWith('.stream.ndjson'))
      .map((file) => ({
        name: file,
        mtime: fs.statSync(path.join(acpxDir, file)).mtime.getTime()
      }))
      .sort((left, right) => right.mtime - left.mtime);

    if (files.length === 0) {
      return null;
    }

    return path.join(acpxDir, files[0].name);
  } catch {
    return null;
  }
}

export function resolveRelayChildLogPath(options: {
  childLogPath?: string;
  homeDir?: string;
} = {}): string | null {
  return options.childLogPath || findLatestAcpxChildLog(options.homeDir);
}
