---
name: test-design
description: Decide whether an accepted behavior or defect needs new regression coverage, then add or extend only the smallest meaningful proof. Use when adding or materially changing tests, or when asked what test to write for a behavior, defect, or risk.
---

# Test Value Gate

A new or materially changed test is retained only when it identifies:

1. an observable contract or invariant;
2. a plausible failure it can detect;
3. a gap not already covered by an existing test, type, schema, LSP check, or deterministic check;
4. the cheapest faithful layer;
5. an oracle independent from the implementation under test; and
6. red-before-green, a controlled focused mutation, or equivalent defect-sensitivity evidence when practical.

`No new test` is an acceptable professional outcome for behavior-neutral changes or behavior already proved by the suite. Coverage, assertion count, and test count are diagnostic signals, not acceptance goals.

## Execute

1. Read the accepted contract, the implementation, the nearest existing tests, `docs/QUALITY.md`, and only the framework configuration needed to run the test.
2. State the value thesis: observable contract, failure model, evidence gap, cheapest faithful layer, independent oracle, defect-sensitivity plan.
3. Reuse the existing test framework, fixtures, builders, and naming conventions. Do not add a second framework or speculative test infrastructure.
4. For a bug, demonstrate red-before-green (or a safe focused mutation) when practical. Do not overwrite user work to recreate the defect.
5. Add or extend only the smallest behavior-oriented test with a distinct failure signal. One representative per equivalence class plus exact material boundaries; pairwise/property/decision-table cases for meaningful interactions, never Cartesian enumeration.
6. Never compute expected values with the implementation's own logic, mock the subject/authority, verify private calls unless contractual, test framework or third-party behavior, use broad incidental snapshots, blind-update snapshots, sleep/retry away nondeterminism, or duplicate a case that adds no distinct behavioral signal. Mocks are reserved for owned boundaries that are expensive, nondeterministic, or unsafe. Browser-dependent tests use user-visible behavior and accessible roles, keep independent state, and cover only the journey that requires a browser.
7. Run the exact new or extended test first through a real run (`eval`/`bash`); repeat the selector if nondeterminism is plausible. Then run the affected lane of the `verify` skill.
8. Do not change production behavior unless the request explicitly includes the fix; report a newly exposed defect instead.

Return decision, value thesis, contract → test/existing evidence, defect-sensitivity evidence, exact commands/results, files changed, remaining untested risk.
