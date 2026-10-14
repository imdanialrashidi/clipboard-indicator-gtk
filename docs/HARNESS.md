# Agent Harness Operating Playbook

Detailed operating model for non-trivial omp sessions. `AGENTS.md` stays a short map and points here instead of duplicating rules. Everything below assumes omp-native tools; install nothing.

## Design principles

1. **Intent steers; the agent finishes.** Convert the request into observable acceptance criteria, then execute reversible implementation and evidence gathering without intermediate approval loops.
2. **Repository knowledge is the system of record.** Durable product, architecture, quality, decision, and execution state belongs in versioned repository artifacts rather than chat memory.
3. **Progressive disclosure beats giant prompts.** Keep always-loaded instructions small and retrieve code, docs, skills, and external facts just in time.
4. **Native tools beat bolted-on tooling.** `lsp`, `eval`, `task`, `debug`, `web_search`, `browser`, `/advisor`, `/plan`, `/handoff` are already in the box — plus `/spec`, `/build`, `/review`, `/ship` in this template for the contract→slice→verdict→delivery loop. Prefer them over scripts, MCP servers, and packages that duplicate them.
5. **Prefer mechanical constraints over repeated prose.** If an invariant can be linted, tested, typed, validated, or blocked by tooling, encode it there.
6. **Evaluation needs a contract.** Independent review is most useful when it judges explicit observable criteria, not vague taste.
7. **Complexity must earn its cost.** Add agents, skills, commands, loops, or persistent artifacts only for demonstrated failure modes.

## Execution protocol

### 1. Classify the task

- Quick: `/skill:quick-fix` — one direct patch, one targeted proof, scoped diff review.
- Standard: `/spec` → `/build` → `/ship`.
- Complex: native `/plan` mode for planning; durable `docs/exec-plans/active/` state only when work must cross sessions; native `/handoff` + `/resume` for continuity.
- High risk: threat-boundary analysis, negative-path proof, `/review` reviewer pass plus `/advisor on` for High-risk turns only (second model, extra cost), recovery notes, full gate.

### 2. Establish the acceptance contract

For Standard or larger work, write a compact contract before editing:

```text
Goal:
Non-goals:
Acceptance:
- A1 ... -> proof: ...
- A2 ... -> proof: ...
- A3 ... -> proof: ...
```

Good criteria describe user-visible or externally observable behavior. Avoid implementation trivia such as exact internal function names unless the public contract requires them.

Additional rules:

- Bug: capture the failure or a precise characterization before changing code when practical — attach `debug` (DAP) for crashes/hangs instead of print statements.
- Performance: capture a reproducible baseline and target.
- UI: include the critical user journey plus important loading/error/empty/permission states, and the accepted `docs/DESIGN.md` thesis for visually significant work.
- Security/data: include rejection/tampering/idempotency/ownership evidence where relevant.
- Do not accept placeholder buttons, stub handlers, fake persistence, TODO implementations, or display-only controls as satisfying functional criteria.

Keep ordinary contracts compact and in context. Complex or multi-session contracts belong in an execution plan.

The agent derives the contract from available evidence. It asks via `ask` only when no safe reversible interpretation exists; ordinary product, implementation, naming, tooling, and test choices are agent-owned.

### 3. Discover with a context budget

Start from identifiers, not bulk context. Prefer in this order:

1. repository map and relevant project docs;
2. `lsp` (definitions, references, rename impact, diagnostics) before `grep` for anything the language server knows;
3. focused source ranges and affected tests;
4. `eval`/`bash` runs for runtime truth;
5. `web_search` + `read` on URLs/PDFs for current upstream issues, advisories, regressions, or release notes.

Large reads summarize instead of dumping; use exact search/symbol lookup and focused ranges rather than walking files linearly.

Use `task` scouts only when the relevant surface or cross-module flow is genuinely unclear. Otherwise investigate directly. Do not delegate the same discovery twice. One primary writer owns the worktree.

### 4. Implement one coherent vertical slice

Prefer a complete end-to-end behavior over many half-finished layers.

During implementation:

- use the narrowest reliable verification after meaningful edits (`/skill:verify`, affected lane);
- map the affected symbols/contracts/dependencies and nearest tests before editing — `lsp` references first for exported symbols;
- when tests change, use `/skill:test-design` and pass its Test Value Gate; `no new test` is valid when existing evidence is already sufficient;
- preserve existing architectural boundaries; avoid speculative abstractions;
- keep data validation at boundaries; keep business rules testable outside UI/transport code where appropriate;
- do not clean unrelated code merely because it is nearby.

