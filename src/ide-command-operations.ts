/**
 * Compatibility facade for IDE command operations.
 *
 * Command implementations live in focused domain modules under
 * src/ide-command-operations/. Keep importing from this file to preserve the
 * existing public path.
 */
export * from "./ide-command-operations/contracts";
export * from "./ide-command-operations/entity-commands";
export * from "./ide-command-operations/statement-commands";
export * from "./ide-command-operations/selection-commands";
export * from "./ide-command-operations/scene-commands";
export * from "./ide-command-operations/batch-commands";
export * from "./ide-command-operations/transform-commands";
