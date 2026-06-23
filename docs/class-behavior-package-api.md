# Class behavior package API

This reference defines the reusable Alice class behavior package format,
TypeScript helpers, and HTTP routes.

The package uses `AliceTypeDefinition` as the source of truth. It does not define
a separate TypeScript-only behavior model.

## Contents

- [Scope](#scope)
- [Package format](#package-format)
- [TypeScript API](#typescript-api)
- [HTTP API](#http-api)
- [Conflict strategies](#conflict-strategies)
- [Project persistence](#project-persistence)
- [Validation requirements](#validation-requirements)
- [Error contract](#error-contract)
- [Related documentation](#related-documentation)

## Scope

A reusable class behavior package contains exactly one `AliceTypeDefinition`
from `AliceProject.types`.

The package includes the selected type's own fields, constructors, methods,
superclass name, and Alice statement data. It does not include:

- scene objects or scene placement
- project-level methods outside the selected type
- resource files or asset bytes
- referenced external types
- dependent user-defined classes

Names and references inside the selected type are preserved as data. A receiving
project must already contain compatible resources, external types, superclass
types, and referenced user classes for those references to resolve.

## Package format

Reusable class behavior packages are JSON files with the extension:

```text
.alice-class-behavior.json
```

Package schema:

```typescript
interface AliceClassBehaviorPackage {
  kind: "alice-web.reusable-class-behavior";
  version: 1;
  exportedBy: "alice-web";
  type: AliceTypeDefinition;
  evidence: string[];
}
```

The `type` field is the Alice project type definition:

```typescript
interface AliceTypeDefinition {
  name: string;
  superTypeName?: string | null;
  methods?: AliceMethod[];
  constructors?: AliceMethod[];
  fields?: AliceFieldDefinition[];
}

interface AliceFieldDefinition {
  name: string;
  typeName?: string | null;
  resourceType?: string | null;
  initializer?: string | null;
}

interface AliceMethod {
  name: string;
  isFunction: boolean;
  returnType: string;
  parameters: Array<{ name: string; type: string }>;
  statements: AliceStatement[];
}
```

Example package:

```json
{
  "kind": "alice-web.reusable-class-behavior",
  "version": 1,
  "exportedBy": "alice-web",
  "type": {
    "name": "SpinnerBehavior",
    "superTypeName": "org.lgna.story.SModel",
    "fields": [
      {
        "name": "turnSpeed",
        "typeName": "Double",
        "initializer": "0.25"
      }
    ],
    "constructors": [
      {
        "name": "SpinnerBehavior",
        "isFunction": false,
        "returnType": "SpinnerBehavior",
        "parameters": [],
        "statements": [
          {
            "kind": "expression",
            "expression": "this.turnSpeed = 0.25"
          }
        ]
      }
    ],
    "methods": [
      {
        "name": "spinOnce",
        "isFunction": false,
        "returnType": "void",
        "parameters": [],
        "statements": [
          {
            "kind": "call",
            "object": "this",
            "method": "turn",
            "arguments": ["LEFT", "turnSpeed"]
          }
        ]
      }
    ]
  }
}
```

## TypeScript API

Package helpers live in `src/project-io/class-behavior-package.ts`. The browser
workflow and server routes use these helpers so export, import, validation, and
conflict handling stay consistent.

```typescript
import {
  exportClassBehaviorPackage,
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
  serializeClassBehaviorPackage,
  ClassBehaviorPackageError,
  type AliceClassBehaviorPackage,
  type ClassBehaviorConflictStrategy,
  type ClassBehaviorImportResult,
} from "./src/project-io/class-behavior-package.js";
```

### `exportClassBehaviorPackage(project, typeName)`

```typescript
function exportClassBehaviorPackage(
  project: AliceProject,
  typeName: string,
): AliceClassBehaviorPackage;
```

Exports one type from `project.types`.

| Parameter | Type | Meaning |
| --- | --- | --- |
| `project` | `AliceProject` | Current Alice project model |
| `typeName` | `string` | Name of the reusable class behavior to export |

The function returns a package with:

- `kind: "alice-web.reusable-class-behavior"`
- `version: 1`
- `exportedBy: "alice-web"`
- a deep copy of the matching `AliceTypeDefinition`

The function throws a typed package error when `project.types` does not contain
`typeName`.

### `serializeClassBehaviorPackage(packageData)`

```typescript
function serializeClassBehaviorPackage(
  packageData: AliceClassBehaviorPackage,
): string;
```

Validates the package and returns pretty-printed JSON ending with a newline. The
serialized output is checked against the package size limit before it is returned.

### `parseClassBehaviorPackage(input)`

```typescript
function parseClassBehaviorPackage(
  input: unknown,
): AliceClassBehaviorPackage;
```

Parses and validates an untrusted package. `input` can be a JSON string or an
already parsed value.

Validation runs before a package is returned. Invalid packages throw
`ClassBehaviorPackageError` and do not modify project state.

### `importClassBehaviorPackage(project, packageData, options)`

```typescript
function importClassBehaviorPackage(
  project: AliceProject,
  packageData: AliceClassBehaviorPackage,
  options?: {
    conflictStrategy?: ClassBehaviorConflictStrategy;
  },
): ClassBehaviorImportResult;
```

Imports one class behavior into `project.types`.

```typescript
type ClassBehaviorConflictStrategy =
  | "rename"
  | "replace"
  | "merge"
  | "reject";

interface ClassBehaviorImportResult {
  schema_version: "alice-web.class-behavior-import-result/v1";
  status: "imported";
  evidence: string[];
  originalName: string;
  importedName: string;
  conflictStrategy: ClassBehaviorConflictStrategy;
  renamed: boolean;
  replaced: boolean;
  merged: boolean;
}
```

The default strategy is `rename`.

## HTTP API

The HTTP routes operate only on the current project. They do not accept project
IDs, filesystem paths, or remote project URLs.

### `GET /api/projects/current/classes/:typeName/behavior`

Exports one class behavior from the current project.

Clients must URL-encode `:typeName`. For example, a type named `My Spinner`
must be requested as `My%20Spinner`.

```bash
curl -fS http://127.0.0.1:3000/api/projects/current/classes/SpinnerBehavior/behavior \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -o SpinnerBehavior.alice-class-behavior.json
```

Required successful response:

```http
HTTP/1.1 200 OK
Content-Type: application/json; charset=utf-8
Content-Disposition: attachment; filename="SpinnerBehavior.alice-class-behavior.json"
Cache-Control: no-store
```

Response body:

```json
{
  "kind": "alice-web.reusable-class-behavior",
  "version": 1,
  "exportedBy": "alice-web",
  "type": {
    "name": "SpinnerBehavior",
    "superTypeName": "org.lgna.story.SModel",
    "fields": [],
    "constructors": [],
    "methods": []
  }
}
```

### `POST /api/projects/current/classes/behavior`

Imports one class behavior package into the current project.

```bash
node -e 'const fs=require("fs"); const pkg=JSON.parse(fs.readFileSync("SpinnerBehavior.alice-class-behavior.json","utf8")); fs.writeFileSync("import-request.json", JSON.stringify({ conflictStrategy: "rename", package: pkg }, null, 2));'

curl -fS -X POST http://127.0.0.1:3000/api/projects/current/classes/behavior \
  -H "X-Alice-Local-Api-Token: $ALICE_LOCAL_API_TOKEN" \
  -H "Content-Type: application/json" \
  --data @import-request.json
```

Request body:

```typescript
interface ImportClassBehaviorRequest {
  package: AliceClassBehaviorPackage;
  conflictStrategy?: "rename" | "replace" | "merge" | "reject";
}
```

Required successful response:

```json
{
  "schema_version": "alice-web.class-behavior-import-result/v1",
  "status": "imported",
  "evidence": [
    "class-behavior-package-validated",
    "class-behavior-type-imported",
    "class-behavior-name-preserved"
  ],
  "originalName": "SpinnerBehavior",
  "importedName": "SpinnerBehavior",
  "conflictStrategy": "rename",
  "renamed": false,
  "replaced": false,
  "merged": false
}
```

Conflict response with `reject`:

```http
HTTP/1.1 409 Conflict
Content-Type: application/json; charset=utf-8
Cache-Control: no-store
```

```json
{
  "error": "Class behavior already exists: SpinnerBehavior",
  "code": "class-behavior-conflict",
  "existingName": "SpinnerBehavior"
}
```

## Conflict strategies

| Strategy | Default | Required effect |
| --- | --- | --- |
| `rename` | yes | Imports with the next available type name when the original name is already used. |
| `replace` | no | Replaces the matching existing type definition with the package type. |
| `merge` | no | Combines the package type with the existing type using the member matching rules below. |
| `reject` | no | Returns `409` and leaves the project unchanged when the type name already exists. |

For renamed imports, self-type references equal to the original class name are
rewritten to the imported class name in `type.name`, field `typeName`, method
return types, method parameter types, constructor names, constructor return
types, constructor parameter types, and nested statement type fields (`varType`,
`itemType`, and `catchType`). Resource references and non-type statement data are
preserved.

Merge uses these member keys:

| Member kind | Match key |
| --- | --- |
| Field | `field.name` |
| Method | `method.name` |
| Constructor | Position in the constructor list |

When a member key matches, the package member replaces the existing member. When
no member key matches, the existing member is preserved and the package member is
appended in package order. Merge does not merge statement arrays member-by-member.

## Project persistence

Import changes the same `AliceProject.types` collection that Project IO writes
into `.a3p` project XML.

```typescript
import { readFile, writeFile } from "node:fs/promises";
import { readProject, writeProject } from "./src/project-io.js";
import {
  importClassBehaviorPackage,
  parseClassBehaviorPackage,
} from "./src/project-io/class-behavior-package.js";

const archive = await readProject(await readFile("RobotDance.a3p"));
const packageData = parseClassBehaviorPackage(
  await readFile("SpinnerBehavior.alice-class-behavior.json", "utf8"),
);

importClassBehaviorPackage(archive.project, packageData, {
  conflictStrategy: "rename",
});

await writeFile("RobotDance-with-spinner.a3p", await writeProject(archive));
```

Reading `RobotDance-with-spinner.a3p` returns the imported type in
`archive.project.types` with its fields, constructors, methods, superclass name,
and statement data intact.

## Validation requirements

alice-web validates packages before import and before any project change:

| Rule | Requirement |
| --- | --- |
| Package identity | `kind` must be `alice-web.reusable-class-behavior` |
| Package version | `version` must be `1` |
| Export identity | `exportedBy` must be `alice-web` |
| Type shape | `type.name` is required; `fields`, `methods`, and `constructors` must be arrays when present |
| Safe names | Type, field, method, constructor, and parameter names must match `[A-Za-z_][A-Za-z0-9_]*` |
| Size limit | Package JSON must be 256 KiB or smaller |
| String limit | Individual string values must be limited to 8,192 characters |
| Array limit | `fields`, `methods`, `constructors`, `parameters`, and statement arrays must each be limited to 200 entries |
| Nesting limit | Nested package data must be limited to 32 levels |
| Dangerous keys | `__proto__`, `prototype`, and `constructor` keys must be rejected anywhere in the package |

Import treats method and constructor bodies as data. It must never evaluate,
compile, dynamically import, or run package contents.

## Error contract

| HTTP status | Code | Meaning |
| --- | --- | --- |
| `400` | `invalid-class-behavior-package` | The package JSON is malformed or fails validation |
| `400` | `missing-class-behavior` | The requested class behavior is not present in the current project |
| `409` | `class-behavior-conflict` | The target project already has the class name and `reject` was requested |
| `400` | `class-behavior-package-too-large` | The package JSON is too large |
| `400` | `dangerous-class-behavior-key` | The package contains `__proto__`, `prototype`, or `constructor` |
| `400` | `unsafe-class-behavior-name` | A type, field, method, constructor, or parameter name is not safe |
| `400` | `unsupported-class-behavior-version` | The package version is not supported |

## Related documentation

- [Reusable class behavior workflow](./class-behavior-workflow.md)
- [Reuse class behavior between Alice projects](./tutorial-reuse-class-behavior-between-projects.md)
- [Class behavior package configuration](./class-behavior-package-configuration.md)
- [Project IO API reference](./project-io-api.md)

Last updated for reusable Alice class behavior packages.
