## Bug: Event registration docs under-declare the request contract

**Layer**: api-contracts × docs
**Severity**: Medium
**Pass**: 1
**Evidence**:
- `docs/atlas/api-contracts/README.md:20` documents `/api/events/register` as `{ eventType, handlerName?, key?, target?, useCapture?, targetObjects?, threshold? }`.
- `docs/api-reference.md:227-231` marks `handlerName` as required and omits `target`, `useCapture`, `targetObjects`, and `threshold` from the request table.
- `src/events.ts:165-193` defaults `handlerName` and actively reads `useCapture`, `target`, `targetObjects`, and `threshold`; `test/events.test.ts:78-137` covers omitted `handlerName` plus proximity registrations with `targetObjects` and `threshold`.
- code_quote: `const handlerName = request.handlerName ?? "handler";`

**Impact**: Consumers following `docs/api-reference.md` will send incomplete payloads and miss valid capabilities, while the atlas and implementation support a richer event contract. This creates avoidable integration errors around proximity and capture-style registrations.
**Fix**: Update `docs/api-reference.md` so the request table matches the atlas/code truth: `handlerName` optional, and `target`, `useCapture`, `targetObjects`, and `threshold` documented.
