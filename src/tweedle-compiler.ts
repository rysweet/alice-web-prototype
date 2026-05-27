import {
  TweedleParseError,
  parseTweedle,
  type ClassDecl,
  type ConstructorDecl,
  type Expression,
  type MethodDecl,
  type Statement,
  type TypeRef,
} from "./tweedle-parser.js";

export interface SourceLocation {
  filePath: string;
  line: number;
  column: number;
}

export interface ExecutableMethod {
  key: string;
  className: string;
  name: string;
  kind: "constructor" | "method";
  parameters: Array<{ name: string; type: string; isVarArgs: boolean }>;
  returnType: string;
  body: Statement[];
  isStatic: boolean;
}

export interface ExecutableAst {
  className: string;
  constructors: ExecutableMethod[];
  methods: ExecutableMethod[];
  entryPoint: string | null;
}

const DEFAULT_BUILTIN_TYPES = new Set([
  "Boolean",
  "Color",
  "Character",
  "Direction",
  "Double",
  "Duration",
  "Integer",
  "List",
  "Number",
  "Object",
  "PointOfView",
  "SActor",
  "SBiped",
  "SCamera",
  "SJointedModel",
  "SModel",
  "SScene",
  "SThing",
  "String",
  "Text",
  "Void",
  "WholeNumber",
  "decimal",
  "int",
  "void",
]);

const IMPORT_RE = /^\s*import\s+([A-Za-z0-9_.]+)\s*;\s*$/gm;

export class CompilerError extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation | null,
    public readonly code: string = "compiler-error",
  ) {
    super(message);
    this.name = "CompilerError";
  }
}

export class CompilerWarning extends Error {
  constructor(
    message: string,
    public readonly location: SourceLocation | null,
    public readonly code: string = "compiler-warning",
  ) {
    super(message);
    this.name = "CompilerWarning";
  }
}

export class CompilationUnit {
  constructor(
    public readonly filePath: string,
    public readonly source: string,
    public readonly ast: ClassDecl | null,
    public readonly imports: string[],
    public readonly executableAst: ExecutableAst | null,
    public readonly errors: CompilerError[] = [],
    public readonly warnings: CompilerWarning[] = [],
  ) {}

  get className(): string | null {
    return this.ast?.name ?? null;
  }

  get success(): boolean {
    return this.ast !== null && this.errors.length === 0;
  }
}

export class ImportResolver {
  resolveImports(source: string): string[] {
    const imports: string[] = [];
    for (const match of source.matchAll(IMPORT_RE)) {
      imports.push(match[1]);
    }
    return imports;
  }

  stripImports(source: string): string {
    return source
      .split(/\r?\n/u)
      .map((line) => line.trimStart().startsWith("import ") ? "" : line)
      .join("\n");
  }

  resolveImportStatements(unit: CompilationUnit, units: readonly CompilationUnit[], typeResolver: TypeResolver): CompilationUnit[] {
    const resolved: CompilationUnit[] = [];
    for (const specifier of unit.imports) {
      const target = typeResolver.resolveTypeReference(this.localName(specifier), unit);
      if (target instanceof CompilationUnit) {
        resolved.push(target);
      }
    }
    return resolved;
  }

  localName(specifier: string): string {
    const parts = specifier.split(".");
    return parts[parts.length - 1] ?? specifier;
  }
}

export class TypeResolver {
  private readonly builtinTypes: Set<string>;
  private readonly unitsByClassName = new Map<string, CompilationUnit>();

  constructor(units: readonly CompilationUnit[], builtinTypes: Iterable<string> = DEFAULT_BUILTIN_TYPES) {
    this.builtinTypes = new Set(builtinTypes);
    for (const unit of units) {
      if (unit.className) {
        this.unitsByClassName.set(unit.className, unit);
      }
    }
  }

  resolveTypeReference(name: string, unit?: CompilationUnit): CompilationUnit | { name: string; builtin: true } | null {
    const normalized = normalizeTypeName(name);
    if (!normalized) {
      return null;
    }
    if (this.builtinTypes.has(normalized)) {
      return { name: normalized, builtin: true };
    }
    if (unit) {
      if (unit.className === normalized) {
        return unit;
      }
      for (const specifier of unit.imports) {
        const localName = specifier.split(".").at(-1) ?? specifier;
        if (localName === normalized) {
          const imported = this.unitsByClassName.get(localName);
          if (imported) {
            return imported;
          }
        }
      }
    }
    return this.unitsByClassName.get(normalized) ?? null;
  }

