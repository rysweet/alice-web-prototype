# Procedure & Function Creation API

Create new procedures and functions on the in-memory Alice program AST via HTTP.
Methods are persisted to `.a3p` on save.

## Endpoints

### `POST /api/code/create-procedure`

Create a void procedure (no return value) with optional parameters.

**Request:**

```json
{
  "name": "walkForward",
  "parameters": [
    { "name": "distance", "type": "java.lang.Double" },
    { "name": "duration", "type": "java.lang.Double" }
  ]
}
```

| Field        | Type     | Required | Default              | Description                              |
|------------- |--------- |--------- |--------------------- |----------------------------------------- |
| `name`       | string   | yes      | —                    | Method name. Must match `^[a-zA-Z_][a-zA-Z0-9_]{0,127}$` |
| `parameters` | array    | no       | `[]`                 | Formal parameters. Max 50 entries.       |
| `parameters[].name` | string | yes | —               | Parameter name. Same regex as method name. |
| `parameters[].type` | string | no  | `java.lang.Double`  | Alice/Java type string.                  |

**Response (201):**

```json
{
  "status": "created",
  "method": {
    "name": "walkForward",
    "isFunction": false,
    "returnType": "void",
    "parameters": [
      { "name": "distance", "type": "java.lang.Double" },
      { "name": "duration", "type": "java.lang.Double" }
    ]
  }
}
```

**Errors:**

| Status | Condition                               | Body                                          |
|------- |---------------------------------------- |---------------------------------------------- |
| 400    | Missing `name`                          | `{ "error": "name is required" }`             |
| 400    | Invalid name format                     | `{ "error": "invalid method name" }`          |
| 400    | Invalid parameter name                  | `{ "error": "invalid parameter name: ..." }`  |
| 400    | Duplicate parameter name                | `{ "error": "duplicate parameter name: ..." }` |
| 400    | Parameters exceeds 50                   | `{ "error": "too many parameters (max 50)" }` |
| 409    | Name collides with existing method      | `{ "error": "method already exists: ..." }`   |

---

### `POST /api/code/create-function`

Create a typed function (has a return value) with optional parameters.

**Request:**

```json
{
  "name": "getSpeed",
  "returnType": "java.lang.Double",
  "parameters": [
    { "name": "gear", "type": "java.lang.Integer" }
  ]
}
```

| Field        | Type     | Required | Default              | Description                              |
|------------- |--------- |--------- |--------------------- |----------------------------------------- |
| `name`       | string   | yes      | —                    | Method name. Same regex as procedures.   |
| `returnType` | string   | no       | `java.lang.Double`   | Return type. Any valid Alice/Java type.  |
| `parameters` | array    | no       | `[]`                 | Formal parameters. Max 50 entries.       |
| `parameters[].name` | string | yes | —               | Parameter name. Same regex as method name. |
| `parameters[].type` | string | no  | `java.lang.Double`  | Alice/Java type string.                  |

**Response (201):**

```json
{
  "status": "created",
  "method": {
    "name": "getSpeed",
    "isFunction": true,
    "returnType": "java.lang.Double",
    "parameters": [
      { "name": "gear", "type": "java.lang.Integer" }
    ]
  }
}
```

**Errors:** Same as `create-procedure`, plus:

| Status | Condition                               | Body                                              |
|------- |---------------------------------------- |-------------------------------------------------- |
| 400    | Invalid `returnType` (empty string)     | `{ "error": "returnType must be non-empty" }`     |

---

## State Model

Created methods live in `ServerState.methods[]` as `AliceMethod` objects
(the same type used by the `.a3p` parser). They coexist with
`ServerState.procedures`, which stores statements for methods edited
via `POST /api/code/edit-procedure`.

**Duplicate detection** checks both `state.procedures` keys and
`state.methods` names — Alice has a single namespace for Scene methods.

The `GET /api/screenshot` fallback merges `state.methods` into its
synthesized `AliceProject`, so created methods appear in the project
snapshot even without a loaded `.a3p` file. (The existing fallback
currently passes `methods: []`; the implementation will replace this
with `state.methods`.)

---

## Persistence (.a3p Save)

When `POST /api/project/save` is called and a real `.a3p` file was
loaded at launch, each entry in `state.methods` is injected into the
project's `programType.xml` as a `UserMethod` XML node before the ZIP
is written.

**Generated XML per method:**

