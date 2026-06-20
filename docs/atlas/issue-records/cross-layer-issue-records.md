# Cross-Layer Atlas Issue Records

## Infrastructure diagram under-models the a3p-parser coupling hub
**Severity**: Medium
**Evidence**: `docs/atlas/compile-deps/README.md:16-19` describes `a3p-parser` as the densest shared base, but `docs/atlas/service-components/service-components-infrastructure.mmd:2-14` only draws `A3P I/O` into `Project system` and `REST server`. The code fan-out is materially wider: the browser entry imports `parseA3P` in `src/main.ts:3`, grading imports it in `src/grading-pipeline.ts:1,47-52`, hooks import it in `src/hooks/place-object.ts:10` and related hook files, and the server imports it in `src/server.ts:11,81-83,267-282`. The service-components infrastructure view is under-modeled around a real cross-subsystem coupling hub.

## Collaboration journey has no runtime entrypoint
**Severity**: High
**Evidence**: `docs/atlas/runtime-topology/README.md:11-19` describes the shipped runtime as a local Express API plus the browser viewer in `src/main.ts`, and `docs/atlas/api-contracts/README.md:13-21` enumerates 9 REST routes with no collaboration surface. In code, `src/server.ts:1-14,67-415` wires only launch/scene/code/save/run/screenshot/events routes, `src/cli.ts:119-125` only boots that server, and `src/main.ts:14-17,104-123,149-163` only loads an `.a3p` file into the renderer. `src/collaboration.ts` exists and is exported from `src/index.ts:24`, but it is not connected to any runtime entrypoint.

## Dead exported helper candidates in smaller modules
**Severity**: Low
**Evidence**: `docs/atlas/ast-lsp-bindings/README.md:13-16` labels these as local dead-export candidates. Repo-local reference checks identify no in-repository consumers outside the defining files for `walkBinaryExpression` (`src/search/resolvers.ts:85-91`) or `cloneEntityBoundingBox`, `captureEntityTransform`, `ensureJointedModel`, and `describeJointedModel` (`src/story-api/entities.ts:30-33,101-112,140-145,171-175`). External package consumers cannot be ruled out from this repository alone.

## Event registration docs under-declare the request contract
**Severity**: Medium
**Evidence**: The atlas contract in `docs/atlas/api-contracts/README.md:20-31` matches implementation behavior, but `docs/api-reference.md:217-232` still marks `handlerName` as required and omits `target`, `useCapture`, `targetObjects`, and `threshold`. The implementation defaults `handlerName` in `src/events.ts:165-173`, validates `target` and `useCapture` in `src/events.ts:172-177`, and handles proximity-specific `targetObjects`/`threshold` in `src/events.ts:179-193`; tests in `test/events.test.ts:78-137` cover omitted `handlerName` and proximity registrations.

## REST save route bypasses the archive writer stack
**Severity**: High
**Evidence**: `docs/atlas/data-flow/README.md:18-20` says the REST server is evidence-oriented, but `docs/atlas/data-flow/data-flow.mmd:31-37` still merges `POST /api/project/save` with `ProjectSaver.saveProject` and routes both through `writeA3P / writeProject`. The live route in `src/server.ts:219-255` does not call the writer stack: it copies the source `.a3p` or writes a placeholder buffer, then emits `desktop-save-operation-result.json`. The archive writer path lives separately in `src/project-system.ts:139-147` and `src/project-io.ts:164-200`, so the atlas diagram misstates the save boundary.

## New-project journey has no runtime entrypoint
**Layer**: user-journeys × runtime-topology
**Severity**: High
**Evidence**: `docs/atlas/user-journeys/README.md:29-35` and `docs/atlas/user-journeys/journey-student-new-project.mmd:11-27` present a student workflow that creates a project, adds a biped through the gallery, edits a procedure, and runs via `ProjectRunner`. But `docs/atlas/runtime-topology/README.md:15-19` says the browser runtime is `src/main.ts`, and that file only wires file upload and rendering (`src/main.ts:14-17,104-123,149-163`). The other runtime entrypoint, `src/cli.ts:119-125`, only boots `createServer()`. The modules named by the journey exist (`src/project-template.ts`, `src/gallery.ts`, `src/procedure-editor.ts`, `src/project-runner.ts`), but they are library/test surfaces rather than connected runtime flows, so the atlas currently documents a user journey that a shipped client cannot actually start.

## Service-components falsely routes collaboration into the server
**Layer**: service-components × runtime-topology
**Severity**: High
**Evidence**: `docs/atlas/service-components/README.md:37-47` and `docs/atlas/service-components/service-components-infrastructure.mmd:7-14` show `State sync` feeding `Collaboration`, with `Collaboration --> Server`. The runtime layer does not support that edge: `docs/atlas/runtime-topology/README.md:11-19` describes only the local API server and browser viewer, `src/server.ts:1-14` imports no collaboration or state-sync module, and `src/cli.ts:119-125` only starts `createServer()`. This is a separate atlas contradiction from the collaboration user-journey bug: the component architecture itself currently overstates server-side collaboration wiring.
