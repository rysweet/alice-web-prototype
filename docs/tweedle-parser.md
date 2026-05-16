# Tweedle AST Parser

The Tweedle parser (`src/tweedle-parser.ts`) transforms Tweedle source code into
a typed AST. Tweedle is the programming language embedded in Alice `.a3p` project
files — each `.twe` file inside the archive contains one class declaration. The
parser handles all constructs needed for grading student work in Lessons 1–4 and
all library code in the SceneGraphLibrary.

## Overview

The parser takes a raw Tweedle source string and returns a `TweedleTypeDeclaration`
AST node (currently always a `TweedleClassDeclaration`). It is a **pure function**
with no I/O, no dependencies beyond TypeScript, and no side effects.

The typical data flow is:

```
.a3p ZIP  →  a3p-parser.ts (extract .twe text)  →  tweedle-parser.ts (AST)  →  tweedle-vm.ts (execute)
```

## Quick Start

```typescript
import { parseTweedle } from "./tweedle-parser.js";

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

console.log(ast.type);         // "ClassDeclaration"
console.log(ast.name);         // "Greeter"
console.log(ast.superClass);   // "SScene"
console.log(ast.methods[0].name); // "myFirstMethod"
```

## API Reference

### `parseTweedle(source: string): TweedleTypeDeclaration`

The single public entry point. Parses one Tweedle type declaration from source
text.

**Parameters:**

| Parameter | Type     | Description |
|-----------|----------|-------------|
| `source`  | `string` | Tweedle source code (contents of one `.twe` file) |

**Returns:** A `TweedleTypeDeclaration` — currently always `TweedleClassDeclaration`.

