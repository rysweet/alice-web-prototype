## Bug: Dead exported helper candidates in smaller modules

**Layer**: ast-lsp-bindings × compile-deps
**Severity**: Low
**Evidence**:
- `docs/atlas/ast-lsp-bindings/README.md:13-16` already flags 80 local dead-export candidates from the barrel/static scan.
- Repo-local reference checks identify exported helpers with no references outside their defining files: `src/search/resolvers.ts:85` (`walkBinaryExpression`), `src/story-api/entities.ts:30` (`cloneEntityBoundingBox`), `src/story-api/entities.ts:101` (`captureEntityTransform`), `src/story-api/entities.ts:140` (`ensureJointedModel`), and `src/story-api/entities.ts:171` (`describeJointedModel`).
- In-repository consumers are limited to the defining lines or same-file self-use; no import/use sites appear elsewhere in `src/` or `test/`.
- code_quote: `export function walkBinaryExpression(`

**Impact**: These exports enlarge the public surface and make the atlas/reporting noise worse, because symbols look supported and reusable even though no consumer depends on them. That increases maintenance cost and hides the truly live API surface.
**Fix**: Demote unused helpers to non-exported locals, or add real consumers/tests if they are intended to remain part of the supported public surface.
