# Tweedle Code Generator

The Tweedle code generator (`src/tweedle-codegen.ts`) converts a Tweedle AST
back into formatted Tweedle source code. It is the reverse of
`tweedle-parser.ts` — together they form a roundtrip: source → AST → source.
Pure function, no I/O, no external dependencies.

## Overview

The code generator takes a `ClassDecl` AST node (or any sub-node like
`Statement` or `Expression`) and produces valid Tweedle source text. The output
is semantically equivalent to the input — it may differ in whitespace and
optional parentheses, but parsing the output produces the same AST.

The typical data flow is:

```
.a3p ZIP  →  a3p-parser.ts (extract .twe text)
          →  tweedle-parser.ts (AST)
          →  [transform / modify AST]
          →  tweedle-codegen.ts (regenerate .twe text)
          →  a3p-writer.ts (write back to .a3p)
```

## Quick Start

```typescript
import { parseTweedle } from "./tweedle-parser.js";
import { generateTweedle } from "./tweedle-codegen.js";

const source = `
class Greeter extends SScene {
  Greeter() {
    this.greeting <- "hello";
  }

  void myFirstMethod() {
    this.bunny.say("Hello, world!");
  }
}
`;

const ast = parseTweedle(source);
const output = generateTweedle(ast);
console.log(output);
```

Output:

```tweedle
class Greeter extends SScene {
  Greeter() {
    this.greeting <- "hello";
  }

  void myFirstMethod() {
    this.bunny.say("Hello, world!");
  }
}
```

### Roundtrip Verification

```typescript
import { parseTweedle } from "./tweedle-parser.js";
import { generateTweedle } from "./tweedle-codegen.js";

const ast1 = parseTweedle(source);
const regenerated = generateTweedle(ast1);
const ast2 = parseTweedle(regenerated);

// ASTs are structurally identical
JSON.stringify(ast1) === JSON.stringify(ast2); // true
```

## API Reference

### `generateTweedle(node: ClassDecl): string`

Generate Tweedle source code from a class declaration AST.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `node` | `ClassDecl` | A parsed class declaration AST node |

**Returns:** Formatted Tweedle source code as a string.

**Throws:**

| Error | Condition |
|-------|-----------|
| `TweedleCodegenError` | Input is `null` or `undefined` |
| `TweedleCodegenError` | AST depth exceeds 100 levels (depth guard) |
| `TweedleCodegenError` | Unknown AST node type encountered |

**Example:**

```typescript
const ast = parseTweedle(source);
const code = generateTweedle(ast);
```

### `generateStatement(node: Statement): string`

Generate Tweedle source for a single statement. Useful for code snippets or
partial generation.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `node` | `Statement` | A statement AST node |

**Returns:** Formatted Tweedle source fragment (no trailing newline).

**Example:**

```typescript
import { generateStatement } from "./tweedle-codegen.js";

const stmt: Statement = {
  type: "Return",
  expression: { type: "Literal", value: 42, literalType: "number" },
};
generateStatement(stmt); // "return 42;"
```

### `generateExpression(node: Expression): string`

Generate Tweedle source for a single expression.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `node` | `Expression` | An expression AST node |

**Returns:** Tweedle expression source text (no semicolon, no newline).

**Example:**

```typescript
import { generateExpression } from "./tweedle-codegen.js";

const expr: Expression = {
  type: "BinaryOp",
  operator: "+",
  left: { type: "Literal", value: 1, literalType: "number" },
  right: { type: "Literal", value: 2, literalType: "number" },
};
generateExpression(expr); // "1 + 2"
```

### `TweedleCodegenError`

Custom error class for code generation failures.

```typescript
export class TweedleCodegenError extends Error {
  constructor(
    message: string,
    public readonly nodeType: string,
  );
}
```

| Property | Description |
|----------|-------------|
| `nodeType` | The AST node type that caused the error (or `"null"` for null input) |

## Formatting Rules

The code generator produces consistently formatted output:

