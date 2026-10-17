# Product Design Contract

Specific, short, durable. The visual and interaction source of truth shared by build, browser QA, and review. Replace template prompts with accepted decisions; do not preserve a menu of unused options. Fill during the first user-facing `/spec`; delete sections that never apply.

## Owner direction

Accepted owner choices (build task approval):

- Panel indicator is icon-only (`edit-paste-symbolic`): clipboard text never appears in the top panel. Contents show inside the history popup only.
- Visual language: restrained, native GNOME Shell theme inheritance. No custom palette, gradients, cards, or decorative clutter.
- Popup is compact and scannable (single-column rows, first-line preview ≤120 chars, truncated badge); preferences use native GTK4/libadwaita (`Adw.PreferencesPage`).
- Keyboard interaction, visible focus, and `St.Settings.reducedMotion` honored from day one; no animation-dependent meaning.
- Agent-proposed details: 26–30em popup width, 12–26em scroll region, bold label for pinned rows. Open to owner revision with a screenshot.
- Canonical code token source: `extension/stylesheet.css` (layout only, inherits theme colors) + Shell theme classes (`system-status-icon`, `popup-menu-icon`, `button`).

## Experience brief

- Product / surface: in-Shell clipboard history — top-panel indicator + popup; Adw preferences window.
- Primary audience: daily GNOME/Wayland users re-copying recent text (commands, links, snippets).
- Single job of this surface: open → find → restore to clipboard, in seconds, by mouse or keyboard alone.
- Desired user feeling before → after: rummaging → certain. The list is already there, in order, searchable.
- Success signal: restore via Enter/click with zero reading friction; empty/error states explain themselves.

## Brand character

- Native, not noticeable: feels like part of Shell, not an app.
- Compact, not dashboardy: one column, no cards, no statistics.

## Direction

- Visual thesis: inherit the Shell theme completely; differentiate only through spacing, hierarchy, and typography of list rows.
- Signature element (one restrained choice): bold row label for pinned entries — the only weight contrast in the list.
- What must feel familiar: `PopupMenu` rows, `St.Entry` search, `system-status-icon` panel icon, Adw preferences groups.
- What must never look generic: gradient buttons, card-per-entry layouts, emoji/icon decoration, AI-dashboard chrome.

## Semantic tokens

No custom palette: all color comes from the user's Shell theme. Layout-only
classes live in `extension/stylesheet.css`; color-bearing classes are Shell
theme classes (`system-status-icon`, `popup-menu-icon`, `button`). Contrast
is therefore the theme's proven contrast, not ours to measure.

Typography: system font at theme sizes; pinned rows bold. Geometry: 6px
rhythm, 26–30em popup width, 12–26em scroll region. Icons: symbolic only
(`edit-paste`, `edit-delete`, `view-pin`, `edit-clear-all`,
`media-playback-pause/start`, `emblem-system`).

## Composition and responsiveness

- Desktop composition: icon-only panel button; popup stacks search →
  notice → scrollable single-column list → icon toolbar.
- Dense/long-content behavior: one-line first-line preview (≤120 chars) +
  `(truncated)` badge; list scrolls, popup never grows unbounded.
- RTL/localization behavior: untested — marked UNPROVEN until a live pass.
  No directional styling in our CSS, so theme RTL applies by default.

## Components and states

| Component / pattern | Required states | Notes |
|---|---|---|
| Panel indicator | default / hover / focus / active | icon only, never text |
| Search entry | default / focus / filled / no-match | focused on popup open |
| History row | default / hover / focus / pinned / truncated | Enter/click restores; pin + delete buttons |
| Toolbar | pause ↔ resume toggle, clear, settings | pause state visible in popup |
| Status rows | loading / empty / no-match / paused-empty | distinct copy each |
| Error banner + Retry | read failure / storage failure | keeps history visible above list |

## Motion, feedback, voice

- Orchestrated moment: none. Popup open/close uses Shell default animation
  only, subject to `reducedMotion`; nothing else moves.
- Vocabulary: plain verbs (Pin, Unpin, Delete, Clear history, Retry, Resume).
  Errors say what happened + what still works ("Showing kept history").
  Empty states say the next step ("Copy something to get started").

## Quality budgets

- Accessibility target: keyboard-only operation (arrows/Enter/Esc native to
  `PopupMenu`), visible focus, accessible names on all buttons; contrast
  inherited from theme. Formal WCAG audit UNPROVEN.
- Performance target (PRODUCT.md §6, all UNPROVEN until measured): popup
  open ≤ 200 ms at 30 entries; search filters same frame; no sync I/O on
  the clipboard path.

## Screen acceptance

| Flow / screen | Critical states | Visual proof |
|---|---|---|
| Popup journey (open/search/restore/pin) | 2-row, 1-row search, pinned | UNPROVEN — headless has no pixels; UI-tree probe proved structure only |
| Preferences window | limits/behavior/shortcut groups | UNPROVEN — needs a display |

## Decision log

| Date | Decision | Evidence / rationale | Revisit when |
|---|---|---|---|
| 2026-10-14 | Icon-only panel; text in popup only | Owner approval in build task | Owner requests otherwise |
| 2026-10-14 | No custom palette; theme inheritance | GNOME native feel; zero contrast debt | A branded variant is requested |
