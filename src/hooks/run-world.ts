#!/usr/bin/env node
/**
 * CLI hook matching Java Alice's tools/eatme-run-world interface.
 * Accepts: --project <path.a3p> --evidence-dir <dir> --json
 * Outputs: single JSON line to stdout, writes evidence artifacts.
 */
import * as fs from "fs";
import * as path from "path";
import { parseA3P } from "../a3p-parser.js";
import { createExecutionState, executeStatements } from "../statement-executor.js";

interface Args {
  project: string;
  evidenceDir: string;
  json: boolean;
}

function parseArgs(argv: string[]): Args {
  const args = argv.slice(2);
  let project = "";
  let evidenceDir = "";
  let json = false;

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case "--project":
        project = args[++i];
        break;
      case "--evidence-dir":
        evidenceDir = args[++i];
        break;
      case "--json":
        json = true;
        break;
    }
  }

  if (!project) throw new Error("--project is required");
  if (!evidenceDir) throw new Error("--evidence-dir is required");
  if (!json) throw new Error("--json is required");

  return { project, evidenceDir, json };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv);

  const projectData = fs.readFileSync(args.project);
  const parsed = await parseA3P(projectData);

  const selector = "scene.eatmeFirstLessonStep";

  // Execute all parsed statements
  const runStart = Date.now();
  const execState = createExecutionState(parsed.sceneObjects);
  const allStatements = parsed.methods.flatMap(m => m.statements);
  const execResult = executeStatements(allStatements, execState);
  const runDuration = Date.now() - runStart;

  fs.mkdirSync(args.evidenceDir, { recursive: true });

  // Write run evidence
  const runEvidencePath = path.join(args.evidenceDir, "run-world-result.json");
  fs.writeFileSync(runEvidencePath, JSON.stringify({
    schema_version: "eatme.alice-run-world-result/v1",
    status: "completed",
    run_selector: selector,
    project_name: parsed.projectName,
    scene_object_count: parsed.sceneObjects.length,
    statements_executed: execResult.statementsExecuted,
    event_log: execResult.eventLog,
    run_duration_ms: runDuration,
    errors: [],
    doesNotClaim: [
      "visible rendering correctness",
      "desktop run-button proof",
    ],
  }, null, 2) + "\n");

  // Single JSON line to stdout
  console.log(JSON.stringify({
    schema_version: "eatme.alice-run-world-result/v1",
    status: "completed",
    run_selector: selector,
    statements_executed: execResult.statementsExecuted,
    run_evidence_artifact: "run-world-result.json",
  }));
}

main().catch((err) => {
  console.error("run world failed:", err.message);
  process.exit(1);
});
