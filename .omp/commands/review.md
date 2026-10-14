---
description: Independently evaluate the current change against acceptance and release risk
argument-hint: "[scope or acceptance contract]"
---

Review this working-tree change against its acceptance contract:

$ARGUMENTS

Do not edit files during review.

1. Read `AGENTS.md`, `docs/QUALITY.md`, and the relevant accepted goal or active execution plan. For user-facing work also read `docs/DESIGN.md`.
2. Inspect the actual diff and the narrow surrounding contracts/tests needed to understand it. For changed tests, check the plausible regression, gap in existing coverage, independent expected result, and faithful layer. Do not demand a new unit test when existing evidence proves the contract; flag implementation-mirroring or duplicate tests only with a concrete missed-defect scenario.
3. Apply the focused risk review in `docs/QUALITY.md`. When independent context materially improves this scope, delegate a bounded read-only reviewer pass through `task` subagents (plus a security-focused pass for changed trust/data/money boundaries) and, for High-risk work only, weigh `/advisor` notes (second model, extra cost); otherwise perform the same evidence-focused passes directly.
4. Evaluate each required acceptance criterion as `PASS`, `FAIL`, `UNPROVEN`, or `BLOCKED`. A visually present but non-functional/stubbed accepted feature is `FAIL`.
5. For user-facing behavior, exercise the critical journey through the real application with the `browser` tool when the app can run safely. For a material visual change, grade the hard gates in `docs/DESIGN.md` from rendered desktop/mobile evidence. Browser evidence beats visual inference; without it, appearance criteria are `UNPROVEN`.
6. Report only evidence-backed acceptance failures or actionable regression/risk findings. Do not invent adjacent requirements or stylistic preferences outside `docs/QUALITY.md` and existing project conventions.

For each finding include severity, `file:line` or symbol evidence, failure scenario, smallest safe fix, and the proof check that would close it.

Then include:

- **Acceptance:** criterion → PASS/FAIL/UNPROVEN/BLOCKED + evidence
- **Strengths:** only verified strengths that matter to release confidence
- **Verdict:** exactly one of `PASS`, `PASS WITH FIXES`, or `BLOCK`

`PASS` requires every required acceptance criterion to be proven and no unresolved BLOCKER/MAJOR finding.
