export type DialogMode = "modal" | "modeless";
export type ConfirmChoice = "yes" | "no" | "cancel";
export type InputDialogKind = "text" | "number" | "combo";

export interface ManagedDialog<TValue = unknown> {
  id: string;
  title: string;
  mode: DialogMode;
  value: TValue | null;
  open: boolean;
}

export interface InputDialogOptions {
  allowEmpty?: boolean;
  min?: number;
  max?: number;
  choices?: string[];
}

export interface InputDialogResult<TValue> {
  accepted: boolean;
  value: TValue | null;
  reason: string | null;
}

export class DialogManager {
  private readonly dialogs = new Map<string, ManagedDialog>();
  private readonly modalStack: string[] = [];

  open<TValue>(dialog: ManagedDialog<TValue>): ManagedDialog<TValue> {
    const existing = this.dialogs.get(dialog.id);
    if (existing?.open) {
      throw new TypeError(`dialog "${dialog.id}" is already open`);
    }

    const snapshot: ManagedDialog<TValue> = {
      ...dialog,
      open: true,
    };
    this.dialogs.set(dialog.id, snapshot);
    if (snapshot.mode === "modal") {
      this.modalStack.push(snapshot.id);
    }
    return { ...snapshot };
  }

  close<TValue>(id: string, value: TValue | null = null): ManagedDialog<TValue> | null {
    const dialog = this.dialogs.get(id);
    if (!dialog) {
      return null;
    }

    dialog.open = false;
    dialog.value = value;
    if (dialog.mode === "modal") {
      const index = this.modalStack.lastIndexOf(id);
      if (index >= 0) {
        this.modalStack.splice(index, 1);
      }
    }
    return { ...(dialog as ManagedDialog<TValue>) };
  }

  get(id: string): ManagedDialog | null {
    const dialog = this.dialogs.get(id);
    return dialog ? { ...dialog } : null;
  }

  listOpen(): ManagedDialog[] {
    return [...this.dialogs.values()]
      .filter((dialog) => dialog.open)
      .map((dialog) => ({ ...dialog }));
  }

  activeModal(): ManagedDialog | null {
    const id = this.modalStack.at(-1);
    return id ? this.get(id) : null;
  }

  hasBlockingModal(): boolean {
    return this.modalStack.length > 0;
  }
}

export class InputDialog {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly kind: InputDialogKind,
    private readonly options: InputDialogOptions = {},
  ) {}

  asManagedDialog(): ManagedDialog<string | number> {
    return {
      id: this.id,
      title: this.title,
      mode: "modal",
      value: null,
      open: false,
    };
  }

  submit(rawValue: string): InputDialogResult<string | number> {
    if (this.kind === "text") {
      if (!this.options.allowEmpty && !rawValue.trim()) {
        return { accepted: false, value: null, reason: "text input is required" };
      }
      return { accepted: true, value: rawValue, reason: null };
    }

    if (this.kind === "number") {
      const value = Number(rawValue);
      if (Number.isNaN(value)) {
        return { accepted: false, value: null, reason: "number input must be numeric" };
      }
      if (this.options.min !== undefined && value < this.options.min) {
        return { accepted: false, value: null, reason: `number input must be >= ${this.options.min}` };
      }
      if (this.options.max !== undefined && value > this.options.max) {
        return { accepted: false, value: null, reason: `number input must be <= ${this.options.max}` };
      }
      return { accepted: true, value, reason: null };
    }

    const choices = this.options.choices ?? [];
    if (!choices.includes(rawValue)) {
      return { accepted: false, value: null, reason: `combo input must be one of: ${choices.join(", ")}` };
    }
    return { accepted: true, value: rawValue, reason: null };
  }
}

export class ConfirmDialog {
  constructor(
    public readonly id: string,
    public readonly title: string,
    private readonly allowCancel = true,
  ) {}

  asManagedDialog(): ManagedDialog<ConfirmChoice> {
    return {
      id: this.id,
      title: this.title,
      mode: "modal",
      value: null,
      open: false,
    };
  }

  resolve(choice: ConfirmChoice): ConfirmChoice {
    if (!this.allowCancel && choice === "cancel") {
      throw new TypeError("cancel is not allowed for this confirmation dialog");
    }
    return choice;
  }
}

export type FileDialogMode = "open" | "save";

export class FileDialog {
  constructor(
    public readonly id: string,
    public readonly title: string,
    public readonly mode: FileDialogMode,
    private readonly extensions: string[] = [],
    private readonly defaultExtension: string | null = null,
  ) {}

  asManagedDialog(): ManagedDialog<string> {
    return {
      id: this.id,
      title: this.title,
      mode: "modeless",
      value: null,
      open: false,
    };
  }

  pick(path: string): string {
    const trimmed = path.trim();
    if (!trimmed) {
      throw new TypeError("file path must be a non-empty string");
    }

    const lowered = trimmed.toLowerCase();
    if (this.extensions.length === 0) {
      return trimmed;
    }

    const allowed = this.extensions.map((extension) => extension.toLowerCase());
    const hasAllowedExtension = allowed.some((extension) => lowered.endsWith(extension));
    if (hasAllowedExtension) {
      return trimmed;
    }

    if (this.mode === "save" && this.defaultExtension) {
      return `${trimmed}${this.defaultExtension}`;
    }

    throw new TypeError(`file path must end with one of: ${this.extensions.join(", ")}`);
  }
}

export class ColorPicker {
  private readonly presets = new Set<string>();

  constructor(colors: string[] = ["#FFFFFF", "#000000"]) {
    for (const color of ["#FFFFFF", "#000000", ...colors]) {
      this.presets.add(this.normalize(color));
    }
  }

  normalize(color: string): string {
    const trimmed = color.trim();
    const match = /^#?([0-9a-f]{6})$/i.exec(trimmed);
    if (!match) {
      throw new TypeError(`invalid color value: ${color}`);
    }
    return `#${match[1].toUpperCase()}`;
  }

  pick(color: string): string {
    const normalized = this.normalize(color);
    this.presets.add(normalized);
    return normalized;
  }

  listPresets(): string[] {
    return [...this.presets.values()].sort();
  }
}

export type ExpressionTokenKind = "identifier" | "operator" | "literal" | "group";

export interface ExpressionToken {
  kind: ExpressionTokenKind;
  value: string;
}

export class CustomExpressionCreator {
  private readonly tokens: ExpressionToken[] = [];

  addIdentifier(name: string): this {
    return this.push("identifier", name);
  }

  addOperator(operator: string): this {
    return this.push("operator", operator);
  }

  addLiteral(literal: string | number | boolean): this {
    return this.push("literal", typeof literal === "string" ? JSON.stringify(literal) : String(literal));
  }

  addGroup(expression: string): this {
    return this.push("group", `(${expression.trim()})`);
  }

  listTokens(): ExpressionToken[] {
    return this.tokens.map((token) => ({ ...token }));
  }

  preview(): string {
    return this.tokens.map((token) => token.value).join(" ").trim();
  }

  build(): string {
    const expression = this.preview();
    if (!expression) {
      throw new TypeError("expression must contain at least one token");
    }
    return expression;
  }

  private push(kind: ExpressionTokenKind, value: string): this {
    const normalized = value.trim();
    if (!normalized) {
      throw new TypeError(`${kind} token must be a non-empty string`);
    }
    this.tokens.push({ kind, value: normalized });
    return this;
  }
}
