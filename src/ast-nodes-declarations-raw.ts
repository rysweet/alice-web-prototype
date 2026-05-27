import { TypeRef } from "./ast-nodes-common-core.js";
import { RawExpression } from "./ast-nodes-expressions-raw.js";
import { RawStatement } from "./ast-nodes-statements-raw.js";

export type RawParameter = {
  name: string;
  paramType: TypeRef;
  isVarArgs: boolean;
  defaultValue: RawExpression | null;
};

export type RawArgument = {
  name: string | null;
  value: RawExpression;
};

export type RawConstructorDecl = {
  type: "ConstructorDeclaration";
  name: string;
  parameters: RawParameter[];
  body: RawStatement[];
  visibility: string | null;
};

export type RawMethodDecl = {
  type: "MethodDeclaration";
  name: string;
  returnType: TypeRef;
  parameters: RawParameter[];
  body: RawStatement[];
  isStatic: boolean;
  visibility: string | null;
};

export type RawFieldDecl = {
  type: "FieldDeclaration";
  name: string;
  fieldType: TypeRef;
  initializer: RawExpression | null;
  isStatic: boolean;
  isConstant: boolean;
  visibility: string | null;
};

export type RawClassDecl = {
  type: "ClassDeclaration";
  name: string;
  superClass: string | null;
  modelType: string | null;
  visibility: string | null;
  constructors: RawConstructorDecl[];
  methods: RawMethodDecl[];
  fields: RawFieldDecl[];
};
