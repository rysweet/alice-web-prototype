import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceProject,
  AliceStatement,
  AliceTypeDefinition,
} from "../a3p-parser.js";

export const CLASS_BEHAVIOR_PACKAGE_KIND = "alice-web.reusable-class-behavior";
export const CLASS_BEHAVIOR_PACKAGE_VERSION = 1;
export const MAX_CLASS_BEHAVIOR_JSON_BYTES = 256 * 1024;
export const MAX_CLASS_BEHAVIOR_STRING_LENGTH = 8192;
export const MAX_CLASS_BEHAVIOR_ARRAY_ITEMS = 200;

const DANGEROUS_KEYS = new Set(["__proto__", "prototype", "constructor"]);
const SAFE_NAME_RE = /^[A-Za-z_][A-Za-z0-9_]*$/;
const CONFLICT_STRATEGIES = new Set<ClassBehaviorConflictStrategy>([
  "rename",
  "replace",
  "merge",
  "reject",
]);
const CONTAINER_STATEMENT_KINDS = new Set([
  "CountLoop",
  "DoInOrder",
  "DoTogether",
  "EachInArrayTogether",
  "EachInIterableTogether",
  "ForEachInArrayLoop",
  "ForEachInIterableLoop",
  "IfElse",
  "Switch",
  "TryCatch",
  "WhileLoop",
]);

export type ClassBehaviorConflictStrategy = "rename" | "replace" | "merge" | "reject";

export interface AliceClassBehaviorPackage {
  kind: typeof CLASS_BEHAVIOR_PACKAGE_KIND;
  version: typeof CLASS_BEHAVIOR_PACKAGE_VERSION;
  exportedBy: "alice-web";
  type: AliceTypeDefinition;
  evidence?: string[];
}

export interface ImportClassBehaviorPackageOptions {
  conflictStrategy?: ClassBehaviorConflictStrategy;
}

export interface ClassBehaviorImportResult {
  schema_version: "alice-web.class-behavior-import-result/v1";
  status: "imported";
  originalName: string;
  importedName: string;
  conflictStrategy: ClassBehaviorConflictStrategy;
  renamed: boolean;
  replaced: boolean;
  merged: boolean;
  evidence: string[];
}

export type ClassBehaviorPackageErrorCode =
  | "class-behavior-conflict"
  | "class-behavior-package-too-large"
  | "dangerous-class-behavior-key"
  | "invalid-class-behavior-package"
  | "missing-class-behavior"
  | "unsafe-class-behavior-name"
  | "unsupported-class-behavior-version";

export class ClassBehaviorPackageError extends Error {
  readonly code: ClassBehaviorPackageErrorCode;
  readonly status: number;
  readonly existingName?: string;

  constructor(
    code: ClassBehaviorPackageErrorCode,
    message: string,
    options: { status?: number; existingName?: string } = {},
  ) {
    super(message);
    this.name = "ClassBehaviorPackageError";
    this.code = code;
    this.status = options.status ?? (code === "class-behavior-conflict" ? 409 : 400);
    this.existingName = options.existingName;
  }
}

export function exportClassBehaviorPackage(project: AliceProject, typeName: string): AliceClassBehaviorPackage {
  const type = (project.types ?? []).find((candidate) => candidate.name === typeName);
  if (!type) {
    throw new ClassBehaviorPackageError(
      "missing-class-behavior",
      `Class behavior not found: ${typeName}`,
    );
  }

  const packageData: AliceClassBehaviorPackage = {
    kind: CLASS_BEHAVIOR_PACKAGE_KIND,
    version: CLASS_BEHAVIOR_PACKAGE_VERSION,
    exportedBy: "alice-web",
    type: cloneType(type),
    evidence: buildPackageEvidence(type),
  };
  validatePackage(packageData);
  return packageData;
}

export function serializeClassBehaviorPackage(packageData: AliceClassBehaviorPackage): string {
  const parsed = parseClassBehaviorPackage(packageData);
  const serialized = `${JSON.stringify(parsed, null, 2)}\n`;
  assertJsonSize(serialized);
  return serialized;
}

