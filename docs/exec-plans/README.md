# Execution Plans

Durable handoff artifacts for Complex or multi-session work. Not required for quick edits or ordinary short features.

Use `docs/exec-plans/active/<short-slug>.md` while work is active. Move the finished plan to `docs/exec-plans/completed/` only when retaining the decision/evidence history is useful to the project.

Keep plans compact and factual. They should make a fresh agent productive without replaying the old chat.

Recommended structure:

```markdown
# <Task>

Status: active | blocked | complete
Updated: YYYY-MM-DD

## Goal

## Non-goals

## Acceptance contract
- [ ] A1 — observable criterion — proof required
- [ ] A2 — observable criterion — proof required

## Confirmed current state
- Facts established from code/runtime/tests

## Relevant surface
- Important files, modules, services, endpoints, tests

## Decisions
- Decision — rationale — consequence

## Evidence
- Command/tool — result
- Browser/API/measurement evidence

## Next actions
1. Smallest next discriminating or implementation action
2. ...

## Risks / blockers

## Handoff
- What changed
- What remains
- What must not be overwritten
- First action for a fresh session
```

Rules:

- Do not paste raw transcripts or giant logs into the plan.
- Record outcomes and pointers to evidence instead.
- Do not mark acceptance complete without proof.
- Preserve unresolved hypotheses as hypotheses, not facts.
- Update the plan before `/handoff` or a deliberate context reset.
- The working tree and actual tests remain authoritative if the plan becomes stale.
