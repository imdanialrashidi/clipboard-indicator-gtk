---
name: verify
description: Select and run the cheapest verification lane that proves an accepted change, from affected checks to the full gate. Use after implementing a slice, before /ship, or when asked what to run.
---

# Verification lanes

Pick the cheapest lane that matches the change; never jump to the full gate by default.

- **Affected:** the exact new test first, then the nearest existing tests covering the changed symbols (resolve dependents through `lsp` references, not guesses). For content-only edits, an exact content assertion or parser may suffice.
- **Feature:** the affected lane plus every check that exercises the accepted slice end to end (API/CLI exercise, `eval`/`bash` run of the journey, browser-tool pass for browser-visible behavior).
- **Full:** the repository's canonical gate (`scripts/verify.sh`, or the documented suite when the repo defines one). Required before `/ship` of Standard-or-larger work, after harness/workflow changes, and when affected selection cannot bound the risk.

An unmatched file (no adjacent test, generated artifact, config without a validator) is treated conservatively: run the feature lane, or the full gate when the change is load-bearing.

## Rules

- Run the thing; output proves it. Exit-zero alone is not proof: state what was exercised and observed.
- A flaky check is a reliability defect, not permission to weaken the gate. Repeat the selector enough to assess; report flakes.
- Map each lane result to `PASS`, `FAIL`, `UNPROVEN`, `BLOCKED`, or `NOT EXECUTED`. Never merge these into one status. `UNPROVEN` is not ready.
- Report exact commands and outcomes, files/checks covered, and what was deliberately not run and why.