export function parseClassBehaviorPackage(input: unknown): AliceClassBehaviorPackage {
  const parsed = typeof input === "string" ? parseJsonString(input) : cloneUntrusted(input);
  validatePackage(parsed);
  return parsed as AliceClassBehaviorPackage;
}

export function importClassBehaviorPackage(
  project: AliceProject,
  packageInput: unknown,
  options: ImportClassBehaviorPackageOptions = {},
): ClassBehaviorImportResult {
  const packageData = parseClassBehaviorPackage(packageInput);
  const strategy = options.conflictStrategy ?? "rename";
  if (!CONFLICT_STRATEGIES.has(strategy)) {
    throw new ClassBehaviorPackageError(
      "invalid-class-behavior-package",
      `Unsupported class behavior conflict strategy: ${String(options.conflictStrategy)}`,
    );
  }

  const originalName = packageData.type.name;
  const existingIndex = (project.types ?? []).findIndex((candidate) => candidate.name === originalName);
  const incoming = cloneType(packageData.type);

  project.types ??= [];

  if (existingIndex === -1) {
    project.types.push(incoming);
    return importResult(originalName, incoming.name, strategy, {
      renamed: false,
      replaced: false,
      merged: false,
    });
  }

  if (strategy === "reject") {
    throw new ClassBehaviorPackageError(
      "class-behavior-conflict",
      `Class behavior already exists: ${originalName}`,
      { status: 409, existingName: originalName },
    );
  }

  if (strategy === "replace") {
    project.types[existingIndex] = incoming;
    return importResult(originalName, incoming.name, strategy, {
      renamed: false,
      replaced: true,
      merged: false,
    });
  }

  if (strategy === "merge") {
    project.types[existingIndex] = mergeTypeDefinitions(project.types[existingIndex], incoming);
    return importResult(originalName, originalName, strategy, {
      renamed: false,
      replaced: false,
      merged: true,
    });
  }

  const renamed = renameTypeDefinition(incoming, nextTypeName(project.types, originalName));
  project.types.push(renamed);
  return importResult(originalName, renamed.name, strategy, {
    renamed: true,
    replaced: false,
    merged: false,
  });
}

function importResult(
  originalName: string,
  importedName: string,
  conflictStrategy: ClassBehaviorConflictStrategy,
  flags: { renamed: boolean; replaced: boolean; merged: boolean },
): ClassBehaviorImportResult {
  return {
    schema_version: "alice-web.class-behavior-import-result/v1",
    status: "imported",
    originalName,
    importedName,
    conflictStrategy,
    renamed: flags.renamed,
    replaced: flags.replaced,
    merged: flags.merged,
    evidence: [
      "class-behavior-package-validated",
      "class-behavior-type-imported",
      flags.renamed ? "class-behavior-conflict-renamed" : "class-behavior-name-preserved",
      ...(flags.replaced ? ["class-behavior-conflict-replaced"] : []),
      ...(flags.merged ? ["class-behavior-conflict-merged"] : []),
    ],
  };
}

function parseJsonString(input: string): unknown {
  assertJsonSize(input);
  try {
    return JSON.parse(input, (key, value) => {
      if (DANGEROUS_KEYS.has(key)) {
        throw new ClassBehaviorPackageError(
          "dangerous-class-behavior-key",
          `Class behavior package contains a dangerous key: ${key}`,
        );
      }
      return value;
    });
  } catch (error) {
    if (error instanceof ClassBehaviorPackageError) throw error;
    throw new ClassBehaviorPackageError(
      "invalid-class-behavior-package",
      "Class behavior package must be valid JSON.",
    );
  }
}

function cloneUntrusted(input: unknown): unknown {
  assertSafeJsonValue(input);
  const serialized = JSON.stringify(input);
  if (serialized === undefined) {
    throw new ClassBehaviorPackageError(
      "invalid-class-behavior-package",
      "Class behavior package must be a JSON object.",
    );
  }
  assertJsonSize(serialized);
  return JSON.parse(serialized);
}