  validateCompilationUnit(unit: CompilationUnit): { errors: CompilerError[]; warnings: CompilerWarning[] } {
    const errors: CompilerError[] = [];
    const warnings: CompilerWarning[] = [];
    const seenImports = new Set<string>();

    for (const specifier of unit.imports) {
      if (seenImports.has(specifier)) {
        warnings.push(new CompilerWarning(`Duplicate import '${specifier}'`, null, "duplicate-import"));
        continue;
      }
      seenImports.add(specifier);
      const localName = specifier.split(".").at(-1) ?? specifier;
      if (!this.resolveTypeReference(localName, unit)) {
        errors.push(new CompilerError(`Unknown import '${specifier}'`, null, "unknown-import"));
      }
    }

    if (!unit.ast) {
      return { errors, warnings };
    }

    const typesToCheck = new Map<string, string[]>();
    typesToCheck.set(`class ${unit.ast.name}`, [
      ...(unit.ast.superClass ? [unit.ast.superClass] : []),
      ...(unit.ast.modelType ? [unit.ast.modelType] : []),
    ]);

    for (const field of unit.ast.fields) {
      typesToCheck.set(`field ${field.name}`, [typeRefName(field.fieldType), ...collectExpressionTypeReferences(field.initializer)]);
    }
    for (const constructor of unit.ast.constructors) {
      typesToCheck.set(`constructor ${constructor.name}`, [
        ...constructor.parameters.map((parameter) => typeRefName(parameter.paramType)),
        ...collectStatementsTypeReferences(constructor.body),
      ]);
      warnings.push(...collectControlFlowWarnings(unit, constructor.name, constructor.body));
      warnings.push(...collectUnusedVariableWarnings(unit, constructor.name, constructor.body));
    }
    for (const method of unit.ast.methods) {
      typesToCheck.set(`method ${method.name}`, [
        typeRefName(method.returnType),
        ...method.parameters.map((parameter) => typeRefName(parameter.paramType)),
        ...collectStatementsTypeReferences(method.body),
      ]);
      warnings.push(...collectControlFlowWarnings(unit, method.name, method.body));
      warnings.push(...collectUnusedVariableWarnings(unit, method.name, method.body));
    }

    for (const [label, typeNames] of typesToCheck) {
      for (const rawTypeName of typeNames) {
        const typeName = normalizeTypeName(rawTypeName);
        if (!typeName || typeName === "void") {
          continue;
        }
        if (!this.resolveTypeReference(typeName, unit)) {
          errors.push(new CompilerError(`Unknown type '${typeName}' referenced by ${label}`, null, "unknown-type"));
        }
      }
    }

    return { errors, warnings };
  }
}

export class TweedleCompiler {
  constructor(
    private readonly importResolver: ImportResolver = new ImportResolver(),
  ) {}

  compile(source: string, filePath = "Main.tweedle"): CompilationUnit {
    return this.compileUnits([{ path: filePath, source }])[0];
  }

  compileUnits(sources: ReadonlyArray<{ path: string; source: string }>): CompilationUnit[] {
    const parsedUnits = sources.map(({ path, source }) => this.parseUnit(path, source));
    const typeResolver = new TypeResolver(parsedUnits.filter((unit) => unit.ast));

    return parsedUnits.map((unit) => {
      if (!unit.ast) {
        return unit;
      }
      const diagnostics = typeResolver.validateCompilationUnit(unit);
      const executableAst = buildExecutableAst(unit.ast);
      return new CompilationUnit(
        unit.filePath,
        unit.source,
        unit.ast,
        unit.imports,
        executableAst,
        [...unit.errors, ...diagnostics.errors],
        [...unit.warnings, ...diagnostics.warnings],
      );
    });
  }

  private parseUnit(filePath: string, source: string): CompilationUnit {
    const imports = this.importResolver.resolveImports(source);
    const strippedSource = this.importResolver.stripImports(source);

    try {
      const ast = parseTweedle(strippedSource);
      return new CompilationUnit(filePath, source, ast, imports, buildExecutableAst(ast));
    } catch (error) {
      if (error instanceof TweedleParseError) {
        return new CompilationUnit(
          filePath,
          source,
          null,
          imports,
          null,
          [new CompilerError(error.message, {
            filePath,
            line: error.line,
            column: error.column,
          }, "syntax-error")],
        );
      }
      throw error;
    }
  }
}

