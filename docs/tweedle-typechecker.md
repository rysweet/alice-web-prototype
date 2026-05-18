# Tweedle Type Checker

The Tweedle type checker (`src/tweedle-typechecker.ts`) provides static type
analysis for parsed Tweedle ASTs. It resolves type references, checks assignment
compatibility (including inheritance), validates method call signatures, and
detects inheritance cycles. It operates on the AST produced by
`tweedle-parser.ts` — no source text, no I/O, no side effects.

## Overview

The type checker builds a `TypeEnvironment` from one or more parsed
`ClassDecl` nodes. The environment holds a class registry with resolved
inheritance chains and exposes three core operations: type resolution,
assignability checks, and method signature validation.

The typical data flow is:

```
.a3p ZIP  →  a3p-parser.ts (extract .twe text)
          →  tweedle-parser.ts (AST per class)
          →  tweedle-typechecker.ts (validate types across classes)
          →  tweedle-vm.ts (execute)
```

## Quick Start

```typescript
import { parseTweedle } from "./tweedle-parser.js";
import { createTypeEnvironment } from "./tweedle-typechecker.js";

const scene = parseTweedle(`
  class MyScene extends SScene {
    MyScene() {}
    void myFirstMethod() {
      this.bunny.say("Hello!");
    }
  }
`);

const biped = parseTweedle(`
  class Bunny extends SBiped {
    Bunny() {}
  }
`);

const env = createTypeEnvironment([scene, biped]);

// Resolve a type by name
const bunnyType = env.resolveType("Bunny");
console.log(bunnyType?.name);       // "Bunny"
console.log(bunnyType?.superClass); // "SBiped"

// Check assignment compatibility
env.isAssignableTo("Bunny", "SBiped");        // true  — subclass
env.isAssignableTo("Bunny", "SThing");         // true  — transitive
env.isAssignableTo("SBiped", "Bunny");         // false — wrong direction
env.isAssignableTo("null", "Bunny");           // true  — null → any class
env.isAssignableTo("null", "DecimalNumber");   // false — null → primitive

// Validate a method call
const result = env.checkMethodCall("MyScene", "myFirstMethod", []);
console.log(result.valid); // true
```

## API Reference

### `createTypeEnvironment(classes: ClassDecl[]): TypeEnvironment`

Factory function. Accepts an array of parsed class declarations and builds a
type environment with a resolved class registry.

**Parameters:**

| Parameter | Type          | Description |
|-----------|---------------|-------------|
| `classes` | `ClassDecl[]` | Parsed class declarations from `parseTweedle()` |

**Returns:** A `TypeEnvironment` instance.

**Throws:**

| Error | Condition |
|-------|-----------|
| `TweedleTypeError` | Duplicate class name in the input array |
| `TweedleTypeError` | Inheritance cycle detected (e.g., `A extends B extends A`) |

**Example:**

```typescript
const env = createTypeEnvironment([parseTweedle(src1), parseTweedle(src2)]);
```

### Built-in Types

The type environment pre-registers the following built-in types. They are
always available without being passed to `createTypeEnvironment()`:

| Type name | Kind | Description |
|-----------|------|-------------|
| `DecimalNumber` | Primitive | 64-bit floating-point number |
| `WholeNumber` | Primitive | Integer (subtype of `DecimalNumber`) |
| `TextString` | Primitive | String value |
| `Boolean` | Primitive | `true` / `false` |
| `SThing` | Class | Base entity class |
| `SScene` | Class | Scene entity |
| `SGround` | Class | Ground plane entity |
| `STurnable` | Class | Entity with orientation |
| `SMovableTurnable` | Class | Entity with position + orientation |
| `SCamera` | Class | Camera entity |
| `SModel` | Class | Entity with size |
| `SJointedModel` | Class | Entity with joints |
| `SBiped` | Class | Humanoid characters |
| `SFlyer` | Class | Flying creatures |
| `SQuadruped` | Class | Four-legged animals |
| `SProp` | Class | Inanimate objects with joints |

### `TypeEnvironment`

#### `resolveType(name: string): ResolvedType | null`

Look up a resolved type by name. Returns `null` if the type is not registered.
For user-defined classes, `ResolvedType` includes the original `ClassDecl` plus
the resolved inheritance chain. For built-in types, it includes the name and
kind (primitive vs. class).

```typescript
const resolved = env.resolveType("Bunny");
if (resolved) {
  console.log(resolved.name);       // "Bunny"
  console.log(resolved.superClass); // "SBiped"
}
```

#### `isAssignableTo(source: string, target: string): boolean`

Check whether a value of type `source` can be assigned to a variable of type
`target`. Follows Tweedle/Java assignability rules:

| Rule | Example | Result |
|------|---------|--------|
| Same type | `isAssignableTo("SBiped", "SBiped")` | `true` |
| Subclass → superclass | `isAssignableTo("SBiped", "SThing")` | `true` |
| Superclass → subclass | `isAssignableTo("SThing", "SBiped")` | `false` |
| `null` → any class type | `isAssignableTo("null", "SBiped")` | `true` |
| `null` → primitive | `isAssignableTo("null", "DecimalNumber")` | `false` |
| `WholeNumber` → `DecimalNumber` | `isAssignableTo("WholeNumber", "DecimalNumber")` | `true` |
| `DecimalNumber` → `WholeNumber` | `isAssignableTo("DecimalNumber", "WholeNumber")` | `false` |
| Unknown type | `isAssignableTo("Foo", "Bar")` | `false` |

```typescript
env.isAssignableTo("Bunny", "SBiped");   // true
env.isAssignableTo("Bunny", "SFlyer");   // false
```

