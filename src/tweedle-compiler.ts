import { parseTweedle, TweedleParseError } from "./tweedle-parser.js";
import {
  TweedleDiagnosticCollector,
  type ClassDecl,
  type TweedleDiagnostic,
} from "./tweedle-parser-declarations.js";
import {
  createTypeEnvironment,
  type TypeEnvironment,
} from "./tweedle-typechecker.js";

export {
  CompilationUnit,
  CompilerError,
  CompilerWarning,
  ImportResolver,
  TweedleCompiler,
  TypeResolver,
  type ExecutableAst,
  type ExecutableMethod,
  type SourceLocation,
} from "./tweedle-compiler/core.js";

export interface CompilationResult {
  classes: ClassDecl[];
  typeEnvironment: TypeEnvironment | null;
  diagnostics: TweedleDiagnostic[];
  success: boolean;
}

export function compileTweedleSource(source: string): CompilationResult {
  const collector = new TweedleDiagnosticCollector();
  let classes: ClassDecl[] = [];
  let typeEnvironment: TypeEnvironment | null = null;

  try {
    classes = [parseTweedle(source)];
  } catch (error) {
    if (error instanceof TweedleParseError) {
      collector.error(error.message, error.sourceLocation, {
        found: error.found || undefined,
        expected: error.expected || undefined,
        code: "parse-error",
      });
    } else if (error instanceof Error) {
      const sourceError = error as Error & { line?: number; column?: number };
      collector.error(error.message, {
        line: sourceError.line ?? 1,
        column: sourceError.column ?? 0,
      }, { code: "parse-error" });
    }

    return {
      classes,
      typeEnvironment: null,
      diagnostics: collector.diagnostics.slice(),
      success: false,
    };
  }

  try {
    typeEnvironment = createTypeEnvironment(classes);
  } catch (error) {
    if (error instanceof Error) {
      collector.error(error.message, { line: 1, column: 0 }, { code: "type-error" });
    }
  }

  return {
    classes,
    typeEnvironment,
    diagnostics: collector.diagnostics.slice(),
    success: !collector.hasErrors,
  };
}
