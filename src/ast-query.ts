import {
  AbstractField,
  AbstractMethod,
  AbstractNode,
  AbstractStatement,
  FieldAccess,
  MethodInvocation,
  type Statement,
} from "./ast-nodes.js";

export type AstRoot = AbstractNode | readonly AbstractNode[];
export type TrackableDeclaration = AbstractField | AbstractMethod;

type StatementConstructor<T extends Statement> = abstract new (...args: never[]) => T;

export interface CircularReferenceCycle {
  readonly declarations: readonly TrackableDeclaration[];
  readonly names: readonly string[];
}

export class AstQuery {
  constructor(private readonly root: AstRoot) {}

  findMethodInvocationsOnType(typeName: string): MethodInvocation[] {
    return findMethodInvocationsOnType(this.root, typeName);
  }

  findFieldAccesses(): FieldAccess[] {
    return findFieldAccesses(this.root);
  }

  findStatementsOfType<T extends Statement>(statementType: string | StatementConstructor<T>): T[] {
    return findStatementsOfType(this.root, statementType);
  }

  countNodesByType(): Record<string, number> {
    return countNodesByType(this.root);
  }

  findCircularReferences(): CircularReferenceCycle[] {
    return findCircularReferences(this.root);
  }
}

export function findMethodInvocationsOnType(root: AstRoot, typeName: string): MethodInvocation[] {
  return collectNodes(root, (node): node is MethodInvocation => node instanceof MethodInvocation)
    .filter((invocation) => isInvocationOnType(invocation, typeName));
}

export function findFieldAccesses(root: AstRoot): FieldAccess[] {
  return collectNodes(root, (node): node is FieldAccess => node instanceof FieldAccess);
}

export function findStatementsOfType<T extends Statement>(
  root: AstRoot,
  statementType: string | StatementConstructor<T>,
): T[] {
  return collectNodes(root, (node): node is T => node instanceof AbstractStatement && matchesStatementType(node, statementType));
}

export function countNodesByType(root: AstRoot): Record<string, number> {
  const counts = new Map<string, number>();
  traverseAst(root, (node) => {
    const typeName = node.constructor.name;
    counts.set(typeName, (counts.get(typeName) ?? 0) + 1);
  });
  return Object.fromEntries([...counts.entries()].sort(([left], [right]) => left.localeCompare(right)));
}

export function findCircularReferences(root: AstRoot): CircularReferenceCycle[] {
  const declarations = collectNodes(root, (node): node is TrackableDeclaration => isTrackableDeclaration(node))
    .sort(compareDeclarations);
  const adjacency = new Map<TrackableDeclaration, Set<TrackableDeclaration>>();

  for (const declaration of declarations) {
    adjacency.set(declaration, new Set());
    traverseAst(declaration, (node) => {
      if (node instanceof MethodInvocation && node.method && isTrackableDeclaration(node.method)) {
        adjacency.get(declaration)?.add(node.method);
      }
      if (node instanceof FieldAccess && node.field && isTrackableDeclaration(node.field)) {
        adjacency.get(declaration)?.add(node.field);
      }
    }, { skipReferenceDeclarations: true });
  }

  return stronglyConnectedComponents(declarations, adjacency)
    .filter((component) => component.length > 1 || adjacency.get(component[0])?.has(component[0]))
    .map((component) => {
      const sorted = [...component].sort(compareDeclarations);
      return {
        declarations: sorted,
        names: sorted.map((declaration) => declaration.name),
      };
    })
    .sort((left, right) => left.names.join("→").localeCompare(right.names.join("→")));
}

function isInvocationOnType(invocation: MethodInvocation, typeName: string): boolean {
  const targetType = invocation.target?.getType();
  if (targetType?.type === "SimpleTypeRef" && targetType.name === typeName) {
    return true;
  }
  return invocation.method?.getDeclaringType()?.name === typeName;
}

function matchesStatementType<T extends Statement>(
  statement: AbstractStatement,
  statementType: string | StatementConstructor<T>,
): statement is T {
  if (typeof statementType === "string") {
    const runtimeType = statement as AbstractStatement & { type?: string };
    return statement.constructor.name === statementType || runtimeType.type === statementType;
  }
  return statement instanceof statementType;
}

