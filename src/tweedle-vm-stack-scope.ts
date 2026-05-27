import { MAX_VARIABLES_PER_SCOPE, VMState } from "./tweedle-vm-core-types.js";
import { evaluateValue, parseArrayAccessExpression, parseFieldPathExpression, resolveObjectForPath, toArrayIndex } from "./tweedle-vm-eval-core.js";

// ── Scope helpers ──────────────────────────────────────────────────────

export function pushScope(state: VMState): void {
  state.scopes.push(new Map());
}

export function popScope(state: VMState): void {
  if (state.scopes.length > 1) {
    state.scopes.pop();
  }
}

/** Walk scopes innermost→outermost, return first match or undefined. */
export function scopeLookup(state: VMState, name: string): unknown {
  for (let i = state.scopes.length - 1; i >= 0; i--) {
    if (state.scopes[i].has(name)) {
      return state.scopes[i].get(name);
    }
  }
  return state.runtime.globalScope.get(name);
}

/** Write to the innermost (current) scope frame, respecting per-frame cap. */
export function scopeSet(state: VMState, name: string, value: unknown): void {
  const current = state.scopes[state.scopes.length - 1];
  if (current.has(name) || current.size < MAX_VARIABLES_PER_SCOPE) {
    current.set(name, value);
  }
}

/** Update the nearest scope containing `name`. Returns false if undeclared. */
export function scopeAssign(state: VMState, name: string, value: unknown): boolean {
  const arrayAccess = parseArrayAccessExpression(name);
  if (arrayAccess) {
    const target = evaluateValue(state, arrayAccess.target);
    const index = toArrayIndex(evaluateValue(state, arrayAccess.index));
    if (Array.isArray(target) && index !== null) {
      target[index] = value;
      return true;
    }
    return false;
  }

  const fieldPath = parseFieldPathExpression(name);
  if (fieldPath) {
    const owner = resolveObjectForPath(state, fieldPath.root);
    if (owner) {
      owner.fields.set(fieldPath.member, value);
      return true;
    }
  }

  for (let i = state.scopes.length - 1; i >= 0; i--) {
    if (state.scopes[i].has(name)) {
      state.scopes[i].set(name, value);
      return true;
    }
  }
  if (state.currentSelf?.fields.has(name)) {
    state.currentSelf.fields.set(name, value);
    return true;
  }
  return false;
}
