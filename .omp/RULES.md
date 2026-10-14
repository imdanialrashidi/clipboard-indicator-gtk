# Project sticky rules

Short, hard requirements. Long background belongs in `AGENTS.md`.

- Solo default: never commit, push, merge, release, deploy, or mutate production. Only when the user explicitly asks for a commit or PR ("open a PR", "commit this", or equivalent), follow `docs/GIT_POLICY.md` exactly (scoped files, no `--no-verify`, no force, no main writes, no auto-merge).
- Secrets stay out of code, logs, screenshots, fixtures, prompts, traces, and artifacts.
- No stubs, placeholder handlers, fake persistence, display-only controls, or TODO implementations as complete.
- Run the changed path before yielding; an unproven criterion is not passed.
- Never weaken, skip, or delete a valid test or control to get green.
