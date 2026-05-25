import type {
  AliceMethod,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";

export interface MethodFrequencyEntry {
  name: string;
  count: number;
}

export interface ResourceUsageSummary {
  totalSceneObjects: number;
  totalResourceBackedObjects: number;
  textureReferenceCount: number;
  constructorArgumentCount: number;
  byObjectType: Record<string, number>;
  byResourceType: Record<string, number>;
}

export interface CodeComplexityMetrics {
  totalMethods: number;
  procedureCount: number;
  functionCount: number;
  totalStatements: number;
  maxStatementsInMethod: number;
  averageStatementsPerMethod: number;
  maxNestingDepth: number;
  branchCount: number;
  loopCount: number;
  eventHandlerCount: number;
  cyclomaticEstimate: number;
}

export interface ProjectStatistics {
  methodFrequency: MethodFrequencyEntry[];
  statementTypeDistribution: Record<string, number>;
  resourceUsage: ResourceUsageSummary;
  complexity: CodeComplexityMetrics;
}

function increment(counter: Record<string, number>, key: string): void {
  counter[key] = (counter[key] ?? 0) + 1;
}

function nestedStatementGroups(statement: AliceStatement): AliceStatement[][] {
  const groups: AliceStatement[][] = [];
  if (statement.body) {
    groups.push(statement.body);
  }
  if (statement.ifBody) {
    groups.push(statement.ifBody);
  }
  if (statement.elseBody) {
    groups.push(statement.elseBody);
  }
  if (statement.tryBody) {
    groups.push(statement.tryBody);
  }
  if (statement.catchBody) {
    groups.push(statement.catchBody);
  }
  if (statement.defaultCase) {
    groups.push(statement.defaultCase);
  }
  for (const entry of statement.cases ?? []) {
    groups.push(entry.body);
  }
  return groups;
}

function walkStatements(
  statements: readonly AliceStatement[],
  visitor: (statement: AliceStatement, depth: number) => void,
  depth = 1,
): void {
  for (const statement of statements) {
    visitor(statement, depth);
    for (const group of nestedStatementGroups(statement)) {
      walkStatements(group, visitor, depth + 1);
    }
  }
}

function isLoopStatement(statement: AliceStatement): boolean {
  return statement.kind.includes("Loop") || statement.kind.includes("Each");
}

function branchContribution(statement: AliceStatement): number {
  if (statement.kind === "IfElse") {
    return 1 + (statement.elseBody && statement.elseBody.length > 0 ? 1 : 0);
  }
  if (statement.kind === "Switch") {
    return (statement.cases?.length ?? 0) + (statement.defaultCase ? 1 : 0);
  }
  if (statement.kind === "TryCatch") {
    return (statement.catchBody && statement.catchBody.length > 0 ? 1 : 0);
  }
  return 0;
}

function eventContribution(statement: AliceStatement): number {
  return statement.kind.includes("Event") ? 1 : 0;
}

function methodCallName(statement: AliceStatement): string | null {
  if (!statement.method) {
    return null;
  }
  return statement.object ? `${statement.object}.${statement.method}` : statement.method;
}

function roundTo(value: number, places: number): number {
  const scale = 10 ** places;
  return Math.round(value * scale) / scale;
}

export function analyzeMethodFrequency(project: AliceProject): MethodFrequencyEntry[] {
  const counts: Record<string, number> = {};
  for (const method of project.methods) {
    walkStatements(method.statements, (statement) => {
      const name = methodCallName(statement);
      if (name) {
        increment(counts, name);
      }
    });
  }
  return Object.entries(counts)
    .map(([name, count]) => ({ name, count }))
    .sort((left, right) => right.count - left.count || left.name.localeCompare(right.name));
}

export function analyzeStatementTypeDistribution(project: AliceProject): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const method of project.methods) {
    walkStatements(method.statements, (statement) => {
      increment(counts, statement.kind);
    });
  }
  return counts;
}

export function summarizeResourceUsage(project: AliceProject): ResourceUsageSummary {
  const byObjectType: Record<string, number> = {};
  const byResourceType: Record<string, number> = {};
  let constructorArgumentCount = 0;
  let totalResourceBackedObjects = 0;

  for (const sceneObject of project.sceneObjects) {
    increment(byObjectType, sceneObject.typeName);
    constructorArgumentCount += sceneObject.constructorArgs?.length ?? 0;
    if (sceneObject.resourceType) {
      increment(byResourceType, sceneObject.resourceType);
      totalResourceBackedObjects += 1;
    }
  }

  return {
    totalSceneObjects: project.sceneObjects.length,
    totalResourceBackedObjects,
    textureReferenceCount: project.textureRefs?.length ?? 0,
    constructorArgumentCount,
    byObjectType,
    byResourceType,
  };
}

export function calculateCodeComplexity(project: AliceProject): CodeComplexityMetrics {
  let totalStatements = 0;
  let maxStatementsInMethod = 0;
  let maxNestingDepth = 0;
  let branchCount = 0;
  let loopCount = 0;
  let eventHandlerCount = 0;

  for (const method of project.methods) {
    let statementsInMethod = 0;
    walkStatements(method.statements, (statement, depth) => {
      totalStatements += 1;
      statementsInMethod += 1;
      maxNestingDepth = Math.max(maxNestingDepth, depth);
      branchCount += branchContribution(statement);
      loopCount += isLoopStatement(statement) ? 1 : 0;
      eventHandlerCount += eventContribution(statement);
    });
    maxStatementsInMethod = Math.max(maxStatementsInMethod, statementsInMethod);
  }

  const totalMethods = project.methods.length;
  const functionCount = project.methods.filter((method) => method.isFunction).length;
  const procedureCount = totalMethods - functionCount;

  return {
    totalMethods,
    procedureCount,
    functionCount,
    totalStatements,
    maxStatementsInMethod,
    averageStatementsPerMethod: totalMethods === 0 ? 0 : roundTo(totalStatements / totalMethods, 2),
    maxNestingDepth,
    branchCount,
    loopCount,
    eventHandlerCount,
    cyclomaticEstimate: totalMethods + branchCount + loopCount + eventHandlerCount,
  };
}

export function collectProjectStatistics(project: AliceProject): ProjectStatistics {
  return {
    methodFrequency: analyzeMethodFrequency(project),
    statementTypeDistribution: analyzeStatementTypeDistribution(project),
    resourceUsage: summarizeResourceUsage(project),
    complexity: calculateCodeComplexity(project),
  };
}

export function countStatements(method: AliceMethod): number {
  let count = 0;
  walkStatements(method.statements, () => {
    count += 1;
  });
  return count;
}
