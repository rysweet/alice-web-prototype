import {
  parseA3P,
  type AliceMethod,
  type AliceProject,
  type AliceStatement,
} from "./a3p-parser";
import { Scene } from "./story-api/scene";
import { SGround, SScene, SCamera } from "./story-api/entities";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface ExecutionLogEntry {
  readonly step: number;
  readonly kind: string;
  readonly detail: string;
}

export interface EventRegistration {
  readonly eventType: string;
  readonly handlerName: string;
}

export interface GradeInput {
  readonly scene: Scene;
  readonly executionLog: readonly ExecutionLogEntry[];
  readonly eventRegistrations: readonly EventRegistration[];
  readonly declaredMethods: readonly string[];
}

export interface CriterionResult {
  readonly name: string;
  readonly passed: boolean;
  readonly message: string;
}

export interface GradeResult {
  readonly lesson: number;
  readonly passed: boolean;
  readonly criteria: readonly CriterionResult[];
  readonly score: number;
}

export type GradingDimension =
  | "first-lesson"
  | "events"
  | "variables"
  | "loops"
  | "functions"
  | "parameters";

export interface AstStatementEntry {
  readonly methodName: string;
  readonly depth: number;
  readonly statement: AliceStatement;
}

export interface ProjectAstSummary {
  readonly methods: readonly AliceMethod[];
  readonly statements: readonly AstStatementEntry[];
  readonly methodCount: number;
  readonly functionCount: number;
  readonly parameterCount: number;
  readonly variableCount: number;
  readonly loopCount: number;
  readonly eventCount: number;
  readonly methodCallCount: number;
  readonly statementCount: number;
}

export interface PipelineGradeInput extends GradeInput {
  readonly project: AliceProject;
  readonly ast: ProjectAstSummary;
}

export interface DimensionGradeResult {
  readonly dimension: GradingDimension;
  readonly passed: boolean;
  readonly criteria: readonly CriterionResult[];
  readonly score: number;
}

export interface GradingPipelineResult {
  readonly project: AliceProject;
  readonly ast: ProjectAstSummary;
  readonly input: PipelineGradeInput;
  readonly results: readonly DimensionGradeResult[];
  readonly reportHtml: string;
}

export const DEFAULT_GRADING_DIMENSIONS: readonly GradingDimension[] = [
  "first-lesson",
  "events",
  "variables",
  "loops",
  "functions",
  "parameters",
];

// ---------------------------------------------------------------------------
// Built-in method allowlist for L6 / L8
// ---------------------------------------------------------------------------

const BUILTIN_METHODS: ReadonlySet<string> = new Set([
  "move",
  "turn",
  "roll",
  "say",
  "think",
  "resize",
  "setOpacity",
  "setColor",
  "delay",
  "myFirstMethod",
  "run",
  "setVehicle",
]);

// ---------------------------------------------------------------------------
// Pre-compiled patterns
// ---------------------------------------------------------------------------

