## Bug: REST save docs misstate archive-writer integration

**Layer**: api-contracts × data-flow
**Severity**: High
**Evidence**:
- `docs/atlas/data-flow/data-flow.mmd:31-37` routes `POST /api/project/save` through `writeA3P / writeProject` into a JSZip-backed archive sink.
- `docs/atlas/api-contracts/README.md:17,44-45` describes `/api/project/save` as a placeholder/copy proof path.
- `POST /api/project/save` delegates to `projectService.saveProject()` (`src/server/routes/project-routes.ts:4-13`), which builds the current project and serializes it with `writeA3P()` before writing `saved-project.a3p` (`src/server/project-service.ts:142-172`).
- code_quote: `const a3pBytes = await writeA3P(currentProject);`

**Impact**: Engineers tracing `/api/project/save` through the atlas get conflicting signals about whether the REST endpoint serializes an archive or only emits proof artifacts.
**Fix**: Align `data-flow` and `api-contracts` around the route-to-service-to-`writeA3P` path, and document any remaining state fidelity limits separately from archive serialization.
