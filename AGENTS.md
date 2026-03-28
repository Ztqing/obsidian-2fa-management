# 2FA Management Collaboration Guide

## Project Invariants

- This repo is an Obsidian community plugin built with TypeScript, `npm`, and `esbuild`.
- Release artifacts must remain `main.js`, `manifest.json`, and optional `styles.css` at the plugin root.
- The plugin is currently desktop-only. Keep `manifest.json` aligned with that reality unless mobile support is deliberately implemented and validated.
- Keep the plugin local-first. Do not add hidden telemetry, background network calls, or cloud dependencies without a clear user-facing reason and explicit documentation.
- Do not change stable user-facing identifiers casually:
  - plugin `id`
  - command IDs
  - persisted vault data shape
  - stable manifest fields tied to release compatibility
- All vault and secret handling must stay inside the vault/plugin-data boundary. Do not add access outside the vault.

## Architecture Boundaries

- `src/main.ts` should remain a minimal entry shim that only re-exports the plugin entrypoint.
- `src/plugin.ts` should own plugin lifecycle, top-level wiring, stable facade methods, and cross-subsystem coordination.
- `src/plugin/internal/*` should hold plugin-specific adapters and refresh mapping. Do not move that glue back into `plugin.ts`.
- `src/application/*` should contain orchestration and workflow logic, not low-level storage details or raw UI layout code.
- `src/vault/service.ts` is the single public vault facade. Keep internal responsibilities split into focused collaborators such as:
  - repository/session state
  - encrypted vault persistence
  - entry mutations
  - persisted unlock handling
  - settings handling
- `src/ui/views/*` should stay layered:
  - `totp-manager-view.ts`: Obsidian view lifecycle
  - controller: user action routing
  - renderer: structural rendering and node reuse
  - code refresh: live code/countdown updates
  - helper modules: drag, menus, copy feedback, session activity
- `src/ui/modals/*` should keep modal shells, controllers, import helpers, and forms separated when logic grows.
- Prefer adding narrowly scoped internal modules and making large files thinner rather than re-centralizing logic into one file.

## Working Rules

- Read the current implementation and current worktree state before editing. Do not assume a clean tree.
- Do not revert or overwrite existing uncommitted changes unless explicitly asked.
- Make incremental changes on top of the current worktree. Prefer additive refactors over large renames or sweeping moves.
- Keep behavior stable by default unless the user explicitly asks for behavioral change.
- Do not mix unrelated work in one change. Separate:
  - core feature or safety changes
  - refactors
  - UI polish
  - docs
- Before large refactors, add or tighten guardrail tests first.
- Preserve Obsidian lifecycle safety:
  - register and clean up listeners
  - register intervals
  - keep reload/unload paths idempotent

## Validation Gate

- The default verification gate for code changes is:
  - `npm run lint`
  - `npm run typecheck`
  - `npm test`
- Run targeted tests for the touched subsystem before full regression when possible.
- UI and interaction changes must include regression coverage, not just visual tweaks.
- Refactors are not complete until lint, typecheck, and full tests pass again.
- Keep test support aligned with the real repo layout and runtime constraints. For Obsidian-only runtime behavior, use the repo’s test support stubs instead of weakening production code for tests.

## UI Rules

- For layout, alignment, spacing, truncation, and rhythm issues, prefer CSS changes before changing DOM structure.
- Only change rendering structure when the problem cannot be solved reliably at the style layer.
- Keep UI behavior stable while polishing visuals.
- Card, settings, and manager-view changes must remain regression-tested.
- Maintain the current view layering rather than reintroducing monolithic UI files.
- When adjusting card layout:
  - align primary title and status elements predictably
  - let secondary text use available space before truncating
  - truncate only at the true usable boundary, not prematurely
- Keep in-app copy concise, action-oriented, and consistent with current plugin terminology.

## Git Habits

- Split commits by topic. A commit should map cleanly to its message.
- Review staged changes before committing. Ensure staged content matches the intended commit scope.
- Prefer Conventional Commit style messages such as:
  - `feat: ...`
  - `refactor: ...`
  - `test: ...`
  - `docs: ...`
- Keep docs-only changes in separate commits when practical.
- When a task naturally breaks into phases, prefer commit order like:
  - core behavior / safety
  - refactor / UI layer work
  - docs