function isTrackableDeclaration(node: AbstractNode): node is TrackableDeclaration {
  return node instanceof AbstractField || node instanceof AbstractMethod;
}

function collectNodes<T extends AbstractNode>(
  root: AstRoot,
  predicate: (node: AbstractNode) => node is T,
): T[] {
  const matches: T[] = [];
  traverseAst(root, (node) => {
    if (predicate(node)) {
      matches.push(node);
    }
  });
  return matches;
}

type TraverseOptions = {
  skipReferenceDeclarations?: boolean;
};

function traverseAst(
  root: AstRoot,
  visitor: (node: AbstractNode) => void,
  options: TraverseOptions = {},
): void {
  const seen = new Set<string>();
  const visit = (node: AbstractNode): void => {
    if (seen.has(node.id)) {
      return;
    }
    seen.add(node.id);
    visitor(node);
    for (const child of directChildren(node, options)) {
      visit(child);
    }
  };

  for (const node of flattenRoots(root)) {
    visit(node);
  }
}

function flattenRoots(root: AstRoot): AbstractNode[] {
  return Array.isArray(root) ? Array.from(root) : [root as AbstractNode];
}

function directChildren(node: AbstractNode, options: TraverseOptions): AbstractNode[] {
  const children: AbstractNode[] = [];
  for (const [key, value] of Object.entries(node as unknown as Record<string, unknown>)) {
    if (options.skipReferenceDeclarations && REFERENCE_DECLARATION_KEYS.has(key)) {
      continue;
    }
    collectNestedChildren(value, children, options);
  }
  return children;
}

const REFERENCE_DECLARATION_KEYS = new Set(["method", "field", "parameter", "local", "constructorDeclaration"]);

function collectNestedChildren(
  value: unknown,
  children: AbstractNode[],
  options: TraverseOptions,
): void {
  if (value instanceof AbstractNode) {
    children.push(value);
    return;
  }
  if (Array.isArray(value)) {
    for (const entry of value) {
      collectNestedChildren(entry, children, options);
    }
    return;
  }
  if (value && typeof value === "object") {
    for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
      if (options.skipReferenceDeclarations && REFERENCE_DECLARATION_KEYS.has(key)) {
        continue;
      }
      collectNestedChildren(nested, children, options);
    }
  }
}

function compareDeclarations(left: TrackableDeclaration, right: TrackableDeclaration): number {
  return left.name.localeCompare(right.name) || left.id.localeCompare(right.id);
}

function stronglyConnectedComponents(
  declarations: readonly TrackableDeclaration[],
  adjacency: ReadonlyMap<TrackableDeclaration, ReadonlySet<TrackableDeclaration>>,
): TrackableDeclaration[][] {
  const indices = new Map<TrackableDeclaration, number>();
  const lowLinks = new Map<TrackableDeclaration, number>();
  const stack: TrackableDeclaration[] = [];
  const onStack = new Set<TrackableDeclaration>();
  const components: TrackableDeclaration[][] = [];
  let index = 0;

  const visit = (declaration: TrackableDeclaration): void => {
    indices.set(declaration, index);
    lowLinks.set(declaration, index);
    index += 1;
    stack.push(declaration);
    onStack.add(declaration);

    for (const dependency of adjacency.get(declaration) ?? []) {
      if (!indices.has(dependency)) {
        visit(dependency);
        lowLinks.set(
          declaration,
          Math.min(lowLinks.get(declaration) ?? 0, lowLinks.get(dependency) ?? 0),
        );
      } else if (onStack.has(dependency)) {
        lowLinks.set(
          declaration,
          Math.min(lowLinks.get(declaration) ?? 0, indices.get(dependency) ?? 0),
        );
      }
    }

    if (lowLinks.get(declaration) !== indices.get(declaration)) {
      return;
    }

    const component: TrackableDeclaration[] = [];
    while (stack.length > 0) {
      const entry = stack.pop()!;
      onStack.delete(entry);
      component.push(entry);
      if (entry === declaration) {
        break;
      }
    }
    components.push(component);
  };

  for (const declaration of declarations) {
    if (!indices.has(declaration)) {
      visit(declaration);
    }
  }

  return components;
}