const RE_METHOD_NAME = /this\.(\w+)\(/;
const RE_MOVEMENT = /\b(?:move|turn)\b/;
const RE_EVENT_NAME = /(event|listener|activated|when)/i;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Count scene entities excluding default scene objects. */
function countNonDefaultEntities(scene: Scene): number {
  let count = 0;
  for (const [, entity] of scene.entities) {
    if (
      entity instanceof SGround ||
      entity instanceof SScene ||
      entity instanceof SCamera
    ) {
      continue;
    }
    count++;
  }
  return count;
}

/** Extract method name from a detail string like "this.methodName(args)". */
function extractMethodName(detail: string): string | null {
  const match = RE_METHOD_NAME.exec(detail);
  return match ? match[1] : null;
}

/** True if the execution log contains a MethodCall to a non-built-in method. */
function hasCustomMethodCall(log: readonly ExecutionLogEntry[]): boolean {
  for (const entry of log) {
    if (entry.kind !== "MethodCall") continue;
    const name = extractMethodName(entry.detail);
    if (name !== null && !BUILTIN_METHODS.has(name)) return true;
  }
  return false;
}

/** True if the log contains at least one entry with the given kind. */
function hasLogKind(log: readonly ExecutionLogEntry[], kind: string): boolean {
  return log.some((e) => e.kind === kind);
}

/** True if the log contains a MethodCall whose detail includes move or turn. */
function hasMovementStatement(log: readonly ExecutionLogEntry[]): boolean {
  return log.some(
    (e) => e.kind === "MethodCall" && RE_MOVEMENT.test(e.detail),
  );
}

function buildResult(
  lesson: number,
  criteria: CriterionResult[],
): GradeResult {
  const passed = criteria.every((c) => c.passed);
  let passedCount = 0;
  for (const c of criteria) if (c.passed) passedCount++;
  const score = criteria.length > 0 ? passedCount / criteria.length : 0;
  return { lesson, passed, criteria, score };
}

function buildDimensionResult(
  dimension: GradingDimension,
  criteria: CriterionResult[],
): DimensionGradeResult {
  const passed = criteria.every((criterion) => criterion.passed);
  const score = criteria.length === 0
    ? 0
    : criteria.filter((criterion) => criterion.passed).length / criteria.length;
  return { dimension, passed, criteria, score };
}

function nestedStatementGroups(statement: AliceStatement): AliceStatement[][] {
  const groups: AliceStatement[][] = [];
  if (statement.body) groups.push(statement.body);
  if (statement.ifBody) groups.push(statement.ifBody);
  if (statement.elseBody) groups.push(statement.elseBody);
  if (statement.tryBody) groups.push(statement.tryBody);
  if (statement.catchBody) groups.push(statement.catchBody);
  if (statement.defaultCase) groups.push(statement.defaultCase);
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

function isVariableStatement(statement: AliceStatement): boolean {
  return statement.kind === "VariableDeclaration" || statement.kind.includes("Variable");
}

function isEventStatement(statement: AliceStatement): boolean {
  return Boolean(statement.event)
    || statement.kind.includes("Event")
    || statement.kind.includes("Listener");
}

function methodKey(method: AliceMethod): string {
  return `${method.name}:${method.returnType}:${method.parameters
    .map((parameter) => `${parameter.name}:${parameter.type}`)
    .join(",")}`;
}

function collectProjectMethods(project: AliceProject): AliceMethod[] {
  const methods: AliceMethod[] = [];
  const seen = new Set<string>();

  const addMethod = (method: AliceMethod): void => {
    const key = methodKey(method);
    if (seen.has(key)) return;
    seen.add(key);
    methods.push(method);
  };

  for (const method of project.methods) {
    addMethod(method);
  }

  for (const type of project.types ?? []) {
    for (const method of type.methods ?? []) {
      addMethod(method);
    }
    for (const constructor of type.constructors ?? []) {
      addMethod(constructor);
    }
  }

  return methods;
}

function extractProjectAst(project: AliceProject): ProjectAstSummary {
  const methods = collectProjectMethods(project);
  const statements: AstStatementEntry[] = [];
  let functionCount = 0;
  let parameterCount = 0;
  let variableCount = 0;
  let loopCount = 0;
  let eventCount = 0;
  let methodCallCount = 0;

  for (const method of methods) {
    if (method.isFunction) functionCount += 1;
    parameterCount += method.parameters.length;
    walkStatements(method.statements, (statement, depth) => {
      statements.push({ methodName: method.name, depth, statement });
      if (isVariableStatement(statement)) variableCount += 1;
      if (isLoopStatement(statement)) loopCount += 1;
      if (isEventStatement(statement)) eventCount += 1;
      if (statement.kind === "MethodCall") methodCallCount += 1;
    });
  }

  return {
    methods,
    statements,
    methodCount: methods.length,
    functionCount,
    parameterCount,
    variableCount,
    loopCount,
    eventCount,
    methodCallCount,
    statementCount: statements.length,
  };
}

function formatMethodCall(statement: AliceStatement): string {
  const objectName = statement.object ?? "this";
  const methodName = statement.method ?? "unknown";
  const args = statement.arguments ?? [];
  return `${objectName}.${methodName}(${args.join(", ")})`;
}

function formatStatementDetail(statement: AliceStatement): string {
  switch (statement.kind) {
    case "MethodCall":
      return formatMethodCall(statement);
    case "VariableDeclaration":
      return `${statement.name ?? "unknown"}:${statement.varType ?? "Object"}`;
    case "IfElse":
      return statement.condition ?? "unknown";
    case "ReturnStatement":
      return statement.expression ?? "unknown";
    default:
      return statement.event
        ?? statement.expression
        ?? statement.method
        ?? statement.name
        ?? statement.kind;
  }
}

function buildExecutionLog(
  statements: readonly AstStatementEntry[],
): ExecutionLogEntry[] {
  return statements.map((entry, index) => ({
    step: index + 1,
    kind: entry.statement.kind,
    detail: formatStatementDetail(entry.statement),
  }));
}

function inferEventType(statement: AliceStatement): string {
  return statement.event ?? statement.kind;
}

function buildEventRegistrations(
  statements: readonly AstStatementEntry[],
): EventRegistration[] {
  const registrations: EventRegistration[] = [];
  const seen = new Set<string>();

  for (const entry of statements) {
    if (!isEventStatement(entry.statement)) continue;
    const registration = {
      eventType: inferEventType(entry.statement),
      handlerName: entry.methodName,
    };
    const key = `${registration.eventType}:${registration.handlerName}`;
    if (seen.has(key)) continue;
    seen.add(key);
    registrations.push(registration);
  }

  return registrations;
}

function buildDeclaredMethods(methods: readonly AliceMethod[]): string[] {
  return methods.map((method) => method.name);
}

function countPassed(criteria: readonly CriterionResult[]): number {
  return criteria.filter((criterion) => criterion.passed).length;
}

function pluralize(value: number, singular: string, plural = `${singular}s`): string {
  return `${value} ${value === 1 ? singular : plural}`;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function renderCriterionList(criteria: readonly CriterionResult[]): string {
  return criteria
    .map(
      (criterion) => `<li class="criterion ${criterion.passed ? "pass" : "fail"}">`
        + `<strong>${escapeHtml(criterion.name)}</strong>: ${escapeHtml(criterion.message)}`
        + "</li>",
    )
    .join("");
}

function renderSummaryItem(label: string, value: number): string {
  return `<li><strong>${escapeHtml(label)}:</strong> ${value}</li>`;
}

// ---------------------------------------------------------------------------
// Per-lesson grading
// ---------------------------------------------------------------------------

function gradeL1(input: GradeInput): CriterionResult[] {
  const count = countNonDefaultEntities(input.scene);
  return [
    {
      name: "entity-added",
      passed: count >= 1,
      message:
        count >= 1
          ? `${count} non-default entity(s) found`
          : "no non-default entities found in scene",
    },
  ];
}

function gradeL2(input: GradeInput): CriterionResult[] {
  const found = hasMovementStatement(input.executionLog);
  return [
    {
      name: "movement-statement",
      passed: found,
      message: found
        ? "move/turn statement found in execution log"
        : "no move or turn statement found",
    },
  ];
}

function gradeL3(input: GradeInput): CriterionResult[] {
  const count = input.eventRegistrations.length;
  return [
    {
      name: "event-listener",
      passed: count >= 1,
      message:
        count >= 1
          ? `${count} event listener(s) registered`
          : "no event listeners registered",
    },
  ];
}

function gradeL4(input: GradeInput): CriterionResult[] {
  const found = hasLogKind(input.executionLog, "CountLoop");
  return [
    {
      name: "count-loop",
      passed: found,
      message: found
        ? "CountLoop found in execution log"
        : "no CountLoop found in execution log",
    },
  ];
}

function gradeL5(input: GradeInput): CriterionResult[] {
  const found = hasLogKind(input.executionLog, "IfElse");
  return [
    {
      name: "if-else",
      passed: found,
      message: found
        ? "IfElse found in execution log"
        : "no IfElse found in execution log",
    },
  ];
}

function gradeL6(input: GradeInput): CriterionResult[] {
  const found = hasCustomMethodCall(input.executionLog);
  return [
    {
      name: "custom-method",
      passed: found,
      message: found
        ? "custom method call found beyond built-ins"
        : "no custom method calls found (only built-ins)",
    },
  ];
}

function gradeL7(input: GradeInput): CriterionResult[] {
  const count = input.declaredMethods.length;
  return [
    {
      name: "multiple-methods",
      passed: count >= 2,
      message:
        count >= 2
          ? `${count} methods declared`
          : `only ${count} method(s) declared (need ≥2)`,
    },
  ];
}

function gradeL8(input: GradeInput): CriterionResult[] {
  const entityCount = countNonDefaultEntities(input.scene);

  let hasLoop = false;
  let hasConditional = false;
  let hasCustom = false;
  for (const entry of input.executionLog) {
    if (entry.kind === "CountLoop") hasLoop = true;
    else if (entry.kind === "IfElse") hasConditional = true;
    else if (entry.kind === "MethodCall") {
      const name = extractMethodName(entry.detail);
      if (name !== null && !BUILTIN_METHODS.has(name)) hasCustom = true;
    }
    if (hasLoop && hasConditional && hasCustom) break;
  }

  return [
    {
      name: "entities-3plus",
      passed: entityCount >= 3,
      message:
        entityCount >= 3
          ? `${entityCount} non-default entities found`
          : `only ${entityCount} non-default entity(s) (need ≥3)`,
    },
    {
      name: "has-loop",
      passed: hasLoop,
      message: hasLoop
        ? "CountLoop found"
        : "no CountLoop found in execution log",
    },
    {
      name: "has-conditional",
      passed: hasConditional,
      message: hasConditional
        ? "IfElse found"
        : "no IfElse found in execution log",
    },
    {
      name: "has-custom-method",
      passed: hasCustom,
      message: hasCustom
        ? "custom method call found"
        : "no custom method calls found",
    },
  ];
}

// ---------------------------------------------------------------------------
// Dimension grading for the A3P -> AST -> report pipeline
// ---------------------------------------------------------------------------

function gradeFirstLessonDimension(input: PipelineGradeInput): CriterionResult[] {
  const entityCount = countNonDefaultEntities(input.scene);
  return [
    {
      name: "scene-entities",
      passed: entityCount >= 1,
      message:
        entityCount >= 1
          ? `${pluralize(entityCount, "non-default entity")} ready for the first lesson`
          : "no non-default scene entities found",
    },
  ];
}

function gradeEventsDimension(input: PipelineGradeInput): CriterionResult[] {
  const eventCount = input.eventRegistrations.length;
  return [
    {
      name: "event-handlers",
      passed: eventCount >= 1,
      message:
        eventCount >= 1
          ? `${pluralize(eventCount, "event handler")} found in the AST`
          : "no event handlers found in the AST",
    },
  ];
}

function gradeVariablesDimension(input: PipelineGradeInput): CriterionResult[] {
  const variableCount = input.ast.variableCount;
  return [
    {
      name: "variable-declarations",
      passed: variableCount >= 1,
      message:
        variableCount >= 1
          ? `${pluralize(variableCount, "variable declaration")} found in the AST`
          : "no variable declarations found in the AST",
    },
  ];
}

function gradeLoopsDimension(input: PipelineGradeInput): CriterionResult[] {
  const loopCount = input.ast.loopCount;
  return [
    {
      name: "loop-statements",
      passed: loopCount >= 1,
      message:
        loopCount >= 1
          ? `${pluralize(loopCount, "loop statement")} found in the AST`
          : "no loop statements found in the AST",
    },
  ];
}

function gradeFunctionsDimension(input: PipelineGradeInput): CriterionResult[] {
  const functionCount = input.ast.functionCount;
  return [
    {
      name: "functions",
      passed: functionCount >= 1,
      message:
        functionCount >= 1
          ? `${pluralize(functionCount, "function")} found in the AST`
          : "no functions found in the AST",
    },
  ];
}

function gradeParametersDimension(input: PipelineGradeInput): CriterionResult[] {
  const parameterCount = input.ast.parameterCount;
  return [
    {
      name: "parameters",
      passed: parameterCount >= 1,
      message:
        parameterCount >= 1
          ? `${pluralize(parameterCount, "parameter")} found in the AST`
          : "no parameters found in the AST",
    },
  ];
}

const DIMENSION_GRADERS: Record<
  GradingDimension,
  (input: PipelineGradeInput) => CriterionResult[]
> = {
  "first-lesson": gradeFirstLessonDimension,
  events: gradeEventsDimension,
  variables: gradeVariablesDimension,
  loops: gradeLoopsDimension,
  functions: gradeFunctionsDimension,
  parameters: gradeParametersDimension,
};

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

const GRADERS: Record<number, (input: GradeInput) => CriterionResult[]> = {
  1: gradeL1,
  2: gradeL2,
  3: gradeL3,
  4: gradeL4,
  5: gradeL5,
  6: gradeL6,
  7: gradeL7,
  8: gradeL8,
};

/** Grade a student's work for the specified lesson (1–8). */
export function gradeLesson(lesson: number, input: GradeInput): GradeResult {
  if (!Number.isInteger(lesson) || lesson < 1 || lesson > 8) {
    throw new TypeError("lesson must be an integer between 1 and 8");
  }
  const criteria = GRADERS[lesson](input);
  return buildResult(lesson, criteria);
}

export function buildGradeInputFromProject(project: AliceProject): PipelineGradeInput {
  const ast = extractProjectAst(project);
  return {
    project,
    ast,
    scene: Scene.fromProject(project),
    executionLog: buildExecutionLog(ast.statements),
    eventRegistrations: buildEventRegistrations(ast.statements),
    declaredMethods: buildDeclaredMethods(ast.methods),
  };
}

export function gradeDimension(
  dimension: GradingDimension,
  input: PipelineGradeInput,
): DimensionGradeResult {
  const grader = DIMENSION_GRADERS[dimension];
  if (!grader) {
    throw new TypeError(`unsupported grading dimension: ${dimension}`);
  }
  return buildDimensionResult(dimension, grader(input));
}

export function gradeDimensions(
  input: PipelineGradeInput,
  dimensions: readonly GradingDimension[] = DEFAULT_GRADING_DIMENSIONS,
): DimensionGradeResult[] {
  return dimensions.map((dimension) => gradeDimension(dimension, input));
}

export function renderGradingReport(
  project: AliceProject,
  ast: ProjectAstSummary,
  results: readonly DimensionGradeResult[],
): string {
  const passedDimensions = results.filter((result) => result.passed).length;
  const summaryItems = [
    renderSummaryItem("Methods", ast.methodCount),
    renderSummaryItem("Functions", ast.functionCount),
    renderSummaryItem("Parameters", ast.parameterCount),
    renderSummaryItem("Variables", ast.variableCount),
    renderSummaryItem("Loops", ast.loopCount),
    renderSummaryItem("Events", ast.eventCount),
    renderSummaryItem("Statements", ast.statementCount),
  ].join("");

  const rows = results
    .map((result) => {
      const passedCriteria = countPassed(result.criteria);
      return `<tr>`
        + `<td>${escapeHtml(result.dimension)}</td>`
        + `<td class="${result.passed ? "pass" : "fail"}">${result.passed ? "passed" : "failed"}</td>`
        + `<td>${passedCriteria}/${result.criteria.length}</td>`
        + `<td>${Math.round(result.score * 100)}%</td>`
        + `</tr>`;
    })
    .join("");

  const sections = results
    .map(
      (result) => `<section class="dimension">`
        + `<h2>${escapeHtml(result.dimension)}</h2>`
        + `<ul>${renderCriterionList(result.criteria)}</ul>`
        + `</section>`,
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Grading report – ${escapeHtml(project.projectName)}</title>
  <style>
    body { font-family: Arial, sans-serif; margin: 2rem; color: #1f2937; }
    h1, h2 { margin-bottom: 0.5rem; }
    .summary { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 1rem; }
    .summary-card, .dimension { border: 1px solid #d1d5db; border-radius: 8px; padding: 1rem; margin-bottom: 1rem; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #d1d5db; padding: 0.5rem; text-align: left; }
    th { background: #f3f4f6; }
    .pass { color: #166534; }
    .fail { color: #991b1b; }
    ul { margin: 0; padding-left: 1.2rem; }
  </style>
</head>
<body>
  <h1>Grading report for ${escapeHtml(project.projectName)}</h1>
  <p>Version ${escapeHtml(project.version)} · ${passedDimensions}/${results.length} dimensions passed</p>
  <div class="summary">
    <section class="summary-card">
      <h2>AST summary</h2>
      <ul>${summaryItems}</ul>
    </section>
  </div>
  <table>
    <thead>
      <tr>
        <th>Dimension</th>
        <th>Status</th>
        <th>Criteria</th>
        <th>Score</th>
      </tr>
    </thead>
    <tbody>${rows}</tbody>
  </table>
  ${sections}
</body>
</html>`;
}

export function runGradingPipeline(
  project: AliceProject,
  dimensions: readonly GradingDimension[] = DEFAULT_GRADING_DIMENSIONS,
): GradingPipelineResult {
  const input = buildGradeInputFromProject(project);
  const results = gradeDimensions(input, dimensions);
  return {
    project,
    ast: input.ast,
    input,
    results,
    reportHtml: renderGradingReport(project, input.ast, results),
  };
}

export async function gradeA3P(
  data: ArrayBuffer | Uint8Array,
  dimensions: readonly GradingDimension[] = DEFAULT_GRADING_DIMENSIONS,
): Promise<GradingPipelineResult> {
  const project = await parseA3P(data);
  return runGradingPipeline(project, dimensions);
}

export function looksLikeEventHandlerName(name: string): boolean {
  return RE_EVENT_NAME.test(name);
}
