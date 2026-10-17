# Product Contract — Lightweight GNOME Shell Clipboard Manager

Spec stage only. No implementation. Evidence legend: **[DOCUMENTED]** = upstream source cited; **[VERIFIED]** = observed on this machine (Shell 51.0, Wayland, 2026-10-14); **[ASSUMPTION]** = chosen default pending owner approval; **[UNPROVEN]** = must be proven in `/build`.

## 1. Purpose and target experience

- Purpose: a genuine in-Shell clipboard history extension (GJS ESM running inside `gnome-shell`, **not** a standalone GTK app with a bridge) that is faster, smaller, and more reliable than Clipboard Indicator.
- Target user: daily GNOME/Wayland user who re-copies recent text (commands, links, snippets) and wants a compact panel popup: open → type to filter → Enter to restore → Ctrl+V to paste.
- Feel: native GNOME, restrained, compact, scannable. Visual intent owned by `docs/DESIGN.md`; this document owns behavior.
- Why now **[VERIFIED]**: incumbent `clipboard-indicator@tudmotu.com` v71 declares `shell-version` ≤ 50 and reports `State: OUT OF DATE` under local Shell 51.0 — a compatible replacement is needed.

## 2. MVP scope

### In (MVP)

- M1. Panel entry point opening a compact popup with text history and live substring search.
- M2. Restore selected item to clipboard (`St.Clipboard.set_text`); user pastes manually. No auto-paste.
- M3. Pin/unpin, delete single entry, clear all (pinned survive clear by default), deterministic duplicate handling (re-copy moves existing entry to top, no duplicate rows).
- M4. Pause/resume collection; persisted local history with hard bounds; empty/loading/error states.
- M5. GTK4/libadwaita preferences via `ExtensionPreferences` + GSettings; keyboard navigation and accessibility from day one.

### Non-goals (explicitly out of MVP)

- Image / rich-content previews, file-copy handling, syntax highlighting, per-type icons.
- Automatic pasting into the focused app (synthetic key events under Wayland).
- Per-app exclusion lists, regex search, categorization, favorites sections, notifications per copy, timers/interval clearing, cloud sync, statistics/dashboard.
- TypeScript, build system, database, background daemon, new runtime dependency.

### Deferred features and their cost (evaluate after MVP)

| Feature | Why deferred | Technical cost if added |
|---|---|---|
| Image support (`get_content` bytes + `St.TextureCache`) | MIME variance unproven on Wayland; binary size, file cache, async decode risk | Per-entry files, MIME probing, decode off main thread, eviction by bytes, texture lifecycle — large test surface |
| Auto-paste on select | Wayland compositors restrict synthetic input; surprising + flaky | Input emulation path, focus race handling, per-app quirks — reliability risk |
| Per-app exclusion | Needs focus-window tracking (`focusWindow.get_wm_class`) on every change | Extra signal surface, privacy-sensitive app list in settings |
| Regex / case-sensitive search | Incumbent complexity with little daily value | Query parser, error states for invalid regex |
| Cloud sync / categorization | Directly contradicts privacy and minimal-resource goals | Network, accounts, conflict resolution — rejected unless product direction changes |

## 3. User-visible behaviors and acceptance criteria

