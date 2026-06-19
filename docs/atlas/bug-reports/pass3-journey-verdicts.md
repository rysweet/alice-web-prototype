# Pass 3 Journey Verdicts

## Journey 1: Student loads project via REST, edits, runs, saves
**Verdict**: FAIL
**Trace**:
- Step 1: `POST /api/launch` → project service reads the archive → `parseA3P` → `state.parsedProject` (`src/server/routes/launch-routes.ts:5-33`, `src/server/project-service.ts:35-65`) → verified ✅
- Step 2: `POST /api/code/edit-procedure` → project service updates `state.procedures` and proof artifacts; only `append-statement` edits can also mutate `state.parsedProject` (`src/server/routes/code-routes.ts:5-14`, `src/server/project-service.ts:67-139`) → endpoint exists, but the default proof edit does not mutate `state.parsedProject` ❌
- Step 3: `POST /api/world/run` → `executeProject(state.parsedProject)` (`src/server/routes/world-routes.ts:4-17`, `src/server/project-service.ts:175-218`) → wired, but it ignores default proof edits stored only in `state.procedures` ❌
- Step 4: `POST /api/project/save` → `buildCurrentProject(state)` → `writeA3P(currentProject)` (`src/server/routes/project-routes.ts:4-13`, `src/server/project-service.ts:142-172`, `src/server/state.ts:54-80`) → endpoint uses the archive writer, but the same default proof-edit gap applies to launched projects ❌
- Step 5: Public symbols stay reachable through `createServer`/`Server` (`src/server.ts:15-37`, `src/index.ts:144`, `test/silver-thread-e2e.test.ts:9-99`) → verified ✅
**Issues found**:
- Default proof edits stay in `state.procedures`; they do not flow into the cached parsed project used by run.
- Save serializes through `writeA3P`, but launched projects use `state.parsedProject`, so default proof edits stored only in `state.procedures` still do not change the saved archive.

## Journey 2: Eatme suite drives the prototype
**Verdict**: PASS
**Trace**:
- Step 1: `GET /api/health` and `POST /api/launch` exist in route modules (`src/server/routes/health-routes.ts:4-14`, `src/server/routes/launch-routes.ts:5-33`) and are exercised by `test/advanced-e2e.test.ts:104-106` → verified ✅
- Step 2: `POST /api/scene/add-object` mutates `state.sceneObjects` and writes `scene-object-added.json` (`src/server/routes/scene-routes.ts:5-34`, `test/advanced-e2e.test.ts:107-114`) → verified ✅
- Step 3: `POST /api/events/register` → `EventSystem.register()` → `event-register.json` (`src/server/routes/event-routes.ts:5-37`, `src/events.ts:165-224`, `test/events.test.ts:51-261`) → verified ✅
- Step 4: `POST /api/events/fire` → `EventSystem.fire()` → `event-fire.json` (`src/server/routes/event-routes.ts:39-70`, `src/events.ts:259-300`, `test/advanced-e2e.test.ts:134-156`) → verified ✅
- Step 5: `POST /api/world/run` → `executeProject` + `run-world-result.json` (`src/server/routes/world-routes.ts:4-17`, `src/server/project-service.ts:175-218`) → verified ✅
- Step 6: Server/event symbols remain reachable through the public surface (`src/index.ts:54-55,144`) and the evidence checks in `test/events.test.ts:684-718` / `test/advanced-e2e.test.ts:101-157` → verified ✅
**Issues found**: None

## Journey 3: Developer runs tests and coverage
**Verdict**: FAIL
**Trace**:
- Step 1: `npm test` → `vitest run` is wired in `package.json:9-16` and passed on this checkout (`226` files, `2568` tests passed) → verified ✅
- Step 2: Coverage tooling is declared via `@vitest/coverage-v8` in `package.json:24-35` and `npx vitest run --coverage` starts correctly → verified ✅
- Step 3: The coverage run fails in `test/hooks.test.ts:60-75,128-228` when hook subprocesses cannot reopen `.hook-integration-test-evidence/test-input.a3p` under coverage instrumentation → missing ❌
- Step 4: The failing path reaches built hook entrypoints (`dist-server/hooks/edit-procedure.js:102-136`, `dist-server/hooks/run-world.js:80-119`, `dist-server/hooks/save-project.js:120-143`) but does not complete cleanly under coverage ❌
**Issues found**:
- `npm test` is green, but the documented coverage journey is not: `npx vitest run --coverage` reproduced 7 failures in `test/hooks.test.ts`.

## Journey 4: Student creates a new project, adds a biped, writes a walk procedure, runs
**Verdict**: FAIL
**Trace**:
- Step 1: New-project creation exists as library code via `createEmptyWorldProject()` and `ProjectCreator.createBlank()` (`src/project-template.ts:54-65`, `src/project-system.ts:114-137`, `test/project-system.test.ts:30-40`) → verified ✅
- Step 2: Gallery + scene edit exists as library code: `people/biped` is defined in `src/gallery.ts:19-29`, and `SceneEditor.placeFromGallery()` uses it in `src/scene-editor.ts:100-110` / `test/scene-editor.test.ts:14-22` → verified ✅
- Step 3: Procedure editing exists as AST tooling in `src/procedure-editor.ts:119-207` and `test/procedure-editor.test.ts:29-97` → verified ✅
- Step 4: Code generation exists (`src/tweedle-codegen.ts:328`, `src/print-system.ts:132-177`), but there is no in-repo wiring from `ProcedureEditor` into `generateTweedle` ⚠️
- Step 5: `ProjectRunner.run()` exists and passes its own tests (`src/project-runner.ts:70-136`, `test/project-runner.test.ts:11-89`), but the browser runtime is only `src/index.html:29-41` → `src/main.ts:14-17,76-123`, a file-loader/viewer path with no project-creation/editor/runner integration ❌
- Step 6: The symbols are exported (`src/index.ts:56,90,96,98,100,117`) but not assembled into an actual end-to-end browser journey ❌
**Issues found**:
- The IDE modules exist, but runtime-topology does not wire them into the shipped browser entrypoint.
- The documented `ProcedureEditor` → codegen → runner → renderer chain is incomplete in live code.

## Journey 5: Collaborative editing with sync and conflict resolution
**Verdict**: FAIL
**Trace**:
- Step 1: Session creation/join works in `CollaborationManager` (`src/collaboration.ts:342-373`, `test/collaboration.test.ts:5-21`) → verified ✅
- Step 2: Change application, mailbox fan-out, and last-write-wins conflict handling work in `src/collaboration.ts:259-333` and `test/collaboration.test.ts:23-45,185-231` → verified ✅
- Step 3: Presence tracking also works in `src/collaboration.ts:232-257` and `test/collaboration.test.ts:95-142,233-280` → verified ✅
- Step 4: The journey names `StateStore / StatePatch`, but `src/collaboration.ts` never imports `state-synchronization.ts`; the sync layer is only separately exported (`src/state-synchronization.ts:52-64,172-245`, `src/index.ts:29,100`) ❌
- Step 5: Runtime wiring is missing: the shipped runtime is the viewer client plus REST route composer (`src/index.html:29-41`, `src/main.ts:14-17`, `src/cli.ts:119-144`, `src/server.ts:1-37`) with no collaboration transport or API surface ❌
**Issues found**:
- Collaboration is currently library-only, not a reachable end-to-end user journey.
- The documented sync layer is adjacent to collaboration, not actually connected to it.
