# JSON Mate Modernization Roadmap

## Goal

Move the extension onto a modern, typed build system and ship directly from the WXT build output.

## Guardrails

- Keep the current MV3 extension build working until the WXT track reaches feature parity.
- Build the new stack in parallel instead of replacing the root runtime in one pass.
- Move parsing, messaging, and settings into typed modules before migrating heavy UI logic.
- Migrate low-risk pages first, then tackle the viewer and content script last.

## Target Stack

- WXT for extension app structure and multi-entrypoint builds
- TypeScript for runtime contracts and migration safety
- React for new HTML entrypoints
- Vitest for unit coverage on extracted core modules

## Migration Phases

### Phase 1

- Add a WXT + TypeScript skeleton under `src/`
- Define shared settings and message contracts in typed modules
- Keep the current root manifest, scripts, and packaging flow as the production path

### Phase 2

- Migrate `options` onto the WXT React track
- Migrate `transform-toolkit` with typed messaging hooks

### Phase 3

- Extract parser and detection logic into `src/core/`
- Add unit tests for JSON, JSONP, JSONL, and false-positive regressions

Phase 3 landed with a reusable raw-payload detector core and regression coverage:

- `src/core/detector/raw-payload.ts`
- `src/core/detector/raw-payload.test.ts`

The detector stays DOM-light by accepting a document snapshot, which keeps the parser testable before the content script cutover.

### Phase 4

- Rebuild the viewer on the modern stack
- Replace the legacy content script with the typed parser core

Phase 4 landed in its first production-ready cut:

- `src/entrypoints/viewer/` adds the typed viewer app
- `src/core/viewer/session.ts` handles pending payloads, iframe handoff, manual parsing, and document rebuilds
- `src/core/viewer/tree.ts` handles path formatting, traversal, and immutable node updates
- `src/entrypoints/content/` now uses the typed raw-payload detector
- `src/entrypoints/background/` now opens the WXT viewer as the main surface

## Phase 1 Deliverables

- `package.json`, `tsconfig.json`, and `wxt.config.ts`
- Initial WXT entrypoints for `background` and `options`
- Typed settings defaults
- Typed runtime message definitions

## Cutover Rule

The shipping package comes from the WXT build output. `scripts/package-extension.sh` builds `.output/wxt/chrome-mv3` and zips that directory into `release/`.
