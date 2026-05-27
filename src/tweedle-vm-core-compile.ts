import type {
  AliceFieldDefinition,
  AliceMethod,
  AliceObject,
  AliceProject,
  AliceStatement,
} from "./a3p-parser.js";
import {
  collectProjectDebugStatements,
  TweedleDebugSession,
  type DebugCallFrame,
  type DebugStatementLocation,
  type DebugTrace,
  type DebugTraceEvent,
  type DebugVariableSnapshot,
} from "./debugging.js";
import { generateExpression } from "./tweedle-codegen.js";
import { parseTweedle, type ClassDecl, type ConstructorDecl, type Expression, type FieldDecl, type MethodDecl, type Statement, type TypeRef } from "./tweedle-parser.js";
import { virtualMachine } from "./tweedle-vm-core-setup.js";
import { ExecutionResult, TweedleExecutionOptions, VMEnvironment } from "./tweedle-vm-core-types.js";
import { buildDebugRuntime } from "./tweedle-vm-stack-debug.js";

function typeRefToString(typeRef: TypeRef): string {
  if (typeRef.type === "VoidTypeRef") {
    return "void";
  }
  if (typeRef.type === "LambdaTypeRef") {
    return typeRef.raw;
  }
  const suffix = "[]".repeat(typeRef.arrayDimensions ?? (typeRef.isArray ? 1 : 0));
  const typeArgs = typeRef.typeArguments && typeRef.typeArguments.length > 0
    ? `<${typeRef.typeArguments.map(typeRefToString).join(", ")}>`
    : "";
  return `${typeRef.name}${typeArgs}${suffix}`;
}

function lowerFirst(value: string): string {
  return value.length > 0 ? value[0].toLowerCase() + value.slice(1) : value;
}

function expressionToSource(expression: Expression): string {
  if (expression.type === "LambdaExpression") {
    if ("raw" in expression && typeof expression.raw === "string") {
      return expression.raw;
    }
    const value = (expression as { value?: { name?: string } }).value;
    if (value && typeof value.name === "string") {
      return value.name;
    }
  }
  return generateExpression(expression);
}

export function convertStatements(statements: Statement[]): AliceStatement[] {
  return statements.flatMap((statement) => {
    const converted = convertStatement(statement);
    return converted ? [converted] : [];
  });
}

function convertStatement(statement: Statement): AliceStatement | null {
  switch (statement.type) {
    case "DoInOrder":
      return { kind: "DoInOrder", body: convertStatements(statement.body) };
    case "DoTogether":
      return { kind: "DoTogether", body: convertStatements(statement.body) };
    case "IfElse":
      return {
        kind: "IfElse",
        condition: expressionToSource(statement.condition),
        ifBody: convertStatements(statement.ifBody),
        elseBody: statement.elseBody ? convertStatements(statement.elseBody) : [],
      };
    case "ForEach":
      return {
        kind: "ForEach",
        itemType: typeRefToString(statement.itemType),
        itemName: statement.itemName,
        collection: expressionToSource(statement.collection),
        body: convertStatements(statement.body),
      };
    case "CountUpTo":
      return {
        kind: "CountUpTo",
        countExpression: expressionToSource(statement.count),
        body: convertStatements(statement.body),
      };
    case "WhileLoop":
      return {
        kind: "WhileLoop",
        condition: expressionToSource(statement.condition),
        body: convertStatements(statement.body),
      };
    case "TryCatch":
      return {
        kind: "TryCatch",
        tryBody: convertStatements(statement.tryBody),
        catchType: typeRefToString(statement.catchType),
        catchVariable: statement.catchVariable,
        catchBody: convertStatements(statement.catchBody),
      };
    case "Return":
      return { kind: "ReturnStatement", expression: statement.expression ? expressionToSource(statement.expression) : undefined };
    case "LocalVariableDeclaration":
      return {
        kind: "VariableDeclaration",
        name: statement.name,
        varType: typeRefToString(statement.varType),
        value: expressionToSource(statement.initializer),
      };
    case "ExpressionStatement":
      return convertExpressionStatement(statement.expression);
    case "Block":
      return { kind: "DoInOrder", body: convertStatements(statement.body) };
    case "ThisConstructorInvocationStatement":
    case "SuperConstructorInvocationStatement":
    case "DisabledBlock":
    case "Comment":
      return { kind: "Comment" };
    default:
      return null;
  }
}

