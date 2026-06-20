# Journey Architecture Notes

## Student loads project through REST, edits, runs, and saves
**Architecture trace**:
- `POST /api/launch` resolves the project request, reads the project, parses A3P, and stores `state.parsedProject` (`src/server/routes/launch-routes.ts:5-33`, `src/server/project-service.ts:42-72`).
- `POST /api/code/edit-procedure` writes `state.procedures` and proof artifacts; append-statement edits also patch cached parsed methods (`src/server/routes/code-routes.ts:5-14`, `src/server/project-service.ts:74-163`).
- `POST /api/world/run` calls `executeProject(state.parsedProject)` through the project service (`src/server/routes/world-routes.ts:5-27`, `src/server/project-service.ts:198-242`).
- `POST /api/project/save` writes the current project archive through `writeA3P` and emits save evidence (`src/server/routes/project-routes.ts:4-13`, `src/server/project-service.ts:165-196`).
- Public server symbols are exported through `createServer`/`Server` (`src/server.ts:12-13,38`, `src/index.ts:144`).
**Architecture gaps**:
- Default comment-style procedure edits remain evidence-oriented; statement edits patch cached parsed methods before run.

## Eatme suite drives the prototype
**Architecture trace**:
- `GET /api/health` and `POST /api/launch` are server routes in `src/server/routes/health-routes.ts:4-14` and `src/server/routes/launch-routes.ts:5-33`.
- `POST /api/scene/add-object` mutates `state.sceneObjects` and writes `scene-object-added.json` (`src/server/routes/scene-routes.ts:5-34`).
- `POST /api/events/register` calls `EventSystem.register()` and writes `event-register.json` (`src/server/routes/event-routes.ts:5-37`, `src/events.ts:165-224`).
- `POST /api/events/fire` calls `EventSystem.fire()` and writes `event-fire.json` (`src/server/routes/event-routes.ts:39-70`, `src/events.ts:259-300`).
- `POST /api/world/run` calls `executeProject` and writes `run-world-result.json` (`src/server/routes/world-routes.ts:5-27`, `src/server/project-service.ts:198-242`).
- Server/event symbols are exported through the public surface (`src/index.ts:48,130`).

## Developer test and coverage commands
**Architecture trace**:
- `npm test` maps to `vitest run` in `package.json:9-16`.
- Coverage tooling is declared through `@vitest/coverage-v8` in `package.json:24-35`.
- Hook subprocess tests in `test/hooks.test.ts:60-75,128-228` reopen `.hook-integration-test-evidence/test-input.a3p` under coverage instrumentation.
- Built hook entrypoints are emitted under `dist-server/hooks/` for edit, run, and save commands.
**Architecture gap**:
- The documented coverage journey depends on the hook subprocess input file being addressable from coverage-instrumented subprocesses.

## Student creates a project, adds a biped, writes a walk procedure, and runs
**Architecture trace**:
- New-project creation exists as library code through `createEmptyWorldProject()` and `ProjectCreator.createBlank()` (`src/project-template.ts:54-65`, `src/project-system.ts:114-137`).
- Gallery and scene edit code exists: `people/biped` is defined in `src/gallery.ts:19-29`, and `SceneEditor.placeFromGallery()` uses it in `src/scene-editor.ts:100-110`.
- Procedure editing exists as AST tooling in `src/procedure-editor.ts:119-207`.
- Code generation exists in `src/tweedle-codegen.ts:328` and `src/print-system.ts:132-177`, but there is no in-repo wiring from `ProcedureEditor` into `generateTweedle`.
- `ProjectRunner.run()` exists in `src/project-runner.ts:70-136`, but the browser runtime is only `src/index.html:29-41` → `src/main.ts:14-17,76-123`, a file-loader/viewer path with no project-creation/editor/runner integration.
- The symbols are exported (`src/index.ts:56,90,96,98,100,117`) but not assembled into an end-to-end browser journey.
**Architecture gaps**:
- The IDE modules exist, but runtime-topology does not wire them into the shipped browser entrypoint.
- The documented `ProcedureEditor` → codegen → runner → renderer chain is incomplete in live code.

## Collaborative editing with sync and conflict resolution
**Architecture trace**:
- Session creation/join lives in `CollaborationManager` (`src/collaboration.ts:342-373`).
- Change application, mailbox fan-out, and last-write-wins conflict handling live in `src/collaboration.ts:259-333`.
- Presence tracking lives in `src/collaboration.ts:232-257`.
- The journey names `StateStore / StatePatch`, but `src/collaboration.ts` never imports `state-synchronization.ts`; the sync layer is separately exported (`src/state-synchronization.ts:52-64,172-245`, `src/index.ts:24,86`).
- Runtime wiring is missing: the shipped runtime is the viewer client plus REST server (`src/index.html:29-41`, `src/main.ts:14-17`, `src/cli.ts:119-144`, `src/server.ts:1-13,38`) with no collaboration transport or API surface.
**Architecture gaps**:
- Collaboration is currently library-only, not a reachable end-to-end user journey.
- The documented sync layer is adjacent to collaboration, not actually connected to it.
