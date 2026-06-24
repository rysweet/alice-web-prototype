import type { Express } from "express";
import { writeJsonEvidenceArtifact } from "../../evidence-writer.js";
import type { ServerContext } from "../context.js";
import { readJsonObjectBody, readRequiredStringField } from "../validation.js";

const SCENARIO_ID = "design-process-story-or-game";
const EVIDENCE_ARTIFACT = "design-process-story-or-game-evidence.json";
const DOES_NOT_CLAIM = [
  "automated creative assessment",
  "learner-world grading",
  "complete Alice coverage",
  "desktop Alice UI automation",
  "visible rendering correctness",
] as const;

type ProjectMode = "story" | "game";

interface SceneSketch {
  readonly name: string;
  readonly character: string;
  readonly action: string;
}

interface BridgeMapping {
  readonly scene: string;
  readonly aliceConcept: string;
  readonly controls: string;
}

interface DesignProcessEvidenceRequest {
  readonly scenario: string;
  readonly mode: ProjectMode;
  readonly designBrief: string;
  readonly sceneSketches: readonly SceneSketch[];
  readonly bridgeMappings: readonly BridgeMapping[];
  readonly playtestObservation: string;
  readonly revisionNote: string;
  readonly reviewNote: string;
  readonly accessibilityChoice?: string;
}

export function registerDesignProcessRoutes(app: Express, context: ServerContext): void {
  app.post("/api/design-process/story-or-game/evidence", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "launch a project before recording design-process evidence" });
      return;
    }

    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const parsed = readDesignProcessRequest(body.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    const authoredObjectNames = Array.from(context.state.sceneObjects.keys())
      .filter((name) => name !== "ground" && name !== "camera");
    if (authoredObjectNames.length === 0) {
      res.status(400).json({ error: "build evidence requires at least one authored scene object" });
      return;
    }

    const procedureStatements = Array.from(context.state.procedures.entries())
      .map(([name, statements]) => ({ name, statementCount: statements.length }));
    const totalStatementCount = procedureStatements.reduce((sum, method) => sum + method.statementCount, 0);
    if (totalStatementCount === 0) {
      res.status(400).json({ error: "build evidence requires at least one edited procedure statement" });
      return;
    }

    if (context.state.runWorldEvidenceArtifacts.length < 2) {
      res.status(400).json({ error: "revision-loop evidence requires an initial playtest run and a revision run" });
      return;
    }

    const evidence = buildEvidence(context, parsed.value, authoredObjectNames, procedureStatements);
    const evidenceArtifact = writeJsonEvidenceArtifact(context.evidenceDir, EVIDENCE_ARTIFACT, evidence);
    res.json({ ...evidence, evidenceArtifact });
  });
}

function readDesignProcessRequest(
  body: Record<string, unknown>,
): { ok: true; value: DesignProcessEvidenceRequest } | { ok: false; error: string } {
  const scenario = readRequiredStringField(body, "scenario");
  if (!scenario.ok) return scenario;
  if (scenario.value !== SCENARIO_ID) {
    return { ok: false, error: `scenario must be ${SCENARIO_ID}` };
  }

  const mode = readRequiredStringField(body, "mode");
  if (!mode.ok) return mode;
  if (mode.value !== "story" && mode.value !== "game") {
    return { ok: false, error: "mode must be story or game" };
  }

  const designBrief = readRequiredStringField(body, "designBrief");
  if (!designBrief.ok) return designBrief;
  const playtestObservation = readRequiredStringField(body, "playtestObservation");
  if (!playtestObservation.ok) return playtestObservation;
  const revisionNote = readRequiredStringField(body, "revisionNote");
  if (!revisionNote.ok) return revisionNote;
  const reviewNote = readRequiredStringField(body, "reviewNote");
  if (!reviewNote.ok) return reviewNote;

  const sceneSketches = readSceneSketches(body.sceneSketches);
  if (!sceneSketches.ok) return sceneSketches;
  const bridgeMappings = readBridgeMappings(body.bridgeMappings);
  if (!bridgeMappings.ok) return bridgeMappings;

  const accessibilityChoiceValue = body.accessibilityChoice;
  let accessibilityChoice: string | undefined;
  if (accessibilityChoiceValue !== undefined) {
    const field = readRequiredStringField(body, "accessibilityChoice");
    if (!field.ok) return field;
    accessibilityChoice = field.value;
  }

  return {
    ok: true,
    value: {
      scenario: scenario.value,
      mode: mode.value,
      designBrief: designBrief.value,
      sceneSketches: sceneSketches.value,
      bridgeMappings: bridgeMappings.value,
      playtestObservation: playtestObservation.value,
      revisionNote: revisionNote.value,
      reviewNote: reviewNote.value,
      ...(accessibilityChoice !== undefined ? { accessibilityChoice } : {}),
    },
  };
}

