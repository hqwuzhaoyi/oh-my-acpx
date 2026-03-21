# ACP Relay Fallback (streamTo=parent stall)

When `sessions_spawn({ runtime: "acp", streamTo: "parent" })` shows only:

- `Started <agent> session ...`
- `<agent> has produced no output for 60s ...`

but the child actually completes, use this fallback.

## 1) Detect relay stall

Use the `streamLogPath` returned by `sessions_spawn`.

```bash
node scripts/relay-fallback.js --stream-log ~/.openclaw/agents/<agent>/sessions/<id>.acp-stream.jsonl
```

If output says `diagnosis: relay_stalled_without_terminal_event`, continue.

## 2) Pull child result directly

Use the returned `childSessionKey`:

- `sessions_history(childSessionKey)`
- aggregate latest assistant messages
- return to parent session

## 3) Verify child completion in acpx logs (optional)

```bash
grep -R "\"stopReason\":\"end_turn\"" ~/.acpx/sessions/*.stream.ndjson | tail -5
```

## 4) Operator policy (recommended)

In orchestration flows:

1. spawn ACP child with `streamTo: "parent"`
2. if no assistant delta within N seconds (e.g. 75s), mark as relay-stall
3. auto-fallback to `sessions_history(childSessionKey)`
4. send child summary to user

This avoids silent black-hole runs.

---

## Notes

- This is a relay observability workaround, not an execution workaround.
- Child runs can still complete successfully even when parent relay stalls.
- Track upstream fixes in OpenClaw issues: #46795, #45205, #37869, #40693.
