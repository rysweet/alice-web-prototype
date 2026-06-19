# Pass 2 Cross-Check

## Infrastructure diagram under-models the a3p-parser coupling hub
**Pass 1 verdict:** Medium — Infrastructure diagram under-models the a3p-parser coupling hub
**Pass 2 verdict:** CONFIRMED
**Rationale:** I independently found the same mismatch before reading Pass 1: `docs/atlas/compile-deps/README.md:16-19` describes `a3p-parser` as the densest shared base, but `docs/atlas/service-components/service-components-infrastructure.mmd:2-14` only draws `A3P I/O` into `Project system` and `REST server`. The code fan-out is materially wider: the browser entry imports `parseA3P` in `src/main.ts:3`, grading imports it in `src/grading-pipeline.ts:1,47-52`, hooks import it in `src/hooks/place-object.ts:10` (and related hook files), and the server project service imports and calls it in `src/server/project-service.ts:3,54,181`. That makes the service-components infrastructure view under-modeled around a real cross-subsystem coupling hub.

## Collaboration journey has no runtime entrypoint
**Pass 1 verdict:** High — Collaboration journey has no runtime entrypoint
**Pass 2 verdict:** CONFIRMED
**Rationale:** I reached the same conclusion from the layer READMEs alone, then verified it in code. `docs/atlas/runtime-topology/README.md:11-19` says the shipped runtime is a local Express API plus the browser viewer in `src/main.ts`, and `docs/atlas/api-contracts/README.md:13-21` enumerates only 9 REST routes with no collaboration surface. In code, `src/server.ts:1-10,21-28` wires only launch/health/scene/code/project/world/screenshot/events route modules, `src/cli.ts:119-125` only boots that server, and `src/main.ts:14-17,104-123,149-163` only loads an `.a3p` file into the renderer. `src/collaboration.ts` exists and is exported from `src/index.ts:29`, but it is not connected to any runtime entrypoint.

## Spot-check confirmed dead exported helpers in smaller modules
**Pass 1 verdict:** Low — Spot-check confirmed dead exported helpers in smaller modules
**Pass 2 verdict:** CONFIRMED
**Rationale:** The local-consumer claim holds up. `docs/atlas/ast-lsp-bindings/README.md:13-16` already labels these as local dead-export candidates, and my grep spot-checks found no in-repo consumers outside their defining files for `walkBinaryExpression` (`src/search/resolvers.ts:85-91`) or `cloneEntityBoundingBox`, `captureEntityTransform`, `ensureJointedModel`, and `describeJointedModel` (`src/story-api/entities.ts:30-33,101-112,140-145,171-175`). That supports Pass 1's conclusion for the repo-local atlas scope, even though external package consumers cannot be ruled out from this repository alone.

## Event registration docs under-declare the request contract
**Pass 1 verdict:** Medium — Event registration docs under-declare the request contract
**Pass 2 verdict:** CONFIRMED
**Rationale:** The documentation drift is real. The atlas contract in `docs/atlas/api-contracts/README.md:20-31` matches implementation behavior, but `docs/api-reference.md:217-232` still marks `handlerName` as required and omits `target`, `useCapture`, `targetObjects`, and `threshold`. The implementation defaults `handlerName` in `src/events.ts:165-173`, validates `target` and `useCapture` in `src/events.ts:172-177`, and handles proximity-specific `targetObjects`/`threshold` in `src/events.ts:179-193`; tests in `test/events.test.ts:78-137` cover omitted `handlerName` and proximity registrations. Pass 1 is supported.

## REST save docs misstate archive-writer integration
**Pass 1 verdict:** High — REST save docs misstate archive-writer integration
**Pass 2 verdict:** CONFIRMED
**Rationale:** I independently flagged the same save-path documentation split. `docs/atlas/data-flow/data-flow.mmd:31-37` routes `POST /api/project/save` through `writeA3P / writeProject`, while `docs/atlas/api-contracts/README.md:17,44-45` describes `/api/project/save` as a placeholder/copy proof path. The live route delegates to `projectService.saveProject()` (`src/server/routes/project-routes.ts:4-13`), which builds the current project and serializes it with `writeA3P()` (`src/server/project-service.ts:142-172`). That makes the atlas text misleading exactly as Pass 1 reported; the implementation path is the route-to-service-to-writer flow.

## New Pass 2 Finding: New-project journey has no runtime entrypoint
**Layer**: user-journeys × runtime-topology
**Severity**: High
**Evidence**: `docs/atlas/user-journeys/README.md:29-35` and `docs/atlas/user-journeys/journey-student-new-project.mmd:11-27` present a student workflow that creates a project, adds a biped through the gallery, edits a procedure, and runs via `ProjectRunner`. But `docs/atlas/runtime-topology/README.md:15-19` says the browser runtime is `src/main.ts`, and that file only wires file upload and rendering (`src/main.ts:14-17,104-123,149-163`). The other runtime entrypoint, `src/cli.ts:119-125`, only boots `createServer()`. The modules named by the journey exist (`src/project-template.ts`, `src/gallery.ts`, `src/procedure-editor.ts`, `src/project-runner.ts`), but they are library/test surfaces rather than connected runtime flows, so the atlas currently documents a user journey that a shipped client cannot actually start.

## New Pass 2 Finding: Service-components falsely routes collaboration into the server
**Layer**: service-components × runtime-topology
**Severity**: High
**Evidence**: `docs/atlas/service-components/README.md:37-47` and `docs/atlas/service-components/service-components-infrastructure.mmd:7-14` show `State sync` feeding `Collaboration`, with `Collaboration --> Server`. The runtime layer does not support that edge: `docs/atlas/runtime-topology/README.md:11-19` describes only the local API server and browser viewer, `src/server.ts:1-10,21-28` imports and registers no collaboration or state-sync route module, and `src/cli.ts:119-125` only starts `createServer()`. This is a separate atlas contradiction from the collaboration user-journey bug: the component architecture itself currently overstates server-side collaboration wiring.
