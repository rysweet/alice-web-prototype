export interface TweedleMethodSpec {
  name: string;
  returnType?: string;
  parameters?: string[];
  body?: string[];
  isStatic?: boolean;
  visibility?: string | null;
}

export interface JavaCodeGenerationOptions {
  indent?: string;
  htmlClassName?: string;
}

export class JavaCodeGenerationError extends Error {
  constructor(message: string, public readonly nodeType: string) {
    super(message);
    this.name = "JavaCodeGenerationError";
  }
}
