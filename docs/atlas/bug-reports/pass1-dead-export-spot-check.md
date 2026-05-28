## Bug: Spot-check confirmed dead exported helpers in smaller modules

**Layer**: ast-lsp-bindings × compile-deps
**Severity**: Low
**Pass**: 1
**Evidence**:
- `docs/atlas/ast-lsp-bindings/README.md:13-16` already flags 80 local dead-export candidates from the barrel/static scan.
- Manual grep spot-checks found exported helpers with no references outside their defining files: `src/search/resolvers.ts:85` (`walkBinaryExpression`), `src/story-api/entities.ts:30` (`cloneEntityBoundingBox`), `src/story-api/entities.ts:101` (`captureEntityTransform`), `src/story-api/entities.ts:140` (`ensureJointedModel`), and `src/story-api/entities.ts:171` (`describeJointedModel`).
- Grepping `src/` and `test/` for those symbol names returns only the defining lines (or same-file self-use), with no import/use sites elsewhere.
- code_quote: `export function walkBinaryExpression(`

**Impact**: These exports enlarge the public surface and make the atlas/reporting noise worse, because symbols look supported and reusable even though no consumer depends on them. That increases maintenance cost and hides the truly live API surface.
**Fix**: Demote unused helpers to non-exported locals, or add real consumers/tests if they are intended to remain part of the supported public surface.
