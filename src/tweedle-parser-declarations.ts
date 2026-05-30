// Split from tweedle-parser.ts

export type TypeRef =
  | {
    type: "SimpleTypeRef";
    name: string;
    isArray: boolean;
    arrayDimensions?: number;
    typeArguments?: TypeRef[];
  }
  | { type: "VoidTypeRef" }
  | { type: "LambdaTypeRef"; raw: string };

export type Parameter = {
  name: string;
  paramType: TypeRef;
  isVarArgs: boolean;
  defaultValue: Expression | null;
};

export type Argument = {
  name: string | null;
  value: Expression;
};

export type Statement =
  | { type: "DoInOrder"; body: Statement[] }
  | { type: "DoTogether"; body: Statement[] }
  | { type: "IfElse"; condition: Expression; ifBody: Statement[]; elseBody: Statement[] | null }
  | { type: "ForEach"; itemType: TypeRef; itemName: string; collection: Expression; body: Statement[] }
  | { type: "CountUpTo"; count: Expression; body: Statement[] }
  | { type: "WhileLoop"; condition: Expression; body: Statement[] }
  | { type: "TryCatch"; tryBody: Statement[]; catchType: TypeRef; catchVariable: string; catchBody: Statement[] }
  | { type: "SwitchCase"; expression: Expression; cases: Array<{ value: Expression; body: Statement[] }>; defaultCase: Statement[] | null }
  | { type: "Return"; expression: Expression | null }
  | { type: "ExpressionStatement"; expression: Expression }
  | { type: "LocalVariableDeclaration"; name: string; varType: TypeRef; initializer: Expression; isConstant: boolean }
  | { type: "Block"; body: Statement[] }
  | { type: "ThisConstructorInvocationStatement"; className?: string | null; arguments?: Argument[] }
  | { type: "SuperConstructorInvocationStatement"; className?: string | null; arguments?: Argument[] }
  | { type: "DisabledBlock"; raw: string }
  | { type: "Comment"; text: string };

export type Expression =
  | { type: "Literal"; value: number | string | boolean | null; literalType: "number" | "string" | "boolean" | "null" }
  | { type: "This" }
  | { type: "Super" }
  | { type: "Identifier"; name: string }
  | { type: "MemberAccess"; target: Expression; memberName: string }
  | { type: "MethodInvocation"; target: Expression | null; methodName: string; arguments: Argument[] }
  | { type: "NewInstance"; className: string; arguments: Argument[] }
  | { type: "NewArray"; elementType: TypeRef; elements: Expression[]; size: Expression | null }
  | { type: "ArrayLiteral"; elements: Expression[] }
  | { type: "BinaryOp"; operator: string; left: Expression; right: Expression }
  | { type: "UnaryOp"; operator: string; operand: Expression }
  | { type: "Assignment"; target: Expression; value: Expression }
  | { type: "ArrayAccess"; target: Expression; index: Expression }
  | { type: "TypeCast"; expression: Expression; targetType: TypeRef }
  | { type: "InstanceOf"; expression: Expression; testType: TypeRef }
  | { type: "Parenthesized"; expression: Expression }
  | { type: "LambdaExpression"; raw: string };

export type ConstructorDecl = {
  type: "ConstructorDeclaration";
  name: string;
  parameters: Parameter[];
  body: Statement[];
  visibility: string | null;
  typeParameters?: string[];
};

export type MethodDecl = {
  type: "MethodDeclaration";
  name: string;
  returnType: TypeRef;
  parameters: Parameter[];
  body: Statement[];
  isStatic: boolean;
  visibility: string | null;
  typeParameters?: string[];
};

export type FieldDecl = {
  type: "FieldDeclaration";
  name: string;
  fieldType: TypeRef;
  initializer: Expression | null;
  isStatic: boolean;
  isConstant: boolean;
  visibility: string | null;
};

export type EnumValueDecl = {
  name: string;
  arguments: Argument[];
};

export type ClassDecl = {
  type: "ClassDeclaration";
  name: string;
  superClass: string | null;
  modelType: string | null;
  visibility: string | null;
  constructors: ConstructorDecl[];
  methods: MethodDecl[];
  fields: FieldDecl[];
  typeParameters?: string[];
  isEnum?: boolean;
  enumValues?: EnumValueDecl[];
};

export interface SourceLocation {
  line: number;
  column: number;
  offset?: number;
  length?: number;
}

export interface TweedleDiagnostic {
  severity: "error" | "warning" | "info";
  message: string;
  location: SourceLocation;
  found?: string;
  expected?: string;
  code?: string;
}

export class TweedleDiagnosticCollector {
  private readonly _diagnostics: TweedleDiagnostic[] = [];
  private _errorCount = 0;
  private _warningCount = 0;

  add(diagnostic: TweedleDiagnostic): void {
    this._diagnostics.push(diagnostic);
    if (diagnostic.severity === "error") this._errorCount++;
    else if (diagnostic.severity === "warning") this._warningCount++;
  }

  error(
    message: string,
    location: SourceLocation,
    options?: { found?: string; expected?: string; code?: string },
  ): void {
    this.add({ severity: "error", message, location, ...options });
  }

  warning(
    message: string,
    location: SourceLocation,
    options?: { found?: string; expected?: string; code?: string },
  ): void {
    this.add({ severity: "warning", message, location, ...options });
  }

  /** Returns a live read-only view of the internal diagnostics array. Copy with .slice() if you need a stable snapshot. */
  get diagnostics(): readonly TweedleDiagnostic[] {
    return this._diagnostics;
  }

  get errors(): readonly TweedleDiagnostic[] {
    return this._diagnostics.filter((diagnostic) => diagnostic.severity === "error");
  }

  get warnings(): readonly TweedleDiagnostic[] {
    return this._diagnostics.filter((diagnostic) => diagnostic.severity === "warning");
  }

  get hasErrors(): boolean {
    return this._errorCount > 0;
  }

  get hasWarnings(): boolean {
    return this._warningCount > 0;
  }

  clear(): void {
    this._diagnostics.length = 0;
    this._errorCount = 0;
    this._warningCount = 0;
  }
}

// ── TweedleParseError ────────────────────────────────────────────────────

export class TweedleParseError extends Error {
  public readonly sourceLocation: SourceLocation;

  constructor(
    message: string,
    public readonly line: number,
    public readonly column: number,
    public readonly found: string,
    public readonly expected: string,
    location?: Omit<SourceLocation, "line" | "column">,
  ) {
    super(message);
    this.name = "TweedleParseError";
    this.sourceLocation = { line, column, ...location };
  }
}

export function applyDeclarationMetadata(raw: ClassDecl, hydrated: ClassDecl): ClassDecl {
  const target = hydrated as ClassDecl & {
    typeParameters?: string[];
    isEnum?: boolean;
    enumValues?: EnumValueDecl[];
  };
  target.typeParameters = raw.typeParameters;
  target.isEnum = raw.isEnum;
  target.enumValues = raw.enumValues;
  for (let index = 0; index < raw.methods.length; index++) {
    (target.methods[index] as MethodDecl & { typeParameters?: string[] }).typeParameters = raw.methods[index].typeParameters;
  }
  for (let index = 0; index < raw.constructors.length; index++) {
    (target.constructors[index] as ConstructorDecl & { typeParameters?: string[] }).typeParameters = raw.constructors[index].typeParameters;
  }
  return target;
}