- A1 Panel entry: user clicks panel indicator (or presses toggle shortcut) → popup opens with history, most-recent first. Proof: nested Shell 51 observation + no errors in journal. **[UNPROVEN]**
- A2 Search: typing filters entries as substring match (case-insensitive, MVP); empty query restores full order; no-match shows deliberate empty state. Proof: exercise with 0/1/N matches. **[UNPROVEN]**
- A3 Restore: Enter/click on entry → clipboard holds that exact text; popup closes; subsequent paste yields it. Proof: `get_text` round-trip check. **[UNPROVEN]**
- A4 Pin: pinned entries stay at top section, survive clear and eviction; unpin returns entry to normal order. Proof: pin → clear → still present; unpin → order normal. **[UNPROVEN]**
- A5 Delete/clear: delete removes one entry (+ its persisted bytes); clear removes all unpinned; both update popup and storage immediately. Proof: file + UI state agree. **[UNPROVEN]**
- A6 Duplicates: copying identical text moves the existing entry to top with original pin state; never two identical rows. Proof: copy A,B,A → order A,B with 2 rows. **[UNPROVEN]**
- A7 Pause: while paused, new copies are ignored and UI says collection is paused; resume collects again. Proof: copy while paused → history unchanged. **[UNPROVEN]**
- A8 Keyboard/a11y: arrows move, Enter restores, Esc closes, search focused on open; all actions reachable by keyboard; visible focus; names for screen readers; honors reduced-motion (`St.Settings.reducedMotion` **[DOCUMENTED]** gjs.guide Shell-51 porting notes) — no animation-dependent meaning. Proof: keyboard-only run + inspector check. **[UNPROVEN]**
- A9 States: empty (never copied / cleared), loading (first async read), error (clipboard read or storage failure) each have distinct copy and recovery action — never a blank or frozen popup. Proof: force each state. **[UNPROVEN]**

## 4. Clipboard monitoring and content handling

- R-M1 Event-driven only **[DOCUMENTED + VERIFIED pattern]**: monitor via `Meta.Display.get_selection()` → `Meta.Selection::owner-changed` filtered to `SELECTION_CLIPBOARD` (pattern confirmed in installed incumbent `extension.js:1082`; signal + methods `get_mimetypes`/`transfer_async` listed in Mutter 51 `Meta.Selection` reference). No polling loops, no interval timers. **[ASSUMPTION]**: this signal fires for all app toolkits on Wayland — must be proven in `/build` across GTK, Firefox/Chromium, terminal. **[UNPROVEN]**
- R-M2 Read path: on signal, probe `St.Clipboard.get_mimetypes(CLIPBOARD)` then `get_text(CLIPBOARD, cb)`; read is async and debounced/coalesced so rapid copies cannot stack overlapping reads. **[DOCUMENTED]**: `st-clipboard.c` (main) shows `get_text` picks first available of `text/plain;charset=utf-8`, `UTF8_STRING`, `text/plain`, `STRING` and transfers via `meta_selection_transfer_async`.
- R-M3 MVP content = text only for those four mimetypes. Anything else (images, files, HTML without text fallback): ignored for history, UI shows most-recent text unchanged; if popup is open with an unsupported latest copy, show neutral "unsupported content — not stored" notice, never an error. Image/file persistence is a non-goal (see §2).
- R-M4 Restore path: `St.Clipboard.set_text(CLIPBOARD, text)` **[DOCUMENTED]** (`st-clipboard.h`). No `set_content` in MVP. Setting clipboard re-fires `owner-changed`; implementation must ignore its own write (guard flag), not create duplicates or loops.
- R-M5 PRIMARY selection (middle-click) is out of scope: MVP tracks `ST_CLIPBOARD_TYPE_CLIPBOARD` only. **[ASSUMPTION]** pending approval.
- R-M6 Failure semantics: `get_text` callback with `NULL`, `get_mimetypes` returning `NULL`/empty, or selection object unavailable → treat as transient, keep old history, surface error state only if user opened popup; always log `console.error` without content.

## 5. Privacy, retention, persistence