**Throws:** `TweedleParseError` on syntax errors (see [Error Handling](#error-handling)).

**Security limits:**

| Limit | Value | Error |
|-------|-------|-------|
| Max source length | 1 MB (1,048,576 chars) | `TweedleParseError` |
| Max parse depth | 100 levels | `TweedleParseError` |

## AST Node Types

All AST nodes use a discriminated union on the `type` field. This avoids
collision with `AliceStatement.kind` from `a3p-parser.ts`.

### Declarations

#### `TweedleClassDeclaration`

```typescript
interface TweedleClassDeclaration {
  type: "ClassDeclaration";
  name: string;
  superClass: string | null;
  modelType: string | null;       // from `models` clause
  visibility: string | null;      // @CompletelyHidden, @TuckedAway, @PrimeTime
  constructors: TweedleConstructorDeclaration[];
  methods: TweedleMethodDeclaration[];
  fields: TweedleFieldDeclaration[];
}
```

`modelType` captures the `models` clause (`class Scene extends SScene models Scene`).
`visibility` stores Alice annotation strings used in the SceneGraphLibrary.

#### `TweedleMethodDeclaration`

```typescript
interface TweedleMethodDeclaration {
  type: "MethodDeclaration";
  name: string;
  returnType: TweedleTypeRef;
  parameters: TweedleParameter[];
  body: TweedleStatement[];
  isStatic: boolean;
  visibility: string | null;
}
```

#### `TweedleConstructorDeclaration`

```typescript
interface TweedleConstructorDeclaration {
  type: "ConstructorDeclaration";
  name: string;
  parameters: TweedleParameter[];
  body: TweedleStatement[];
  visibility: string | null;
}
```

Distinguished from methods via lookahead: `IDENTIFIER '('` without a preceding
return type is a constructor.

#### `TweedleFieldDeclaration`

```typescript
interface TweedleFieldDeclaration {
  type: "FieldDeclaration";
  name: string;
  fieldType: TweedleTypeRef;
  initializer: TweedleExpression | null;
  isStatic: boolean;
  isConstant: boolean;
  visibility: string | null;
}
```

### Type References

```typescript
type TweedleTypeRef =
  | { type: "SimpleTypeRef"; name: string; isArray: boolean }
  | { type: "VoidTypeRef" }
  | { type: "LambdaTypeRef"; raw: string };
```

`SimpleTypeRef` covers all named types including primitives (`WholeNumber`,
`DecimalNumber`, `TextString`, `Boolean`) and class types (`SBiped`, `SJoint`).
Array types like `SJoint[]` set `isArray: true`.

`LambdaTypeRef` stores lambda type signatures (e.g., `<SThing->Boolean>`) as an
opaque string. These appear in library code but are not used in Lessons 1–4.

### Parameters

```typescript
interface TweedleParameter {
  name: string;
  paramType: TweedleTypeRef;
  isVarArgs: boolean;             // for Type... name syntax
  defaultValue: TweedleExpression | null;
}
```

### Statements

All statement nodes satisfy the `TweedleStatement` union type.

| Node Type | Description |
|-----------|-------------|
| `DoInOrder` | `do in order { }` — explicit sequential block |
| `DoTogether` | `do together { }` — parallel execution block |
| `IfElse` | `if (condition) { } else { }` |
| `ForEach` | `for each Type item in collection { }` |
| `CountUpTo` | `count up to intExpression { }` |
| `Return` | `return expression;` |
| `ExpressionStatement` | Expression used as a statement (method calls, assignments) |
| `LocalVariableDeclaration` | `Type name <- value;` or `constant Type name <- value;` |
| `Block` | Bare `{ }` block (no special semantics) |
| `DisabledBlock` | `*< ... >*` NODE_DISABLE wrapped block (lexer skips content) |

#### Statement Node Shapes

```typescript
interface TweedleDoInOrder {
  type: "DoInOrder";
  body: TweedleStatement[];
}

interface TweedleDoTogether {
  type: "DoTogether";
  body: TweedleStatement[];
}

interface TweedleIfElse {
  type: "IfElse";
  condition: TweedleExpression;
  ifBody: TweedleStatement[];
  elseBody: TweedleStatement[] | null;
}

interface TweedleForEach {
  type: "ForEach";
  itemType: TweedleTypeRef;
  itemName: string;
  collection: TweedleExpression;
  body: TweedleStatement[];
}

interface TweedleCountUpTo {
  type: "CountUpTo";
  count: TweedleExpression;
  body: TweedleStatement[];
}

interface TweedleReturn {
  type: "Return";
  expression: TweedleExpression | null;
}

interface TweedleExpressionStatement {
  type: "ExpressionStatement";
  expression: TweedleExpression;
}

interface TweedleLocalVariableDeclaration {
  type: "LocalVariableDeclaration";
  name: string;
  varType: TweedleTypeRef;
  initializer: TweedleExpression;
  isConstant: boolean;
}

interface TweedleBlock {
  type: "Block";
  body: TweedleStatement[];
}

interface TweedleDisabledBlock {
  type: "DisabledBlock";
  raw: string;              // unparsed content between *< and >*
}
```

### Expressions

All expression nodes satisfy the `TweedleExpression` union type. Operator
precedence is handled by a Pratt parser.

| Node Type | Example | Description |
|-----------|---------|-------------|
| `MethodInvocation` | `this.bunny.say("hi")` | Chained method call |
| `MemberAccess` | `this.bunny` | Field / property access |
| `This` | `this` | Self reference |
| `Super` | `super`, `super.method()` | Superclass reference |
| `Identifier` | `bunny` | Variable or name reference |
| `Literal` | `42`, `"hello"`, `true`, `null` | Constant values |
| `NewInstance` | `new SBiped(resource: bunny)` | Object construction |
| `NewArray` | `new SThing[]{}` | Array creation |
| `BinaryOp` | `a + b`, `x .. y`, `a == b` | Binary operators |
| `UnaryOp` | `!flag`, `-value` | Unary prefix operators |
| `Assignment` | `this.name <- value` | Right-associative assignment |
| `ArrayAccess` | `arr[0]` | Array index access |
| `TypeCast` | `x as SBiped` | Type cast (produces dedicated node, not `BinaryOp`) |
| `InstanceOf` | `x instanceof SFlyer` | Type check (produces dedicated node, not `BinaryOp`) |
| `Parenthesized` | `(a + b)` | Grouping |

#### Expression Node Shapes

```typescript
interface TweedleMethodInvocation {
  type: "MethodInvocation";
  target: TweedleExpression;      // the object being called on
  methodName: string;
  arguments: TweedleArgument[];
}

interface TweedleArgument {
  name: string | null;            // null for positional, string for named (name: value)
  value: TweedleExpression;
}

interface TweedleMemberAccess {
  type: "MemberAccess";
  target: TweedleExpression;
  memberName: string;
}

interface TweedleThis {
  type: "This";
}

interface TweedleSuper {
  type: "Super";
}

interface TweedleLiteral {
  type: "Literal";
  value: number | string | boolean | null;
  literalType: "number" | "string" | "boolean" | "null";
}

interface TweedleNewInstance {
  type: "NewInstance";
  className: string;
  arguments: TweedleArgument[];
}

interface TweedleNewArray {
  type: "NewArray";
  elementType: TweedleTypeRef;
  elements: TweedleExpression[];  // items for `new T[]{a, b}`
  size: TweedleExpression | null; // size for `new T[n]`
}

interface TweedleBinaryOp {
  type: "BinaryOp";
  operator: string;               // "+", "-", "..", "==", etc.
  left: TweedleExpression;
  right: TweedleExpression;
}

interface TweedleUnaryOp {
  type: "UnaryOp";
  operator: string;               // "!", "-"
  operand: TweedleExpression;
}

interface TweedleAssignment {
  type: "Assignment";
  target: TweedleExpression;
  value: TweedleExpression;
}

interface TweedleArrayAccess {
  type: "ArrayAccess";
  target: TweedleExpression;
  index: TweedleExpression;
}

interface TweedleTypeCast {
  type: "TypeCast";
  expression: TweedleExpression;
  targetType: TweedleTypeRef;
}

interface TweedleInstanceOf {
  type: "InstanceOf";
  expression: TweedleExpression;
  testType: TweedleTypeRef;
}

interface TweedleParenthesized {
  type: "Parenthesized";
  expression: TweedleExpression;
}
```

## Operator Precedence

From lowest to highest precedence, matching the ANTLR grammar:

| Precedence | Operators | Associativity |
|------------|-----------|---------------|
| 1 | `<-` (assignment) | Right |
| 2 | `\|\|` | Left |
| 3 | `&&` | Left |
| 4 | `==`, `!=` | Left |
| 5 | `<`, `>`, `<=`, `>=`, `instanceof` | Left |
| 6 | `..` (string concat) | Left |
| 7 | `+`, `-` | Left |
| 8 | `*`, `/`, `%` | Left |
| 9 | `!`, `-` (unary) | Prefix |
| 10 | `.` (member access), `()` (call), `[]` (index), `as` | Left |

## Error Handling

### `TweedleParseError`

All parse failures throw `TweedleParseError`, a subclass of `Error` with
structured diagnostic fields:

```typescript
class TweedleParseError extends Error {
  line: number;       // 1-based line number
  column: number;     // 0-based column offset
  found: string;      // token text that was found
  expected: string;   // human-readable description of what was expected
}
```

**Example:**

```typescript
import { parseTweedle, TweedleParseError } from "./tweedle-parser.js";

try {
  parseTweedle("class { }");
} catch (e) {
  if (e instanceof TweedleParseError) {
    console.error(`Parse error at line ${e.line}:${e.column}`);
    console.error(`Found: ${e.found}`);
    console.error(`Expected: ${e.expected}`);
  }
}
```

Output:
```
Parse error at line 1:6
Found: {
Expected: class name (identifier)
```

### Unsupported Constructs

| Construct | Behavior |
|-----------|----------|
| Lambda expressions `(x) -> { ... }` | Throws `TweedleParseError` with message "Lambda expressions are not yet supported" |
| Enum declarations | Throws `TweedleParseError` with message "Enum declarations are not yet supported" |

These constructs are not used in Lessons 1–4 student code and can be added in
future iterations.

## Tweedle Language Constructs

### Class Declarations

```tweedle
class Scene extends SScene models Scene {
  // constructors, methods, fields
}
```

The `extends` clause is optional. The `models` clause is Alice-specific and
indicates the model type backing this class.

### Visibility Annotations

```tweedle
@CompletelyHidden
class InternalHelper extends SThing {
  @TuckedAway
  void helperMethod() { }

  @PrimeTime
  void publicMethod() { }
}
```

Three visibility levels are recognized and stored as strings:
- `@CompletelyHidden` — hidden from student view
- `@TuckedAway` — collapsed / advanced
- `@PrimeTime` — prominently displayed

### Constructors

```tweedle
Scene(SBiped bunny, SFlyer blueJay) {
  super();
  this.bunny <- bunny;
}
```

Disambiguated from methods by the absence of a return type before the name.

### Methods

```tweedle
void myFirstMethod() {
  this.bunny.say("Hello!");
}

DecimalNumber computeDistance(DecimalNumber x, DecimalNumber y) {
  return x + y;
}

static SThing[] getDefaultThings() {
  return new SThing[]{};
}
```

### Fields

```tweedle
SBiped bunny;
constant WholeNumber MAX_SIZE <- 10;
static TextString DEFAULT_NAME <- "unnamed";
```

### Named Arguments

Tweedle uses named arguments with the `name: value` syntax:

```tweedle
this.bunny.move(direction: MoveDirection.FORWARD, amount: 1.0);
```

Arguments can be positional or named. In the AST, each `TweedleArgument` has
a `name` field (`null` for positional arguments).

### Assignment Operator `<-`

Tweedle uses `<-` instead of `=` for assignment:

```tweedle
this.greeting <- "hello";
WholeNumber count <- 0;
```

The operator is right-associative and lowest precedence in expressions.

### String Concatenation `..`

Tweedle uses `..` for string concatenation (not `+`):

```tweedle
TextString fullName <- firstName .. " " .. lastName;
```

### Control Flow

```tweedle
// Do in order (explicit sequential block)
do in order {
  this.bunny.say("First");
  this.bunny.say("Second");
}

// Do together (parallel execution)
do together {
  this.bunny.move(direction: MoveDirection.FORWARD, amount: 1.0);
  this.cat.move(direction: MoveDirection.BACKWARD, amount: 1.0);
}

// If/else
if (this.bunny.isCollidingWith(this.cat)) {
  this.bunny.say("Found you!");
} else {
  this.bunny.say("Where are you?");
}

// For-each
for each SThing thing in this.getThings() {
  thing.move(direction: MoveDirection.UP, amount: 0.5);
}

// Count up to
count up to 5 {
  this.bunny.turn(direction: TurnDirection.LEFT, amount: 0.25);
}
```

### Disabled Blocks

Alice uses `*< ... >*` markers to disable code blocks in the IDE. The parser
recognizes these and produces `DisabledBlock` nodes:

```tweedle
*< this.bunny.say("This is disabled"); >*
```

### `$`-prefixed Identifiers

Identifiers like `$SceneGraph`, `$Clock`, and `$System` are valid per the
Tweedle lexer grammar. They reference built-in Alice services and appear
frequently in library code.

## Integration with a3p-parser

The `a3p-parser.ts` module parses `.a3p` ZIP archives into an `AliceProject`
using XML-based extraction. The Tweedle parser provides a complementary path:
it parses the raw `.twe` source text (Tweedle code) directly from the ZIP into
a higher-fidelity AST. A future integration will wire these together:

```typescript
import JSZip from "jszip";
import { parseTweedle } from "./tweedle-parser.js";
import * as fs from "fs";

const data = fs.readFileSync("project.a3p");
const zip = await JSZip.loadAsync(data);

// .twe files live inside the ZIP alongside the XML manifest
const tweEntry = zip.file("Scene.twe");
if (tweEntry) {
  const sceneSource = await tweEntry.async("string");
  const sceneAst = parseTweedle(sceneSource);
}
```

> **Note:** The current `parseA3P()` returns an `AliceProject` from the XML
> manifest; it does not yet expose raw `.twe` source text. The integration
> above reads `.twe` entries directly from the ZIP.

## Integration with tweedle-vm

The Tweedle VM (`src/tweedle-vm.ts`) currently operates on `AliceStatement`
nodes from the XML-based `a3p-parser.ts`. The Tweedle AST parser provides a
higher-fidelity AST that captures constructs the XML parser cannot represent
(named arguments, `do together`, proper expressions, type information).

A future bridge layer can convert `TweedleClassDeclaration` nodes into the
`AliceMethod[]` / `AliceStatement[]` format that the VM already consumes, or
the VM can be updated to walk the Tweedle AST directly.

## Security

The parser enforces defensive limits to prevent abuse:

| Guard | Limit | Behavior |
|-------|-------|----------|
| Source length | 1,048,576 characters (1 MB) | Throws `TweedleParseError` before tokenizing |
| Parse depth | 100 nested levels | Throws `TweedleParseError` mid-parse |
| Cursor advance | Every token consume must advance the position | Internal invariant; prevents infinite loops |

The parser produces an **inert AST** — it does not evaluate expressions,
execute code, or perform I/O. All AST nodes are plain data objects.

No regular expressions are used in the lexer hot path. The lexer is a
character-by-character scanner for predictable performance.

## Supported Tweedle Grammar Coverage

The parser covers the following ANTLR grammar rules from `TweedleParser.g4`:

| Grammar Rule | Status |
|-------------|--------|
| `typeDeclaration` | ✅ Class declarations |
| `classDeclaration` | ✅ Full support |
| `classBody` | ✅ Full support |
| `classBodyDeclaration` | ✅ Methods, constructors, fields |
| `memberDeclaration` | ✅ Full support |
| `methodDeclaration` | ✅ Full support |
| `constructorDeclaration` | ✅ Full support |
| `fieldDeclaration` | ✅ Full support |
| `block` | ✅ Full support |
| `blockStatement` | ✅ Full support |
| `statement` | ✅ All statement types |
| `expression` | ✅ All expression types |
| `primary` | ✅ Full support |
| `typeType` | ✅ Simple, void, array, lambda |
| `formalParameters` | ✅ With defaults and varargs |
| `enumDeclaration` | ❌ Not yet supported |
| `lambdaExpression` | ❌ Throws clear error |

## Examples

### Parsing a Student Scene File

```typescript
import { parseTweedle } from "./tweedle-parser.js";

const sceneSource = `
class Scene extends SScene models Scene {
  Scene(SBiped bunny) {
    super();
    this.bunny <- bunny;
  }

  void initializeEventListeners() {
    // event setup
  }

  void myFirstMethod() {
    this.bunny.moveAndOrientTo(target: this.camera, duration: 2.0);
    this.bunny.say("I can see you!");
  }
}
`;

const ast = parseTweedle(sceneSource);

// Walk the AST
for (const method of ast.methods) {
  console.log(`Method: ${method.name}`);
  console.log(`  Parameters: ${method.parameters.length}`);
  console.log(`  Statements: ${method.body.length}`);
  console.log(`  Static: ${method.isStatic}`);
}
```

Output:
```
Method: initializeEventListeners
  Parameters: 0
  Statements: 0
  Static: false
Method: myFirstMethod
  Parameters: 0
  Statements: 2
  Static: false
```

### Inspecting Named Arguments

```typescript
const source = `
class Demo extends SScene {
  void doDemo() {
    this.bunny.move(direction: MoveDirection.FORWARD, amount: 1.0);
  }
}
`;

const ast = parseTweedle(source);
const stmt = ast.methods[0].body[0]; // ExpressionStatement
if (stmt.type === "ExpressionStatement"
    && stmt.expression.type === "MethodInvocation") {
  for (const arg of stmt.expression.arguments) {
    console.log(`  ${arg.name ?? "(positional)"}: ${JSON.stringify(arg.value)}`);
  }
}
```

Output:
```
  direction: {"type":"MemberAccess","target":{"type":"Identifier","name":"MoveDirection"},"memberName":"FORWARD"}
  amount: {"type":"Literal","value":1,"literalType":"number"}
```

### Error Recovery

```typescript
import { parseTweedle, TweedleParseError } from "./tweedle-parser.js";

try {
  parseTweedle("class extends SScene { }");
} catch (e) {
  if (e instanceof TweedleParseError) {
    console.log(`Line ${e.line}, column ${e.column}`);
    console.log(`Found: "${e.found}"`);
    console.log(`Expected: ${e.expected}`);
    // → Line 1, column 6
    //   Found: "extends"
    //   Expected: class name (identifier)
  }
}
```

### Parsing Library Code

```typescript
const flyerSource = `
class SFlyer extends SThing {
  @TuckedAway
  SJoint[] getTailArray() {
    return new SJoint[]{};
  }

  @CompletelyHidden
  TextString toString() {
    return "unnamed " .. $System.getClassName(this);
  }
}
`;

const ast = parseTweedle(flyerSource);

const getTailArray = ast.methods.find(m => m.name === "getTailArray")!;
console.log(getTailArray.visibility);   // "@TuckedAway"
console.log(getTailArray.returnType);   // { type: "SimpleTypeRef", name: "SJoint", isArray: true }
```

## Architecture

```
src/tweedle-parser.ts
├── Lexer          Character-by-character scanner → Token[]
│                  Handles: keywords, identifiers ($-prefix), numbers,
│                  strings (escapes: \", \\, \n, \t, \r),
│                  operators (<-, .., *<, >*),
│                  single-line // and block /* */ comments
│
├── Parser         Recursive-descent (declarations, statements)
│                  + Pratt parser (expressions with precedence)
│                  Produces typed AST nodes
│
├── AST Types      ~30 discriminated-union interfaces
│                  Tagged on `type` field
│
└── TweedleParseError
                   Error subclass with line, column, found, expected
```

The entire parser is a single file with no external dependencies. This keeps
the module simple, avoids version conflicts, and makes it easy to regenerate
or replace.
