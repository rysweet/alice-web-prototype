# Serialization — JSON & XML Project Serialization

The serialization module (`src/serialization.ts`) provides full
JSON and XML serialization/deserialization of `AliceProject` objects, matching
Java's `XmlProjectIo` / `JsonProjectIo` pattern. It enables save/load
compatibility for Alice projects in two standard text formats with guaranteed
round-trip fidelity.

## Overview

| Export | Kind | Purpose |
|--------|------|---------|
| `serialize` | function | Serialize `AliceProject` → string (XML or JSON) |
| `deserialize` | function | Deserialize string → `AliceProject` |
| `serializeToXml` | function | Convenience — XML serialization |
| `serializeToJson` | function | Convenience — JSON serialization |
| `deserializeFromXml` | function | Convenience — XML deserialization |
| `deserializeFromJson` | function | Convenience — JSON deserialization |
| `SerializationError` | class | Error with `format` field for diagnostics |
| `SerializationFormat` | type | `"xml" \| "json"` |
| `SerializationOptions` | interface | Format + pretty-print control |

The module operates on `AliceProject` (the parsed scene graph), not
`AliceProjectArchive` (which includes binary resources). It has no filesystem
or network dependency.

## Quick Start

### JSON Round-Trip

```typescript
import { serializeToJson, deserializeFromJson } from "./serialization.js";

// Serialize
const json = serializeToJson(project);
console.log(json);
// {
//   "version": "0.0.1",
//   "projectName": "MyScene",
//   "sceneObjects": [...],
//   "methods": [...]
// }

// Deserialize
const restored = deserializeFromJson(json);
console.log(restored.projectName);  // "MyScene"
```

### XML Round-Trip

```typescript
import { serializeToXml, deserializeFromXml } from "./serialization.js";

// Serialize
const xml = serializeToXml(project);
console.log(xml);
// <alice-project version="0.0.1" projectName="MyScene">
//   <scene-objects>
//     <scene-object name="ground" typeName="SGround" resourceType="">
//       <position x="0" y="0" z="0"/>
//       ...

// Deserialize
const restored = deserializeFromXml(xml);
console.log(restored.projectName);  // "MyScene"
```

### Options-Based API

```typescript
import { serialize, deserialize } from "./serialization.js";

// JSON, compact (no pretty-printing)
const compact = serialize(project, { format: "json", pretty: false });

// XML, pretty-printed (default)
const pretty = serialize(project, { format: "xml" });

// Deserialize (format must match)
const p1 = deserialize(compact, "json");
const p2 = deserialize(pretty, "xml");
```

## API Reference

### `serialize(project, options): string`

Serialize an `AliceProject` to a string in the specified format.