- R-P1 Local only: history lives in one JSON file under `GLib.get_user_cache_dir() + '/<uuid>/'` (pattern **[VERIFIED]** in incumbent `registry.js`), written with async `Gio.File.replace_async` + `write_bytes_async`; atomic replace, never sync I/O on the clipboard path. No network calls, no external services, no new permissions.
- R-P2 Never log or screenshot content: clipboard text must not appear in logs, errors, screenshots, prefs, or crash reports. Tests/fixtures use synthetic strings only.
- R-P3 Bounds (recommended defaults, **[ASSUMPTION]** — approve or change): max 30 entries; max 50 KB per entry (longer copies truncated with visible "truncated" marker, full text never stored); max 1 MiB total file; eviction oldest-first, pinned exempt from eviction but capped at 10 pinned (pinning beyond cap refuses with notice). Counts enforced before write.
- R-P4 Pause is runtime + persisted (survives restart) **[ASSUMPTION]**; Clear deletes the JSON file (and rewrites empty) immediately and updates UI.
- R-P5 No sensitive-content detection in MVP: passwords/secrets cannot be reliably identified; contract promises pause + clear + no-logging instead. Optional "clear on screen lock / session end" is an open question (§10), default off.
- R-P6 Corrupt/oversize cache: on parse failure back up once (`registry.json.bak`, incumbent pattern **[VERIFIED]**) and start empty with a notice; never crash Shell.

## 6. Performance and resource management

- R-R1 No claimed numbers. Budgets are targets to measure in `/build`, currently **[UNPROVEN]**: popup open ≤ 200 ms with 30 entries on reference hardware; search keystroke → filtered list same frame; clipboard-change → stored + indicator updated without jank. Report measured medians; unmeasured = unproven.
- R-R2 Rules (verifiable by inspection + test): zero synchronous file/process work on `owner-changed`; persistence writes coalesced (≤ 1 in-flight write, trailing-edge flush ≤ 500 ms); search is O(n) substring over ≤ 30 truncated strings; popup builds ≤ 30 rows, no per-keystroke actor reconstruction beyond list update.
- R-R3 Cleanup: `disable()` is synchronous **[DOCUMENTED]** (Shell 51 throws on async `disable()`), disconnects `owner-changed` + settings signals, destroys panel button/menu/actors, cancels pending async callbacks via destroyed-guard, flushes one final write. Re-enable must not duplicate indicators or leak handlers (enable→disable→enable cycle test).
- R-R4 Memory: in-memory history bounded by same caps as storage; no image/byte caches in MVP; no timers except debounced write and transient UI feedback.

## 7. Error, empty, unsupported behavior

| Situation | Required behavior |
|---|---|
| Empty history | Popup shows "Clipboard history is empty" + hint (copy something); search hidden or disabled |
| First open / slow read | Brief loading state, spinner or skeleton, never frozen |
| Clipboard read fails | Keep old history; inline error "Couldn't read clipboard" with Retry; `console.error` without content |
| Storage write/read fails | Inline error + Retry; corrupt file → backup + start empty with notice |
| Unsupported (image/file) copied | Not stored; neutral notice only if popup open; history unchanged |
| Entry exceeds size cap | Stored truncated + "truncated" badge; no silent full retention |
| Pin cap reached | Refuse with "Unpin something first"; state unchanged |
| Own restore write | Ignored by monitor; no duplicate, no loop |

## 8. GNOME 51 compatibility and verification strategy

- Target **[VERIFIED]**: `gnome-shell 51.0`, `gjs 1.90.1`, `gnome-extensions 51.0`, Wayland session; `St-51.typelib` + `Shell-51.typelib` present in `/usr/lib/gnome-shell/`.
- Format **[DOCUMENTED + VERIFIED pattern]**: ESM `extension.js` (`export default class … extends Extension`), `prefs.js` (`extends ExtensionPreferences`, `fillPreferencesWindow` with `Adw.PreferencesPage`), `metadata.json` with `"shell-version": ["51"]`, compiled GSettings schema. No metadata/prefs format changes in 51 **[DOCUMENTED]** (gjs.guide porting page).
- Shell-51 constraints that bind this project **[DOCUMENTED]** (same page): `disable()` must be sync; `St` `vertical` property removed; `St.ButtonMask` old names deprecated (`ONE/TWO/THREE` → `PRIMARY/MIDDLE/SECONDARY`); `PopupMenu.open/close(animation)` → `open/close({animate})`; direct Clutter event signals deprecated in favor of controllers (`Clutter.ClickGesture`/`KeyController`/…); `Clutter.get_default_backend()` removed; `Shell.GLSLEffect` removed. New code must comply; old incumbent idioms in these areas must not be copied.
- Verification matrix (each row PASS/FAIL/UNPROVEN/BLOCKED per §11; none yet PASS):
  1. `gnome-extensions pack` + install from zip on Shell 51 — clean.
  2. enable → indicator appears; disable → fully removed; re-enable → no duplicates (journal free of errors).
  3. Session restart (logout/login or nested restart) → history + pause + pins restored within caps.
  4. Copy flows on Wayland from GTK app, browser, terminal → stored once, order correct, duplicates coalesce.
  5. Unsupported copy (image in browser/Files) → ignored per §7.
  6. `prefs.js` opens as Adw window, settings round-trip to GSettings, Shell needs no restart.
  7. Looking Glass / `journalctl -f -o cat /usr/bin/gnome-shell` shows no exceptions across 1–6.
