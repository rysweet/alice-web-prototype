## Bug: Infrastructure diagram under-models the a3p-parser coupling hub

**Layer**: service-components × compile-deps
**Severity**: Medium
**Evidence**:
- `docs/atlas/compile-deps/README.md:16-19` says `a3p-parser` is the most imported internal module and binds project/IDE, runtime, and entry-point clusters.
- `docs/atlas/service-components/service-components-infrastructure.mmd:2-14` shows `A3P I/O` feeding only `Project system` and `REST server`.
- Actual imports span multiple subsystems: `src/main.ts:3`, `src/project-system.ts:1-2`, `src/grading-pipeline.ts:1`, `src/hooks/place-object.ts:10`, and the server project service imports and calls `parseA3P` (`src/server/project-service.ts:3,54,181`).
- code_quote: `A3P["A3P I/O\na3p-parser / a3p-writer"] --> ProjectSystem`

**Impact**: The service-components layer hides a major cross-subsystem dependency hub, so refactor blast radius around `a3p-parser` looks much smaller than it is. That makes the atlas less trustworthy for coupling and ownership decisions.
**Fix**: Redraw the infrastructure/service-components layer so `a3p-parser` is shown as a shared foundation with edges into browser, grading, hook, and server paths, or split the infrastructure view into a denser sub-diagram.