```xml
<node key="{uuid}" type="org.lgna.project.ast.UserMethod" uuid="{uuid}">
  <property name="name">
    <value type="java.lang.String">{methodName}</value>
  </property>
  <property name="isFunction">
    <value type="java.lang.Boolean">{true|false}</value>
  </property>
  <property name="returnType">
    <node type="org.lgna.project.ast.JavaType">
      <property name="class">
        <value type="java.lang.String">{returnType}</value>
      </property>
    </node>
  </property>
  <property name="requiredParameters">
    <collection type="org.lgna.project.ast.UserParameter[]">
      <!-- one per parameter -->
      <node key="{paramUuid}" type="org.lgna.project.ast.UserParameter" uuid="{paramUuid}">
        <property name="name">
          <value type="java.lang.String">{paramName}</value>
        </property>
        <property name="valueType">
          <node type="org.lgna.project.ast.JavaType">
            <property name="class">
              <value type="java.lang.String">{paramType}</value>
            </property>
          </node>
        </property>
      </node>
    </collection>
  </property>
  <property name="body">
    <node type="org.lgna.project.ast.BlockStatement">
      <property name="statements">
        <collection type="org.lgna.project.ast.Statement[]" />
      </property>
    </node>
  </property>
</node>
```

> **Note:** The `<property name="class">` matches the property name used by Alice 3.x
> `JavaType` serialization and aligns with what `a3p-parser.ts` reads via
> `getPropertyText(node, "class")`.

All text values are XML-escaped via `escapeXml()` as defense-in-depth.

When no `.a3p` was loaded at launch, save skips XML injection — methods
exist only in server memory.

---

## Examples

### Create a procedure with no parameters

```bash
curl -X POST http://localhost:3000/api/code/create-procedure \
  -H 'Content-Type: application/json' \
  -d '{ "name": "wave" }'
```

```json
{
  "status": "created",
  "method": {
    "name": "wave",
    "isFunction": false,
    "returnType": "void",
    "parameters": []
  }
}
```

### Create a function with parameters

```bash
curl -X POST http://localhost:3000/api/code/create-function \
  -H 'Content-Type: application/json' \
  -d '{
    "name": "computeArea",
    "returnType": "java.lang.Double",
    "parameters": [
      { "name": "width", "type": "java.lang.Double" },
      { "name": "height", "type": "java.lang.Double" }
    ]
  }'
```

```json
{
  "status": "created",
  "method": {
    "name": "computeArea",
    "isFunction": true,
    "returnType": "java.lang.Double",
    "parameters": [
      { "name": "width", "type": "java.lang.Double" },
      { "name": "height", "type": "java.lang.Double" }
    ]
  }
}
```

### Create method then save

```bash
# Launch with a real project
curl -X POST http://localhost:3000/api/launch \
  -H 'Content-Type: application/json' \
  -d '{ "project": "/path/to/starter.a3p" }'

# Create a procedure
curl -X POST http://localhost:3000/api/code/create-procedure \
  -H 'Content-Type: application/json' \
  -d '{ "name": "dance", "parameters": [{ "name": "speed" }] }'

# Save — the new method is injected into the .a3p XML
curl -X POST http://localhost:3000/api/project/save \
  -H 'Content-Type: application/json' \
  -d '{ "saveSelector": "scene.dance" }'
```

### Duplicate name rejection

```bash
# First call succeeds
curl -X POST http://localhost:3000/api/code/create-procedure \
  -H 'Content-Type: application/json' \
  -d '{ "name": "greet" }'
# → 201 Created

# Second call with same name fails
curl -X POST http://localhost:3000/api/code/create-procedure \
  -H 'Content-Type: application/json' \
  -d '{ "name": "greet" }'
# → 409 { "error": "method already exists: greet" }
```

---

## Validation Rules

| Rule                     | Constraint                                   |
|------------------------- |--------------------------------------------- |
| Method name format       | `/^[a-zA-Z_][a-zA-Z0-9_]{0,127}$/`          |
| Parameter name format    | Same regex as method name                    |
| Parameter name uniqueness | No duplicate names within a method           |
| Max parameters           | 50 per method                                |
| Default parameter type   | `java.lang.Double`                           |
| Default function return  | `java.lang.Double`                           |
| Procedure return type    | Always `void` (not configurable)             |
| Name uniqueness          | Across `state.procedures` and `state.methods`|

---

## Security

- **Name validation** — Regex rejects injection attempts via method/parameter names.
- **XML escaping** — `escapeXml()` applied to all values written to `.a3p` XML.
- **Body size** — Express JSON parser limited to 1 MB (`express.json({ limit: "1mb" })`).
- **Parameter cap** — Hard limit of 50 parameters prevents payload abuse.
- **Localhost only** — No authentication required; server binds to localhost.