function readSceneSketches(value: unknown): { ok: true; value: SceneSketch[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 2) {
    return { ok: false, error: "sceneSketches must include at least two scenes or game states" };
  }
  const sketches: SceneSketch[] = [];
  for (const [index, item] of value.entries()) {
    const object = readObjectItem(item, `sceneSketches[${index}]`);
    if (!object.ok) return object;
    const name = readRequiredStringField(object.value, "name");
    if (!name.ok) return { ok: false, error: `sceneSketches[${index}].${name.error}` };
    const character = readRequiredStringField(object.value, "character");
    if (!character.ok) return { ok: false, error: `sceneSketches[${index}].${character.error}` };
    const action = readRequiredStringField(object.value, "action");
    if (!action.ok) return { ok: false, error: `sceneSketches[${index}].${action.error}` };
    sketches.push({ name: name.value, character: character.value, action: action.value });
  }
  return { ok: true, value: sketches };
}

function readBridgeMappings(value: unknown): { ok: true; value: BridgeMapping[] } | { ok: false; error: string } {
  if (!Array.isArray(value) || value.length < 2) {
    return { ok: false, error: "bridgeMappings must include at least two Alice concept mappings" };
  }
  const mappings: BridgeMapping[] = [];
  for (const [index, item] of value.entries()) {
    const object = readObjectItem(item, `bridgeMappings[${index}]`);
    if (!object.ok) return object;
    const scene = readRequiredStringField(object.value, "scene");
    if (!scene.ok) return { ok: false, error: `bridgeMappings[${index}].${scene.error}` };
    const aliceConcept = readRequiredStringField(object.value, "aliceConcept");
    if (!aliceConcept.ok) return { ok: false, error: `bridgeMappings[${index}].${aliceConcept.error}` };
    const controls = readRequiredStringField(object.value, "controls");
    if (!controls.ok) return { ok: false, error: `bridgeMappings[${index}].${controls.error}` };
    mappings.push({ scene: scene.value, aliceConcept: aliceConcept.value, controls: controls.value });
  }
  return { ok: true, value: mappings };
}

function readObjectItem(
  value: unknown,
  label: string,
): { ok: true; value: Record<string, unknown> } | { ok: false; error: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: `${label} must be an object` };
  }
  return { ok: true, value: value as Record<string, unknown> };
}

function buildEvidence(
  context: ServerContext,
  request: DesignProcessEvidenceRequest,
  authoredObjectNames: readonly string[],
  procedureStatements: readonly { name: string; statementCount: number }[],
) {
  const phases = ["plan", "build", "playtest", "revise", "review"] as const;
  return {
    schema_version: "lookingglass.design-process-story-or-game-evidence/v1",
    status: "evidence-recorded",
    scenario: SCENARIO_ID,
    runtime: "alice-web",
    platform: "lookingglass",
    phases,
    journeyEvidence: {
      plan: {
        mode: request.mode,
        designBrief: request.designBrief,
        sceneSketches: request.sceneSketches,
        sceneOrStateCount: request.sceneSketches.length,
      },
      build: {
        projectName: context.state.projectName,
        authoredObjectNames,
        procedureStatements,
      },
      playtest: {
        observation: request.playtestObservation,
        runCount: context.state.runWorldEvidenceArtifacts.length,
        runEvidenceArtifacts: context.state.runWorldEvidenceArtifacts,
      },
      revise: {
        revisionNote: request.revisionNote,
        bridgeMappings: request.bridgeMappings,
      },
      review: {
        reviewNote: request.reviewNote,
        accessibilityChoice: request.accessibilityChoice ?? "not recorded",
      },
    },
    closureEvidence: {
      userVisibleResult: "student can show a plan, built Alice-web prototype, playtest observation, revision note, and review note",
      namedAliceConcepts: request.bridgeMappings.map((mapping) => mapping.aliceConcept),
      projectState: {
        sceneObjectCount: context.state.sceneObjects.size,
        authoredObjectCount: authoredObjectNames.length,
        procedureCount: context.state.procedures.size,
      },
    },
    doesNotClaim: [...DOES_NOT_CLAIM],
  };
}
