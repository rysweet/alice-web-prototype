import { spawnSync } from "node:child_process";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

type ScenarioSpec = {
  file: string;
  name: string;
  flowTokens: string[];
};

const repoRoot = fileURLToPath(new URL("..", import.meta.url));
const gadugiDir = resolve(repoRoot, "gadugi");
const gadugiTestBin = resolve(
  repoRoot,
  "node_modules",
  ".bin",
  process.platform === "win32" ? "gadugi-test.cmd" : "gadugi-test",
);

const scenarioSpecs: ScenarioSpec[] = [
  {
    file: "01-a3p-open-parse-render.yaml",
    name: "A3P Open / Parse / Render",
    flowTokens: [
      "A3P_FILE",
      "--project",
      "/api/launch",
      "projectName",
      "sceneObjectCount",
      "/api/screenshot",
      "objectCount",
    ],
  },
  {
    file: "02-tweedle-ast-vm-execution.yaml",
    name: "Tweedle AST & VM Execution",
    flowTokens: [
      "A3P_FILE",
      "/api/launch",
      "/api/world/run",
      "statements_executed",
      "execution_log",
      "procedure_count",
    ],
  },
  {
    file: "03-scene-entity-manipulation.yaml",
    name: "Scene Entity Manipulation",
    flowTokens: [
      "/api/launch",
      "/api/scene/add-object",
      "org.lgna.story.SBiped",
      "org.lgna.story.SProp",
      "org.lgna.story.SFlyer",
      "className is required and must be a non-empty string",
      "/api/screenshot",
      "objectCount",
    ],
  },
  {
    file: "04-event-system.yaml",
    name: "Event System",
    flowTokens: [
      "/api/launch",
      "/api/events/register",
      "sceneActivated",
      "keyPress",
      "proximity",
      "unknown eventType",
      "/api/events/fire",
      "eventType is required",
    ],
  },
  {
    file: "05-save-export-roundtrip.yaml",
    name: "Save / Export Round-Trip",
    flowTokens: [
      "/api/launch",
      "/api/code/edit-procedure",
      "gadugi-round-trip-proof",
      "/api/project/save",
      "saved-project.a3p",
      "server-2.log",
      "sceneObjectCount",
    ],
  },
  {
    file: "06-typescript-source-export.yaml",
    name: "TypeScript Source Export Handoff",
    flowTokens: [
      "/api/launch",
      "/api/scene/add-object",
      "/api/code/create-procedure",
      "/api/code/edit-procedure",
      "/api/projects/current/export/typescript",
      "alice-web-typescript-source.zip",
      "alice-web-typescript-source/src/project.ts",
      "danceTogether",
    ],
  },
  {
    file: "06-web-player-export-share-parity.yaml",
    name: "Web Player Export Share Parity",
    flowTokens: [
      "/api/project/new",
      "/api/project/export/web-package",
      "alice-web.export-web-package-result/v1",
      "packageBase64",
      "manifest.json",
      "share.json",
      "preview.png",
      "project/project.json",
      "validation.json",
      "window.AlicePlayer",
      "alice-web-player",
      "/api/project/validate-web-package",
      "alice-web.validate-web-package-result/v1",
      "entrypoint-playable",
      "/api/project/share",
      "alice-web.share-artifacts-result/v1",
      "invalid-base64",
    ],
  },
];

const unsupportedActions = [
  "launch",
  "http_request",
  "verify_response",
  "verify_output",
  "send_input",
  "verify_exit_code",
  "stop_application",
  "shell",
];

function scenarioPath(file: string): string {
  return resolve(gadugiDir, file);
}

function readScenario(file: string): string {
  return readFileSync(scenarioPath(file), "utf8");
}

function actionNames(yaml: string): string[] {
  return [...yaml.matchAll(/^\s*(?:-\s*)?action:\s*["']?([^"'\s#]+)["']?/gm)].map((match) => match[1]);
}

