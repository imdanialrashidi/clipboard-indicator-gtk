---
name: quick-fix
description: Execute an explicitly small, obvious, low-risk repository change with minimal ceremony and one targeted proof. Use for typos, copy or label edits, one-value configuration tweaks, local styling adjustments, a single-file bug whose owner and expected behavior are already clear. Do not use for security or auth, money, data or schema changes, dependencies, public APIs, deployment, or cross-module ambiguity.
---

# Localized Fast Path

## Admit or escalate

Use this path only when all are true:

- the requested outcome and owning location are obvious;
- one low-risk behavior changes, normally in one or two files;
- no architecture, dependency, lockfile, public contract, migration, generated artifact, or external system is involved;
- no auth/access, money, secrets/privacy, upload/callback, destructive, concurrency, infrastructure, release, or deployment boundary is involved;
- one cheap targeted check can convincingly falsify the change.

If any condition is false, state the reason in one sentence and switch to `/spec` + `/build`. Do not continue under the fast-path label.

## Execute

1. Inspect `git status --short`, the exact target, and the nearest relevant check. For code, resolve the symbol through `lsp` before editing; use exact search and focused reads, and stop as soon as ownership is confirmed.
2. State the intended observable result in one sentence. No acceptance matrix, plan, todo list, or subagent.
3. Edit directly in the working tree (solo default — no branch, no commit); then make the smallest direct patch. Preserve surrounding behavior and user changes; no unrelated cleanup, abstractions, or doc churn.
4. Run the changed path for real (`eval`/`bash` run, focused test, or exact content assertion for content-only edits). Do not run broad suites or the full gate unless project policy requires it.
5. Inspect the scoped diff and run `git diff --check`. Team delivery only on request: prepare the `ai-changes` lane under `docs/GIT_POLICY.md` and finish the scoped PR handoff through `scripts/omp-pr.mjs`; this adds no broad gate or reviewer to a qualifying quick fix.

Escalate to `/build` if ownership becomes unclear, scope expands beyond one behavior, more than two files need coordinated changes, the targeted check fails twice, or any excluded boundary appears.

## Report

Compact: result, changed file(s), exact check and observed outcome, Git state/action, PR URL or precise delivery blocker only for team delivery. No per-task branch, main write, or auto-merge; solo and read-only work never publishes.
