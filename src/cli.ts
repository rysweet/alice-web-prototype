#!/usr/bin/env node
import { realpathSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { runAliceHowToParityAudit } from "./server/alice-howto-parity-audit.js";
import { createServer } from "./server.js";

export interface CliConfig {
  readonly command: "serve" | "help" | "print-config" | "alice-howto-parity-audit";
  readonly port: number;
  readonly evidenceDir: string;
  readonly project?: string;
  readonly localApiToken?: string;
  readonly outputPath?: string;
  readonly pretty?: boolean;
}

const DEFAULT_PORT = 3000;
const DEFAULT_EVIDENCE_DIR = "./evidence";
const USAGE = [
  "Usage:",
  "  alice-web serve [--port <1-65535>] [--evidence-dir <dir>] [--project <file.a3p>] [--api-token <token>]",
  "  alice-web print-config [--port <1-65535>] [--evidence-dir <dir>] [--project <file.a3p>] [--api-token <token>]",
  "  alice-web alice-howto-parity-audit --output <file> [--pretty]",
  "  alice-web help",
].join("\n");

export function parseArgs(argv: string[]): CliConfig {
  const args = argv.slice(2);
  const commandToken = args[0] ?? "serve";
  const command = normalizeCommand(commandToken);

  let port = DEFAULT_PORT;
  let evidenceDir = DEFAULT_EVIDENCE_DIR;
  let project: string | undefined;
  let localApiToken: string | undefined;
  let outputPath: string | undefined;
  let pretty = false;

  for (let i = 1; i < args.length; i++) {
    const current = args[i];
    switch (current) {
      case "--port":
        port = parsePort(args[++i]);
        break;
      case "--evidence-dir":
        evidenceDir = parseEvidenceDir(args[++i]);
        break;
      case "--project":
        project = parseProjectPath(args[++i]);
        break;
      case "--api-token":
        localApiToken = parseApiToken(args[++i]);
        break;
      case "--output":
        outputPath = parseOutputPath(args[++i]);
        break;
      case "--pretty":
        pretty = true;
        break;
      case "--help":
      case "-h":
        return { command: "help", port, evidenceDir, project, localApiToken, outputPath, pretty };
      default:
        if (current?.startsWith("-")) {
          throw new Error(`Unknown option: ${current}`);
        }
    }
  }

  return { command, port, evidenceDir, project, localApiToken, outputPath, pretty };
}

function normalizeCommand(value: string): CliConfig["command"] {
  if (value === "--help" || value === "-h") {
    return "help";
  }
  if (value === "serve" || value === "print-config" || value === "help" || value === "alice-howto-parity-audit") {
    return value;
  }
  throw new Error(`Unknown command: ${value}`);
}

function parsePort(value: string | undefined): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error("--port must be a valid port number");
  }
  return parsed;
}

function parseEvidenceDir(value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error("--evidence-dir requires a directory path");
  }
  return value;
}

function parseProjectPath(value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error("--project requires a file path");
  }
  if (!value.endsWith(".a3p")) {
    throw new Error("--project must point to an .a3p file");
  }
  return value;
}

function parseApiToken(value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new Error("--api-token requires a non-empty token");
  }
  return value;
}

function parseOutputPath(value: string | undefined): string {
  if (!value || !value.trim()) {
    throw new CliUsageError("--output requires a file path");
  }
  return value;
}

export function formatConfig(config: CliConfig): string {
  return JSON.stringify(
    {
      command: config.command,
      port: config.port,
      evidenceDir: path.resolve(config.evidenceDir),
      project: config.project ? path.resolve(config.project) : null,
      runtime: "alice-web",
    },
    null,
    2,
  );
}

export function printUsage(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write(`${USAGE}\n`);
}

async function run(config: CliConfig): Promise<void> {
  switch (config.command) {
    case "help":
      printUsage(process.stdout);
      return;
    case "print-config":
      console.log(formatConfig(config));
      return;
    case "alice-howto-parity-audit":
      await runHowToParityAudit(config);
      return;
    case "serve":
      await serve(config);
      return;
  }
}

async function runHowToParityAudit(config: CliConfig): Promise<void> {
  if (!config.outputPath) {
    throw new CliUsageError("alice-howto-parity-audit requires --output <file>");
  }

  try {
    const result = await runAliceHowToParityAudit({
      outputPath: config.outputPath,
      pretty: config.pretty,
      repoRoot: process.cwd(),
    });
    if (result.summary.failed > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    throw new CliUsageError(formatError(error));
  }
}

async function serve(config: CliConfig): Promise<void> {
  const app = createServer({
    port: config.port,
    evidenceDir: config.evidenceDir,
    projectPath: config.project,
    localApiToken: config.localApiToken,
  });
  const server = app.listen(config.port, "127.0.0.1", () => {
    console.log(
      JSON.stringify({
        status: "listening",
        port: config.port,
        evidenceDir: config.evidenceDir,
        project: config.project ?? null,
        pid: process.pid,
        runtime: "alice-web",
      }),
    );
  });

  for (const signal of ["SIGTERM", "SIGINT"] as const) {
    process.on(signal, () => {
      console.log(`Received ${signal}, shutting down...`);
      server.close(() => process.exit(0));
    });
  }
}

async function main(): Promise<void> {
  try {
    await run(parseArgs(process.argv));
  } catch (err) {
    console.error(formatError(err));
    printUsage(process.stderr);
    process.exit(err instanceof CliUsageError ? 2 : 1);
  }
}

class CliUsageError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}

function formatError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function isDirectExecution(): boolean {
  const entryPoint = process.argv[1];
  if (!entryPoint) {
    return false;
  }

  try {
    return realpathSync(entryPoint) === realpathSync(fileURLToPath(import.meta.url));
  } catch {
    return path.resolve(entryPoint) === fileURLToPath(import.meta.url);
  }
}

if (isDirectExecution()) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : String(err));
    process.exit(1);
  });
}
