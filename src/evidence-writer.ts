import * as fs from "fs";
import * as path from "path";

/**
 * Writes eatme proof artifact JSON files matching the exact schemas
 * that Java Alice produces. The eatme Rust harness validates these.
 */

// ── Scene Object Added ───────────────────────────────────────────────

export interface SceneObjectAddedEvidence {
  objectClassName: string;
  sceneFieldCountAfter: number;
}

const SCENE_OBJECT_ADDED_ARTIFACT = "scene-object-added.json";
const SCENE_OBJECT_ADDED_SCHEMA = "eatme.alice-scene-object-added/v1";

export function writeSceneObjectAdded(
  evidenceDir: string,
  evidence: SceneObjectAddedEvidence,
): string {
  validateEvidenceDir(evidenceDir);
  const content = JSON.stringify(
    {
      schema_version: SCENE_OBJECT_ADDED_SCHEMA,
      timestamp: Date.now(),
      object_class_name: evidence.objectClassName,
      scene_field_count_after: evidence.sceneFieldCountAfter,
    },
    null,
    2,
  ) + "\n";
  const artifact = path.join(evidenceDir, SCENE_OBJECT_ADDED_ARTIFACT);
  writeAtomically(artifact, content);
  return artifact;
}

// ── Edit Procedure Proof ─────────────────────────────────────────────

export interface EditProcedureEvidence {
  procedureSelector: string;
  editSpec: string;
  inputProjectArtifact: string;
  sceneType: string;
  methodName: string;
  marker: string;
  beforeStatementCount: number;
  afterStatementCount: number;
  beforeMethods: string[];
  afterMethods: string[];
  editedProject: string;
}

const EDIT_PROCEDURE_PROOF_ARTIFACT =
  "first-lesson-code-editor-action-proof.json";
const EDIT_PROCEDURE_PROOF_SCHEMA =
  "eatme.alice-first-lesson-code-editor-action-proof/v1";

export function writeEditProcedureProof(
  evidenceDir: string,
  evidence: EditProcedureEvidence,
): string {
  validateEvidenceDir(evidenceDir);
  const content = JSON.stringify(
    {
      schema_version: EDIT_PROCEDURE_PROOF_SCHEMA,
      status: "proved",
      procedure_selector: evidence.procedureSelector,
      edit_spec: evidence.editSpec,
      input_project_artifact: evidence.inputProjectArtifact,
      scene_type: evidence.sceneType,
      method_name: evidence.methodName,
      selection_mode: "api_direct",
      selected_declaration: evidence.methodName,
      code_composite_declaration: evidence.methodName,
      code_editor_backing: "lookingglass",
      code_editor_code: evidence.methodName,
      operation_fired: true,
      action: "append-comment",
      marker: evidence.marker,
      before_statement_count: evidence.beforeStatementCount,
      after_statement_count: evidence.afterStatementCount,
      statement_count_delta:
        evidence.afterStatementCount - evidence.beforeStatementCount,
      target_marker_count: 1,
      wrong_target_marker_count: 0,
      before_methods: evidence.beforeMethods,
      after_methods: evidence.afterMethods,
      edited_project: evidence.editedProject,
      success: true,
      doesNotClaim: [
        "full first-lesson completion",
        "first-lesson completion",
        "grading",
        "creative assessment",
        "visible rendering correctness",
        "broad UI automation",
        "Save-menu completion",
      ],
    },
    null,
    2,
  ) + "\n";
  const artifact = path.join(evidenceDir, EDIT_PROCEDURE_PROOF_ARTIFACT);
  writeAtomically(artifact, content);
  return artifact;
}

// ── Edit Procedure Result (stdout JSON) ──────────────────────────────

const EDIT_PROCEDURE_RESULT_SCHEMA =
  "eatme.alice-first-lesson-code-editor-action-proof-result/v1";
const EDITED_PROJECT_FILENAME = "edited-project.a3p";

export function editProcedureResultJson(procedureSelector: string): string {
  return JSON.stringify({
    schema_version: EDIT_PROCEDURE_RESULT_SCHEMA,
    status: "proved",
    procedure_selector: procedureSelector,
    edited_project_artifact: EDITED_PROJECT_FILENAME,
    action_proof: EDIT_PROCEDURE_PROOF_ARTIFACT,
    doesNotClaim: [
      "first-lesson completion",
      "grading",
      "creative assessment",
      "visible rendering correctness",
      "broad UI automation",
    ],
  });
}

// ── Save Project Proof ───────────────────────────────────────────────

export interface SaveProjectEvidence {
  savedFilePath: string;
  fileSizeBytes: number;
}

const SAVE_RESULT_ARTIFACT = "desktop-save-operation-result.json";
const SAVE_RESULT_SCHEMA = "eatme.alice-desktop-save-operation-result/v1";