```typescript
function serialize(
  project: AliceProject,
  options: SerializationOptions
): string;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `project` | `AliceProject` | The project to serialize |
| `options` | `SerializationOptions` | Format and formatting control |

```typescript
interface SerializationOptions {
  format: SerializationFormat;  // "xml" | "json"
  pretty?: boolean;             // default: true
}
```

**Returns:** Serialized string (JSON or XML).

**Behavior:**

- **JSON format:** Uses `JSON.stringify` with 2-space indent when `pretty: true`
  (default), no indent when `pretty: false`.
- **XML format:** Builds a DOM using `@xmldom/xmldom`, serializes with
  `XMLSerializer`. Pretty-printed XML includes newlines and indentation.

### `deserialize(data, format): AliceProject`

Deserialize a string into an `AliceProject`.

```typescript
function deserialize(
  data: string,
  format: SerializationFormat
): AliceProject;
```

**Parameters:**

| Parameter | Type | Description |
|-----------|------|-------------|
| `data` | `string` | Serialized project string |
| `format` | `SerializationFormat` | `"xml"` or `"json"` |

**Returns:** A fully populated `AliceProject`.

**Throws:**

| Error | Condition |
|-------|-----------|
| `SerializationError` | Malformed JSON (syntax error) |
| `SerializationError` | Missing required field in JSON |
| `SerializationError` | Wrong field type in JSON (e.g. `sceneObjects` is not an array) |
| `SerializationError` | Malformed XML (parse error) |
| `SerializationError` | Missing `<alice-project>` root element |
| `SerializationError` | Missing required child elements in XML |

### Convenience Functions

```typescript
function serializeToXml(project: AliceProject): string;
function serializeToJson(project: AliceProject): string;
function deserializeFromXml(xml: string): AliceProject;
function deserializeFromJson(json: string): AliceProject;
```

These are shorthand for `serialize` / `deserialize` with preset options:

| Function | Equivalent |
|----------|-----------|
| `serializeToXml(p)` | `serialize(p, { format: "xml" })` |
| `serializeToJson(p)` | `serialize(p, { format: "json" })` |
| `deserializeFromXml(s)` | `deserialize(s, "xml")` |
| `deserializeFromJson(s)` | `deserialize(s, "json")` |

### `SerializationError`

Custom error class with a `format` field for diagnostics.

```typescript
class SerializationError extends Error {
  readonly format: SerializationFormat;
  constructor(message: string, format: SerializationFormat);
}
```

| Property | Type | Description |
|----------|------|-------------|
| `format` | `SerializationFormat` | `"xml"` or `"json"` — which format failed |
| `message` | `string` | Human-readable error description |

```typescript
try {
  deserializeFromJson('{"invalid": true}');
} catch (e) {
  if (e instanceof SerializationError) {
    console.log(e.format);   // "json"
    console.log(e.message);  // 'Missing required field: "version"'
  }
}
```

## JSON Format

### Schema

The JSON format is a direct `JSON.stringify` of the `AliceProject` interface:

```json
{
  "version": "0.0.1",
  "projectName": "MyScene",
  "sceneObjects": [
    {
      "name": "ground",
      "typeName": "SGround",
      "resourceType": "",
      "position": { "x": 0, "y": 0, "z": 0 },
      "orientation": { "x": 0, "y": 0, "z": 0, "w": 1 },
      "size": { "width": 1, "height": 1, "depth": 1 }
    }
  ],
  "methods": [
    {
      "name": "myFirstMethod",
      "isFunction": false,
      "returnType": "void",
      "parameters": [],
      "statements": [
        {
          "kind": "MethodCall",
          "object": "this.ground",
          "method": "move",
          "arguments": ["FORWARD", "1.0"]
        }
      ]
    }
  ],
  "jointHierarchy": [],
  "boundingBoxes": {},
  "textureRefs": []
}
```

### Validation on Deserialize

| Field | Required | Type | Error on violation |
|-------|----------|------|--------------------|
| `version` | ✅ | `string` | `Missing required field: "version"` |
| `projectName` | ✅ | `string` | `Missing required field: "projectName"` |
| `sceneObjects` | ✅ | `array` | `Missing required field: "sceneObjects"` or `"sceneObjects" must be an array` |
| `methods` | ✅ | `array` | `Missing required field: "methods"` or `"methods" must be an array` |
| `jointHierarchy` | ❌ | `array` | Defaults to `[]` if absent |
| `boundingBoxes` | ❌ | `object` | Defaults to `{}` if absent |
| `textureRefs` | ❌ | `array` | Defaults to `[]` if absent |

## XML Format

### Structure

```xml
<alice-project version="0.0.1" projectName="MyScene">
  <scene-objects>
    <scene-object name="ground" typeName="SGround" resourceType="">
      <position x="0" y="0" z="0"/>
      <orientation x="0" y="0" z="0" w="1"/>
      <size width="1" height="1" depth="1"/>
    </scene-object>
  </scene-objects>
  <methods>
    <method name="myFirstMethod" isFunction="false" returnType="void">
      <parameters/>
      <statements>
        <statement kind="MethodCall" object="this.ground"
                   method="move" arguments="FORWARD,1.0"/>
      </statements>
    </method>
  </methods>
  <!-- Optional elements (omitted if empty) -->
  <joint-hierarchy>
    <joint name="ROOT" parent="">
      <position x="0" y="0" z="0"/>
      <orientation x="0" y="0" z="0" w="1"/>
      <joint name="SPINE_BASE" parent="ROOT">
        <!-- nested children -->
      </joint>
    </joint>
  </joint-hierarchy>
  <bounding-boxes>
    <bounding-box name="BunnyResource">
      <min x="-0.3" y="0" z="-0.2"/>
      <max x="0.3" y="1.5" z="0.2"/>
    </bounding-box>
  </bounding-boxes>
  <texture-refs>
    <texture-ref path="resources/textures/skin.png"/>
  </texture-refs>