Magic words available per turn: `ultrathink` for careful multi-step reasoning, `orchestrate` to fan substantial independent work through parallel subagents with per-phase verification.

### 5. Evaluate independently

After the slice is functionally complete and targeted checks pass, evaluate against the acceptance contract and `docs/QUALITY.md`.

Prefer `/review` (bounded read-only reviewer pass through `task` subagents with a verdict) for non-trivial user-facing, cross-module, production-bug, or material-regression work. For High-risk work only, add `/advisor on` so a second model reviews each turn (default cadence; costs extra inference — never a substitute for the verdict pass). Otherwise perform a separate evidence-focused pass directly.

For browser-visible behavior, drive the real application through the `browser` tool; interaction evidence comes before screenshots. For visually significant work, judge the rendered result against `docs/DESIGN.md` hard gates and quality budgets. If pixels cannot be inspected, mark appearance-dependent criteria `UNPROVEN`.

The evaluator should answer:

- Which acceptance criterion is proven?
- Which criterion is not proven or fails?
- Is any accepted functionality stubbed or only visually represented?
- Did the change introduce a regression outside the narrow happy path?
- What is the smallest evidence-backed fix?

Default to at most **two evaluator/repair rounds**. If a BLOCKER or MAJOR issue remains after two evidence-driven repair rounds, stop repeating the same loop: reassess the contract/root cause, create or update an execution plan, or report the blocker.

### 6. Verify and report evidence

Load `/skill:verify` and use its affected, feature, and full lanes. Map every acceptance criterion to evidence:

- passed;
- failed;
- skipped;
- blocked by prerequisite;
- not executed.

These are distinct statuses — never merge them. `UNPROVEN` is not ready.

### Memory, context, and continuity

- `retain` for durable repo facts the next session will need (decisions, invariants, gotchas); `recall` before re-deriving them; `learn` for reusable lessons. Never store secrets, credentials, or personal data.
- Keep `.omp/config.yml` memory decisions explicit: `memory.backend: local` only when cross-session recall earns its keep, otherwise `off`. `autolearn.enabled` stays `false` unless the owner opts in.
- Forge a TTSR rule via `/omfg` only for a recurring misbehavior pattern (seen 2+ times), not a one-off mistake.
- Before context pressure bites: `/context` to check usage, `/compact` to summarize in place, `/shake` to drop heavy tool output, `/handoff` + `/resume` to continue Complex work fresh. Durable multi-session state lives in `docs/exec-plans/active/<short-slug>.md` (structure below); update it before every `/handoff` or deliberate reset. The working tree and actual checks stay authoritative if the plan goes stale.
- Plan shape: Goal / Non-goals / Acceptance contract (checkboxes + proof) / Confirmed current state / Relevant surface / Decisions / Evidence (command → result) / Next actions / Risks-blockers / Handoff (changed, remaining, do-not-overwrite, first action). No pasted transcripts or giant logs.

### 7. Deliver (solo default, team PR opt-in)

Solo default: leave the proven change in the working tree and report its state. Team delivery only on request: follow `docs/GIT_POLICY.md` — prepare the persistent `ai-changes` branch before editing, finish accepted verification, then run the scoped PR helper with explicit file paths and exact evidence. It commits/pushes and creates the PR or updates the same related PR. Do not create per-task branches, mix unrelated work into an open PR, write to `main`, or merge automatically. A missing credential blocks delivery, not safe local implementation; report both states accurately.

## Failure-recovery ladder

If the same approach fails twice without new evidence, climb — do not loop:

1. **Re-characterize:** reproduce the failure more precisely (`debug`, minimal repro, narrower log) before changing anything else.
2. **Shrink scope:** cut the slice to the smallest still-meaningful behavior and re-prove it.
3. **Change the tool:** `lsp` instead of guessing, `eval` cell instead of a script file, `browser` instead of DOM inference, `/review` for an independent verdict.
4. **Reassess the contract:** the criterion may be wrong, unmeasurable, or blocked by a genuine prerequisite — say so, mark it `BLOCKED`/`UNPROVEN`, and finish reachable work.
5. **Durable state:** for Complex work, write the current state into `docs/exec-plans/active/` and continue via `/handoff` + `/resume` in a fresh session.