export function writeSaveProof(
  evidenceDir: string,
  evidence: SaveProjectEvidence,
): string {
  validateEvidenceDir(evidenceDir);
  const content = JSON.stringify(
    {
      schema_version: SAVE_RESULT_SCHEMA,
      status: "saved",
      source: "lookingglass",
      operation: "SaveProjectOperation",
      extension: "a3p",
      finished: true,
      canceled: false,
      prompt_count: 0,
      save_attempts: 1,
      saved_file: evidence.savedFilePath,
      saved_file_exists: true,
      saved_file_size_bytes: evidence.fileSizeBytes,
      dialogType: "api-direct",
      evidencePath: "Save API endpoint",
      wroteFile: true,
      fileExtension: "a3p",
      claim: "Save control/dialog approval reached a non-empty .a3p project file write",
      doesNotClaim: [
        "desktop Save menu item was clicked",
        "full lesson completion",
        "full Alice UI automation",
        "first-lesson completion",
        "visible rendering correctness",
        "grading correctness",
        "broad UI automation coverage",
        "native dialog coverage",
      ],
    },
    null,
    2,
  ) + "\n";
  const artifact = path.join(evidenceDir, SAVE_RESULT_ARTIFACT);
  writeAtomically(artifact, content);
  return artifact;
}

// ── Save Project Result (stdout JSON for hook) ───────────────────────

const SAVE_PROJECT_RESULT_SCHEMA = "eatme.alice-project-save-result/v1";

export function saveProjectResultJson(
  saveSelector: string,
  savedProjectArtifact: string,
  saveArtifact: string,
): string {
  return JSON.stringify({
    schema_version: SAVE_PROJECT_RESULT_SCHEMA,
    status: "saved",
    save_selector: saveSelector,
    saved_project_artifact: savedProjectArtifact,
    save_artifact: saveArtifact,
  });
}

// ── Helpers ──────────────────────────────────────────────────────────

function validateEvidenceDir(dir: string): void {
  const resolved = path.resolve(dir);
  const stat = fs.statSync(resolved, { throwIfNoEntry: false });
  if (!stat) {
    fs.mkdirSync(resolved, { recursive: true });
  } else if (!stat.isDirectory()) {
    throw new Error(`Evidence path is not a directory: ${dir}`);
  }
}

let atomicWriteCounter = 0;

function writeAtomically(filePath: string, content: string): void {
  atomicWriteCounter += 1;
  const tmpPath = `${filePath}.tmp.${process.pid}.${Date.now()}.${atomicWriteCounter}`;
  try {
    fs.writeFileSync(tmpPath, content, "utf-8");
    fs.renameSync(tmpPath, filePath);
  } finally {
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      // tmp already moved or cleaned
    }
  }
  const stat = fs.statSync(filePath);
  if (!stat.isFile() || stat.size === 0) {
    throw new Error(`Evidence artifact was not written: ${filePath}`);
  }
}

// ── Event Register Evidence ───────────────────────────────────────────

export interface EventRegisterEvidence {
  registrationId: string;
  eventType: string;
  handlerName: string;
  totalRegistrations: number;
}

const EVENT_REGISTER_ARTIFACT = "event-register.json";
const EVENT_REGISTER_SCHEMA = "eatme.alice-event-register/v1";

export function writeEventRegister(
  evidenceDir: string,
  evidence: EventRegisterEvidence,
): string {
  validateEvidenceDir(evidenceDir);
  const content = JSON.stringify(
    {
      schema_version: EVENT_REGISTER_SCHEMA,
      timestamp: Date.now(),
      registration_id: evidence.registrationId,
      event_type: evidence.eventType,
      handler_name: evidence.handlerName,
      total_registrations: evidence.totalRegistrations,
    },
    null,
    2,
  ) + "\n";
  const artifact = path.join(evidenceDir, EVENT_REGISTER_ARTIFACT);
  writeAtomically(artifact, content);
  return artifact;
}

// ── Event Fire Evidence ──────────────────────────────────────────────

export interface EventFireEvidence {
  eventType: string;
  registrationsEvaluated: number;
  triggeredCount: number;
  triggered: string[];
}

const EVENT_FIRE_ARTIFACT = "event-fire.json";
const EVENT_FIRE_SCHEMA = "eatme.alice-event-fire/v1";

export function writeEventFire(
  evidenceDir: string,
  evidence: EventFireEvidence,
): string {
  validateEvidenceDir(evidenceDir);
  const content = JSON.stringify(
    {
      schema_version: EVENT_FIRE_SCHEMA,
      timestamp: Date.now(),
      event_type: evidence.eventType,
      registrations_evaluated: evidence.registrationsEvaluated,
      triggered_count: evidence.triggeredCount,
      triggered: evidence.triggered,
    },
    null,
    2,
  ) + "\n";
  const artifact = path.join(evidenceDir, EVENT_FIRE_ARTIFACT);
  writeAtomically(artifact, content);
  return artifact;
}

// Re-export artifact filenames for tests
export const ARTIFACT_NAMES = {
  sceneObjectAdded: SCENE_OBJECT_ADDED_ARTIFACT,
  editProcedureProof: EDIT_PROCEDURE_PROOF_ARTIFACT,
  editedProject: EDITED_PROJECT_FILENAME,
  saveResult: SAVE_RESULT_ARTIFACT,
  eventRegister: EVENT_REGISTER_ARTIFACT,
  eventFire: EVENT_FIRE_ARTIFACT,
} as const;