function buildExecutableAst(ast: ClassDecl): ExecutableAst {
  const constructors = ast.constructors.map((constructorDecl) => executableMethod(ast.name, constructorDecl));
  const methods = ast.methods.map((methodDecl) => executableMethod(ast.name, methodDecl));
  const entryPoint = methods.find((method) => method.name === "main")?.key
    ?? methods[0]?.key
    ?? constructors[0]?.key
    ?? null;
  return {
    className: ast.name,
    constructors,
    methods,
    entryPoint,
  };
}

function executableMethod(className: string, declaration: ConstructorDecl | MethodDecl): ExecutableMethod {
  const kind = declaration.type === "ConstructorDeclaration" ? "constructor" : "method";
  return {
    key: `${className}.${declaration.name}`,
    className,
    name: declaration.name,
    kind,
    parameters: declaration.parameters.map((parameter) => ({
      name: parameter.name,
      type: typeRefName(parameter.paramType),
      isVarArgs: parameter.isVarArgs,
    })),
    returnType: declaration.type === "ConstructorDeclaration" ? className : typeRefName(declaration.returnType),
    body: declaration.body,
    isStatic: declaration.type === "MethodDeclaration" ? declaration.isStatic : false,
  };
}

function normalizeTypeName(name: string | null | undefined): string {
  if (!name) {
    return "";
  }
  return name.replace(/\[\]/gu, "").trim();
}

function typeRefName(typeRef: TypeRef): string {
  switch (typeRef.type) {
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return "Function";
    case "SimpleTypeRef": {
      const suffix = typeRef.isArray ? "[]".repeat(typeRef.arrayDimensions ?? 1) : "";
      return `${typeRef.name}${suffix}`;
    }
    default:
      return "Object";
  }
}

function collectStatementsTypeReferences(statements: readonly Statement[]): string[] {
  const referencedTypes: string[] = [];
  for (const statement of statements) {
    switch (statement.type) {
      case "DoInOrder":
      case "DoTogether":
      case "Block":
        referencedTypes.push(...collectStatementsTypeReferences(statement.body));
        break;
      case "IfElse":
        referencedTypes.push(...collectExpressionTypeReferences(statement.condition));
        referencedTypes.push(...collectStatementsTypeReferences(statement.ifBody));
        referencedTypes.push(...collectStatementsTypeReferences(statement.elseBody ?? []));
        break;
      case "ForEach":
        referencedTypes.push(typeRefName(statement.itemType));
        referencedTypes.push(...collectExpressionTypeReferences(statement.collection));
        referencedTypes.push(...collectStatementsTypeReferences(statement.body));
        break;
      case "CountUpTo":
      case "WhileLoop":
        referencedTypes.push(...collectExpressionTypeReferences(statement.type === "WhileLoop" ? statement.condition : statement.count));
        referencedTypes.push(...collectStatementsTypeReferences(statement.body));
        break;
      case "TryCatch":
        referencedTypes.push(typeRefName(statement.catchType));
        referencedTypes.push(...collectStatementsTypeReferences(statement.tryBody));
        referencedTypes.push(...collectStatementsTypeReferences(statement.catchBody));
        break;
      case "SwitchCase":
        referencedTypes.push(...collectExpressionTypeReferences(statement.expression));
        for (const switchCase of statement.cases) {
          referencedTypes.push(...collectExpressionTypeReferences(switchCase.value));
          referencedTypes.push(...collectStatementsTypeReferences(switchCase.body));
        }
        referencedTypes.push(...collectStatementsTypeReferences(statement.defaultCase ?? []));
        break;
      case "Return":
        referencedTypes.push(...collectExpressionTypeReferences(statement.expression));
        break;
      case "ExpressionStatement":
        referencedTypes.push(...collectExpressionTypeReferences(statement.expression));
        break;
      case "LocalVariableDeclaration":
        referencedTypes.push(typeRefName(statement.varType));
        referencedTypes.push(...collectExpressionTypeReferences(statement.initializer));
        break;
      case "ThisConstructorInvocationStatement":
      case "SuperConstructorInvocationStatement":
        for (const argument of statement.arguments ?? []) {
          referencedTypes.push(...collectExpressionTypeReferences(argument.value));
        }
        break;
      case "DisabledBlock":
      case "Comment":
        break;
      default:
        assertNever(statement);
    }
  }
  return referencedTypes;
}

