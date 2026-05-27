import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";
import {
  createTweedleRuntimeEnvironment,
  registerRuntimeObject,
  resolveRuntimeClassMethod,
  resolveTopLevelRuntimeMethod,
  type TweedleRuntimeClass,
  type TweedleRuntimeEnvironment,
} from "./tweedle-runtime.js";
import { dispatchMethod } from "./tweedle-vm-builtins-dispatch.js";
import { LogEntry, RuntimeLambda, RuntimeObject, RuntimeType, VMState } from "./tweedle-vm-core-types.js";
import { evaluateValue } from "./tweedle-vm-eval-core.js";

export function instantiateSceneObjects(
  project: AliceProject,
  runtime: TweedleRuntimeEnvironment<RuntimeObject>,
  log: LogEntry[],
  returnValues: Map<string, unknown>,
  listenerMap: Map<string, RuntimeLambda[]>,
): Map<string, RuntimeObject> {
  const objectMap = new Map<string, RuntimeObject>();
  for (const source of project.sceneObjects) {
    const runtimeObject: RuntimeObject = {
      name: source.name,
      typeName: source.typeName,
      fields: new Map(),
      source,
    };
    objectMap.set(source.name, runtimeObject);
    registerRuntimeObject(runtime, runtimeObject);
  }

  let bootstrapStep = 0;
  for (const runtimeObject of objectMap.values()) {
    const state: VMState = {
      stepCounter: bootstrapStep,
      depth: 0,
      log,
      returned: false,
      returnValue: undefined,
      scopes: [new Map()],
      runtime,
      methodMap: runtime.methodTable,
      typeMap: runtime.classRegistry,
      objectMap,
      currentSelf: runtimeObject,
      returnValues,
      listenerMap,
    };
    initializeRuntimeObject(runtimeObject, state, sourceArgs(runtimeObject.source));
    bootstrapStep = state.stepCounter;
  }

  return objectMap;
}

function sourceArgs(source: AliceObject): string[] {
  return [...(source.constructorArgs ?? [])];
}

export function initializeRuntimeObject(runtimeObject: RuntimeObject, state: VMState, args: string[]): void {
  const typeChain = collectTypeChain(runtimeObject.typeName, state.typeMap);
  for (const type of typeChain) {
    for (const field of type.fields) {
      runtimeObject.fields.set(field.name, field.initializer ? evaluateValue(state, field.initializer) : null);
    }
    const constructor = selectConstructor(type, args.length);
    if (constructor) {
      dispatchMethod(constructor, args, state, runtimeObject, type.name);
    }
  }
}

function collectTypeChain(typeName: string, typeMap: Map<string, RuntimeType>): RuntimeType[] {
  const chain: RuntimeType[] = [];
  let current = typeMap.get(typeName) ?? null;
  while (current) {
    chain.unshift(current);
    current = current.superTypeName ? typeMap.get(current.superTypeName) ?? null : null;
  }
  return chain;
}

function selectConstructor(type: RuntimeType, argCount: number): AliceMethod | null {
  for (const constructor of type.constructors) {
    if (constructor.parameters.length === argCount) {
      return constructor;
    }
  }
  return type.constructors[0] ?? null;
}
