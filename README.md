# omp Production Workflow Template

A minimal, evidence-driven workflow for [oh-my-pi (omp)](https://omp.sh) — a batteries-included coding agent with LSP, persistent eval runtimes, parallel subagents, built-in search/browser, and session continuity already in the box.

This template adds only what omp does **not** ship: a short always-loaded agent map, four workflow commands, three skills, product/design/architecture/quality contracts, a scoped PR helper, and one verification gate. Everything omp already does natively (planning, debugging, memory, handoff, model routing) is referenced, not reimplemented.

## What this template provides

- `AGENTS.md` — short progressive-disclosure map; the only always-loaded workflow file.
- `.omp/RULES.md` — sticky hard requirements (delivery scope, secrets, no stubs, run-before-yield).
- `.omp/commands/` — `/spec`, `/build`, `/review`, `/ship`. Deliberately no `plan`/`handoff`/`resume` commands: omp ships those natively (`/plan` mode, `/handoff`, `/resume`). `/advisor` is the native second-model watch, enabled per session — not a command this template owns.
- `.omp/skills/` — `quick-fix`, `test-design`, `verify`. Deliberately no browser/design/eval skills: omp ships `browser`, `lsp`, `debug`, `web_search`, `eval`, and `task` natively.
- `docs/` — `HARNESS.md` (operating playbook), `QUALITY.md` (acceptance bar), `PRODUCT.md`, `ARCHITECTURE.md`, `DESIGN.md` (product decisions), `GIT_POLICY.md` (scoped delivery), `exec-plans/` (durable state for Complex work only).
- `scripts/omp-pr.mjs` — scoped `ai-changes` → `main` PR helper: explicit files only, secret scan, compare-and-swap push guard, evidence comments that never overwrite owner notes.
- `scripts/verify.sh` — canonical gate: template self-checks, then the repo's own cheapest applicable lane.
- `.github/workflows/quality.yml` — CI runs the gate. Nothing else.

## What it deliberately omits (omp already has it)

| pi-template piece | Why it is not here |
|---|---|
| Provider/model routing, launcher flags, `models.env` | omp ships 60+ providers, per-role routing (`/model`, `--smol/--slow/--plan`), fallback chains |
| `pi-sub-agent`, guard scripts, smart-read harness | omp core is native Rust: in-process search, summaries, approval tiers, `task` subagents |
| Playwright MCP, `browser-qa` skill, web-search package | omp ships `browser`, `computer`, and 23-backend `web_search` natively |
| Eval harness, `EVALUATION.md`, `RESEARCH.md` | no benchmark/eval scaffolding belongs in a minimal workflow template |
| `/plan`, `/handoff`, `/resume` commands | omp natives: `/plan` mode, `/handoff` + `/resume`, `/memory` — plus `/review` here for independent review (no native `/review` command exists) |
| Frontend-design skill + rubric | replaced by a compact `docs/DESIGN.md` contract with budgets and hard gates |
| `TOOLING_SETUP.md`, sandbox/docker files | omp is one binary (`install | sh`, brew, bun, nix, ps1); no container story needed |

## Install

Install omp ([docs](https://omp.sh)):

```sh
curl -fsSL https://omp.sh/install | sh
```

Then open this repository in omp. No packages, no MCP servers, no launcher. Project config lives in `.omp/` and loads automatically; global settings stay in `~/.omp/agent/config.yml` (see `.omp/config.yml` for the documented project-override pattern).

Authenticate and pick a model:

```text
/login
/model
```

## راهنمای سریع (خلاصه `omp_workflow_guide.md`)

چهار قدم: اول بگو **چی** می‌خواهی (`/spec`)، بعد بگو **بساز** (`/build`)، بعد خودت `/review` را اجرا کن تا نگاه دوم بیندازد، آخر **تحویل بگیر** (`/ship`). تغییر ریز؟ `/skill:quick-fix`.

- **پرامپت خوب = نتیجه قابل مشاهده، نه راه‌حل.** نگو «با فلان تکنیک درستش کن»؛ بگو «کاربر باید چه ببیند، و اگر خراب بود چه ببیند». ۳ تا ۷ باید بگو، نه بیشتر.
- **همیشه راه منفی را هم بگو** (خطا، خالی، قطعی، دسترسی) و آخرش اضافه کن: «بگو چطور تستش کردی».
- **محدوده را ببند** («به بقیه دست نزن») و **تیکه را کوچک کن** — تیکه کوچکِ تمام‌شده بهتر از تیکه بزرگِ نصفه است.
- **«تمام شد» بدون مدرک = تمام نشده.** همیشه بپرس: «شاهدت چیه؟»
- جزئیات کامل، مثال‌ها و جدول عیب‌یابی: [`omp_workflow_guide.md`](omp_workflow_guide.md).

## Daily usage

```text
/build Implement <accepted outcome> and verify it.
/spec <feature>        # implementation-ready contract, no code
/review                # independent evidence-backed verdict
/ship                  # full gate + scoped ai-changes PR (opt-in team delivery)
/skill:quick-fix       # obvious low-risk edit, one targeted proof
```

Native companions: `/plan` for planning, `/advisor` for High-risk second-model review (extra cost), `/handoff` + `/resume` across sessions, `ultrathink` / `orchestrate` per-turn modes, `/omfg` to forge a rule for a recurring misbehavior.

## Workflow

```text
intent → classify → acceptance contract → focused discovery (lsp first)
→ one primary writer → targeted verification → /review when justified
→ bounded repair (≤2 rounds) → /ship → acceptance → evidence report
```

Long-running work: `/plan` → incremental work → `/handoff` → fresh context → `/resume`, with durable state in `docs/exec-plans/active/` only when continuity needs it.

Delivery, solo by default: leave the proven change in the working tree and report its state. Team PR only on explicit request: `node scripts/omp-pr.mjs prepare` before editing, then `deliver --message ... --title ... --body-file .artifacts/omp-pr.md --file <path>...` after verification. No per-task branches, no main writes, no auto-merge. Read-only/local-only work never publishes; `OMP_PR_DELIVERY=off` opts out.