function assertJsonSize(input: string): void {
  if (new TextEncoder().encode(input).byteLength > MAX_CLASS_BEHAVIOR_JSON_BYTES) {
    throw new ClassBehaviorPackageError(
      "class-behavior-package-too-large",
      `Class behavior package must be ${MAX_CLASS_BEHAVIOR_JSON_BYTES} bytes or fewer.`,
    );
  }
}

function assertSafeJsonValue(value: unknown, depth = 0): void {
  if (depth > 32) {
    throw new ClassBehaviorPackageError(
      "class-behavior-package-too-large",
      "Class behavior package nesting is too deep.",
    );
  }
  if (value === null || typeof value === "boolean" || typeof value === "number") {
    if (typeof value === "number" && !Number.isFinite(value)) {
      throw new ClassBehaviorPackageError(
        "invalid-class-behavior-package",
        "Class behavior package numbers must be finite.",
      );
    }
    return;
  }
  if (typeof value === "string") {
    assertStringSize(value);
    return;
  }
  if (Array.isArray(value)) {
    assertArraySize(value);
    for (const item of value) assertSafeJsonValue(item, depth + 1);
    return;
  }
  if (typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype) {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (DANGEROUS_KEYS.has(key)) {
        throw new ClassBehaviorPackageError(
          "dangerous-class-behavior-key",
          `Class behavior package contains a dangerous key: ${key}`,
        );
      }
      assertStringSize(key);
      assertSafeJsonValue(nested, depth + 1);
    }
    return;
  }
  throw new ClassBehaviorPackageError(
    "invalid-class-behavior-package",
    "Class behavior package must contain only JSON values.",
  );
}

function validatePackage(value: unknown): asserts value is AliceClassBehaviorPackage {
  assertSafeJsonValue(value);
  if (!isPlainObject(value)) {
    throw invalidPackage("Class behavior package must be a JSON object.");
  }
  if (value.kind !== CLASS_BEHAVIOR_PACKAGE_KIND) {
    throw invalidPackage("Class behavior package kind is not supported.");
  }
  if (value.version !== CLASS_BEHAVIOR_PACKAGE_VERSION) {
    throw new ClassBehaviorPackageError(
      "unsupported-class-behavior-version",
      `Class behavior package version ${String(value.version)} is not supported.`,
    );
  }
  if (value.exportedBy !== "alice-web") {
    throw invalidPackage("Class behavior package exporter must be alice-web.");
  }
  validateTypeDefinition(value.type);
  validateStringArray(value.evidence, "evidence");
}

function validateTypeDefinition(value: unknown): asserts value is AliceTypeDefinition {
  if (!isPlainObject(value)) {
    throw invalidPackage("Class behavior package type must be an object.");
  }
  assertSafeName(value.name, "class behavior");
  assertOptionalString(value.superTypeName, "superTypeName");
  validateFields(value.fields);
  validateMethods(value.methods, "methods");
  validateMethods(value.constructors, "constructors");
}

function validateFields(value: unknown): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalidPackage("Class behavior fields must be an array.");
  assertArraySize(value);
  for (const field of value) {
    if (!isPlainObject(field)) throw invalidPackage("Class behavior field must be an object.");
    assertSafeName(field.name, "field");
    assertOptionalString(field.typeName, "field type");
    assertOptionalString(field.resourceType, "field resource type");
    assertOptionalString(field.initializer, "field initializer");
  }
}

function validateMethods(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalidPackage(`Class behavior ${label} must be an array.`);
  assertArraySize(value);
  for (const method of value) {
    validateMethod(method, label);
  }
}