#### `checkMethodCall(className: string, methodName: string, argTypes: string[]): MethodCallResult`

Validate that a method call is well-typed. Checks that:

1. The class exists
2. The method exists on the class (or inherited superclasses)
3. The argument count matches the parameter count (accounting for defaults)
4. Each argument type is assignable to the corresponding parameter type

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `className` | `string` | Name of the class containing the method |
| `methodName` | `string` | Name of the method to check |
| `argTypes` | `string[]` | Resolved type names for each argument |

**Returns:** `MethodCallResult`

```typescript
interface MethodCallResult {
  valid: boolean;
  returnType: TypeRef | null;
  errors: string[];
}
```

| Field | Description |
|-------|-------------|
| `valid` | `true` if the call is well-typed |
| `returnType` | Return type of the method if valid, `null` otherwise |
| `errors` | Human-readable error messages (empty if valid) |

**Example:**

```typescript
// Valid call
const r1 = env.checkMethodCall("MyScene", "myFirstMethod", []);
r1.valid;      // true
r1.returnType; // { type: "VoidTypeRef" }
r1.errors;     // []

// Wrong argument count
const r2 = env.checkMethodCall("MyScene", "myFirstMethod", ["TextString"]);
r2.valid;   // false
r2.errors;  // ["myFirstMethod expects 0 arguments, got 1"]

// Unknown method
const r3 = env.checkMethodCall("MyScene", "noSuchMethod", []);
r3.valid;   // false
r3.errors;  // ["Method 'noSuchMethod' not found on class 'MyScene'"]
```

### `TweedleTypeError`

Custom error class for type-checking failures.

```typescript
export class TweedleTypeError extends Error {
  constructor(
    message: string,
    public readonly typeName: string,
    public readonly detail: string,
  );
}
```

| Property | Description |
|----------|-------------|
| `typeName` | The type that caused the error |
| `detail` | Additional context (e.g., "cycle detected", "duplicate class") |

## Inheritance Resolution

The type checker resolves the full inheritance chain for every class. Given:

```tweedle
class Animal extends SThing { ... }
class Dog extends Animal { ... }
class Puppy extends Dog { ... }
```

The resolved chain for `Puppy` is: `Puppy → Dog → Animal → SThing`.

Method lookup walks this chain from most-derived to least-derived, returning
the first match. This matches Java's method resolution order.

### Cycle Detection

The factory function detects inheritance cycles at construction time:

```typescript
const a = parseTweedle("class A extends B { A() {} }");
const b = parseTweedle("class B extends A { B() {} }");

createTypeEnvironment([a, b]);
// → TweedleTypeError: Inheritance cycle detected: A → B → A
```

Cycle detection uses a visited-set algorithm during chain resolution. Every
class is visited exactly once; if a class is encountered twice, the cycle is
reported with the full path.

### Duplicate Class Detection

```typescript
const c1 = parseTweedle("class Foo extends SThing { Foo() {} }");
const c2 = parseTweedle("class Foo extends SThing { Foo() {} }");

createTypeEnvironment([c1, c2]);
// → TweedleTypeError: Duplicate class name: "Foo"
```

## Null Assignability

`null` is assignable to any class type but not to primitive types. This matches
Java/Tweedle semantics:

```typescript
env.isAssignableTo("null", "SBiped");        // true  — class type
env.isAssignableTo("null", "SThing");         // true  — class type
env.isAssignableTo("null", "DecimalNumber");  // false — primitive
env.isAssignableTo("null", "TextString");     // false — primitive
env.isAssignableTo("null", "Boolean");        // false — primitive
```

## Security

| Concern | Mitigation |
|---------|------------|
| Inheritance cycles cause infinite loops | Visited-set detection in `createTypeEnvironment()` |
| Crafted ASTs with deep inheritance | Bounded by class count (finite input) |
| Duplicate class names corrupt registry | Rejected at construction time |
| No eval, no dynamic code execution | Pure data traversal only |

## Module Exports

```typescript
// Factory
import { createTypeEnvironment } from "./tweedle-typechecker.js";

// Types
import type { TypeEnvironment, MethodCallResult, ResolvedType } from "./tweedle-typechecker.js";

// Error class
import { TweedleTypeError } from "./tweedle-typechecker.js";
```

## Architecture

```
src/
  tweedle-parser.ts        — AST parser (existing, unchanged)
  tweedle-typechecker.ts   — Type checker (NEW)
test/
  tweedle-typechecker.test.ts — ~40 tests covering resolution,
                                assignability, method calls, cycles, nulls
```

The type checker has **zero new dependencies**. It imports only the AST types
(`ClassDecl`, `MethodDecl`, `FieldDecl`, `ConstructorDecl`, `TypeRef`,
`Parameter`) from `tweedle-parser.ts` as type-only imports.

## Limitations

- **No expression-level type inference.** The checker validates method calls
  and assignments but does not infer the type of arbitrary expressions.
- **No generic types.** Tweedle does not have generics; the checker does not
  support them.
- **No overload resolution.** If multiple methods share the same name, the
  checker matches the first one found in the inheritance chain. Tweedle does
  not support method overloading.
- **Built-in types are stubs.** Built-in classes (SThing, SBiped, etc.) are
  registered with empty method/field lists. Method calls on built-ins are not
  validated beyond existence checks. As entity properties are added to the
  story API (isShowing, color, opacity, paint, vehicle), corresponding stub
  methods may be registered in a future iteration.
- **No array type checking.** Array element types are not validated in
  assignments. This may be added in a future iteration.
