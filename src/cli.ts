#!/usr/bin/env node
import { realpathSync } from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import { createServer } from "./server.js";

export interface CliConfig {
  readonly command: "serve" | "help" | "print-config";
  readonly port: number;
  readonly evidenceDir: string;
  readonly project?: string;
}

const DEFAULT_PORT = 3000;
const DEFAULT_EVIDENCE_DIR = "./evidence";
const USAGE = [
  "Usage:",
  "  alice-web serve [--port <1-65535>] [--evidence-dir <dir>] [--project <file.a3p>]",
  "  alice-web print-config [--port <1-65535>] [--evidence-dir <dir>] [--project <file.a3p>]",
  "  alice-web help",
].join("\n");

export function parseArgs(argv: string[]): CliConfig {
  const args = argv.slice(2);
  const commandToken = args[0] ?? "serve";
  const command = normalizeCommand(commandToken);

  let port = DEFAULT_PORT;
  let evidenceDir = DEFAULT_EVIDENCE_DIR;
  let project: string | undefined;

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
      case "--help":
      case "-h":
        return { command: "help", port, evidenceDir, project };
      default:
        if (current?.startsWith("-")) {
          throw new Error(`Unknown option: ${current}`);
        }
    }
  }

  return { command, port, evidenceDir, project };
}

function normalizeCommand(value: string): CliConfig["command"] {
  if (value === "--help" || value === "-h") {
    return "help";
  }
  if (value === "serve" || value === "print-config" || value === "help") {
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

export function formatConfig(config: CliConfig): string {
  return JSON.stringify(
    {
      command: config.command,
      port: config.port,
      evidenceDir: path.resolve(config.evidenceDir),
      project: config.project ? path.resolve(config.project) : null,
      runtime: "typescript-web-prototype",
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
    case "serve":
      await serve(config);
      return;
  }
}

async function serve(config: CliConfig): Promise<void> {
  const app = createServer({
    port: config.port,
    evidenceDir: config.evidenceDir,
    projectPath: config.project,
  });
  const server = app.listen(config.port, "127.0.0.1", () => {
    console.log(
      JSON.stringify({
        status: "listening",
        port: config.port,
        evidenceDir: config.evidenceDir,
        project: config.project ?? null,
        pid: process.pid,
        runtime: "typescript-web-prototype",
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
    console.error(err instanceof Error ? err.message : String(err));
    printUsage(process.stderr);
    process.exit(1);
  }
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