function convertExpressionStatement(expression: Expression): AliceStatement | null {
  if (expression.type === "MethodInvocation") {
    return {
      kind: "MethodCall",
      object: expression.target ? expressionToSource(expression.target) : "this",
      method: expression.methodName,
      arguments: expression.arguments.map((argument) => expressionToSource(argument.value)),
    };
  }
  if (expression.type === "Assignment") {
    return {
      kind: "VariableAssignment",
      name: expressionToSource(expression.target),
      value: expressionToSource(expression.value),
    };
  }
  return { kind: "Comment" };
}

function convertMethod(method: MethodDecl | ConstructorDecl): AliceMethod {
  const returnType = "returnType" in method ? typeRefToString(method.returnType) : "void";
  return {
    name: method.name,
    isFunction: returnType !== "void",
    returnType,
    parameters: method.parameters.map((parameter) => ({
      name: parameter.name,
      type: typeRefToString(parameter.paramType),
    })),
    statements: convertStatements(method.body),
  };
}

function convertField(field: FieldDecl): AliceFieldDefinition {
  return {
    name: field.name,
    initializer: field.initializer ? expressionToSource(field.initializer) : null,
  };
}

function compileProject(mainDeclaration: ClassDecl, options: TweedleExecutionOptions): AliceProject {
  const declarationsByName = new Map<string, ClassDecl>();
  for (const declaration of [mainDeclaration, ...(options.declarations ?? [])]) {
    declarationsByName.set(declaration.name, declaration);
  }
  const declarations = [...declarationsByName.values()];
  const instanceName = options.instanceName ?? lowerFirst(mainDeclaration.name);
  const sceneObjects: AliceObject[] = [
    {
      name: instanceName,
      typeName: mainDeclaration.name,
      resourceType: null,
      position: null,
      orientation: null,
      size: null,
      constructorArgs: options.constructorArguments ?? [],
    },
  ];

  for (const declaration of declarations) {
    if (!declaration.isEnum) {
      continue;
    }
    for (const enumValue of declaration.enumValues ?? []) {
      sceneObjects.push({
        name: `${declaration.name}.${enumValue.name}`,
        typeName: declaration.name,
        resourceType: null,
        position: null,
        orientation: null,
        size: null,
        constructorArgs: enumValue.arguments.map((argument) => expressionToSource(argument.value)),
      });
    }
  }

  return {
    version: "tweedle",
    projectName: mainDeclaration.name,
    sceneObjects,
    methods: [],
    types: declarations.map((declaration) => ({
      name: declaration.name,
      superTypeName: declaration.superClass,
      methods: declaration.methods.map(convertMethod),
      constructors: declaration.constructors.map(convertMethod),
      fields: declaration.fields.map(convertField),
    })),
  };
}

function inferEntryMethod(declaration: ClassDecl): string {
  return declaration.methods.find((method) => method.name === "myFirstMethod")?.name
    ?? declaration.methods[0]?.name
    ?? "";
}

export class TweedleVM {
  private environment: VMEnvironment | null = null;

  execute(mainDeclaration: ClassDecl, options: TweedleExecutionOptions = {}): ExecutionResult {
    const project = compileProject(mainDeclaration, options);
    const execution = virtualMachine.executeEntryPoint(project, {
      receiverName: options.instanceName ?? lowerFirst(mainDeclaration.name),
      entryMethod: options.entryMethod ?? inferEntryMethod(mainDeclaration),
      args: options.arguments ?? [],
    });
    this.environment = execution.environment;
    return execution.result;
  }

  createDebugSession(mainDeclaration: ClassDecl, options: TweedleExecutionOptions = {}): TweedleDebugSession {
    const project = compileProject(mainDeclaration, options);
    const debugStatements = collectProjectDebugStatements(project);
    const debugRuntime = buildDebugRuntime(debugStatements);
    const execution = virtualMachine.executeEntryPoint(project, {
      receiverName: options.instanceName ?? lowerFirst(mainDeclaration.name),
      entryMethod: options.entryMethod ?? inferEntryMethod(mainDeclaration),
      args: options.arguments ?? [],
      debugRuntime,
    });
    const environment = execution.environment;
    this.environment = environment;

    const trace: DebugTrace = {
      statements: debugStatements,
      events: debugRuntime.trace,
      result: {
        execution_log: [...environment.log],
        returnValues: new Map(environment.returnValues),
      },
    };
    return new TweedleDebugSession(trace);
  }

  dispatchEvent(eventName: string, payload: unknown = null): ExecutionResult {
    if (!this.environment) {
      return { execution_log: [], returnValues: new Map() };
    }
    return virtualMachine.dispatchEvent(this.environment, eventName, payload);
  }
}
