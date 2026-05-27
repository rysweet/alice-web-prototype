import type { TweedleMethodSpec } from "./types.js";

export function createTweedleSource(className: string, methods: Array<TweedleMethodSpec | string>): string {
  const renderedMethods = methods.map((method) => {
    if (typeof method === "string") {
      return method.trim();
    }
    const visibility = method.visibility ? `${method.visibility} ` : "";
    const isStatic = method.isStatic ? "static " : "";
    const returnType = method.returnType ?? "void";
    const parameters = method.parameters?.join(", ") ?? "";
    const body = method.body?.length
      ? `\n${method.body.map((line) => `    ${line}`).join("\n")}\n`
      : "\n";
    return `${visibility}${isStatic}${returnType} ${method.name}(${parameters}) {${body}  }`;
  });

  return `class ${className} {\n${renderedMethods.map((method) => `  ${method}`).join("\n\n")}\n}`;
}
