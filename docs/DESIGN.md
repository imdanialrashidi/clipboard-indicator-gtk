# Product Design Contract

Specific, short, durable. The visual and interaction source of truth shared by build, browser QA, and review. Replace template prompts with accepted decisions; do not preserve a menu of unused options. Fill during the first user-facing `/spec`; delete sections that never apply.

## Owner direction

Capture from the user's ordinary brief; do not require every field or a separate approval step. Keep explicit choices separate from agent-proposed details.

- Owner-stated style / design system:
- Exact brand colors and intended roles:
- Theme(s), typography, density, shape, motion, RTL/locales:
- Must keep / avoid:
- Agent-proposed details / unresolved choices:
- Canonical code token source (path; unknown until implemented):

After implementation, the code token source owns resolved values; this document owns intent and token mappings. Update both for an accepted design change. Never maintain a second competing palette.

## Experience brief

- Product / surface:
- Primary audience:
- Single job of this surface:
- Desired user feeling before → after:
- Success signal:

## Brand character

Useful tensions, not vague adjectives:

- [character], not [failure mode]
- [character], not [failure mode]

## Direction

- Visual thesis:
- Signature element (one restrained choice):
- What must feel familiar:
- What must never look generic:

## Semantic tokens

Record exact values (HEX/OKLCH) with measured foreground/background contrast; unmeasured contrast is unproven.

| Role / state | Theme | Exact value or code token | Pair | Contrast proof |
|---|---|---|---|---|
| canvas / surface |  |  |  |  |
| text / muted text |  |  |  |  |
| action / on-action |  |  |  |  |
| accent |  |  |  |  |
| border / focus |  |  |  |  |
| danger / success / warning |  |  |  |  |

Typography: display / body / utility roles with family, scale, weight, leading, source, license, fallback.

Geometry: spacing rhythm, grid/measure, radius logic, border/shadow logic, icon rules.

## Composition and responsiveness

- Desktop composition:
- Mobile recomposition (not shrinkage):
- Dense/long-content behavior:
- Supported viewport/device baseline:
- RTL/localization behavior:

## Components and states

| Component / pattern | Variants | Required states | Reuse or change |
|---|---|---|---|
|  |  | default / hover / focus / active / disabled / error |  |

Required journey states: loading, empty, error/retry, success, permission/offline where relevant. No generic card-per-section without intent.

## Motion, feedback, voice

- Orchestrated moment (or explicit none); transitions, duration/easing, reduced-motion alternative.
- Vocabulary/tone, action-label rules, error and empty-state rules, realistic content fixtures.

## Quality budgets

- Accessibility target: WCAG 2.2 AA unless the product accepts another target.
- Keyboard/focus/touch target:
- Performance target: LCP ≤ 2.5 s, INP ≤ 200 ms, CLS ≤ 0.1 at p75 unless stricter product budgets are accepted.
- Lab budget + production rollout proof:
- Supported browsers and input modes:

## Screen acceptance

| Flow / screen | Critical states | Viewports/locales | Visual proof |
|---|---|---|---|
|  |  |  |  |

## Decision log

| Date | Decision | Evidence / rationale | Revisit when |
|---|---|---|---|
|  |  |  |  |
