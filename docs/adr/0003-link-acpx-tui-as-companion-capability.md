# Link acpx-tui as a companion capability

`acpx-tui` is linked into `capabilities/acpx-tui` as a git submodule rather than copied into OMA's TypeScript core. This keeps the TUI independently versioned while still making it available as an ACPX session operator console for observing, prompting, and resuming ACPX sessions around OMA workflows.

This deliberately keeps OMA proposal-first: the TUI supports ACPX operation, but it does not own the Host Plan, replace the Host Agent, or become part of the core `oma run` decision loop.