| Rule | Value | Rationale |
|------|-------|-----------|
| Indentation | 2 spaces per level | Matches existing codebase style |
| Braces | Opening brace on same line | Tweedle convention |
| Blank lines | Between methods/constructors | Readability |
| Semicolons | After every statement | Required by Tweedle grammar |
| Trailing newline | Yes (single `\n` at end) | POSIX convention |

## Node Generation Reference

### Class Declaration

```tweedle
class ClassName extends SuperClass {
  // fields, constructors, methods
}
```

With `models`:

```tweedle
class ClassName extends SuperClass models ModelType {
  // ...
}
```

### Constructor

Constructors use the class name (Tweedle constructors are not anonymous):

```tweedle
  ClassName(DecimalNumber x, TextString name) {
    // body
  }
```

### Method

```tweedle
  void myMethod(DecimalNumber amount) {
    // body
  }
```

Static methods:

```tweedle
  static DecimalNumber compute(DecimalNumber x) {
    return x * 2;
  }
```

### Field

```tweedle
  DecimalNumber score <- 0;
  constant TextString GREETING <- "hello";
  static WholeNumber count <- 0;
```

### Statements

#### DoInOrder / DoTogether

```tweedle
  doInOrder {
    this.bunny.say("Hello!");
    this.bunny.move(1.0);
  }

  doTogether {
    this.bunny.turn(0.5);
    this.cat.turn(0.5);
  }
```

#### IfElse

```tweedle
  if (x > 0) {
    this.bunny.say("positive");
  } else {
    this.bunny.say("non-positive");
  }
```

Without else:

```tweedle
  if (x > 0) {
    this.bunny.say("positive");
  }
```

#### ForEach

```tweedle
  forEach (SBiped character in this.getCharacters()) {
    character.say("Hello!");
  }
```

#### CountUpTo

```tweedle
  countUpTo (10) {
    this.bunny.hop();
  }
```

#### Return

```tweedle
  return x + 1;
  return;
```

#### LocalVariableDeclaration

```tweedle
  DecimalNumber total <- 0;
  constant TextString name <- "Alice";
```

#### ExpressionStatement

```tweedle
  this.bunny.say("Hello!");
```

#### DisabledBlock

Disabled blocks are emitted verbatim:

```tweedle
  /* disabled code */
```

#### WhileLoop

```tweedle
  while (count > 0) {
    this.bunny.hop();
    count <- count - 1;
  }
```

#### TryCatch

```tweedle
  try {
    this.bunny.moveTo(this.cat);
  } catch (Exception e) {
    this.bunny.say("Error!");
  }
```

#### SwitchCase

Each case has an independent body (no fall-through). `break` is implicit.

```tweedle
  switch (this.mode) {
    case 1: {
      this.bunny.say("Mode 1");
    }
    case 2: {
      this.bunny.say("Mode 2");
    }
    default: {
      this.bunny.say("Unknown");
    }
  }
```

Without default:

```tweedle
  switch (this.color) {
    case "red": {
      this.setColor(Color.RED);
    }
    case "blue": {
      this.setColor(Color.BLUE);
    }
  }
```

### Expressions

#### Literals

| Type | Example output |
|------|---------------|
| Number (integer) | `42` |
| Number (decimal) | `3.14` |
| String | `"hello \"world\""` |
| Boolean | `true`, `false` |
| Null | `null` |

#### String Escaping

The code generator re-escapes special characters in string literals:

| Character | Escaped form |
|-----------|-------------|
| `\` | `\\` |
| `"` | `\"` |
| newline | `\n` |
| tab | `\t` |
| carriage return | `\r` |

This is necessary because the parser unescapes on read; the code generator
must reverse the transformation to produce valid Tweedle source.

#### Identifiers and Members

```tweedle
myVariable
this.bunny
this.bunny.position
```

#### Method Invocations

Positional arguments:

```tweedle
this.bunny.say("Hello!")
doSomething(1, 2, 3)
```

Named arguments:

