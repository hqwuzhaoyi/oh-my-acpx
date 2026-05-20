# Capture auxiliary results separately from artifacts

OMA must perform **Auxiliary Return Capture** after ACPX-backed **Execute Mode** instead of treating ACPX exit status or artifact file writes as the task result. A schema-valid **Auxiliary Task Return** captured from session history or stdout may become a **Schema-Confirmed Auxiliary Result** and use `verdict=provisional_accept`; usable free-form answers become **Extracted Auxiliary Findings** with `status=completed` and `verdict=revise`.

This keeps OMA useful when an auxiliary agent completes the read/review work but fails to write a requested artifact file, while still preserving the **Result Trust Boundary**: hard execution failures reject the result, mismatched task identities are evidence only, and missing artifact persistence prevents provisional acceptance because later **Auxiliary Result Inspection** may not be able to retrieve the full evidence.

## Consequences

OMA needs a Host-facing result inspection command keyed by **Auxiliary Task** identity, such as `oma result show <task-id>`, so the Host Agent can retrieve the complete captured answer without manually browsing `.oma/artifacts/`. The short **Auxiliary Task Return** may contain concise findings, but OMA must preserve the complete captured answer and raw transport evidence for explicit inspection; very large output may be truncated only with an explicit retrieval path.
