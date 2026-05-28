# User Journeys

This layer traces the main end-to-end paths that cut across the behavioral stack.

## 1. Student loads project via REST, edits, runs, saves

![Journey 1 Mermaid diagram](journey-student-rest-mermaid.svg)

![Journey 1 Graphviz diagram](journey-student-rest-dot.svg)

Anchored in `src/server.ts`, `test/server.test.ts`, and `test/silver-thread-e2e.test.ts`.

## 2. Eatme suite drives the prototype

![Journey 2 Mermaid diagram](journey-eatme-suite-mermaid.svg)

![Journey 2 Graphviz diagram](journey-eatme-suite-dot.svg)

Anchored in `test/advanced-e2e.test.ts`, `test/events.test.ts`, and the evidence-writing endpoints in `src/server.ts`.

## 3. Developer runs tests and coverage

![Journey 3 Mermaid diagram](journey-developer-test-mermaid.svg)

![Journey 3 Graphviz diagram](journey-developer-test-dot.svg)

Anchored in `package.json` (`npm test -> vitest run`) plus the installed coverage provider `@vitest/coverage-v8`.

## 4. Student creates a new project, adds a biped, writes a walk procedure, runs

![Journey 4 Mermaid diagram](journey-student-new-project-mermaid.svg)

![Journey 4 Graphviz diagram](journey-student-new-project-dot.svg)

Anchored in `project-template.ts`, `project-system.ts`, `gallery.ts`, `procedure-editor.ts`, `tweedle-codegen.ts`, and `project-runner.ts`.

## 5. Collaborative editing with sync and conflict resolution

![Journey 5 Mermaid diagram](journey-collaborative-edit-mermaid.svg)

![Journey 5 Graphviz diagram](journey-collaborative-edit-dot.svg)

Anchored in `collaboration.ts`, `state-synchronization.ts`, and `test/collaboration.test.ts`.