```tweedle
this.bunny.move(direction: UP, amount: 1.0)
```

#### New Instance

```tweedle
new Color(1.0, 0.0, 0.0)
```

#### New Array

```tweedle
new DecimalNumber[] {1, 2, 3}
```

With size:

```tweedle
new DecimalNumber[10]
```

#### Binary Operations

```tweedle
x + y
a == b
left && right
```

#### Unary Operations

```tweedle
!done
-amount
```

#### Assignment

```tweedle
this.score <- 100
```

#### Array Access

```tweedle
items[0]
```

#### Type Cast

```tweedle
(value as DecimalNumber)
```

#### InstanceOf

```tweedle
(entity instanceof SBiped)
```

#### Parenthesized

```tweedle
(a + b)
```

#### ArrayLiteral

```tweedle
{1, 2, 3}
{"hello", "world"}
```

Empty array literal:

```tweedle
{}
```

### Parameters

```tweedle
DecimalNumber x
TextString name
DecimalNumber... values
SBiped character <- null
```

Varargs use the `...` suffix. Default values follow `<-`.

### Type References

| TypeRef | Output |
|---------|--------|
| `SimpleTypeRef("DecimalNumber", false)` | `DecimalNumber` |
| `SimpleTypeRef("DecimalNumber", true)` | `DecimalNumber[]` |
| `VoidTypeRef` | `void` |
| `LambdaTypeRef("(D)->V")` | `(D)->V` |

## Number Formatting

Numbers are emitted using `String(value)`, which handles both integers and
decimals without precision loss:

| Value | Output |
|-------|--------|
| `42` | `"42"` |
| `3.14` | `"3.14"` |
| `0` | `"0"` |
| `0.5` | `"0.5"` |
| `-1` | `"-1"` |

## Security

| Concern | Mitigation |
|---------|------------|
| Deep/recursive ASTs cause stack overflow | Depth guard at 100 levels |
| Null/undefined input | Explicit null-check with `TweedleCodegenError` |
| Unknown node types | Explicit error on unrecognized `type` field |
| No eval, no dynamic code execution | Pure string concatenation only |
| String injection via literals | All string values are re-escaped |

## Module Exports

```typescript
// Main entry point
import { generateTweedle } from "./tweedle-codegen.js";

// Sub-node generators (for partial codegen)
import { generateStatement, generateExpression } from "./tweedle-codegen.js";

// Error class
import { TweedleCodegenError } from "./tweedle-codegen.js";
```

## Architecture

```
src/
  tweedle-parser.ts    — AST parser (existing, unchanged)
  tweedle-codegen.ts   — Code generator (NEW)
test/
  tweedle-codegen.test.ts — ~45 tests: per-node-type generation,
                            roundtrip parse→generate→parse, string escaping,
                            depth guard, null input, edge cases
```

The code generator has **zero new dependencies**. It imports only the AST types
(`ClassDecl`, `MethodDecl`, `FieldDecl`, `ConstructorDecl`, `Statement`,
`Expression`, `TypeRef`, `Parameter`, `Argument`) from `tweedle-parser.ts` as
type-only imports. It handles all statement types (`WhileLoop`, `TryCatch`,
`SwitchCase` included) and all expression types (`ArrayLiteral` included).

## Limitations

- **Whitespace is normalized.** The generator does not preserve original
  whitespace or comments. Output uses consistent 2-space indentation.
- **Comments are lost.** The parser does not capture comments in the AST, so
  the generator cannot reproduce them.
- **Annotations are not emitted.** The parser recognizes `@` annotations but
  they are not stored in `ClassDecl`; the generator does not emit them.
- **Operator precedence parentheses.** The generator does not add
  disambiguation parentheses based on operator precedence. It relies on the
  AST's `Parenthesized` nodes to preserve grouping from the original source.
- **`Block` statements.** The parser emits `Block` nodes for bare `{ ... }`
  blocks. The generator emits them as indented brace-wrapped bodies.
