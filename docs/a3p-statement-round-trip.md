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
| `CountLoop` | `org.lgna.project.ast.CountLoop` | Preserve `count` or `countExpression` and nested `body`. |
| `IfElse` | `org.lgna.project.ast.ConditionalStatement` | Preserve `condition`, `ifBody`, and `elseBody`. |
| `ReturnStatement` | `org.lgna.project.ast.ReturnStatement` | Preserve `expression`. |
| `VariableDeclaration` | `org.lgna.project.ast.LocalDeclarationStatement` | Preserve `name`, `varType`, and `value`. |
| `DoInOrder` | `org.lgna.project.ast.DoInOrder` | Preserve ordered nested `body` statements. |
| `DoTogether` | `org.lgna.project.ast.DoTogether` | Preserve parallel nested `body` statements. |
| `WhileLoop` | `org.lgna.project.ast.WhileLoop` | Preserve `condition` and nested `body`. |
| `ForEachInArrayLoop` | `org.lgna.project.ast.ForEachInArrayLoop` | Preserve `itemType`, `itemName`, `collection`, and nested `body`. |
| `EachInArrayTogether` | `org.lgna.project.ast.EachInArrayTogether` | Preserve `itemType`, `itemName`, `collection`, and nested `body`. |

Parser tests must include at least one synthetic project for each parser kind.
Container statements must include nested body assertions, not only top-level
kind assertions.

## Writer-supported statement kinds

`SUPPORTED_A3P_STATEMENT_KINDS` contains every `AliceStatement.kind` that
`writeA3P()` accepts as input. It includes all parser-equivalent kinds plus the
writer-only lowering cases below.

| `AliceStatement.kind` | Writer behavior | Parser-equivalent round-trip |
| --- | --- | --- |
| `Comment` | Emit Alice `Comment`. | Yes |
| `MethodCall` | Emit `ExpressionStatement` with `MethodInvocation`. | Yes |
| `CountLoop` | Emit Alice `CountLoop` with count and `body`. | Yes |
| `IfElse` | Emit Alice `ConditionalStatement` with condition and both branches. | Yes |
| `ReturnStatement` | Emit Alice `ReturnStatement` with return expression. | Yes |
| `VariableDeclaration` | Emit Alice `LocalDeclarationStatement` with declaration metadata and initializer. | Yes |
| `DoInOrder` | Emit Alice `DoInOrder` with child `body`. | Yes |
| `DoTogether` | Emit Alice `DoTogether` with child `body`. | Yes |
| `WhileLoop` | Emit Alice `WhileLoop` with condition and `body`. | Yes |
| `ForEachInArrayLoop` | Emit Alice `ForEachInArrayLoop` with item metadata, collection, and `body`. | Yes |
| `EachInArrayTogether` | Emit Alice `EachInArrayTogether` with item metadata, collection, and `body`. | Yes |
| `VariableAssignment` | Lower to an Alice assignment expression statement. | No |
| `EventListener` | Lower to an Alice listener registration method invocation. | No |
| `ForEach` | Lower the runtime foreach statement to Alice `ForEachInArrayLoop`. | No |

Use `ForEach` for the `AliceStatement.kind` accepted by the A3P writer.
`ForEachLoop` is the AST class name used elsewhere in the project; it is not the
writer inventory name.

## Writer-only lowering shapes

Writer-only cases are supported input forms that intentionally reparse as an
Alice XML form rather than as the original runtime kind. Tests must inspect
`programType.xml` and assert the node and property names below.

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
node[type="org.lgna.project.ast.ExpressionStatement"]
  property[name="expression"]
    node[type="org.lgna.project.ast.AssignmentExpression"]
      property[name="leftHandSide"]  -> expression for statement.name
      property[name="rightHandSide"] -> expression for statement.value
```

The test must assert the `ExpressionStatement`, `AssignmentExpression`,
`leftHandSide`, and `rightHandSide` markers and verify that the emitted XML
contains the assignment target and value source.

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
node[type="org.lgna.project.ast.ExpressionStatement"]
  property[name="expression"]
    node[type="org.lgna.project.ast.MethodInvocation"]
      property[name="method"]
        node[type="org.lgna.project.ast.JavaMethod"]
          property[name="name"] = statement.event
      property[name="callerObject"] = statement.object when object is not "this"
      property[name="requiredArguments"]
        collection[type="java.util.ArrayList"]
          node[type="org.lgna.project.ast.LambdaExpression"]
            property[name="body"]
              node[type="org.lgna.project.ast.BlockStatement"]
                property[name="statements"] -> lowered statement.body nodes
```

The test must assert that listener lowering is a method invocation, not a custom
opaque node, and that the callback body contains the lowered child statements.

### `ForEach`

Input:

```typescript
const statement = {
  kind: "ForEach",
  itemType: "org.lgna.story.SThing",
  itemName: "item",
  collection: "this.animals",
  body: [{ kind: "MethodCall", object: "item", method: "say", arguments: ["hello"] }],
};
```

Alice XML shape:

```text
node[type="org.lgna.project.ast.ForEachInArrayLoop"]
  property[name="itemType"]   -> statement.itemType
  property[name="itemName"]   -> statement.itemName
  property[name="array"]      -> expression for statement.collection
  property[name="body"]
    node[type="org.lgna.project.ast.BlockStatement"]
      property[name="statements"]
        collection[type="java.util.ArrayList"]
          ...lowered statement.body nodes...
```

The parser-equivalent form for this XML is `ForEachInArrayLoop`, so `ForEach`
is a writer-only lowering case.

## Unsupported statements

`writeA3P()` throws for any `AliceStatement.kind` that is not in
`SUPPORTED_A3P_STATEMENT_KINDS`.

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
| A3P writer | `src/a3p-writer.ts` | Exports `SUPPORTED_A3P_STATEMENT_KINDS`; writes supported `AliceStatement` objects back into Alice-compatible XML. |
| Serialization | `src/serialization.ts` | Serializes `AliceProject` to the simplified project XML/JSON format, not native A3P XML. |
| Tweedle VM | `src/tweedle-vm-core-setup.ts` | Executes runtime statement kinds, including kinds that are writer-only lowerings for A3P. |
