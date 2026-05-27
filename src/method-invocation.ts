import type { TypeRef } from "./ast-nodes.js";
import { AliceFormatter, type Formatter } from "./formatters.js";
import { typeRefsAssignable } from "./type-system.js";
import {
  ClassDeclaration,
  ConstructorDeclaration,
  InheritanceResolver,
  MethodDeclaration,
  MethodSignature,
} from "./class-system.js";

function typeToString(typeRef: TypeRef | null): string {
  if (!typeRef) {
    return "null";
  }
  switch (typeRef.type) {
    case "SimpleTypeRef":
      return `${typeRef.name}${typeRef.isArray ? "[]" : ""}`;
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return typeRef.raw;
  }
}

function argumentsText(argumentsList: readonly InvocationArgument[]): string[] {
  return argumentsList.map((argument) => String(argument.value));
}

function parametersAccept(
  parameters: readonly { readonly paramType: TypeRef }[],
  argumentsList: readonly InvocationArgument[],
): InvocationValidationIssue[] {
  if (parameters.length !== argumentsList.length) {
    return [{
      kind: "argument-count",
      message: `Expected ${parameters.length} arguments but received ${argumentsList.length}.`,
      index: null,
      expected: String(parameters.length),
      actual: String(argumentsList.length),
    }];
  }
  const issues: InvocationValidationIssue[] = [];
  parameters.forEach((parameter, index) => {
    const argumentType = argumentsList[index]?.type ?? null;
    if (argumentType && !typeRefsAssignable(parameter.paramType, argumentType)) {
      issues.push({
        kind: "argument-type",
        message: `Argument ${index + 1} should be ${typeToString(parameter.paramType)} but was ${typeToString(argumentType)}.`,
        index,
        expected: typeToString(parameter.paramType),
        actual: typeToString(argumentType),
      });
    }
  });
  return issues;
}

export interface InvocationArgument {
  readonly value: string | number | boolean | null;
  readonly type: TypeRef | null;
  readonly name?: string | null;
}

export interface InvocationValidationIssue {
  readonly kind: string;
  readonly message: string;
  readonly index: number | null;
  readonly expected?: string;
  readonly actual?: string;
}

export class MethodInvocation {
  constructor(
    public readonly target: string,
    public readonly methodName: string,
    public readonly args: readonly InvocationArgument[] = [],
    public readonly resolver: InheritanceResolver | null = null,
  ) {}

  resolve(): MethodDeclaration | null {
    return this.resolver?.resolveMethod(
      this.target,
      this.methodName,
      this.args.map((argument) => argument.type),
    )?.member ?? null;
  }

  getSignature(): MethodSignature | null {
    const method = this.resolve();
    return method ? MethodSignature.fromMethod(method) : null;
  }
}

export class ConstructorInvocation {
  constructor(
    public readonly classDeclaration: ClassDeclaration,
    public readonly args: readonly InvocationArgument[] = [],
  ) {}

  resolve(): ConstructorDeclaration | null {
    return (this.classDeclaration.constructors as ConstructorDeclaration[]).find((constructorDeclaration) => {
      return constructorDeclaration.parameters.length === this.args.length
        && constructorDeclaration.parameters.every((parameter, index) => {
          const argumentType = this.args[index]?.type ?? null;
          return argumentType === null || typeRefsAssignable(parameter.paramType, argumentType);
        });
    }) ?? null;
  }
}

export class SuperCall extends MethodInvocation {
  constructor(
    public readonly declaringClass: ClassDeclaration,
    methodName: string,
    argumentsList: readonly InvocationArgument[] = [],
    resolver: InheritanceResolver,
  ) {
    super(declaringClass.superClass ?? "Object", methodName, argumentsList, resolver);
  }

  resolveSuperMethod(): MethodDeclaration | null {
    return this.resolve();
  }
}

export class MethodOverride {
  constructor(
    public readonly subclass: ClassDeclaration,
    public readonly method: MethodDeclaration,
    public readonly resolver: InheritanceResolver,
  ) {}

  resolveParentMethod(): MethodDeclaration | null {
    if (!this.subclass.superClass) {
      return null;
    }
    return this.resolver.resolveMethod(
      this.subclass.superClass,
      this.method.name,
      this.method.parameters.map((parameter) => parameter.paramType),
    )?.member ?? null;
  }
}

export class LambdaInvocation<TResult = unknown> {
  constructor(
    public readonly signature: MethodSignature,
    private readonly lambda: (...args: readonly unknown[]) => TResult,
    public readonly args: readonly unknown[] = [],
  ) {}

