export type CompletionKind = "method" | "field" | "variable" | "keyword" | "type";
export type CompletionVisibility = "public" | "protected" | "private";
export type CompletionScope = "local" | "member" | "global";

export interface CompletionContext {
  prefix: string;
  expectedType?: string;
  scope?: CompletionScope;
  allowPrivate?: boolean;
  preferredKinds?: CompletionKind[];
}

export interface CompletionFilterOptions {
  expectedType?: string;
  scope?: CompletionScope;
  allowPrivate?: boolean;
}

export interface QuickFixSuggestion {
  title: string;
  replacement: string;
}

export class CompletionItem {
  constructor(
    public readonly label: string,
    public readonly insertText: string,
    public readonly kind: CompletionKind,
    public readonly valueType: string,
    public readonly scope: CompletionScope,
    public readonly visibility: CompletionVisibility = "public",
  ) {}
}

export class CompletionFilter {
  apply(items: CompletionItem[], options: CompletionFilterOptions = {}): CompletionItem[] {
    return items.filter((item) => {
      if (options.scope && item.scope !== options.scope && item.scope !== "global") {
        return false;
      }
      if (!options.allowPrivate && item.visibility === "private") {
        return false;
      }
      if (options.expectedType && item.valueType !== options.expectedType && item.valueType !== "Any") {
        return false;
      }
      return true;
    });
  }
}

export class CompletionRanker {
  rank(items: CompletionItem[], prefix: string, preferredKinds: CompletionKind[] = []): CompletionItem[] {
    const needle = prefix.trim().toLowerCase();
    const preferred = new Set(preferredKinds);
    return [...items].sort((left, right) => {
      const scoreDelta = this.score(right, needle, preferred) - this.score(left, needle, preferred);
      if (scoreDelta !== 0) {
        return scoreDelta;
      }
      return left.label.localeCompare(right.label);
    });
  }

  private score(item: CompletionItem, prefix: string, preferredKinds: Set<CompletionKind>): number {
    let score = 0;
    const label = item.label.toLowerCase();
    if (!prefix) {
      score += 1;
    } else if (label === prefix) {
      score += 100;
    } else if (label.startsWith(prefix)) {
      score += 50;
    } else if (label.includes(prefix)) {
      score += 10;
    }

    if (preferredKinds.has(item.kind)) {
      score += 25;
    }
    if (item.scope === "local") {
      score += 5;
    }
    if (item.visibility === "public") {
      score += 2;
    }
    return score;
  }
}

export class CompletionProvider {
  private readonly items: CompletionItem[];
  private readonly filter = new CompletionFilter();
  private readonly ranker = new CompletionRanker();

  constructor(items: CompletionItem[] = []) {
    this.items = [...items];
  }

  register(item: CompletionItem): void {
    this.items.push(item);
  }

  suggest(context: CompletionContext): CompletionItem[] {
    const filtered = this.filter.apply(this.items, {
      expectedType: context.expectedType,
      scope: context.scope,
      allowPrivate: context.allowPrivate,
    }).filter((item) => item.label.toLowerCase().includes(context.prefix.trim().toLowerCase()));
    return this.ranker.rank(filtered, context.prefix, context.preferredKinds ?? []);
  }
}

export interface ParameterInfo {
  name: string;
  type: string;
}

export class ParameterHint {
  constructor(
    public readonly callable: string,
    public readonly parameters: ParameterInfo[],
  ) {}

  format(activeIndex = -1): string {
    return `${this.callable}(${this.parameters.map((parameter, index) => {
      const formatted = `${parameter.name}: ${parameter.type}`;
      return index === activeIndex ? `[${formatted}]` : formatted;
    }).join(", ")})`;
  }
}

export class QuickFix {
  static suggest(diagnostic: string): QuickFixSuggestion[] {
    const message = diagnostic.toLowerCase();
    if (message.includes("unknown variable") || message.includes("cannot find name")) {
      return [{ title: "Declare variable", replacement: "let missingName = value;" }];
    }
    if (message.includes("missing semicolon")) {
      return [{ title: "Insert semicolon", replacement: ";" }];
    }
    if (message.includes("type mismatch")) {
      return [{ title: "Convert value", replacement: "String(value)" }];
    }
    return [{ title: "Open documentation", replacement: "help()" }];
  }
}