function collectExpressionTypeReferences(expression: Expression | null | undefined): string[] {
  if (!expression) {
    return [];
  }
  switch (expression.type) {
    case "Literal":
    case "This":
    case "Super":
    case "Identifier":
      return [];
    case "MemberAccess":
      return collectExpressionTypeReferences(expression.target);
    case "MethodInvocation":
      return [
        ...collectExpressionTypeReferences(expression.target),
        ...expression.arguments.flatMap((argument) => collectExpressionTypeReferences(argument.value)),
      ];
    case "NewInstance":
      return [expression.className, ...expression.arguments.flatMap((argument) => collectExpressionTypeReferences(argument.value))];
    case "NewArray":
      return [
        typeRefName(expression.elementType),
        ...expression.elements.flatMap(collectExpressionTypeReferences),
        ...collectExpressionTypeReferences(expression.size),
      ];
    case "ArrayLiteral":
      return expression.elements.flatMap(collectExpressionTypeReferences);
    case "BinaryOp":
      return [...collectExpressionTypeReferences(expression.left), ...collectExpressionTypeReferences(expression.right)];
    case "UnaryOp":
      return collectExpressionTypeReferences(expression.operand);
    case "Assignment":
      return [...collectExpressionTypeReferences(expression.target), ...collectExpressionTypeReferences(expression.value)];
    case "ArrayAccess":
      return [...collectExpressionTypeReferences(expression.target), ...collectExpressionTypeReferences(expression.index)];
    case "TypeCast":
      return [typeRefName(expression.targetType), ...collectExpressionTypeReferences(expression.expression)];
    case "InstanceOf":
      return [typeRefName(expression.testType), ...collectExpressionTypeReferences(expression.expression)];
    case "Parenthesized":
      return collectExpressionTypeReferences(expression.expression);
    case "LambdaExpression":
      return [];
    default:
      return assertNever(expression);
  }
}

function collectUnusedVariableWarnings(unit: CompilationUnit, methodName: string, statements: readonly Statement[]): CompilerWarning[] {
  const warnings: CompilerWarning[] = [];
  collectBlockUnusedVariables(unit, methodName, statements, warnings);
  return warnings;
}

function collectBlockUnusedVariables(
  unit: CompilationUnit,
  methodName: string,
  statements: readonly Statement[],
  warnings: CompilerWarning[],
): void {
  for (let index = 0; index < statements.length; index += 1) {
    const statement = statements[index];
    if (statement.type === "LocalVariableDeclaration") {
      const remainingStatements = statements.slice(index + 1);
      if (!statementsUseIdentifier(remainingStatements, statement.name)) {
        warnings.push(new CompilerWarning(
          `Unused local '${statement.name}' in ${unit.className ?? unit.filePath}.${methodName}`,
          null,
          "unused-variable",
        ));
      }
    }
    for (const nested of nestedBodies(statement)) {
      collectBlockUnusedVariables(unit, methodName, nested, warnings);
    }
  }
}

function collectControlFlowWarnings(unit: CompilationUnit, methodName: string, statements: readonly Statement[]): CompilerWarning[] {
  const warnings: CompilerWarning[] = [];
  collectControlFlowWarningsInBlock(unit, methodName, statements, warnings);
  return warnings;
}

function collectControlFlowWarningsInBlock(
  unit: CompilationUnit,
  methodName: string,
  statements: readonly Statement[],
  warnings: CompilerWarning[],
): void {
  let sawReturn = false;
  for (const statement of statements) {
    if (sawReturn) {
      warnings.push(new CompilerWarning(
        `Unreachable ${statement.type} in ${unit.className ?? unit.filePath}.${methodName}`,
        null,
        "unreachable-code",
      ));
      break;
    }
    for (const nested of nestedBodies(statement)) {
      collectControlFlowWarningsInBlock(unit, methodName, nested, warnings);
    }
    if (statement.type === "Return") {
      sawReturn = true;
    }
  }
}