  invoke(): TResult {
    return this.lambda(...this.args);
  }
}

export class InvocationValidator {
  validateMethodInvocation(invocation: MethodInvocation): InvocationValidationIssue[] {
    const method = invocation.resolve();
    if (!method) {
      return [{
        kind: "missing-method",
        message: `Unable to resolve method ${invocation.target}.${invocation.methodName}.`,
        index: null,
      }];
    }
    return parametersAccept(method.parameters, invocation.args);
  }

  validateConstructorInvocation(invocation: ConstructorInvocation): InvocationValidationIssue[] {
    const constructorDeclaration = invocation.resolve();
    if (!constructorDeclaration) {
      return [{
        kind: "missing-constructor",
        message: `Unable to resolve constructor ${invocation.classDeclaration.name}.`,
        index: null,
      }];
    }
    return parametersAccept(constructorDeclaration.parameters, invocation.args);
  }

  validateSuperCall(invocation: SuperCall): InvocationValidationIssue[] {
    if (!invocation.declaringClass.superClass) {
      return [{
        kind: "missing-superclass",
        message: `${invocation.declaringClass.name} does not declare a superclass.`,
        index: null,
      }];
    }
    const parentMethod = invocation.resolveSuperMethod();
    if (!parentMethod) {
      return [{
        kind: "missing-super-method",
        message: `Unable to resolve super.${invocation.methodName}.`,
        index: null,
      }];
    }
    return parametersAccept(parentMethod.parameters, invocation.args);
  }

  validateOverride(methodOverride: MethodOverride): InvocationValidationIssue[] {
    const parentMethod = methodOverride.resolveParentMethod();
    if (!parentMethod) {
      return [{
        kind: "missing-parent-method",
        message: `Unable to find a parent method for ${methodOverride.method.name}.`,
        index: null,
      }];
    }
    const issues = parametersAccept(parentMethod.parameters, methodOverride.method.parameters.map((parameter) => ({
      value: parameter.name,
      type: parameter.paramType,
    })));
    if (!typeRefsAssignable(parentMethod.returnType, methodOverride.method.returnType)) {
      issues.push({
        kind: "return-type",
        message: `Override return type ${typeToString(methodOverride.method.returnType)} is incompatible with ${typeToString(parentMethod.returnType)}.`,
        index: null,
        expected: typeToString(parentMethod.returnType),
        actual: typeToString(methodOverride.method.returnType),
      });
    }
    return issues;
  }

  validateLambdaInvocation(invocation: LambdaInvocation<unknown>): InvocationValidationIssue[] {
    if (invocation.signature.parameterTypes.length === invocation.args.length) {
      return [];
    }
    return [{
      kind: "lambda-arity",
      message: `Lambda ${invocation.signature.name} expects ${invocation.signature.parameterTypes.length} arguments but received ${invocation.args.length}.`,
      index: null,
      expected: String(invocation.signature.parameterTypes.length),
      actual: String(invocation.args.length),
    }];
  }
}

export class InvocationFormatter {
  constructor(private readonly formatter: Formatter = new AliceFormatter()) {}

  formatMethodInvocation(invocation: MethodInvocation): string {
    return this.formatter.formatMethodInvocation({
      target: invocation.target,
      methodName: invocation.methodName,
      arguments: argumentsText(invocation.args),
    });
  }

  formatConstructorInvocation(invocation: ConstructorInvocation): string {
    return this.formatter.formatNewExpression({
      typeName: invocation.classDeclaration.name,
      arguments: argumentsText(invocation.args),
    });
  }

  formatSuperCall(invocation: SuperCall): string {
    const args = argumentsText(invocation.args).join(", ");
    return `super ${this.formatter.getNameForMethod(invocation.methodName)}${args ? ` ${args}` : ""}`.trim();
  }

  formatOverride(methodOverride: MethodOverride): string {
    const parentName = methodOverride.resolveParentMethod()?.getDeclaringType()?.name
      ?? methodOverride.subclass.superClass
      ?? "Object";
    return `${methodOverride.subclass.name}.${methodOverride.method.name} overrides ${parentName}.${methodOverride.method.name}`;
  }

  formatLambdaInvocation(invocation: LambdaInvocation<unknown>): string {
    return `lambda ${invocation.signature.name}(${invocation.args.map((argument) => String(argument)).join(", ")})`;
  }
}
