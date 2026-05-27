import type { AliceMethod, AliceTypeDefinition } from "./a3p-parser.js";

export interface TypeMethodSignature {
  readonly name: string;
  readonly returnTypeName: string | null;
  readonly parameters: ReadonlyArray<{ readonly name: string; readonly typeName: string }>;
}

export interface TypePropertySignature {
  readonly name: string;
  readonly typeName: string | null;
}

export interface TypeDefinition {
  readonly name: string;
  readonly superTypeName: string | null;
  readonly interfaces: ReadonlyArray<string>;
  readonly category: string | null;
  readonly methods: ReadonlyArray<TypeMethodSignature>;
  readonly properties: ReadonlyArray<TypePropertySignature>;
  readonly constructors: ReadonlyArray<TypeMethodSignature>;
}

function normalizeMethod(method: AliceMethod | TypeMethodSignature): TypeMethodSignature {
  if ("returnTypeName" in method) {
    return {
      name: method.name,
      returnTypeName: method.returnTypeName,
      parameters: [...method.parameters],
    };
  }
  return {
    name: method.name,
    returnTypeName: method.returnType,
    parameters: method.parameters.map((parameter) => ({ name: parameter.name, typeName: parameter.type })),
  };
}

export function normalizeTypeDefinition(type: AliceTypeDefinition | TypeDefinition): TypeDefinition {
  if ("interfaces" in type) {
    return {
      name: type.name,
      superTypeName: type.superTypeName ?? null,
      interfaces: [...type.interfaces],
      category: type.category ?? null,
      methods: type.methods.map(normalizeMethod),
      properties: type.properties.map((property) => ({ ...property })),
      constructors: type.constructors.map(normalizeMethod),
    };
  }
  return {
    name: type.name,
    superTypeName: type.superTypeName ?? null,
    interfaces: [],
    category: null,
    methods: (type.methods ?? []).map(normalizeMethod),
    properties: (type.fields ?? []).map((field) => ({ name: field.name, typeName: field.typeName ?? null })),
    constructors: (type.constructors ?? []).map(normalizeMethod),
  };
}

function normalizeTypes(types: readonly (AliceTypeDefinition | TypeDefinition)[]): TypeDefinition[] {
  return types.map(normalizeTypeDefinition);
}

export class TypeNode {
  readonly children: TypeNode[] = [];

  constructor(
    readonly type: TypeDefinition,
    readonly depth = 0,
    readonly parent: TypeNode | null = null,
  ) {}

  addChild(type: TypeDefinition): TypeNode {
    const child = new TypeNode(type, this.depth + 1, this);
    this.children.push(child);
    return child;
  }

  flatten(): TypeNode[] {
    return [this, ...this.children.flatMap((child) => child.flatten())];
  }
}

export interface TypeSearchQuery {
  readonly name?: string;
  readonly category?: string;
  readonly interfaceName?: string;
}

export class TypeHierarchyBuilder {
  build(types: readonly (AliceTypeDefinition | TypeDefinition)[]): TypeNode[] {
    const normalized = normalizeTypes(types);
    const nodes = new Map<string, TypeNode>();
    for (const type of normalized) {
      nodes.set(type.name, new TypeNode(type));
    }

    const roots: TypeNode[] = [];
    for (const type of normalized) {
      const node = nodes.get(type.name)!;
      const parent = type.superTypeName ? nodes.get(type.superTypeName) ?? null : null;
      if (!parent) {
        roots.push(node);
        continue;
      }
      const attached = new TypeNode(type, parent.depth + 1, parent);
      nodes.set(type.name, attached);
      parent.children.push(attached);
    }

    return roots.sort((left, right) => left.type.name.localeCompare(right.type.name));
  }

  index(types: readonly (AliceTypeDefinition | TypeDefinition)[]): Map<string, TypeDefinition> {
    return new Map(normalizeTypes(types).map((type) => [type.name, type]));
  }
}

export class TypeSearch {
  private readonly types: TypeDefinition[];

