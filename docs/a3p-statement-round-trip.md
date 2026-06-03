# A3P Statement Round-Trip Coverage

This document describes the A3P statement coverage contract: exported parser and
writer inventories, parser-equivalent round-trip cases, writer-only lowering
cases, and fail-loud behavior for unsupported statement kinds.

Use this page when you add, debug, or review A3P statement support. For complete
archive read/write behavior, see [Project IO](./project-io.md). For the runtime
meaning of `AliceStatement` kinds, see
[Tweedle statement VM execution](./statement-execution.md).

## Contents

- [Quick start](#quick-start)
- [Coverage contract](#coverage-contract)
- [Parser-recognized statement kinds](#parser-recognized-statement-kinds)
- [Writer-supported statement kinds](#writer-supported-statement-kinds)
- [Writer-only lowering shapes](#writer-only-lowering-shapes)
- [Unsupported statements](#unsupported-statements)
- [Adding a new statement kind](#adding-a-new-statement-kind)
- [Configuration](#configuration)

## Quick start

Run the statement round-trip gate with the same memory setting used by the
default workflow:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
```

Round-trip usage:

```typescript
import { parseA3P } from "./a3p-parser.js";
import { writeA3P } from "./a3p-writer.js";

const original = await parseA3P(inputBytes);
const outputBytes = await writeA3P(original);
const reparsed = await parseA3P(outputBytes);

console.log(reparsed.methods.flatMap((method) => method.statements.map((stmt) => stmt.kind)));
```

## Coverage contract

The hardening work exposes two public inventories:

```typescript
import { PARSED_A3P_STATEMENT_KINDS } from "./a3p-parser.js";
import { SUPPORTED_A3P_STATEMENT_KINDS } from "./a3p-writer.js";
```

Tests must assert exact set equality against these inventories. A statement kind
is covered only when it has either:

1. A parser-equivalent round-trip test:
   `AliceStatement` -> `writeA3P()` -> `parseA3P()` returns the same kind and
   required fields.
2. A writer-only lowering test: `writeA3P()` accepts a runtime-only kind and
   emits the documented Alice XML shape.

Do not use warnings, comments, or silent drops as fallback behavior. The writer
must reject unsupported statement kinds before returning archive bytes.

## Parser-recognized statement kinds

`PARSED_A3P_STATEMENT_KINDS` contains every `AliceStatement.kind` that
`parseA3P()` intentionally recognizes from Alice `programType.xml`.

| `AliceStatement.kind` | Alice XML shape | Round-trip requirement |
| --- | --- | --- |
| `Comment` | `org.lgna.project.ast.Comment` | Preserve `expression` from the comment text. |
| `MethodCall` | `ExpressionStatement` with `MethodInvocation` | Preserve `object`, `method`, and ordered `arguments`. |
| `CountLoop` | `org.lgna.project.ast.CountLoop` | Preserve nested `body`; count expression parsing is not yet faithful. |
| `IfElse` | `org.lgna.project.ast.ConditionalStatement` | Preserve nested `ifBody` and `elseBody`; condition parsing is not yet faithful. |
| `ReturnStatement` | `org.lgna.project.ast.ReturnStatement` | Recognize return statements; expression parsing is not yet faithful. |
| `VariableDeclaration` | `org.lgna.project.ast.LocalDeclarationStatement` | Recognize local declarations; declaration metadata parsing is not yet faithful. |
| `DoInOrder` | `org.lgna.project.ast.DoInOrder` | Preserve ordered nested `body` statements. |
| `DoTogether` | `org.lgna.project.ast.DoTogether` | Preserve parallel nested `body` statements. |
| `WhileLoop` | `org.lgna.project.ast.WhileLoop` | Preserve nested `body`; condition parsing is not yet faithful. |
| `ForEachInArrayLoop` | `org.lgna.project.ast.ForEachInArrayLoop` | Recognize collection loops and nested `body`; item and collection expressions are not yet faithful. |
| `ForEachInIterableLoop` | `org.lgna.project.ast.ForEachInIterableLoop` | Recognize collection loops and nested `body`; item and collection expressions are not yet faithful. |
| `EachInArrayTogether` | `org.lgna.project.ast.EachInArrayTogether` | Recognize together collection loops and nested `body`; item and collection expressions are not yet faithful. |
| `EachInIterableTogether` | `org.lgna.project.ast.EachInIterableTogether` | Recognize together collection loops and nested `body`; item and collection expressions are not yet faithful. |

Parser tests must include at least one synthetic project for each parser kind.
Container statements must include nested body assertions, not only top-level
kind assertions.

## Writer-supported statement kinds

`SUPPORTED_A3P_STATEMENT_KINDS` contains every parser-equivalent
`AliceStatement.kind` that `writeA3P()` can emit faithfully. It is intentionally
a subset of `PARSED_A3P_STATEMENT_KINDS`: the parser may recognize Alice XML
that the writer rejects rather than corrupting unsupported expression metadata.

`LOWERED_A3P_STATEMENT_KINDS` contains runtime-only input forms that the writer
accepts by lowering them to a visible Alice XML representation that reparses as a
different kind.

| `AliceStatement.kind` | Writer behavior | Parser-equivalent round-trip |
| --- | --- | --- |
| `Comment` | Emit Alice `Comment`. | Yes |
| `MethodCall` | Emit `ExpressionStatement` with `MethodInvocation`. | Yes |
| `CountLoop` | Emit Alice `CountLoop` with nested `body`. | Body-only |
| `IfElse` | Emit Alice `ConditionalStatement` with a placeholder true expression and both branches. | Body-only |
| `ReturnStatement` | Emit Alice `ReturnStatement`. | Kind-only |
| `VariableDeclaration` | Emit Alice `LocalDeclarationStatement`. | Kind-only |
| `DoInOrder` | Emit Alice `DoInOrder` with child `body`. | Yes |
| `DoTogether` | Emit Alice `DoTogether` with child `body`. | Yes |
| `WhileLoop` | Emit Alice `WhileLoop` with nested `body`. | Body-only |
| `VariableAssignment` | Lower to an Alice comment marker. | No |
| `EventListener` | Lower to an Alice comment marker. | No |

The writer rejects `ForEachInArrayLoop`, `ForEachInIterableLoop`,
`EachInArrayTogether`, `EachInIterableTogether`, and runtime `ForEachLoop`
inputs. The parser currently does not preserve the full item and
array/iterable expression trees needed to re-emit those loops faithfully, so
failing loudly is safer than fabricating wrong-typed XML.

## Writer-only lowering shapes

Writer-only cases are supported input forms that intentionally reparse as an
Alice XML form rather than as the original runtime kind. They are lossy,
visible lowerings used for runtime-only statement kinds that have no faithful
Alice statement node in the current writer.

### `VariableAssignment`

Input:

```typescript
const statement = {
  kind: "VariableAssignment",
  name: "this.score",
  value: "this.score + 1",
};
```

Alice XML shape:

```text
node[type="org.lgna.project.ast.Comment"]
  property[name="text"] = "VariableAssignment:${statement.name}=${statement.value}"
```

The test must assert that no fake `org.lgna.project.ast.VariableAssignment`
node is emitted and that the reparsed statement is a `Comment` containing the
assignment marker.

### `EventListener`

Input:

```typescript
const statement = {
  kind: "EventListener",
  object: "this",
  event: "addSceneActivationListener",
  body: [{ kind: "MethodCall", object: "this.bunny", method: "say", arguments: ["hello"] }],
};
```

Alice XML shape:

```text
node[type="org.lgna.project.ast.Comment"]
  property[name="text"] = "EventListener:${statement.event}"
```

The test must assert that no fake `org.lgna.project.ast.EventListener` node is
emitted and that the reparsed statement is a `Comment` containing the event
marker.

## Unsupported statements

`writeA3P()` throws for any `AliceStatement.kind` that is neither a faithfully
supported parser-equivalent kind nor an explicitly lowered runtime-only kind.

```typescript
import { writeA3P } from "./a3p-writer.js";
import type { AliceProject } from "./a3p-parser.js";

const project: AliceProject = {
  version: "3.6.0.0",
  projectName: "UnsupportedStatementExample",
  sceneObjects: [],
  methods: [
    {
      name: "run",
      isFunction: false,
      returnType: "void",
      parameters: [],
      statements: [{ kind: "TryCatch", tryBody: [], catchBody: [] }],
    },
  ],
};

await expect(writeA3P(project)).rejects.toThrow(/Unsupported A3P statement kind: TryCatch/);
```

Unsupported statements must not be dropped, converted to comments, or hidden
behind warnings. Add explicit writer support and tests before emitting a new
kind. `TryCatch`, `ThrowStatement`, `CountUpTo`, and other runtime-only kinds
remain unsupported until they are added to the writer inventory with concrete
Alice XML output shapes.

## Adding a new statement kind

1. Add the parser kind to `PARSED_A3P_STATEMENT_KINDS` only when `parseA3P()`
   intentionally recognizes that Alice XML form and preserves its required
   fields.
2. Add the writer kind to `SUPPORTED_A3P_STATEMENT_KINDS` only when
   `writeA3P()` intentionally accepts that `AliceStatement.kind`.
3. Add one parser-equivalent round-trip case if the kind parses back as itself.
4. Add one writer-only lowering case if the writer accepts a runtime kind that
   lowers to a different Alice XML/parser kind.
5. Add unsupported-statement coverage when a kind remains intentionally
   unsupported.

Do not add permissive fallback behavior. Unknown A3P writer statements must fail
loudly so projects are not corrupted by silent statement loss.

## Configuration

There is no runtime feature flag for statement coverage. The validation gates use
the repository test and build commands with an increased Node.js heap:

```bash
NODE_OPTIONS=--max-old-space-size=32768 npm test
NODE_OPTIONS=--max-old-space-size=32768 npm run build
```

The memory setting can be exported once per shell:

```bash
export NODE_OPTIONS=--max-old-space-size=32768
npm test
npm run build
```

Keep this setting out of source files and package scripts unless the repository
standard changes globally.

## Relationship to other statement systems

| System | Module | Relationship |
| --- | --- | --- |
| A3P parser | `src/a3p-parser.ts` | Exports `PARSED_A3P_STATEMENT_KINDS`; reads Alice `programType.xml` into `AliceStatement` objects. |
| A3P writer | `src/a3p-writer.ts` | Exports `SUPPORTED_A3P_STATEMENT_KINDS` and `LOWERED_A3P_STATEMENT_KINDS`; writes supported `AliceStatement` objects back into Alice-compatible XML. |
| Serialization | `src/serialization.ts` | Serializes `AliceProject` to the simplified project XML/JSON format, not native A3P XML. |
| Tweedle VM | `src/tweedle-vm-core-setup.ts` | Executes runtime statement kinds, including kinds that are writer-only lowerings for A3P. |
