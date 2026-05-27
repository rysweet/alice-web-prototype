import { RawClassDecl, RawConstructorDecl, RawFieldDecl, RawMethodDecl } from "./ast-nodes-declarations-raw.js";
import { ClassDeclaration, ConstructorDeclaration, FieldDeclaration, MethodDeclaration } from "./ast-nodes-declarations-types.js";
import { hydrateExpression, hydrateParameter } from "./ast-nodes-expressions-hydrate.js";
import { hydrateStatement } from "./ast-nodes-statements-hydrate.js";

export function hydrateConstructorDecl(constructorDecl: RawConstructorDecl): ConstructorDeclaration {
  return new ConstructorDeclaration(
    constructorDecl.name,
    constructorDecl.parameters.map(hydrateParameter),
    constructorDecl.body.map(hydrateStatement),
    constructorDecl.visibility,
  );
}

export function hydrateMethodDecl(methodDecl: RawMethodDecl): MethodDeclaration {
  return new MethodDeclaration(
    methodDecl.name,
    methodDecl.returnType,
    methodDecl.parameters.map(hydrateParameter),
    methodDecl.body.map(hydrateStatement),
    methodDecl.isStatic,
    methodDecl.visibility,
  );
}

export function hydrateFieldDecl(fieldDecl: RawFieldDecl): FieldDeclaration {
  return new FieldDeclaration(
    fieldDecl.name,
    fieldDecl.fieldType,
    fieldDecl.initializer ? hydrateExpression(fieldDecl.initializer) : null,
    fieldDecl.isStatic,
    fieldDecl.isConstant,
    fieldDecl.visibility,
  );
}

export function hydrateClassDecl(classDecl: RawClassDecl): ClassDeclaration {
  return new ClassDeclaration(
    classDecl.name,
    classDecl.superClass,
    classDecl.modelType,
    classDecl.visibility,
    classDecl.constructors.map(hydrateConstructorDecl),
    classDecl.methods.map(hydrateMethodDecl),
    classDecl.fields.map(hydrateFieldDecl),
  );
}
