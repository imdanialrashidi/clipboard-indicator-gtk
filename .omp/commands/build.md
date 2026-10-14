---
description: Implement one accepted bounded vertical slice end to end
argument-hint: "<task>"
---

Implement this accepted task:

$ARGUMENTS

Follow `AGENTS.md` and `.omp/RULES.md`.

1. Classify the task as Quick, Standard, Complex, or High risk. Solo default: edit in the working tree, no branch. Team delivery only on request: prepare the persistent `ai-changes` lane using `docs/GIT_POLICY.md` before editing. For a qualifying Quick change, `/skill:quick-fix` instead.
2. For Standard or larger work, read `docs/HARNESS.md` and `docs/QUALITY.md`; for user-facing work also read `docs/DESIGN.md`. Then state a compact acceptance contract: goal, non-goals, 3–7 observable criteria, proof expected for each.
3. For a bug, reproduce/characterize the failure first when practical (`debug` tool for crashes/hangs, not print-sprinkling). For performance work, capture a baseline. For browser-visible work, include the critical real-browser journey via the `browser` tool.
4. Localize before editing: map accepted behavior → entry symbols → dependent surfaces → nearest existing checks. Resolve symbols and rename impact through `lsp`; use exact search and focused reads. If genuinely unclear across modules, fan out a bounded `task` scout; otherwise investigate directly.
5. When adding or materially changing tests, load `/skill:test-design` and pass its Test Value Gate. For a bug, prefer a regression that demonstrably fails on pre-fix behavior before implementing the fix. Do not write implementation-mirroring or coverage-only tests.
6. Implement the smallest coherent vertical slice. Reuse current boundaries and remove no valid guard/test. No stubs, placeholder handlers, fake persistence, or display-only controls.
7. Load `/skill:verify`. Run the exact new/affected check first through a real run, then the configured lane; treat unmatched files conservatively.
8. After the slice is functionally complete, inspect the diff and evaluate it against the acceptance contract in a separate evidence-focused pass. For non-trivial work, run `/review` (bounded reviewer pass with a verdict). For High-risk work only, add `/advisor on` (second model reviewing turns; extra inference cost, session-scoped) — budgeted to at most two repair rounds; after that, reassess the root cause or report a real blocker instead of looping.
9. For browser-visible behavior, exercise the accepted journey in the real application through the `browser` tool. For visually significant work, capture desktop/mobile/demanding-state evidence against `docs/DESIGN.md` and its quality budgets.
10. Inspect the final diff for unrelated changes and report criterion → evidence exactly, including red-before-green evidence where obtained. Solo default: leave the change in the working tree and report its state. Team delivery only on request: complete the scoped commit/push/PR handoff through `scripts/omp-pr.mjs` under `docs/GIT_POLICY.md`; report the verified PR URL/SHA and CI status or precise blocker. No per-task branch or automatic merge.

If the same approach fails twice without new evidence, follow the failure-recovery ladder in `docs/HARNESS.md`.

Do not add adjacent features, speculative abstractions, unrelated refactors, direct protected-branch mutations, merges, releases, deployments, or production actions outside the accepted outcome.
