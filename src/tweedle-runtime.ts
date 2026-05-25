import type { AliceFieldDefinition, AliceMethod, AliceProject, AliceTypeDefinition } from "./a3p-parser.js";

export interface TweedleRuntimeClass {
  name: string;
  superTypeName: string | null;
  methods: AliceMethod[];
  constructors: AliceMethod[];
  fields: AliceFieldDefinition[];
}

export interface TweedleRuntimeEnvironment<Receiver = unknown> {
  globalScope: Map<string, unknown>;
  classRegistry: Map<string, TweedleRuntimeClass>;
  methodTable: Map<string, AliceMethod[]>;
  objectTable: Map<string, Receiver>;
}

export function createClassRegistry(types: readonly AliceTypeDefinition[] = []): Map<string, TweedleRuntimeClass> {
  const classRegistry = new Map<string, TweedleRuntimeClass>();
  for (const type of types) {
    classRegistry.set(type.name, {
      name: type.name,
      superTypeName: type.superTypeName ?? null,
      methods: [...(type.methods ?? [])],
      constructors: [...(type.constructors ?? [])],
      fields: [...(type.fields ?? [])],
    });
  }
  return classRegistry;
}

export function createMethodTable(methods: readonly AliceMethod[]): Map<string, AliceMethod[]> {
  const methodTable = new Map<string, AliceMethod[]>();
  for (const method of methods) {
    const overloads = methodTable.get(method.name) ?? [];
    overloads.push(method);
    methodTable.set(method.name, overloads);
  }
  return methodTable;
}

export function createTweedleRuntimeEnvironment<Receiver = unknown>(project: AliceProject): TweedleRuntimeEnvironment<Receiver> {
  return {
    globalScope: new Map<string, unknown>(),
    classRegistry: createClassRegistry(project.types ?? []),
    methodTable: createMethodTable(project.methods),
    objectTable: new Map<string, Receiver>(),
  };
}

export function registerRuntimeObject<Receiver extends { name: string }>(
  runtime: TweedleRuntimeEnvironment<Receiver>,
  receiver: Receiver,
): void {
  runtime.objectTable.set(receiver.name, receiver);
  runtime.globalScope.set(receiver.name, receiver);
}

export function resolveRuntimeClassMethod(
  runtime: Pick<TweedleRuntimeEnvironment<unknown>, "classRegistry">,
  typeName: string,
  methodName: string,
  argCount: number,
): AliceMethod | null {
  let current = runtime.classRegistry.get(typeName) ?? null;
  while (current) {
    for (const method of current.methods) {
      if (method.name === methodName && method.parameters.length === argCount) {
        return method;
      }
    }
    current = current.superTypeName ? runtime.classRegistry.get(current.superTypeName) ?? null : null;
  }
  return null;
}

export function resolveTopLevelRuntimeMethod(
  runtime: Pick<TweedleRuntimeEnvironment<unknown>, "methodTable">,
  methodName: string,
  argCount: number,
): AliceMethod | null {
  const methods = runtime.methodTable.get(methodName) ?? [];
  for (const method of methods) {
    if (method.parameters.length === argCount) {
      return method;
    }
  }
  return methods[0] ?? null;
}