</alice-project>
```

### Element Reference

| Element | Parent | Attributes | Description |
|---------|--------|------------|-------------|
| `<alice-project>` | root | `version`, `projectName` | Root element |
| `<scene-objects>` | `<alice-project>` | — | Container for scene objects |
| `<scene-object>` | `<scene-objects>` | `name`, `typeName`, `resourceType` | One scene entity |
| `<position>` | `<scene-object>` | `x`, `y`, `z` | 3D position |
| `<orientation>` | `<scene-object>` | `x`, `y`, `z`, `w` | Quaternion rotation |
| `<size>` | `<scene-object>` | `width`, `height`, `depth` | Axis-aligned size |
| `<methods>` | `<alice-project>` | — | Container for methods |
| `<method>` | `<methods>` | `name`, `isFunction`, `returnType` | One method |
| `<parameters>` | `<method>` | — | Container for parameters |
| `<parameter>` | `<parameters>` | `name`, `type` | One parameter |
| `<statements>` | `<method>` | — | Container for statements |
| `<statement>` | `<statements>` | varies by `kind` | One statement |
| `<joint-hierarchy>` | `<alice-project>` | — | Optional: skeleton data |
| `<joint>` | `<joint-hierarchy>` or `<joint>` | `name`, `parent` | Joint node (recursive) |
| `<bounding-boxes>` | `<alice-project>` | — | Optional: bounding data |
| `<bounding-box>` | `<bounding-boxes>` | `name` | One bounding box |
| `<texture-refs>` | `<alice-project>` | — | Optional: texture paths |
| `<texture-ref>` | `<texture-refs>` | `path` | One texture reference |

### Statement Serialization

Statements are serialized recursively. The `kind` attribute determines which
other attributes are present:

| `kind` | Attributes | Notes |
|--------|------------|-------|
| `MethodCall` | `object`, `method`, `arguments` | Arguments are comma-separated |
| `CountLoop` | `count` | Has child `<body>` element |
| `ReturnStatement` | `expression` | — |
| `VariableDeclaration` | `name`, `varType`, `value` | — |
| `IfElse` | `condition` | Has child `<ifBody>`, `<elseBody>` elements |
| `ForEach` | `name`, `varType` | Has child `<body>` element |
| `DoInOrder` | — | Has child `<body>` element |
| `DoTogether` | — | Has child `<body>` element |
| `Comment` | `expression` | Comment text |

Nested statements (inside `<ifBody>`, `<elseBody>`, `<body>`) are wrapped in
`<statements>` containers. Any unrecognized `kind` value is serialized with
its `kind` attribute and all non-null fields as attributes. Recursion depth is
capped at 50 levels.

## Round-Trip Fidelity

The core invariant for both formats:

```typescript
import { serialize, deserialize } from "./serialization.js";

const restored = deserialize(
  serialize(project, { format: "json" }),
  "json"
);
// deep-equal: restored ≡ project

const restored2 = deserialize(
  serialize(project, { format: "xml" }),
  "xml"
);
// deep-equal: restored2 ≡ project
```

This invariant is tested for:

- Minimal projects (empty `sceneObjects` and `methods`)
- Full projects (all optional fields populated)
- Complex nested statements (if/else, count loops, for-each)
- Projects with multiple scene objects and methods

## Relationship to Existing Modules

| Module | Role | Relationship |
|--------|------|-------------|
| `a3p-parser.ts` | Parses `.a3p` ZIP → `AliceProject` | Defines the `AliceProject` type that serialization operates on |
| `project-io.ts` | Full `.a3p` archive read/write | Handles binary archive format; `serialization.ts` handles text formats |
| `serialization.ts` | Text-format project save/load | Operates on `AliceProject`, not `AliceProjectArchive` |

**When to use which:**

- **`project-io.ts`** — Reading/writing complete `.a3p` ZIP archives with
  resources, thumbnails, and manifest.
- **`serialization.ts`** — Saving/loading just the project scene graph as
  human-readable text (JSON or XML). Useful for debugging, version control
  diffs, programmatic generation, or lightweight persistence.

## Integration Examples

### Save Project to JSON File

```typescript
import { serializeToJson } from "./serialization.js";
import { readProject } from "./project-io.js";
import { writeFileSync } from "fs";