- Tooling **[VERIFIED]**: `gnome-extensions pack` and `dbus-run-session` available; `eslint`, Xvfb/nested-shell helpers not installed — headless/nested runs are **[UNPROVEN]** until `/build` provisions or documents them. No `eslint`/`gdbus`-based gate may be claimed until present.

## 9. Technical constraints

- Runtime: GJS ESM in-Shell (`gi://St`, `gi://Meta`, `gi://Shell`, `gi://Gio`, `gi://GLib`); prefs process additionally `gi://Gtk`, `gi://Adw`. Nothing else without a documented justification.
- Settings: GSettings only. Minimal key set (proposed): `history-size`, `item-bytes-max`, `total-bytes-max`, `paused`, toggle shortcut. Exact names/defaults frozen in `/build` spec review.
- Storage: Gio async local JSON only. No SQLite, no ORM, no daemon, no polling, no TypeScript, no build system, no bundled framework.
- Styling: Shell theme inheritance only; no custom palette/gradients/cards; compact popup; system font; respects theme + reduced motion.

## 10. Open questions and decisions needing owner approval

- D1 Text-only MVP vs. opt-in images: recommended **text-only** (images deferred per §2 cost). Approve?
- D2 Proposed caps (30 / 50 KB / 1 MiB / 10 pinned): approve or set alternatives?
- D3 Duplicates move-to-top (recommended) vs. keep-both vs. ignore-recopy: approve?
- D4 Clear keeps pinned (recommended) vs. clears everything: approve?
- D5 Pause persisted across restart (recommended) vs. session-only: approve?
- D6 Panel shows icon + truncated recent text (recommended, max ~30 chars) vs. icon-only: approve?
- D7 Toggle shortcut default (proposed `<Super><Shift>v`) and search default (case-insensitive substring, no regex): approve?
- D8 No per-app exclusion and no clear-on-lock in MVP (recommended): approve?
- D9 PRIMARY selection ignored (recommended): approve?
- U1 **[UNPROVEN]** Does `owner-changed` fire for Chromium/Electron + VMs + clipboard managers (e.g. GPaste) under Wayland without misses? Needs `/build` matrix.
- U2 **[UNPROVEN]** Exact Wayland MIME set offered by common apps (need `get_mimetypes` dumps) — decides whether text fallback always exists.
- U3 **[UNPROVEN]** Nested-Shell harness availability for CI-less local verification (no Xvfb/eslint today).

## 11. Verification vocabulary

- **PASS**: behavior implemented (in `/build`) and proven by cited evidence (command + observed result).
- **FAIL**: evidence shows behavior missing or wrong.
- **UNPROVEN**: no adequate evidence yet — not passed, not failed. All §3/§8 rows are UNPROVEN at spec stage by construction.
- **BLOCKED**: a genuine prerequisite (e.g. nested-Shell host, missing tool) prevents verification; name the prerequisite.
- Spec-stage rule: no API, number, or compatibility claim above marked **[VERIFIED]**/**[DOCUMENTED]** may be treated as proven; everything else stays **[UNPROVEN]**/**[ASSUMPTION]** until `/build` measures it.
