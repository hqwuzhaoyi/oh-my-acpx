import type { RelayEvent, RelayInspection } from './types';

export function diagnoseRelayEvents(events: RelayEvent[]): RelayInspection {
  const hasStart = events.some(
    (event) => event.kind === 'system_event' && /:start$/.test(String(event.contextKey ?? ''))
  );
  const hasStall = events.some(
    (event) => event.kind === 'system_event' && /:stall$/.test(String(event.contextKey ?? ''))
  );
  const hasDone = events.some(
    (event) => event.kind === 'system_event' && /:done$/.test(String(event.contextKey ?? ''))
  );
  const hasError = events.some(
    (event) => event.kind === 'system_event' && /:error$/.test(String(event.contextKey ?? ''))
  );
  const hasAssistantDelta = events.some((event) => event.kind === 'assistant_delta');

  let diagnosis: RelayInspection['diagnosis'] = 'unknown';

  if (hasStart && hasStall && !hasDone && !hasError && !hasAssistantDelta) {
    diagnosis = 'relay_stalled_without_terminal_event';
  } else if (hasDone) {
    diagnosis = 'relay_completed';
  } else if (hasError) {
    diagnosis = 'relay_error';
  } else if (hasStart && !hasStall && !hasDone) {
    diagnosis = 'relay_started_waiting';
  }

  return {
    hasStart,
    hasStall,
    hasDone,
    hasError,
    hasAssistantDelta,
    diagnosis
  };
}