function validateMethod(value: unknown, label: string): asserts value is AliceMethod {
  if (!isPlainObject(value)) throw invalidPackage(`Class behavior ${label} entry must be an object.`);
  assertSafeName(value.name, label === "constructors" ? "constructor" : "method");
  if (typeof value.isFunction !== "boolean") {
    throw invalidPackage("Class behavior method isFunction must be a boolean.");
  }
  assertRequiredString(value.returnType, "return type");
  if (!Array.isArray(value.parameters)) {
    throw invalidPackage("Class behavior method parameters must be an array.");
  }
  assertArraySize(value.parameters);
  for (const parameter of value.parameters) {
    if (!isPlainObject(parameter)) {
      throw invalidPackage("Class behavior method parameter must be an object.");
    }
    assertSafeName(parameter.name, "parameter");
    assertRequiredString(parameter.type, "parameter type");
  }
  if (!Array.isArray(value.statements)) {
    throw invalidPackage("Class behavior method statements must be an array.");
  }
  assertArraySize(value.statements);
  for (const statement of value.statements) validateStatement(statement);
}

function validateStatement(value: unknown): asserts value is AliceStatement {
  if (!isPlainObject(value)) throw invalidPackage("Class behavior statement must be an object.");
  assertRequiredString(value.kind, "statement kind");
  assertOptionalString(value.object, "statement object");
  assertOptionalString(value.method, "statement method");
  assertOptionalString(value.itemType, "statement item type");
  assertOptionalString(value.itemName, "statement item name");
  assertOptionalString(value.collection, "statement collection");
  assertOptionalString(value.condition, "statement condition");
  assertOptionalString(value.event, "statement event");
  assertOptionalString(value.expression, "statement expression");
  assertOptionalString(value.name, "statement name");
  assertOptionalString(value.varType, "statement variable type");
  assertOptionalString(value.value, "statement value");
  if (value.count !== undefined) {
    const count = value.count;
    if (typeof count !== "number" || !Number.isInteger(count) || count < 0) {
      throw invalidPackage("Class behavior statement count must be a non-negative integer.");
    }
  }
  assertOptionalString(value.countExpression, "statement count expression");
  validateStringArray(value.arguments, "statement arguments");
  validateStatementArray(value.body, "statement body");
  validateStatementArray(value.ifBody, "statement if body");
  validateStatementArray(value.elseBody, "statement else body");
  validateStatementArray(value.tryBody, "statement try body");
  validateStatementArray(value.catchBody, "statement catch body");
  assertOptionalString(value.catchType, "statement catch type");
  assertOptionalString(value.catchVariable, "statement catch variable");
  if (value.cases !== undefined) {
    if (!Array.isArray(value.cases)) throw invalidPackage("Class behavior statement cases must be an array.");
    assertArraySize(value.cases);
    for (const caseEntry of value.cases) {
      if (!isPlainObject(caseEntry)) throw invalidPackage("Class behavior statement case must be an object.");
      assertRequiredString(caseEntry.value, "statement case value");
      validateStatementArray(caseEntry.body, "statement case body", true);
    }
  }
  if (value.defaultCase !== undefined && value.defaultCase !== null) {
    validateStatementArray(value.defaultCase, "statement default case", true);
  }
}

function validateStringArray(value: unknown, label: string): void {
  if (value === undefined) return;
  if (!Array.isArray(value)) throw invalidPackage(`Class behavior ${label} must be an array.`);
  assertArraySize(value);
  for (const item of value) assertRequiredString(item, label);
}

function validateStatementArray(value: unknown, label: string, required = false): void {
  if (value === undefined) {
    if (required) throw invalidPackage(`Class behavior ${label} must be an array.`);
    return;
  }
  if (!Array.isArray(value)) throw invalidPackage(`Class behavior ${label} must be an array.`);
  assertArraySize(value);
  for (const statement of value) validateStatement(statement);
}

function assertRequiredString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.trim() === "") {
    throw invalidPackage(`Class behavior ${label} must be a non-empty string.`);
  }
  assertStringSize(value);
}

function assertOptionalString(value: unknown, label: string): void {
  if (value === undefined || value === null) return;
  if (typeof value !== "string") {
    throw invalidPackage(`Class behavior ${label} must be a string.`);
  }
  assertStringSize(value);
}

