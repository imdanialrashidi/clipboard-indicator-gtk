# PR Delivery Policy (opt-in team delivery)

## Default: solo, no publication

The default is solo work: implement, verify, and leave the proven change in the working tree. No commit, push, branch, or PR unless the current request explicitly asks for team delivery ("open a PR", "deliver via ai-changes", or equivalent).

## Standing authorization and scope (team delivery only)

When the current request asks for PR delivery in a repository whose owner has adopted this workflow, completing the task includes a scoped commit, push, and a pull request to main. Do not ask for a second authorization for that routine handoff. The current request can narrow this policy: review/explanation/plan-only work, "local only", "do not commit", or "do not push" never triggers publication. Set `OMP_PR_DELIVERY=off` for local-only runs.
## One persistent branch, one active task

- Use only the fixed remote branch `ai-changes`, targeting `main` in the same repository through `origin`.
- During prepare, automatically create `ai-changes` from the freshly fetched `origin/main` commit if it is absent. This is included in routine implementation authority; no extra setup approval is needed. Never create per-task branches, fork, or delete an existing branch. A local tracking checkout of the same branch is allowed.
- Keeping the branch after merging is optional; automatic head-branch deletion is supported without changing repository settings. Creation requires a clean worktree, no active PR, and no local `ai-changes` history outside main. If that local history diverges (including a prior squash merge), preserve it and ask the owner rather than reset or publish it.
- Only one task and writer may own this lane at a time. Continue a related open PR by its exact number. If it contains unrelated work, wait for its resolution or ask the owner to combine the scopes; do not append unrelated changes or create another branch.
- Never switch away from a dirty user worktree, discard staged changes, stash user work, or publish unknown local commits.

## Routine implementation sequence

1. Inspect status, the exact repository/remote, and open PRs. Read-only requests end without Git writes.
2. Before editing, run the reviewed helper from the repository root:
   `node scripts/omp-pr.mjs prepare`
   For an explicitly related existing PR, append `--pr NUMBER`.
3. The helper fetches only `main` and `ai-changes` and refuses unpublished/unmerged work. If the remote branch is absent, it uses GitHub's create-only reference API to create exactly `ai-changes` at the captured main commit, then verifies and tracks it. A concurrent creation fails without overwriting that branch. For an existing branch whose previous PR is merged, it synchronizes `main` into the idle `ai-changes` branch without rewriting history. This `main`-to-`ai-changes` synchronization is allowed; merging a PR into `main` is not.
4. Implement and verify the accepted change with the cheapest faithful checks. A quick fix remains a quick fix: PR delivery alone does not require a plan, subagent, or full suite.
5. Review the complete diff. Select only this task's changed file paths; preserve unrelated staged/unstaged work. Do not publish a failing, unverified, secret-bearing, or unresolved BLOCKER/MAJOR change.
6. Put a sanitized outcome, exact executed checks/results, and remaining risks in `.artifacts/omp-pr.md`. Do not commit this temporary evidence file.
7. Run:
   `node scripts/omp-pr.mjs deliver --message "fix: accepted outcome" --title "Accepted outcome" --body-file .artifacts/omp-pr.md --file <path>...`
   Repeat `--file` for each changed file, including both sides of a rename. For a related existing PR, append `--pr NUMBER`.
8. Verify the resulting remote commit and open PR. Report the URL/SHA and CI status. A successful push is not proof that a PR exists or that CI passed. Do not merge it.

The helper commits explicit files only, checks the staged tree and commit, pushes only the captured `VERIFIED_SHA:refs/heads/ai-changes` as a fast-forward (atomic compare-and-swap guard — history rewrites remain forbidden), without tag following or submodule publication, and creates or updates the matching PR. Existing PR titles/descriptions are never overwritten: new commits update the PR and a deduplicated evidence comment records the exact SHA and checks, preserving concurrent owner notes. It never runs arbitrary shell text, edits remote configuration, bypasses hooks, or changes `main`.

## Partial failure, recovery, and opt-out

A failed precondition/authentication/permission check stops delivery; do not bypass a prompt or discover unrelated credentials. Continue safe local implementation when possible and report the delivery blocker separately.

If commit or push succeeded but PR delivery failed, inspect local status, exact SHA, remote state, and any open PR before retrying. Preserve the commit and rerun relevant evidence. Resume only the same verified task:
`node scripts/omp-pr.mjs deliver --resume FULL_40_CHARACTER_SHA --title "Accepted outcome" --body-file .artifacts/omp-pr.md`
Append `--pr NUMBER` if that same PR now exists. Resume requires a clean worktree and the helper-created `.artifacts/omp-pr-receipt.json` matching the repository, commit, parent, tree, and exact file scope. It rechecks paths and secret patterns, permits at most one unpublished commit, and never creates another commit. Do not forge/edit a receipt or use resume to publish unknown history.

A stale `.artifacts/omp-pr.lock` requires confirming that its writer has stopped before removing it. Conflicts, concurrent updates, unmerged old work, unexpected repositories, branch deletion during delivery, and permission failures are stop conditions — not reasons to force-push or reset. Only a fresh clean prepare may create an absent branch; deliver/resume never recreates one.

`OMP_PR_DELIVERY=off` disables the helper. Local-only and read-only runs never publish.

## Enforcement and limits

The normal session keeps destructive Git/GitHub actions unapproved: the only routine exception is a direct invocation of the reviewed `scripts/omp-pr.mjs` helper. History-rewriting force-push, raw force-with-lease commands, destructive reset/clean/restore/checkout, hook bypass (`--no-verify`), remote branches other than the fixed `ai-changes` lane, and `main` writes remain outside automatic scope. Read-only Git/PR/CI inspection remains available.

The helper requires Node.js 22+, Git, an authenticated GitHub CLI (`gh`), and ordinary configured Git push credentials. It recognizes credential-free github.com HTTPS/SSH origin URLs, verifies repository identity/default branch, and rejects divergent push URLs. Do not extract credentials or silently install/configure authentication.

Secret-pattern scans are defense in depth, not a complete secret detector. Owner-approved repository code/hooks and the normal runtime permission boundary remain trusted; the helper cannot prove task ownership or semantic test quality by itself. Never edit it or a permission rule as a side effect of product work.
