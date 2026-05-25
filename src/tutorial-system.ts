export interface TutorialExpectedAction {
  type: string;
  target?: string;
  value?: unknown;
  [key: string]: unknown;
}

export interface TutorialAction extends TutorialExpectedAction {
  timestamp?: number;
}

export interface TutorialStepDefinition {
  id: string;
  instructionText: string;
  expectedAction: TutorialExpectedAction;
  validation?: TutorialStepValidator;
  hints?: readonly string[];
  hintDelayMs?: number;
}

export interface TutorialProgressState {
  currentStepIndex: number;
  currentStep: TutorialStepDefinition | null;
  nextStep: TutorialStepDefinition | null;
  isComplete: boolean;
  completedStepIds: string[];
  totalSteps: number;
}

export interface TutorialActionResult {
  accepted: boolean;
  advanced: boolean;
  completed: boolean;
  stepId: string | null;
  nextStepId: string | null;
}

export type TutorialStepValidator = (
  action: TutorialAction,
  step: TutorialStepDefinition,
  state: TutorialProgressState,
) => boolean;

export interface TutorialSystemOptions {
  clock?: () => number;
  defaultHintDelayMs?: number;
}

const DEFAULT_HINT_DELAY_MS = 15_000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function matchesValue(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(expected)) {
    return Array.isArray(actual)
      && actual.length === expected.length
      && expected.every((entry, index) => matchesValue(actual[index], entry));
  }
  if (isRecord(expected)) {
    if (!isRecord(actual)) {
      return false;
    }
    return Object.entries(expected).every(([key, value]) => matchesValue(actual[key], value));
  }
  return Object.is(actual, expected);
}

export function matchesExpectedAction(
  action: TutorialAction,
  expectedAction: TutorialExpectedAction,
): boolean {
  return Object.entries(expectedAction).every(([key, value]) => matchesValue(action[key], value));
}

export class TutorialSystem {
  private readonly stepsInternal: TutorialStepDefinition[];
  private readonly clock: () => number;
  private readonly defaultHintDelayMs: number;
  private readonly actionHistoryInternal: TutorialAction[] = [];
  private readonly completedStepIdsInternal: string[] = [];
  private currentStepIndexInternal = 0;
  private stepStartedAt: number;

  constructor(steps: readonly TutorialStepDefinition[], options: TutorialSystemOptions = {}) {
    this.stepsInternal = [...steps];
    this.clock = options.clock ?? (() => Date.now());
    this.defaultHintDelayMs = options.defaultHintDelayMs ?? DEFAULT_HINT_DELAY_MS;
    this.stepStartedAt = this.clock();
  }

  get steps(): TutorialStepDefinition[] {
    return [...this.stepsInternal];
  }

  get actionHistory(): TutorialAction[] {
    return [...this.actionHistoryInternal];
  }

  get currentStepIndex(): number {
    return this.currentStepIndexInternal;
  }

  get currentStep(): TutorialStepDefinition | null {
    return this.stepsInternal[this.currentStepIndexInternal] ?? null;
  }

  get isComplete(): boolean {
    return this.currentStep === null;
  }

  get progress(): TutorialProgressState {
    return {
      currentStepIndex: this.currentStepIndexInternal,
      currentStep: this.currentStep,
      nextStep: this.stepsInternal[this.currentStepIndexInternal + 1] ?? null,
      isComplete: this.isComplete,
      completedStepIds: [...this.completedStepIdsInternal],
      totalSteps: this.stepsInternal.length,
    };
  }

  recordAction(action: TutorialAction): TutorialActionResult {
    this.actionHistoryInternal.push({ ...action });
    const step = this.currentStep;
    if (!step) {
      return {
        accepted: false,
        advanced: false,
        completed: true,
        stepId: null,
        nextStepId: null,
      };
    }

    const accepted = step.validation
      ? step.validation(action, step, this.progress)
      : matchesExpectedAction(action, step.expectedAction);
    if (!accepted) {
      return {
        accepted: false,
        advanced: false,
        completed: false,
        stepId: step.id,
        nextStepId: step.id,
      };
    }

    this.completedStepIdsInternal.push(step.id);
    this.currentStepIndexInternal += 1;
    this.stepStartedAt = this.clock();
    return {
      accepted: true,
      advanced: true,
      completed: this.isComplete,
      stepId: step.id,
      nextStepId: this.currentStep?.id ?? null,
    };
  }

  nextStep(): boolean {
    const step = this.currentStep;
    if (!step) {
      return false;
    }
    this.completedStepIdsInternal.push(step.id);
    this.currentStepIndexInternal += 1;
    this.stepStartedAt = this.clock();
    return true;
  }

  reset(): void {
    this.actionHistoryInternal.length = 0;
    this.completedStepIdsInternal.length = 0;
    this.currentStepIndexInternal = 0;
    this.stepStartedAt = this.clock();
  }

  getAvailableHints(now = this.clock()): string[] {
    const step = this.currentStep;
    if (!step || !step.hints || step.hints.length === 0) {
      return [];
    }
    const delay = step.hintDelayMs ?? this.defaultHintDelayMs;
    if (delay <= 0) {
      return [...step.hints];
    }
    const elapsed = Math.max(0, now - this.stepStartedAt);
    const count = Math.min(step.hints.length, Math.floor(elapsed / delay));
    return step.hints.slice(0, count);
  }

  getCurrentHint(now = this.clock()): string | null {
    const hints = this.getAvailableHints(now);
    return hints.length === 0 ? null : hints[hints.length - 1];
  }
}