function executeTargets(yaml: string): string[] {
  const lines = yaml.split(/\r?\n/);
  const targets: string[] = [];

  for (let index = 0; index < lines.length; index += 1) {
    const actionMatch = lines[index].match(/^(\s*)(?:-\s*)?action:\s*["']?execute["']?\s*(?:#.*)?$/);
    if (!actionMatch) {
      continue;
    }

    for (let targetIndex = index + 1; targetIndex < lines.length; targetIndex += 1) {
      const targetMatch = lines[targetIndex].match(/^(\s*)target:\s*(.*)$/);
      if (!targetMatch) {
        if (/^\s*action:/.test(lines[targetIndex])) {
          break;
        }
        continue;
      }

      const targetIndent = targetMatch[1].length;
      const targetValue = targetMatch[2].trim();
      if (!targetValue.startsWith(">") && !targetValue.startsWith("|")) {
        targets.push(targetValue);
        break;
      }

      const blockLines: string[] = [];
      for (let blockIndex = targetIndex + 1; blockIndex < lines.length; blockIndex += 1) {
        const line = lines[blockIndex];
        const indent = line.match(/^ */)?.[0].length ?? 0;
        if (line.trim() !== "" && indent <= targetIndent) {
          break;
        }
        blockLines.push(line.trim());
      }

      targets.push(blockLines.join("\n"));
      break;
    }
  }

  return targets;
}

function runGadugi(args: string[]) {
  return spawnSync(gadugiTestBin, args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: { ...process.env, NODE_OPTIONS: "--max-old-space-size=32768" },
    timeout: 30_000,
  });
}

function commandOutput(result: ReturnType<typeof runGadugi>): string {
  return [result.error?.message, result.stdout, result.stderr].filter(Boolean).join("\n");
}

describe("Gadugi scenario runner contract", () => {
  it("keeps exactly the documented Gadugi scenario files", () => {
    const scenarioFiles = readdirSync(gadugiDir)
      .filter((file) => file.endsWith(".yaml"))
      .sort();

    expect(scenarioFiles).toEqual(scenarioSpecs.map((spec) => spec.file));
    for (const spec of scenarioSpecs) {
      expect(existsSync(scenarioPath(spec.file))).toBe(true);
      expect(readScenario(spec.file)).toContain(`name: "${spec.name}"`);
    }
  });

  it("is discoverable and schema-valid with the installed gadugi-test CLI", () => {
    for (const args of [
      ["list", "-d", "gadugi"],
      ["validate", "-d", "gadugi"],
    ]) {
      const result = runGadugi(args);
      expect(commandOutput(result)).not.toMatch(/ENOENT|not found/i);
      expect(result.status, commandOutput(result)).toBe(0);
    }
  });

  it("uses only runner-supported execute actions and no native cleanup/retry blocks", () => {
    for (const spec of scenarioSpecs) {
      const yaml = readScenario(spec.file);
      const actions = actionNames(yaml);

      expect(actions, `${spec.file} should declare actions`).not.toHaveLength(0);
      expect(actions, `${spec.file} must use only action: execute`).toEqual(["execute"]);
      expect(actions.filter((action) => unsupportedActions.includes(action))).toEqual([]);
      expect(yaml, `${spec.file} must not rely on unsupported cleanup blocks`).not.toMatch(/^\s*cleanup:/m);
      expect(yaml, `${spec.file} must not rely on unsupported retry blocks`).not.toMatch(/^\s*retry:/m);
    }
  });

  it("wraps every scenario in one explicit server lifecycle shell flow", () => {
    for (const spec of scenarioSpecs) {
      const targets = executeTargets(readScenario(spec.file));
      const command = targets.join("\n");

      expect(targets, `${spec.file} should have one execute target`).toHaveLength(1);
      expect(command, `${spec.file} should use a strict shell`).toContain("bash -lc 'set -euo pipefail;");
      expect(command, `${spec.file} should start the built server`).toContain("node dist-server/cli.js serve");
      expect(command, `${spec.file} should capture the exact server pid`).toContain("SERVER_PID=$!");
      expect(command, `${spec.file} should clean up through EXIT trap`).toContain("trap cleanup EXIT");
      expect(command, `${spec.file} should poll localhost with curl`).toContain("curl -fsS");
      expect(command, `${spec.file} should target localhost only`).toContain("http://127.0.0.1:$PORT");
      expect(command, `${spec.file} should terminate only the captured server pid`).toContain('kill "$SERVER_PID"');
      expect(command, `${spec.file} must not use broad process killing`).not.toMatch(/\b(?:pkill|killall)\b/);
    }
  });

  it("preserves the user-visible flow coverage inside execute commands", () => {
    for (const spec of scenarioSpecs) {
      const command = executeTargets(readScenario(spec.file)).join("\n");

      for (const token of spec.flowTokens) {
        expect(command, `${spec.file} should cover ${token}`).toContain(token);
      }
    }
  });
});
