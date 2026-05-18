# Tweedle Type System

The type system module (`src/tweedle-type-system.ts`) provides a full
discriminated-union type hierarchy that mirrors Java's `AbstractType → JavaType /
UserType` pattern. It complements the existing flat `ResolvedType` in
`tweedle-typechecker.ts` by giving each type a `kind` discriminator and a typed
`superType` reference — enabling exhaustive `switch` matching and
`instanceof`-style discrimination without replacing the existing typechecker.

## Overview

The module introduces three concrete type node interfaces (`PrimitiveType`,
`JavaType`, `UserType`) under a common `AbstractType` base, plus a
`TypeHierarchy` facade for querying the type graph. Every type node carries an
`isAssignableTo()` method that follows Tweedle/Java assignability rules.

The typical data flow is:

```
.twe source  →  tweedle-parser.ts (AST per class)
             →  tweedle-type-system.ts (type hierarchy)
             →  tweedle-typechecker.ts (validate assignments/calls)
             →  tweedle-vm.ts (execute)
```

## Quick Start

```typescript
import { parseTweedle } from "./tweedle-parser.js";
import { createTypeHierarchy } from "./tweedle-type-system.js";

const bunny = parseTweedle(`
  class Bunny extends SBiped {
    Bunny() {}
    void hop(DecimalNumber distance) {}
  }
`);

const robo = parseTweedle(`
  class RoboBunny extends Bunny {
    RoboBunny() {}
  }
`);

const hierarchy = createTypeHierarchy([bunny, robo]);

// Resolve types by name
const bunnyType = hierarchy.resolve("Bunny");
console.log(bunnyType?.kind);  // "user"
console.log(bunnyType?.name);  // "Bunny"

const sthing = hierarchy.resolve("SThing");
console.log(sthing?.kind);     // "java"

const num = hierarchy.resolve("DecimalNumber");
console.log(num?.kind);        // "primitive"

// Assignability checks on typed nodes
const roboBunny = hierarchy.resolve("RoboBunny")!;
const sBiped = hierarchy.resolve("SBiped")!;
hierarchy.isAssignableTo(roboBunny, sBiped);  // true  — RoboBunny → Bunny → SBiped
hierarchy.isAssignableTo(sBiped, roboBunny);  // false — wrong direction

// Walk the supertype chain
hierarchy.supertypesOf(roboBunny);
// → [RoboBunny, Bunny, SBiped, SJointedModel, SModel, SMovableTurnable, STurnable, SThing]

// Discriminated-union pattern matching
switch (bunnyType!.kind) {
  case "primitive": console.log("primitive");           break;
  case "java":      console.log("built-in entity");     break;
  case "user":      console.log("user class");          break;
}
```

## API Reference

### Type Node Interfaces

#### `AbstractType`

The base interface for all types. The `kind` field is the discriminator for
exhaustive `switch` matching.

```typescript
type TypeKind = "primitive" | "java" | "user";