function nestedBodies(statement: Statement): Statement[][] {
  switch (statement.type) {
    case "DoInOrder":
    case "DoTogether":
    case "Block":
    case "CountUpTo":
    case "WhileLoop":
    case "ForEach":
      return [statement.body];
    case "IfElse":
      return [statement.ifBody, statement.elseBody ?? []];
    case "TryCatch":
      return [statement.tryBody, statement.catchBody];
    case "SwitchCase":
      return [...statement.cases.map((switchCase) => switchCase.body), statement.defaultCase ?? []];
    case "Return":
    case "ExpressionStatement":
    case "LocalVariableDeclaration":
    case "ThisConstructorInvocationStatement":
    case "SuperConstructorInvocationStatement":
    case "DisabledBlock":
    case "Comment":
      return [];
    default:
      return assertNever(statement);
  }
}

function statementsUseIdentifier(statements: readonly Statement[], name: string): boolean {
  return statements.some((statement) => statementUsesIdentifier(statement, name));
}

function statementUsesIdentifier(statement: Statement, name: string): boolean {
  switch (statement.type) {
    case "DoInOrder":
    case "DoTogether":
    case "Block":
    case "CountUpTo":
    case "WhileLoop":
    case "ForEach":
      return statement.type === "ForEach"
        ? statement.itemName === name || expressionUsesIdentifier(statement.collection, name) || statementsUseIdentifier(statement.body, name)
        : statement.type === "CountUpTo"
          ? expressionUsesIdentifier(statement.count, name) || statementsUseIdentifier(statement.body, name)
          : statement.type === "WhileLoop"
            ? expressionUsesIdentifier(statement.condition, name) || statementsUseIdentifier(statement.body, name)
            : statementsUseIdentifier(statement.body, name);
    case "IfElse":
      return expressionUsesIdentifier(statement.condition, name)
        || statementsUseIdentifier(statement.ifBody, name)
        || statementsUseIdentifier(statement.elseBody ?? [], name);
    case "TryCatch":
      return statementsUseIdentifier(statement.tryBody, name) || statementsUseIdentifier(statement.catchBody, name);
    case "SwitchCase":
      return expressionUsesIdentifier(statement.expression, name)
        || statement.cases.some((switchCase) => expressionUsesIdentifier(switchCase.value, name) || statementsUseIdentifier(switchCase.body, name))
        || statementsUseIdentifier(statement.defaultCase ?? [], name);
    case "Return":
      return expressionUsesIdentifier(statement.expression, name);
    case "ExpressionStatement":
      return expressionUsesIdentifier(statement.expression, name);
    case "LocalVariableDeclaration":
      return expressionUsesIdentifier(statement.initializer, name);
    case "ThisConstructorInvocationStatement":
    case "SuperConstructorInvocationStatement":
      return (statement.arguments ?? []).some((argument) => expressionUsesIdentifier(argument.value, name));
    case "DisabledBlock":
    case "Comment":
      return false;
    default:
      return assertNever(statement);
  }
}

function expressionUsesIdentifier(expression: Expression | null | undefined, name: string): boolean {
  if (!expression) {
    return false;
  }
  switch (expression.type) {
    case "Identifier":
      return expression.name === name;
    case "MemberAccess":
      return expressionUsesIdentifier(expression.target, name);
    case "MethodInvocation":
      return expressionUsesIdentifier(expression.target, name)
        || expression.arguments.some((argument) => expressionUsesIdentifier(argument.value, name));
    case "NewInstance":
      return expression.arguments.some((argument) => expressionUsesIdentifier(argument.value, name));
    case "NewArray":
      return expression.elements.some((element) => expressionUsesIdentifier(element, name))
        || expressionUsesIdentifier(expression.size, name);
    case "ArrayLiteral":
      return expression.elements.some((element) => expressionUsesIdentifier(element, name));
    case "BinaryOp":
      return expressionUsesIdentifier(expression.left, name) || expressionUsesIdentifier(expression.right, name);
    case "UnaryOp":
      return expressionUsesIdentifier(expression.operand, name);
    case "Assignment":
      return expressionUsesIdentifier(expression.target, name) || expressionUsesIdentifier(expression.value, name);
    case "ArrayAccess":
      return expressionUsesIdentifier(expression.target, name) || expressionUsesIdentifier(expression.index, name);
    case "TypeCast":
    case "InstanceOf":
    case "Parenthesized":
      return expressionUsesIdentifier(expression.expression, name);
    case "Literal":
    case "This":
    case "Super":
    case "LambdaExpression":
      return false;
    default:
      return assertNever(expression);
  }
}

function assertNever(value: never): never {
  throw new Error(`Unhandled value: ${JSON.stringify(value)}`);
}
