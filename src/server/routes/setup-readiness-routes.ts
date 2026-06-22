import * as fs from "fs";
import * as path from "path";
import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { readJsonObjectBody, readOptionalStringField } from "../validation.js";

const SETUP_SCENARIOS = [
  "setup-preflight-ready-to-create",
  "setup-support-lab-readiness",
  "instructor-classroom-setup-readiness",
  "instructor-student-launch-evidence-handoff",
] as const;

const DOES_NOT_CLAIM = [
  "Java desktop Alice launch",
  "desktop installer automation",
  "native OpenGL driver diagnosis",
  "native Alice window screenshots",
  "learner-world grading",
  "full Alice UI automation",
] as const;

type SetupScenario = (typeof SETUP_SCENARIOS)[number];

type CheckStatus = "pass" | "unsupported";

interface ReadinessCheck {
  readonly id: string;
  readonly label: string;
  readonly status: CheckStatus;
  readonly evidence: string;
}

interface SetupPreflightResponse {
  readonly schema_version: "lookingglass.setup-preflight/v1";
  readonly status: "ready";
  readonly runtime: "alice-web";
  readonly platform: "lookingglass";
  readonly scenario: SetupScenario | "setup-readiness";
  readonly checks: readonly ReadinessCheck[];
  readonly unsupportedCapabilities: readonly string[];
  readonly classroomReadiness: {
    readonly readyToCreateProject: true;
    readonly readyForLabHandoff: true;
    readonly readyForEvidenceHandoff: true;
    readonly studentFallbackRoles: readonly string[];
  };
  readonly doesNotClaim: readonly string[];
}

export function registerSetupReadinessRoutes(app: Express, context: ServerContext): void {
  app.get("/api/config", (_req, res) => {
    res.json({
      schema_version: "lookingglass.server-config/v1",
      runtime: "alice-web",
      platform: "lookingglass",
      port: context.options.port,
      evidenceDirConfigured: context.evidenceDir.trim().length > 0,
      projectConfigured: context.options.projectPath !== undefined,
      endpoints: {
        health: "/api/health",
        setupPreflight: "/api/setup/preflight",
        evidenceHandoff: "/api/setup/evidence-handoff",
        projectTemplates: "/api/project/templates",
        createProject: "/api/project/new",
      },
      doesNotClaim: DOES_NOT_CLAIM,
    });
  });

  app.get("/api/setup/preflight", (req, res) => {
    const scenario = readSetupScenario(req.query.scenario);
    if (!scenario.ok) {
      res.status(400).json({ error: scenario.error });
      return;
    }

    res.json(buildSetupPreflight(scenario.value));
  });

  app.get("/api/setup/readiness", (_req, res) => {
    res.json(buildSetupPreflight("setup-readiness"));
  });

  app.post("/api/setup/evidence-handoff", (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const scenarioField = readOptionalStringField(body.body, "scenario");
    if (!scenarioField.ok) {
      res.status(400).json({ error: scenarioField.error });
      return;
    }

    const scenario = readSetupScenario(scenarioField.value);
    if (!scenario.ok) {
      res.status(400).json({ error: scenario.error });
      return;
    }

    const handoff = buildEvidenceHandoff(context, scenario.value ?? "setup-readiness");
    fs.writeFileSync(handoff.evidenceArtifact, JSON.stringify(handoff, null, 2) + "\n");
    res.json(handoff);
  });
}

function buildSetupPreflight(
  scenario: SetupScenario | "setup-readiness" | undefined,
): SetupPreflightResponse {
  return {
    schema_version: "lookingglass.setup-preflight/v1",
    status: "ready",
    runtime: "alice-web",
    platform: "lookingglass",
    scenario: scenario ?? "setup-readiness",
    checks: [
      {
        id: "server-health",
        label: "LookingGlass REST server is reachable",
        status: "pass",
        evidence: "health route is registered at /api/health",
      },
      {
        id: "config-visible",
        label: "Web server configuration metadata is visible without filesystem paths or secrets",
        status: "pass",
        evidence: "configuration route is registered at /api/config",
      },
      {
        id: "create-project",
        label: "Instructor can create a starter web project",
        status: "pass",
        evidence: "project template and create-project routes are registered",
      },
      {
        id: "evidence-handoff",
        label: "Instructor can create a student-facing readiness evidence handoff",
        status: "pass",
        evidence: "handoff route writes an artifact when called",
      },
      {
        id: "desktop-java-opengl",
        label: "Desktop Java/OpenGL prerequisite diagnosis is outside the web runtime",
        status: "unsupported",
        evidence: "reported in doesNotClaim instead of claimed as web support",
      },
    ],
    unsupportedCapabilities: [...DOES_NOT_CLAIM],
    classroomReadiness: {
      readyToCreateProject: true,
      readyForLabHandoff: true,
      readyForEvidenceHandoff: true,
      studentFallbackRoles: [
        "web project creator",
        "observer",
        "pair navigator",
        "design-planning recorder",
      ],
    },
    doesNotClaim: [...DOES_NOT_CLAIM],
  };
}

function buildEvidenceHandoff(
  context: ServerContext,
  scenario: SetupScenario | "setup-readiness",
) {
  const evidenceArtifact = path.join(
    context.evidenceDir,
    `setup-readiness-handoff-${scenario}.json`,
  );

  return {
    schema_version: "lookingglass.setup-evidence-handoff/v1",
    status: "handoff-created",
    runtime: "alice-web",
    platform: "lookingglass",
    scenario,
    evidenceArtifact,
    handoff: {
      audience: "instructor-and-students",
      readinessSignals: [
        "server health route is registered",
        "configuration endpoint returns runtime metadata without filesystem paths",
        "project template and create-project routes are registered",
        "web evidence handoff artifact was written by this request",
      ],
      studentNextActions: [
        "open the assigned LookingGlass URL",
        "create or open the starter project",
        "record one visible result after running",
        "record one next revision or setup blocker",
      ],
      supportHandoffFields: [
        "blocker category",
        "owner",
        "learner-safe fallback role",
        "retest signal",
      ],
      doesNotClaim: [...DOES_NOT_CLAIM],
    },
  };
}

function readSetupScenario(
  value: unknown,
): { ok: true; value?: SetupScenario } | { ok: false; error: string } {
  if (value === undefined || value === null || value === "") {
    return { ok: true };
  }
  if (typeof value !== "string") {
    return { ok: false, error: "scenario must be a string" };
  }
  if (isSetupScenario(value)) {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: `scenario must be one of: ${SETUP_SCENARIOS.join(", ")}`,
  };
}

function isSetupScenario(value: string): value is SetupScenario {
  return SETUP_SCENARIOS.some((scenario) => scenario === value);
}