const archive = await readProject(a3pBuffer);
const json = serializeToJson(archive.project);
writeFileSync("project.json", json);
```

### Load Project from JSON File

```typescript
import { deserializeFromJson } from "./serialization.js";
import { readFileSync } from "fs";

const json = readFileSync("project.json", "utf-8");
const project = deserializeFromJson(json);
console.log(project.projectName);
```

### XML Export for Interop

```typescript
import { serializeToXml } from "./serialization.js";

const xml = serializeToXml(project);
// Send to Java-based Alice tools, store in version control, etc.
```

### Comparing Two Projects

```typescript
import { serializeToJson } from "./serialization.js";

const json1 = serializeToJson(project1);
const json2 = serializeToJson(project2);

if (json1 === json2) {
  console.log("Projects are identical");
} else {
  // Diff the JSON strings for human-readable comparison
}
```

## Error Handling

All errors thrown by the module are `SerializationError` instances with a
`format` field indicating which format failed:

```typescript
import { deserializeFromJson, SerializationError } from "./serialization.js";

try {
  deserializeFromJson("not valid json {{{");
} catch (e) {
  if (e instanceof SerializationError) {
    console.log(e.format);   // "json"
    console.log(e.message);  // wraps the original SyntaxError message
  }
}
```

### Error Scenarios

| Input | Format | Error Message (example) |
|-------|--------|------------------------|
| `"not json"` | json | `Invalid JSON: Unexpected token...` |
| `'{"version":"1"}'` | json | `Missing required field: "projectName"` |
| `'{"version":"1","projectName":"x","sceneObjects":"wrong","methods":[]}'` | json | `"sceneObjects" must be an array` |
| `"<not-xml"` | xml | `Malformed XML: ...` |
| `"<wrong-root/>"` | xml | `Expected <alice-project> root element` |
| `"<alice-project/>"` | xml | `Missing required element: <scene-objects>` |

## Security

| Concern | Severity | Mitigation |
|---------|----------|------------|
| Malformed input → unhandled exception | Medium | All parse errors wrapped in `SerializationError` |
| JSON prototype pollution (`__proto__`) | Low | `JSON.parse` returns plain objects; explicit property validation |
| XXE (XML External Entity) injection | None | `@xmldom/xmldom` does not resolve external entities |
| XML entity expansion bomb | None | `@xmldom/xmldom` does not expand entities |
| Deep statement nesting → stack overflow | Medium | Recursion depth capped at 50 levels |
| No eval, no Function, no dynamic code | — | Pure data transformation |
| No filesystem or network access | — | Module has no `fs`/`http`/`fetch` imports |

## Module Exports

```typescript
// Core API
import { serialize, deserialize } from "./serialization.js";

// Convenience functions
import {
  serializeToXml,
  serializeToJson,
  deserializeFromXml,
  deserializeFromJson,
} from "./serialization.js";

// Error class
import { SerializationError } from "./serialization.js";

// Types
import type {
  SerializationFormat,
  SerializationOptions,
} from "./serialization.js";
```

## Architecture

```
src/
  a3p-parser.ts         — AliceProject type definition (existing, unchanged)
  serialization.ts      — JSON & XML serialization (NEW)
test/
  serialization.test.ts — ~13 tests covering round-trip, validation,
                          error handling, pretty/compact output
```

The serialization module imports:
- `AliceProject`, `AliceObject`, `AliceMethod`, `AliceStatement` from
  `./a3p-parser.js` (type imports)
- `@xmldom/xmldom` for XML DOM creation and parsing (already in `package.json`
  dependencies)

## Limitations

- **Operates on `AliceProject`, not `AliceProjectArchive`.** Binary resources
  (textures, models, audio) are not included in the serialized output. Use
  `project-io.ts` for full archive serialization.
- **XML format is a simplified envelope.** The XML structure is a clean
  representation of `AliceProject` fields — it is NOT a replica of the original
  `programType.xml` format from `.a3p` files. For that, use `a3p-parser.ts` and
  `project-io.ts` with XML pass-through.
- **Statement recursion capped at 50 levels.** Deeper nesting (unlikely in
  real projects) throws a `SerializationError`.
- **No streaming.** The entire project is serialized to / deserialized from a
  single string in memory.
- **No schema evolution.** There is no version negotiation or migration between
  different serialization schema versions. The format matches the current
  `AliceProject` interface.
