# Quality Contract

Evaluator-facing quality bar for meaningful changes. Keep project-specific after the first real feature; do not turn it into a generic checklist dump.

## Release rule

A change is not complete because the code compiles or the happy-path check passes. Every accepted behavior must be implemented rather than stubbed, exercised at the appropriate layer (real run, not opinion), and supported by evidence.

A required criterion that is unproven is **not passed**.

## Functional completeness

For accepted scope:

- controls that imply behavior must actually perform that behavior;
- persistence must survive the lifecycle promised by the product;
- displayed state must come from the authoritative source rather than a convenient fake;
- required error, empty, loading, disabled, success, permission, retry, and recovery states must behave coherently;
- no accepted feature may be satisfied by a placeholder, TODO handler, mock response, display-only control, or hard-coded success path unless the contract explicitly says it is a prototype.

## Correctness

- Preserve domain invariants across success and failure paths.
- Validate external/untrusted data at boundaries.
- Handle retries, duplicate requests, time, rounding, ordering, partial failure, and concurrency where they are material to the changed behavior.
- A production bug should gain regression evidence when practical.
- Checks should assert behavior and contracts rather than implementation trivia.
- A new regression test should demonstrably fail on pre-fix behavior (or a safe focused mutation) when practical, then pass after the fix.
- Generated checks must build, pass reliably, add a distinct behavioral signal, and isolate relevant state; line coverage alone is not acceptance evidence.

`/skill:test-design` owns the Test Value Gate — apply it before adding or materially changing tests. `No new test` is acceptable for behavior-neutral changes or behavior the suite already proves.

## Security and data integrity

For trust-boundary changes, apply the focused risk review below.

At minimum:

- authorization and ownership are enforced server-side;
- client-provided roles, prices, payment/subscription states, ownership, and permissions are never authoritative;
- secrets and sensitive data do not enter source, logs, screenshots, fixtures, prompts, or public artifacts;
- money/callback/state-transition operations are verified, idempotent, replay-aware, and auditable where applicable;
- schema/data changes have compatibility, rollback/recovery, and failure-path reasoning.

### Focused risk review

Review only the accepted scope and actual diff. Trace changed trust boundaries, input-to-sink data flows, state transitions, public contracts, dependencies, and operational behavior; check the actual controls and checks before reporting a finding.

Check only relevant failure paths: authorization/tenant isolation, injection and unsafe files/URLs, credential/session handling, payment/replay/idempotency, races and partial writes, timeout/cancellation/recovery, unbounded work, inaccessible/error states, dependency/CI mismatch, migration rollback. For High-risk scopes prefer a `/review` reviewer pass (plus `/advisor on` — second model, extra cost); otherwise a direct evidence-focused pass.

For each evidence-backed finding give severity, `file:line` or symbol, a concrete failure/attack scenario, why the current control is insufficient, the smallest safe fix, and a proof check. Prefer a few actionable findings over speculative checklist output.

- **BLOCKER:** exploitable security, data loss/corruption, money/access violation, migration/deployment breakage, or a broken critical flow.
- **MAJOR:** likely user-visible correctness/reliability failure or substantial security/performance regression.
- **MINOR:** bounded defect or maintenance risk.
- **NIT:** optional clarity/style improvement; never a release blocker.

Return the acceptance evidence and one verdict: `PASS`, `PASS WITH FIXES`, or `BLOCK`. `PASS` requires proven required criteria and no unresolved BLOCKER/MAJOR. Use `/review` for the complete review procedure.

## User-facing quality

For rendered interfaces:

- exercise the critical journey in the real application with the `browser` tool when browser behavior matters;
- preserve keyboard access, visible focus, semantic controls, labels, contrast, touch targets, and reduced-motion behavior;
- check realistic data, long text, localization/RTL when relevant, and at least one narrow viewport for mobile-facing surfaces;
- follow the accepted `docs/DESIGN.md`; reuse existing design tokens/components when sound, change deliberately when the direction requires it;
- do not add explanatory copy that merely restates obvious UI;
- visual polish cannot compensate for missing interaction depth or broken behavior.

Default accessibility baseline when the product has not chosen a stricter target: WCAG 2.2 AA, text contrast ≥ 4.5:1 (3:1 large text), non-text UI/state contrast ≥ 3:1, reflow at 320 CSS px, usable at 200% text zoom with visible focus and meaning not carried by color alone.

## Reliability and performance

Apply only where relevant to the changed path:

- avoid unbounded reads/work, N+1 access, duplicate calls, uncontrolled concurrency, blocking hot paths;
- use explicit timeouts/cancellation/retries where the boundary requires them;
- preserve meaningful non-sensitive logs or diagnostics for critical transitions;
- performance claims require a reproducible baseline and after-measurement;
- a flaky check or intermittent runtime path is a reliability defect, not permission to weaken the gate.

For production web surfaces without accepted product-specific field budgets, target Core Web Vitals `good` at p75 segmented by mobile/desktop: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1. Before field data exists, require an accepted repeatable lab budget plus rollout checks; lab results are pre-production signals, not field proof.

## Maintainability and architecture

- Prefer existing project patterns and stable framework/platform primitives.
- Keep public interfaces small and backward-compatible unless a breaking change is accepted.
- Keep business rules separable from presentation/transport when the existing architecture supports it.
- New abstractions should solve more than one real current use case or remove a demonstrated risk/duplication.
- New dependencies require a concrete benefit over existing/platform capabilities — omp already ships LSP, eval runtimes, browser, search, and subagents; adding a package that duplicates them needs justification.
- Architecture invariants that matter repeatedly should be enforced mechanically with types, lint rules, structural tests, schemas, or CI rather than prose alone.

## Evidence hierarchy

Prefer stronger evidence when practical:

1. deterministic automated check of the accepted behavior;
2. real `eval`/`bash` run or `browser`-tool exercise of the relevant journey;
3. `lsp` diagnostics/references, type/lint/structural analysis for invariant classes;
4. reproducible measurement for performance/reliability claims;
5. focused independent-evaluator inspection (`/review`) for aspects that cannot be automated economically.

A reviewer or subagent opinion alone is not proof.

## Evaluator rubric

Judge the accepted contract, not adjacent scope. For each criterion return one of:

- **PASS** — implementation and evidence satisfy the criterion;
- **FAIL** — evidence demonstrates incorrect/incomplete behavior;
- **UNPROVEN** — implementation may exist but adequate evidence is missing;
- **BLOCKED** — a genuine prerequisite prevents verification.

The overall task cannot be called complete while a required criterion is `FAIL` or `UNPROVEN`, or while a required independent review has an unresolved BLOCKER/MAJOR finding.

## Project-specific quality invariants

Replace this paragraph with confirmed project-specific rules and canonical commands once the repository provides enough evidence (architectural dependency direction, accessibility target, API compatibility guarantee, performance budget, browser/device matrix, canonical release gate). Do not invent quality targets the product or repository has not accepted.