function assertSafeName(value: unknown, label: string): asserts value is string {
  assertRequiredString(value, label);
  if (!SAFE_NAME_RE.test(value)) {
    throw new ClassBehaviorPackageError(
      "unsafe-class-behavior-name",
      `Class behavior ${label} name is not safe: ${value}`,
    );
  }
}

function assertStringSize(value: string): void {
  if (value.length > MAX_CLASS_BEHAVIOR_STRING_LENGTH) {
    throw new ClassBehaviorPackageError(
      "class-behavior-package-too-large",
      `Class behavior package strings must be ${MAX_CLASS_BEHAVIOR_STRING_LENGTH} characters or fewer.`,
    );
  }
}

function assertArraySize(value: readonly unknown[]): void {
  if (value.length > MAX_CLASS_BEHAVIOR_ARRAY_ITEMS) {
    throw new ClassBehaviorPackageError(
      "class-behavior-package-too-large",
      `Class behavior package arrays must contain ${MAX_CLASS_BEHAVIOR_ARRAY_ITEMS} items or fewer.`,
    );
  }
}

function invalidPackage(message: string): ClassBehaviorPackageError {
  return new ClassBehaviorPackageError("invalid-class-behavior-package", message);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && Object.getPrototypeOf(value) === Object.prototype;
}

function cloneType(type: AliceTypeDefinition): AliceTypeDefinition {
  return JSON.parse(JSON.stringify(type)) as AliceTypeDefinition;
}

function buildPackageEvidence(type: AliceTypeDefinition): string[] {
  return [
    "class-behavior-type-present",
    ...(type.superTypeName ? ["class-behavior-supertype-preserved"] : []),
    ...((type.fields?.length ?? 0) > 0 ? ["class-behavior-fields-preserved"] : []),
    ...((type.constructors?.length ?? 0) > 0 ? ["class-behavior-constructors-preserved"] : []),
    ...((type.methods ?? []).some(hasExecutableStatements) ? ["class-behavior-methods-preserved"] : []),
  ];
}

function hasExecutableStatements(method: AliceMethod): boolean {
  return method.statements.some(hasExecutableStatement);
}

function hasExecutableStatement(statement: AliceStatement): boolean {
  if (["Comment", "comment"].includes(statement.kind)) {
    return false;
  }
  return nestedStatementGroups(statement).some((statements) => statements.some(hasExecutableStatement))
    || !isStatementContainer(statement);
}

function nestedStatementGroups(statement: AliceStatement): AliceStatement[][] {
  return [
    statement.body,
    statement.ifBody,
    statement.elseBody,
    statement.tryBody,
    statement.catchBody,
    statement.defaultCase ?? undefined,
    ...(statement.cases ?? []).map((caseBranch) => caseBranch.body),
  ].filter((statements): statements is AliceStatement[] => Array.isArray(statements));
}

function isStatementContainer(statement: AliceStatement): boolean {
  return CONTAINER_STATEMENT_KINDS.has(statement.kind) || nestedStatementGroups(statement).length > 0;
}

function cloneMethod(method: AliceMethod): AliceMethod {
  return JSON.parse(JSON.stringify(method)) as AliceMethod;
}

function mergeTypeDefinitions(existing: AliceTypeDefinition, incoming: AliceTypeDefinition): AliceTypeDefinition {
  return {
    ...cloneType(existing),
    name: existing.name,
    superTypeName: incoming.superTypeName ?? existing.superTypeName,
    fields: mergeNamedItems(existing.fields ?? [], incoming.fields ?? []),
    methods: mergeNamedItems(existing.methods ?? [], incoming.methods ?? []),
    constructors: mergeConstructors(existing.constructors ?? [], incoming.constructors ?? []),
  };
}