  constructor(types: readonly (AliceTypeDefinition | TypeDefinition)[]) {
    this.types = normalizeTypes(types);
  }

  find(query: TypeSearchQuery): TypeDefinition[] {
    const name = query.name?.toLowerCase() ?? null;
    return this.types.filter((type) => {
      if (name && !type.name.toLowerCase().includes(name)) {
        return false;
      }
      if (query.category && type.category !== query.category) {
        return false;
      }
      if (query.interfaceName && !type.interfaces.includes(query.interfaceName)) {
        return false;
      }
      return true;
    });
  }
}

export class TypeInspector {
  private readonly index: Map<string, TypeDefinition>;

  constructor(types: readonly (AliceTypeDefinition | TypeDefinition)[]) {
    this.index = new TypeHierarchyBuilder().index(types);
  }

  inspect(typeName: string) {
    const type = this.requireType(typeName);
    return {
      type,
      methods: [...type.methods],
      properties: [...type.properties],
      constructors: [...type.constructors],
    };
  }

  listMethods(typeName: string): ReadonlyArray<TypeMethodSignature> {
    return this.requireType(typeName).methods;
  }

  listProperties(typeName: string): ReadonlyArray<TypePropertySignature> {
    return this.requireType(typeName).properties;
  }

  listConstructors(typeName: string): ReadonlyArray<TypeMethodSignature> {
    return this.requireType(typeName).constructors;
  }

  private requireType(typeName: string): TypeDefinition {
    const type = this.index.get(typeName);
    if (!type) {
      throw new Error(`Unknown type: ${typeName}`);
    }
    return type;
  }
}

export class TypeRelationship {
  static isA(typeName: string, targetTypeName: string, types: readonly (AliceTypeDefinition | TypeDefinition)[]): boolean {
    const index = new TypeHierarchyBuilder().index(types);
    let current = index.get(typeName) ?? null;
    while (current) {
      if (current.name === targetTypeName) {
        return true;
      }
      current = current.superTypeName ? index.get(current.superTypeName) ?? null : null;
    }
    return false;
  }

  static hasA(typeName: string, propertyTypeName: string, types: readonly (AliceTypeDefinition | TypeDefinition)[]): boolean {
    const type = new TypeHierarchyBuilder().index(types).get(typeName);
    return type?.properties.some((property) => property.typeName === propertyTypeName) ?? false;
  }

  static implements(typeName: string, interfaceName: string, types: readonly (AliceTypeDefinition | TypeDefinition)[]): boolean {
    const type = new TypeHierarchyBuilder().index(types).get(typeName);
    return type?.interfaces.includes(interfaceName) ?? false;
  }
}

function comparableSignature(method: TypeMethodSignature): string {
  return `${method.name}(${method.parameters.map((parameter) => parameter.typeName).join(",")})=>${method.returnTypeName ?? "void"}`;
}

export class TypeComparison {
  static nominallyCompatible(sourceTypeName: string, targetTypeName: string, types: readonly (AliceTypeDefinition | TypeDefinition)[]): boolean {
    return TypeRelationship.isA(sourceTypeName, targetTypeName, types);
  }

  static structurallyCompatible(source: AliceTypeDefinition | TypeDefinition, target: AliceTypeDefinition | TypeDefinition): boolean {
    const left = normalizeTypeDefinition(source);
    const right = normalizeTypeDefinition(target);
    const leftMethods = new Set(left.methods.map(comparableSignature));
    const leftProperties = new Set(left.properties.map((property) => `${property.name}:${property.typeName ?? "unknown"}`));
    const leftConstructors = new Set(left.constructors.map((constructorSignature) => constructorSignature.parameters.length));
    return right.methods.every((method) => leftMethods.has(comparableSignature(method)))
      && right.properties.every((property) => leftProperties.has(`${property.name}:${property.typeName ?? "unknown"}`))
      && right.constructors.every((constructorSignature) => leftConstructors.has(constructorSignature.parameters.length));
  }
}
