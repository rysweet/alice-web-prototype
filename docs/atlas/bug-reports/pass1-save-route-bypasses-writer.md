## Bug: REST save route bypasses the archive writer stack

**Layer**: api-contracts × data-flow
**Severity**: High
**Pass**: 1
**Evidence**:
- `docs/atlas/data-flow/data-flow.mmd:31-37` routes `POST /api/project/save` through `writeA3P / writeProject` into a JSZip-backed archive sink.
- `src/server.ts:219-245` never calls `writeA3P()` or `writeProject()`; it copies the existing `.a3p` or writes a placeholder buffer, then records a proof artifact.
- code_quote: `if (state.projectPath && fs.existsSync(state.projectPath)) { fs.copyFileSync(state.projectPath, savedProjectPath); } else { fs.writeFileSync(savedProjectPath, createMinimalA3pBuffer()); }`

**Impact**: Engineers tracing `/api/project/save` through the atlas will assume the REST endpoint exercises the real archive serializer, but the live route only produces evidence-oriented files. That hides the real boundary between the eatme proof path and the true project serialization stack.
**Fix**: Split the REST save flow from the `project-io` / `a3p-writer` save flow in both `data-flow` and `api-contracts`, and show `/api/project/save` as the lightweight copy-or-placeholder path it currently is.
