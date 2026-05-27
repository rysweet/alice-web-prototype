import type { CompilationUnit } from "./tweedle-compiler.js";
import type { ClassDecl, FieldDecl, MethodDecl, TypeRef } from "./tweedle-parser.js";

export interface MethodDocumentation {
  name: string;
  description: string;
  parameters: Array<{ name: string; type: string; isVarArgs: boolean }>;
  returnType: string;
  examples: string[];
}

export interface ClassDocumentation {
  name: string;
  description: string;
  methods: MethodDocumentation[];
  properties: Array<{ name: string; type: string; description: string }>;
  inheritance: string[];
}

export class APIDocGenerator {
  generate(input: readonly CompilationUnit[] | readonly ClassDecl[]): ClassDocumentation[] {
    const classes = normalizeClasses(input);
    return classes.map((classDecl) => this.documentClass(classDecl));
  }

  private documentClass(classDecl: ClassDecl): ClassDocumentation {
    const inheritance = [classDecl.name, ...(classDecl.superClass ? [classDecl.superClass] : [])];
    return {
      name: classDecl.name,
      description: describeClass(classDecl),
      methods: [
        ...classDecl.constructors.map((constructorDecl) => documentMethod(classDecl.name, constructorDecl.name, classDecl.name, constructorDecl.parameters, constructorDecl.body)),
        ...classDecl.methods.map((methodDecl) => documentMethod(classDecl.name, methodDecl.name, typeRefName(methodDecl.returnType), methodDecl.parameters, methodDecl.body)),
      ],
      properties: classDecl.fields.map((field) => documentField(field)),
      inheritance,
    };
  }
}

export class DocSearch {
  constructor(private readonly docs: readonly ClassDocumentation[]) {}

  search(keyword: string): Array<{ kind: "class" | "method" | "property"; className: string; name: string; snippet: string }> {
    const needle = keyword.toLowerCase().trim();
    if (!needle) {
      return [];
    }

    const hits: Array<{ kind: "class" | "method" | "property"; className: string; name: string; snippet: string }> = [];
    for (const classDoc of this.docs) {
      if (`${classDoc.name} ${classDoc.description}`.toLowerCase().includes(needle)) {
        hits.push({
          kind: "class",
          className: classDoc.name,
          name: classDoc.name,
          snippet: classDoc.description,
        });
      }
      for (const method of classDoc.methods) {
        const haystack = `${method.name} ${method.description} ${method.returnType} ${method.examples.join(" ")}`.toLowerCase();
        if (haystack.includes(needle)) {
          hits.push({
            kind: "method",
            className: classDoc.name,
            name: method.name,
            snippet: method.description,
          });
        }
      }
      for (const property of classDoc.properties) {
        const haystack = `${property.name} ${property.type} ${property.description}`.toLowerCase();
        if (haystack.includes(needle)) {
          hits.push({
            kind: "property",
            className: classDoc.name,
            name: property.name,
            snippet: property.description,
          });
        }
      }
    }
    return hits;
  }
}

export class DocViewer {
  render(input: readonly ClassDocumentation[] | ClassDocumentation): string {
    const docs = Array.isArray(input) ? input : [input];
    const sections = docs.map((classDoc) => `
      <section class="class-doc">
        <h2>${escapeHtml(classDoc.name)}</h2>
        <p>${escapeHtml(classDoc.description)}</p>
        <p><strong>Inheritance:</strong> ${escapeHtml(classDoc.inheritance.join(" → "))}</p>
        <h3>Properties</h3>
        <ul>
          ${classDoc.properties.map((property: ClassDocumentation["properties"][number]) => `<li><strong>${escapeHtml(property.name)}</strong>: ${escapeHtml(property.type)} — ${escapeHtml(property.description)}</li>`).join("")}
        </ul>
        <h3>Methods</h3>
        <ul>
          ${classDoc.methods.map((method: MethodDocumentation) => `<li><strong>${escapeHtml(method.name)}</strong>(${escapeHtml(method.parameters.map((parameter: MethodDocumentation["parameters"][number]) => `${parameter.name}: ${parameter.type}`).join(", "))}) → ${escapeHtml(method.returnType)}<br/>${escapeHtml(method.description)}</li>`).join("")}
        </ul>
      </section>`).join("\n");
    return `<!doctype html><html><body><main>${sections}</main></body></html>`;
  }
}

function normalizeClasses(input: readonly CompilationUnit[] | readonly ClassDecl[]): ClassDecl[] {
  if (input.length === 0) {
    return [];
  }
  const first = input[0];
  if (typeof first === "object" && first !== null && "ast" in first) {
    return (input as readonly CompilationUnit[])
      .map((unit) => unit.ast)
      .filter((ast): ast is ClassDecl => ast !== null);
  }
  return [...input] as ClassDecl[];
}

function describeClass(classDecl: ClassDecl): string {
  const fieldCount = classDecl.fields.length;
  const methodCount = classDecl.methods.length + classDecl.constructors.length;
  const inheritance = classDecl.superClass ? ` extending ${classDecl.superClass}` : "";
  return `${classDecl.name}${inheritance} exposes ${fieldCount} properties and ${methodCount} callable members.`;
}

function documentMethod(
  ownerName: string,
  methodName: string,
  returnType: string,
  parameters: ReadonlyArray<{ name: string; paramType: TypeRef; isVarArgs: boolean }>,
  body: ReadonlyArray<{ type: string }>,
): MethodDocumentation {
  const statementKinds = [...new Set(body.map((statement) => statement.type))];
  const parameterDocs = parameters.map((parameter) => ({
    name: parameter.name,
    type: typeRefName(parameter.paramType),
    isVarArgs: parameter.isVarArgs,
  }));
  return {
    name: methodName,
    description: `${ownerName}.${methodName} returns ${returnType} and uses ${statementKinds.join(", ") || "no statements"}.`,
    parameters: parameterDocs,
    returnType,
    examples: [`${ownerName}.${methodName}(${parameterDocs.map((parameter) => parameter.name).join(", ")})`],
  };
}

function documentField(field: FieldDecl): { name: string; type: string; description: string } {
  const type = typeRefName(field.fieldType);
  const initializerText = field.initializer ? ` Initialized from ${field.initializer.type}.` : "";
  return {
    name: field.name,
    type,
    description: `${field.name} stores ${type}.${initializerText}`,
  };
}

function typeRefName(typeRef: TypeRef): string {
  switch (typeRef.type) {
    case "VoidTypeRef":
      return "void";
    case "LambdaTypeRef":
      return "Function";
    case "SimpleTypeRef":
      return `${typeRef.name}${typeRef.isArray ? "[]".repeat(typeRef.arrayDimensions ?? 1) : ""}`;
    default:
      return "Object";
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
