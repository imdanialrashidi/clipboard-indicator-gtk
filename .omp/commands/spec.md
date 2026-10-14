---
description: Convert an accepted product outcome into an implementation-ready feature contract
argument-hint: "<feature or outcome>"
---

Specify this outcome without implementing it:

$ARGUMENTS

Read `docs/PRODUCT.md`, `docs/ARCHITECTURE.md`, `docs/DESIGN.md` for user-facing work, `docs/QUALITY.md`, and only relevant code/contracts. If `docs/PRODUCT.md` still holds template placeholders, fill its Users/MVP/Non-goals sections from available evidence first — the first `/spec` bootstraps the product contract. Resolve affected symbols through `lsp` before claiming impact.

Produce the smallest implementation-ready contract containing: user/job, trigger and end state, in/out of scope, primary and negative journeys, state/data transitions, boundary validation and authorization, UI states/content/responsiveness when relevant, compatibility/migration/rollback implications, 3–7 observable acceptance criteria with proof each, operational evidence, and unresolved decisions.

Reuse existing public contracts and project terminology. Do not invent architecture, schemas, or UI conventions unsupported by evidence. Persist the result in `docs/exec-plans/active/` only when the task is Complex or must cross sessions; otherwise return the compact contract.
