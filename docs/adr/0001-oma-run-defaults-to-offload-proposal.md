# `oma run` defaults to offload proposal

OMA is used by host agents to save context, not to move the whole workflow into ACPX. Therefore `oma run` defaults to producing an **Offload Proposal** that the host agent can inspect and integrate, while actual ACPX spawning requires an explicit execute mode such as `oma run --execute`.

This deliberately rejects making `oma run` an always-on execution command: automatic spawning would blur ownership of the host context and make OMA look like the primary workflow runtime instead of a context-saving auxiliary sidecar.
