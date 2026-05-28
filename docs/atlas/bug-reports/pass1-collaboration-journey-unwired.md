## Bug: Collaboration journey has no runtime entrypoint

**Layer**: user-journeys × runtime-topology
**Severity**: High
**Pass**: 1
**Evidence**:
- `docs/atlas/user-journeys/journey-collaborative-edit.mmd:4-28` documents a live collaborative-edit path with shared sessions, sync, and peer mailboxes.
- `docs/atlas/runtime-topology/README.md:11-19` and `docs/atlas/api-contracts/README.md:13-21` describe only the viewer client plus 9 REST endpoints; there is no collaboration transport, route, or service on the runtime path.
- `src/server.ts:1-14` imports only `a3p-parser`, `scene-renderer`, `tweedle-vm`, `events`, and `evidence-writer`, while `src/index.ts:24` merely re-exports `./collaboration` without wiring it into `src/main.ts` or `src/cli.ts`.
- code_quote: `participant Session as CollaborationSession`

**Impact**: The atlas presents collaborative editing as an end-to-end journey even though the shipped runtime has no collaboration API or entrypoint. That sends debugging and planning work down a path users cannot actually execute.
**Fix**: Either wire collaboration into a real runtime surface (API/WebSocket/client integration) or relabel/remove the journey so it is clearly documented as library-only or future work.
