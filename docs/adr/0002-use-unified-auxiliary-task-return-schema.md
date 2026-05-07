# Use a unified auxiliary task return schema

OMA should not copy oh-my-claudecode's mixture of state files, worker summaries, outbox messages, and role-specific verdict JSON. Because OMA is a context-saving sidecar for a host agent, every auxiliary task should return one structured contract with terminal status, adoption verdict, summary, scope, evidence, blockers, findings, followups, and host coordination advice.

The key distinction is that `status=completed` only means the auxiliary task finished; it does not mean the host plan or main story is complete. The host agent remains responsible for deciding whether to integrate the result.