interface AbstractType {
  readonly kind: TypeKind;
  readonly name: string;
  isAssignableTo(target: AbstractType): boolean;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `kind` | `TypeKind` | Discriminator: `"primitive"`, `"java"`, or `"user"` |
| `name` | `string` | Unique type name (e.g. `"SBiped"`, `"DecimalNumber"`, `"Bunny"`) |

#### `PrimitiveType`

A non-nullable value type with no supertype chain.

```typescript
interface PrimitiveType extends AbstractType {
  readonly kind: "primitive";
}
```

The four primitives are: `DecimalNumber`, `WholeNumber`, `TextString`, `Boolean`.

`WholeNumber` is assignable to `DecimalNumber` (numeric widening). No other
cross-primitive assignments are allowed.

#### `JavaType`

A built-in entity class from the Alice scene graph library. Has a typed
`superType` reference forming the built-in hierarchy.

```typescript
interface JavaType extends AbstractType {
  readonly kind: "java";
  readonly superType: JavaType | null;
}
```

| Field | Type | Description |
|-------|------|-------------|
| `superType` | `JavaType \| null` | Parent type in the hierarchy, `null` for `SThing` (root) |

#### `UserType`

A user-defined class parsed from Tweedle source. Carries the original AST
nodes for methods, fields, and the full class declaration.

```typescript
interface UserType extends AbstractType {
  readonly kind: "user";
  readonly superType: AbstractType | null;
  readonly classDecl: ClassDecl;
  readonly methods: readonly MethodDecl[];
  readonly fields: readonly FieldDecl[];
}
```

| Field | Type | Description |
|-------|------|-------------|
| `superType` | `AbstractType \| null` | Parent type — may be a `JavaType` (e.g. `SBiped`) or another `UserType` |
| `classDecl` | `ClassDecl` | Original parsed AST from `parseTweedle()` |
| `methods` | `readonly MethodDecl[]` | Methods declared on this class |
| `fields` | `readonly FieldDecl[]` | Fields declared on this class |

### `TypeHierarchy`

The facade for querying the type graph.

```typescript
interface TypeHierarchy {
  resolve(name: string): AbstractType | null;
  allTypes(): readonly AbstractType[];
  isAssignableTo(source: AbstractType, target: AbstractType): boolean;
  supertypesOf(type: AbstractType): readonly AbstractType[];
}
```

#### `resolve(name: string): AbstractType | null`

Look up a type by name. Returns `null` if the type is not registered.

```typescript
const t = hierarchy.resolve("Bunny");
if (t && t.kind === "user") {
  console.log(t.classDecl.name);   // "Bunny"
  console.log(t.methods.length);   // 1
}
```

#### `allTypes(): readonly AbstractType[]`

Return all registered types (primitives + built-in entities + user classes).
The returned array is a snapshot — mutations do not affect the hierarchy.

```typescript
const types = hierarchy.allTypes();
console.log(types.length);  // 12 entity types + 4 primitives + user classes
```

#### `isAssignableTo(source: AbstractType, target: AbstractType): boolean`

Check whether a value of type `source` can be assigned to a variable of type
`target`. This is the typed-node counterpart of
`TypeEnvironment.isAssignableTo(sourceName, targetName)`.

**Assignability rules:**

| Rule | Example | Result |
|------|---------|--------|
| Same type (identity) | `isAssignableTo(bunny, bunny)` | `true` |
| Subclass → superclass | `isAssignableTo(bunny, sBiped)` | `true` |
| Transitive chain | `isAssignableTo(bunny, sThing)` | `true` |
| Superclass → subclass | `isAssignableTo(sBiped, bunny)` | `false` |
| `WholeNumber` → `DecimalNumber` | numeric widening | `true` |
| `DecimalNumber` → `WholeNumber` | — | `false` |
| `null` → any class type | `null` is assignable to reference types | `true` |
| `null` → any primitive | — | `false` |
| Unrelated types | — | `false` |

The `null` type is represented by the special name `"null"`. It is resolved
via `hierarchy.resolve("null")` and is always available.

```typescript
const nullType = hierarchy.resolve("null")!;
const sBiped = hierarchy.resolve("SBiped")!;
const decimal = hierarchy.resolve("DecimalNumber")!;

hierarchy.isAssignableTo(nullType, sBiped);   // true
hierarchy.isAssignableTo(nullType, decimal);  // false
```

#### `supertypesOf(type: AbstractType): readonly AbstractType[]`

Walk the supertype chain from `type` to the root. Returns an ordered array
starting with `type` itself, followed by each successive supertype.

```typescript
const chain = hierarchy.supertypesOf(hierarchy.resolve("RoboBunny")!);
console.log(chain.map(t => t.name));
// → ["RoboBunny", "Bunny", "SBiped", "SJointedModel", "SModel",
//    "SMovableTurnable", "STurnable", "SThing"]
```

For primitive types, the chain contains only the type itself (primitives have
no supertype), except for `WholeNumber` which includes `DecimalNumber`.

### `createTypeHierarchy(classes: ClassDecl[]): TypeHierarchy`

Factory function. Builds a type hierarchy from parsed Tweedle class
declarations.

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `classes` | `ClassDecl[]` | Parsed class declarations from `parseTweedle()` |

**Returns:** A `TypeHierarchy` instance with all primitives, built-in entity
types, and user-defined types registered.

**Throws:**

| Error | Condition | `detail` field |
|-------|-----------|----------------|
| `TweedleTypeError` | Duplicate class name in input | `"duplicate class"` |
| `TweedleTypeError` | Inheritance cycle detected | `"cycle"` |
| `TweedleTypeError` | Supertype chain exceeds 100 levels | `"depth exceeded"` |

**Example:**

```typescript
const classes = [
  parseTweedle("class Dog extends SThing { Dog() {} }"),
  parseTweedle("class Puppy extends Dog { Puppy() {} }"),
];

const hierarchy = createTypeHierarchy(classes);
hierarchy.resolve("Puppy")?.kind;  // "user"
```

### Built-in Types

The type hierarchy pre-registers the following built-in types. They are always
available without being passed to `createTypeHierarchy()`:

**Primitive Types:**

| Name | Kind | Notes |
|------|------|-------|
| `DecimalNumber` | `primitive` | 64-bit floating-point |
| `WholeNumber` | `primitive` | Integer; assignable to `DecimalNumber` |
| `TextString` | `primitive` | String value |
| `Boolean` | `primitive` | `true` / `false` |

**Entity Types (JavaType):**

| Name | Supertype | Description |
|------|-----------|-------------|
| `SThing` | `null` (root) | Base entity class |
| `SScene` | `SThing` | Scene entity |
| `SGround` | `SThing` | Ground plane |
| `STurnable` | `SThing` | Entity with orientation |
| `SMovableTurnable` | `STurnable` | Entity with position + orientation |
| `SCamera` | `SMovableTurnable` | Camera entity |
| `SModel` | `SMovableTurnable` | Entity with size |
| `SJointedModel` | `SModel` | Entity with joints |
| `SBiped` | `SJointedModel` | Humanoid characters |
| `SFlyer` | `SJointedModel` | Flying creatures |
| `SQuadruped` | `SJointedModel` | Four-legged animals |
| `SProp` | `SJointedModel` | Inanimate objects with joints |

### `TweedleTypeError`

Custom error class used by both this module and `tweedle-typechecker.ts`.
Re-exported from this module for convenience.

```typescript
class TweedleTypeError extends Error {
  constructor(
    message: string,
    public readonly typeName: string,
    public readonly detail: string,
  );
}
```

| Property | Description |
|----------|-------------|
| `typeName` | The type that triggered the error |
| `detail` | Category: `"duplicate class"`, `"cycle"`, or `"depth exceeded"` |

## Discriminated-Union Pattern Matching

The `kind` field enables TypeScript's exhaustive `switch` narrowing:

```typescript
function describeType(t: AbstractType): string {
  switch (t.kind) {
    case "primitive":
      return `Primitive: ${t.name}`;
    case "java":
      return `Built-in: ${t.name} extends ${t.superType?.name ?? "—"}`;
    case "user":
      return `User class: ${t.name} with ${t.methods.length} methods`;
  }
}
```

TypeScript will error at compile time if a new `TypeKind` variant is added
without handling it in the `switch`.

## Relationship to `tweedle-typechecker.ts`

| Feature | `tweedle-typechecker.ts` | `tweedle-type-system.ts` |
|---------|--------------------------|--------------------------|
| Type representation | Flat `ResolvedType` (name + superClass string) | Discriminated-union nodes (`AbstractType`) |
| Assignability | `isAssignableTo(sourceName, targetName)` (string-based) | `isAssignableTo(sourceNode, targetNode)` (typed) |
| Type lookup | `resolveType(name): ResolvedType \| null` | `resolve(name): AbstractType \| null` |
| Method validation | `checkMethodCall()` | Not provided — use typechecker |
| Built-in types | Same 4 primitives + 12 entity types | Same 4 primitives + 12 entity types |
| Use case | Validate method calls and assignments | Type-level pattern matching and hierarchy queries |

Both modules can coexist. The type system does not import from or modify the
typechecker. They share the same semantic rules but expose different APIs for
different use cases.

## Security

| Concern | Severity | Mitigation |
|---------|----------|------------|
| Inheritance cycles → infinite loop | High | Cycle detection at `createTypeHierarchy()` construction time |
| Deep inheritance chains → stack overflow | Medium | Depth guard: supertype walk capped at 100 levels |
| Duplicate class names → registry corruption | Medium | Rejected at construction time with `TweedleTypeError` |
| No eval, no dynamic code execution | — | Pure data traversal only |
| No filesystem or network access | — | Enforced by design — no `fs`/`http`/`fetch` imports |

## Module Exports

```typescript
// Factory
import { createTypeHierarchy } from "./tweedle-type-system.js";

// Type interfaces
import type {
  TypeKind,
  AbstractType,
  PrimitiveType,
  JavaType,
  UserType,
  TypeHierarchy,
} from "./tweedle-type-system.js";

// Error class (same as typechecker)
import { TweedleTypeError } from "./tweedle-type-system.js";
```

## Architecture

```
src/
  tweedle-parser.ts         — AST parser (existing, unchanged)
  tweedle-typechecker.ts    — Flat type environment (existing, unchanged)
  tweedle-type-system.ts    — Discriminated-union type hierarchy (NEW)
test/
  tweedle-type-system.test.ts — ~13 tests covering resolution, assignability,
                                 hierarchy queries, cycles, duplicates
```

The type system imports only AST types (`ClassDecl`, `MethodDecl`, `FieldDecl`,
`TypeRef`) from `tweedle-parser.ts` as type-only imports. It has **zero external
dependencies**.

## Limitations

- **No method validation.** The type system provides type hierarchy queries but
  does not validate method calls. Use `tweedle-typechecker.ts` for that.
- **No expression-level type inference.** The module resolves named types and
  checks assignability; it does not infer types from expressions.
- **No generic types.** Tweedle does not have generics.
- **Built-in entity types have empty method/field lists.** Built-in classes
  (`SThing`, `SBiped`, etc.) are registered as `JavaType` nodes with no methods
  or fields. Method resolution on built-ins should use the typechecker.
- **Duplicate constants.** The built-in type registry re-declares the same 4
  primitives and 12 entity types as `tweedle-typechecker.ts` (they are `private`
  in the typechecker). This is intentional — the values are stable and
  documented.