function mergeNamedItems<T extends { name: string }>(existing: readonly T[], incoming: readonly T[]): T[] {
  const merged = existing.map((item) => JSON.parse(JSON.stringify(item)) as T);
  const indexByName = new Map(merged.map((item, index) => [item.name, index]));
  for (const item of incoming) {
    const cloned = JSON.parse(JSON.stringify(item)) as T;
    const index = indexByName.get(item.name);
    if (index === undefined) {
      indexByName.set(item.name, merged.length);
      merged.push(cloned);
    } else {
      merged[index] = cloned;
    }
  }
  return merged;
}

function mergeConstructors(existing: readonly AliceMethod[], incoming: readonly AliceMethod[]): AliceMethod[] {
  const merged = existing.map(cloneMethod);
  for (let index = 0; index < incoming.length; index += 1) {
    merged[index] = cloneMethod(incoming[index]);
  }
  return merged;
}

function nextTypeName(types: readonly AliceTypeDefinition[], baseName: string): string {
  const existingNames = new Set(types.map((type) => type.name));
  let suffix = 2;
  let candidate = `${baseName}${suffix}`;
  while (existingNames.has(candidate)) {
    suffix += 1;
    candidate = `${baseName}${suffix}`;
  }
  return candidate;
}

function renameTypeDefinition(type: AliceTypeDefinition, nextName: string): AliceTypeDefinition {
  const originalName = type.name;
  const renamed = cloneType(type);
  renamed.name = nextName;
  renamed.fields = renamed.fields?.map((field) => ({
    ...field,
    typeName: field.typeName === originalName ? nextName : field.typeName,
  }));
  renamed.methods = renamed.methods?.map((method) => renameMethodTypeReferences(method, originalName, nextName));
  renamed.constructors = renamed.constructors?.map((constructorMethod) => ({
    ...renameMethodTypeReferences(constructorMethod, originalName, nextName),
    name: constructorMethod.name === originalName ? nextName : constructorMethod.name,
  }));
  return renamed;
}

function renameMethodTypeReferences(
  method: AliceMethod,
  originalName: string,
  nextName: string,
): AliceMethod {
  return {
    ...method,
    returnType: method.returnType === originalName ? nextName : method.returnType,
    parameters: method.parameters.map((parameter) => ({
      ...parameter,
      type: parameter.type === originalName ? nextName : parameter.type,
    })),
    statements: method.statements.map((statement) =>
      renameStatementTypeReferences(statement, originalName, nextName)
    ),
  };
}

function renameStatementTypeReferences(
  statement: AliceStatement,
  originalName: string,
  nextName: string,
): AliceStatement {
  const renamed: AliceStatement = {
    ...statement,
    ...(statement.varType === originalName ? { varType: nextName } : {}),
    ...(statement.itemType === originalName ? { itemType: nextName } : {}),
    ...(statement.catchType === originalName ? { catchType: nextName } : {}),
  };
  if (statement.body) {
    renamed.body = renameStatementList(statement.body, originalName, nextName);
  }
  if (statement.ifBody) {
    renamed.ifBody = renameStatementList(statement.ifBody, originalName, nextName);
  }
  if (statement.elseBody) {
    renamed.elseBody = renameStatementList(statement.elseBody, originalName, nextName);
  }
  if (statement.tryBody) {
    renamed.tryBody = renameStatementList(statement.tryBody, originalName, nextName);
  }
  if (statement.catchBody) {
    renamed.catchBody = renameStatementList(statement.catchBody, originalName, nextName);
  }
  if (statement.cases) {
    renamed.cases = statement.cases.map((entry) => ({
      ...entry,
      body: renameStatementList(entry.body, originalName, nextName),
    }));
  }
  if (statement.defaultCase) {
    renamed.defaultCase = renameStatementList(statement.defaultCase, originalName, nextName);
  }
  return renamed;
}

function renameStatementList(
  statements: AliceStatement[],
  originalName: string,
  nextName: string,
): AliceStatement[] {
  return statements.map((statement) =>
    renameStatementTypeReferences(statement, originalName, nextName)
  );
}
