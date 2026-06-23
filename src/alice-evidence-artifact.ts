const ALICE_EVIDENCE_FORMAT = "alice-visible-behavior-evidence" as const;
const ALICE_EVIDENCE_VERSION = 1 as const;
const ALICE_EVIDENCE_MIME_TYPE = "application/json" as const;

const MAX_VISIBLE_OBJECTS = 200;
const MAX_FILENAME_LENGTH = 120;
const MAX_RUNTIME_REVIEW_ITEMS = 50;

export type AliceEvidenceExportMethod = "download" | "native-share";
export type AliceEvidenceShareOutcome = "prepared" | "completed" | "unavailable";

export interface AliceEvidenceVector {
  x: number;
  y: number;
  z: number;
}

export interface AliceEvidenceCanvasSnapshot {
  available: boolean;
  reason?: string;
  width?: number;
  height?: number;
  mimeType?: string;
}

export interface AliceEvidenceVisibleObject {
  name: string;
  typeName: string;
  visible: boolean;
  position: AliceEvidenceVector;
}

export interface AliceEvidenceVisibleBehavior {
  statusText: string;
  viewport: {
    width: number;
    height: number;
    canvasSnapshot: AliceEvidenceCanvasSnapshot;
  };
  camera: {
    mode: string;
    position: AliceEvidenceVector;
    target: AliceEvidenceVector;
  };
  objects: AliceEvidenceVisibleObject[];
}

export interface AliceEvidenceCameraVrComfort {
  schema_version: "alice.camera-vr-comfort-evidence/v1";
  status: "partial";
  browserWebXrStatus?: string;
  desktopCameraAvailable?: boolean;
  keyboardMovementAvailable?: boolean | "unknown";
  reducedMotionRespected?: boolean | "unknown";
  trueHeadsetVrSupported: false;
  nativeVrSupported: false;
  cameraMode?: string;
  evidenceCodes?: readonly string[];
  comfortChecks?: {
    discreteMovementStep?: boolean;
    stableHorizon?: boolean;
    noForcedHeadset?: boolean;
  };
  unsupportedReason?: string;
}

export interface AliceEvidenceAccessibilityCaptions {
  schema_version: "alice.accessibility-rescue-camera-captions/v1";
  status: "partial";
  ariaLiveCaption?: string;
  cameraCaption?: string;
  objectCaption?: string;
  keyboardReviewAvailable?: boolean | "unknown";
  highContrastReviewAvailable?: boolean | "unknown";
  captionChecks?: readonly {
    id: string;
    present: boolean;
    channel?: "aria-live" | "visible-text";
    text?: string;
  }[];
}

export interface AliceEvidenceGalleryReview {
  schema_version: "alice.gallery-walk-rubric-evidence/v1";
  status: "partial";
  projectName?: string;
  galleryItemCount?: number;
  reviewWorkflowSupported?: boolean;
  rubricRecordingSupported?: boolean;
  liveStudioSupported: false;
  unsupportedLiveStudioReason?: string;
  rubric?: readonly {
    id: string;
    label: string;
    maxScore: number;
    evidenceRequired: string;
  }[];
  galleryItems?: readonly {
    id: string;
    title: string;
    reviewPrompt: string;
  }[];
}

export interface AliceEvidenceRuntimeReview {
  cameraVrComfort?: AliceEvidenceCameraVrComfort;
  accessibilityRescueCaptions?: AliceEvidenceAccessibilityCaptions;
  galleryWalkRubric?: AliceEvidenceGalleryReview;
}

export interface AliceEvidenceArtifact {
  format: typeof ALICE_EVIDENCE_FORMAT;
  version: typeof ALICE_EVIDENCE_VERSION;
  application: {
    name: "Alice";
    runtime: "alice-web";
  };
  world: {
    name: string;
    aliceVersion: string;
    objectCount: number;
  };
  run: {
    id: string;
    capturedAt: string;
  };
  visibleBehavior: AliceEvidenceVisibleBehavior;
  runtimeReview?: AliceEvidenceRuntimeReview;
  export: {
    method: AliceEvidenceExportMethod;
    requestedAt: string;
    filename: string;
    mimeType: typeof ALICE_EVIDENCE_MIME_TYPE;
    share?: {
      available: boolean;
      outcome: AliceEvidenceShareOutcome;
      title?: string;
      summary?: string;
      artifactHash?: `sha256:${string}`;
      preparedAt?: string;
    };
  };
}

export interface AliceEvidenceArtifactInput {
  world: {
    name: string;
    aliceVersion: string;
    objectCount: number;
  };
  run: {
    id: string;
    capturedAt: string;
  };
  visibleBehavior: AliceEvidenceVisibleBehavior;
  runtimeReview?: AliceEvidenceRuntimeReview;
  export: {
    method: AliceEvidenceExportMethod;
    requestedAt: string;
    filename: string;
    mimeType?: string;
    share?: {
      available: boolean;
      outcome: AliceEvidenceShareOutcome;
      title?: string;
      summary?: string;
      artifactHash?: `sha256:${string}`;
      preparedAt?: string;
    };
  };
}

export interface AliceEvidenceValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AliceEvidenceSummary {
  title: string;
  projectName: string;
  captureCount: number;
  objectCount: number;
  lastCaptureLabel: string | null;
  statusText: string;
}

export interface PrepareAliceEvidenceShareInput {
  available?: boolean;
  outcome?: AliceEvidenceShareOutcome;
  title?: string;
  summary?: string;
  preparedAt?: string;
}

export class AliceEvidenceArtifactError extends Error {
  constructor(message: string, readonly errors: string[]) {
    super(message);
    this.name = "AliceEvidenceArtifactError";
  }
}

export function createAliceEvidenceArtifact(input: AliceEvidenceArtifactInput): AliceEvidenceArtifact {
  return {
    format: ALICE_EVIDENCE_FORMAT,
    version: ALICE_EVIDENCE_VERSION,
    application: {
      name: "Alice",
      runtime: "alice-web",
    },
    world: {
      name: stringValue(input.world.name),
      aliceVersion: stringValue(input.world.aliceVersion),
      objectCount: finiteNonNegativeInteger(input.world.objectCount),
    },
    run: {
      id: stringValue(input.run.id),
      capturedAt: stringValue(input.run.capturedAt),
    },
    visibleBehavior: {
      statusText: stringValue(input.visibleBehavior.statusText),
      viewport: {
        width: finitePositiveInteger(input.visibleBehavior.viewport.width),
        height: finitePositiveInteger(input.visibleBehavior.viewport.height),
        canvasSnapshot: sanitizeCanvasSnapshot(input.visibleBehavior.viewport.canvasSnapshot),
      },
      camera: {
        mode: stringValue(input.visibleBehavior.camera.mode),
        position: sanitizeVector(input.visibleBehavior.camera.position),
        target: sanitizeVector(input.visibleBehavior.camera.target),
      },
      objects: input.visibleBehavior.objects.slice(0, MAX_VISIBLE_OBJECTS).map(sanitizeVisibleObject),
    },
    ...(input.runtimeReview ? { runtimeReview: sanitizeRuntimeReview(input.runtimeReview) } : {}),
    export: {
      method: input.export.method,
      requestedAt: stringValue(input.export.requestedAt),
      filename: sanitizeAliceEvidenceFilename(input.export.filename),
      mimeType: ALICE_EVIDENCE_MIME_TYPE,
      ...(input.export.share ? {
        share: {
          available: Boolean(input.export.share.available),
          outcome: input.export.share.outcome,
          ...(input.export.share.title ? { title: stringValue(input.export.share.title) } : {}),
          ...(input.export.share.summary ? { summary: stringValue(input.export.share.summary) } : {}),
          ...(input.export.share.artifactHash ? { artifactHash: input.export.share.artifactHash } : {}),
          ...(input.export.share.preparedAt ? { preparedAt: stringValue(input.export.share.preparedAt) } : {}),
        },
      } : {}),
    },
  };
}

export function serializeAliceEvidenceArtifact(artifact: AliceEvidenceArtifact): string {
  assertValidAliceEvidenceArtifact(artifact);
  return `${JSON.stringify(artifact, null, 2)}\n`;
}

export function parseAliceEvidenceArtifact(json: string): AliceEvidenceArtifact {
  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new AliceEvidenceArtifactError(
      `Alice evidence artifact JSON could not be parsed: ${error instanceof Error ? error.message : String(error)}`,
      ["JSON must be valid."],
    );
  }

  assertValidAliceEvidenceArtifact(parsed);
  return parsed as AliceEvidenceArtifact;
}

export function summarizeAliceEvidenceArtifact(artifact: AliceEvidenceArtifact): AliceEvidenceSummary {
  assertValidAliceEvidenceArtifact(artifact);
  const projectName = artifact.world.name;
  const objectCount = artifact.visibleBehavior.objects.length;
  const captureCount = 1;
  const title = `Alice evidence for ${projectName}`;
  const objectText = `${objectCount} ${objectCount === 1 ? "object" : "objects"}`;
  return {
    title,
    projectName,
    captureCount,
    objectCount,
    lastCaptureLabel: "Visible behavior",
    statusText: `Alice alice-web evidence for ${projectName}: ${captureCount} capture, ${objectText}.`,
  };
}

export function prepareAliceEvidenceShare(
  artifact: AliceEvidenceArtifact,
  input: PrepareAliceEvidenceShareInput = {},
): AliceEvidenceArtifact {
  const preShareArtifact = withoutShare(artifact);
  const summary = summarizeAliceEvidenceArtifact(preShareArtifact);
  const artifactHash = `sha256:${sha256Hex(serializeAliceEvidenceArtifact(preShareArtifact))}` as const;
  const sharedArtifact: AliceEvidenceArtifact = {
    ...preShareArtifact,
    export: {
      ...preShareArtifact.export,
      share: {
        available: input.available ?? true,
        outcome: input.outcome ?? "prepared",
        title: input.title ?? summary.title,
        summary: input.summary ?? summary.statusText,
        artifactHash,
        preparedAt: input.preparedAt ?? new Date().toISOString(),
      },
    },
  };
  assertValidAliceEvidenceArtifact(sharedArtifact);
  return sharedArtifact;
}

export function validateAliceEvidenceArtifact(value: unknown): AliceEvidenceValidationResult {
  const errors: string[] = [];
  const artifact = recordValue(value);

  if (!artifact) {
    return { valid: false, errors: ["Alice evidence artifact must be an object."] };
  }

  expectEqual(artifact.format, ALICE_EVIDENCE_FORMAT, "format", errors);
  expectEqual(artifact.version, ALICE_EVIDENCE_VERSION, "version", errors);

  const application = nestedRecord(artifact.application, "application", errors);
  if (application) {
    expectEqual(application.name, "Alice", "application.name", errors);
    expectEqual(application.runtime, "alice-web", "application.runtime", errors);
  }

  const world = nestedRecord(artifact.world, "world", errors);
  if (world) {
    expectNonEmptyString(world.name, "world.name", errors);
    expectNonEmptyString(world.aliceVersion, "world.aliceVersion", errors);
    expectPositiveInteger(world.objectCount, "world.objectCount", errors);
  }

  const run = nestedRecord(artifact.run, "run", errors);
  if (run) {
    expectNonEmptyString(run.id, "run.id", errors);
    expectIsoTimestamp(run.capturedAt, "run.capturedAt", errors);
  }

  const visibleBehavior = nestedRecord(artifact.visibleBehavior, "visibleBehavior", errors);
  if (visibleBehavior) {
    expectNonEmptyString(visibleBehavior.statusText, "visibleBehavior.statusText", errors);
    validateViewport(visibleBehavior.viewport, errors);
    validateCamera(visibleBehavior.camera, errors);
    validateVisibleObjects(visibleBehavior.objects, errors);
  }

  if (artifact.runtimeReview !== undefined) {
    const runtimeReview = nestedRecord(artifact.runtimeReview, "runtimeReview", errors);
    if (runtimeReview) {
      if (runtimeReview.cameraVrComfort !== undefined) {
        const cameraVrComfort = nestedRecord(runtimeReview.cameraVrComfort, "runtimeReview.cameraVrComfort", errors);
        if (cameraVrComfort) {
          expectEqual(cameraVrComfort.schema_version, "alice.camera-vr-comfort-evidence/v1", "runtimeReview.cameraVrComfort.schema_version", errors);
          expectEqual(cameraVrComfort.status, "partial", "runtimeReview.cameraVrComfort.status", errors);
          expectLiteralFalse(cameraVrComfort.trueHeadsetVrSupported, "runtimeReview.cameraVrComfort.trueHeadsetVrSupported", errors);
          expectLiteralFalse(cameraVrComfort.nativeVrSupported, "runtimeReview.cameraVrComfort.nativeVrSupported", errors);
        }
      }
      if (runtimeReview.accessibilityRescueCaptions !== undefined) {
        const captions = nestedRecord(runtimeReview.accessibilityRescueCaptions, "runtimeReview.accessibilityRescueCaptions", errors);
        if (captions) {
          expectEqual(captions.schema_version, "alice.accessibility-rescue-camera-captions/v1", "runtimeReview.accessibilityRescueCaptions.schema_version", errors);
          expectEqual(captions.status, "partial", "runtimeReview.accessibilityRescueCaptions.status", errors);
        }
      }
      if (runtimeReview.galleryWalkRubric !== undefined) {
        const galleryWalkRubric = nestedRecord(runtimeReview.galleryWalkRubric, "runtimeReview.galleryWalkRubric", errors);
        if (galleryWalkRubric) {
          expectEqual(galleryWalkRubric.schema_version, "alice.gallery-walk-rubric-evidence/v1", "runtimeReview.galleryWalkRubric.schema_version", errors);
          expectEqual(galleryWalkRubric.status, "partial", "runtimeReview.galleryWalkRubric.status", errors);
          expectLiteralFalse(galleryWalkRubric.liveStudioSupported, "runtimeReview.galleryWalkRubric.liveStudioSupported", errors);
        }
      }
    }
  }

  const exported = nestedRecord(artifact.export, "export", errors);
  if (exported) {
    if (exported.method !== "download" && exported.method !== "native-share") {
      errors.push("export.method must be download or native-share.");
    }
    expectIsoTimestamp(exported.requestedAt, "export.requestedAt", errors);
    expectEqual(exported.mimeType, ALICE_EVIDENCE_MIME_TYPE, "export.mimeType", errors);
    if (typeof exported.filename !== "string" || exported.filename !== sanitizeAliceEvidenceFilename(exported.filename)) {
      errors.push("export.filename must be a conservative .json filename.");
    }
    if (exported.share !== undefined) {
      const share = nestedRecord(exported.share, "export.share", errors);
      if (share) {
        if (typeof share.available !== "boolean") {
          errors.push("export.share.available must be a boolean.");
        }
        if (!["prepared", "completed", "unavailable"].includes(String(share.outcome))) {
          errors.push("export.share.outcome must be prepared, completed, or unavailable.");
        }
        if (share.title !== undefined) {
          expectNonEmptyString(share.title, "export.share.title", errors);
        }
        if (share.summary !== undefined) {
          expectNonEmptyString(share.summary, "export.share.summary", errors);
        }
        if (share.artifactHash !== undefined
          && (typeof share.artifactHash !== "string" || !/^sha256:[a-f0-9]{64}$/.test(share.artifactHash))) {
          errors.push("export.share.artifactHash must be a sha256 hex digest.");
        }
        if (share.preparedAt !== undefined) {
          expectIsoTimestamp(share.preparedAt, "export.share.preparedAt", errors);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}

function sanitizeAliceEvidenceFilename(value: string): string {
  const withoutExtension = value.replace(/\.json$/i, "");
  const normalized = withoutExtension
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-+|-+$/g, "");
  const base = (normalized || "alice-evidence").slice(0, MAX_FILENAME_LENGTH - ".json".length);
  return `${base.replace(/[.-]+$/g, "") || "alice-evidence"}.json`;
}

function assertValidAliceEvidenceArtifact(value: unknown): void {
  const validation = validateAliceEvidenceArtifact(value);
  if (!validation.valid) {
    throw new AliceEvidenceArtifactError(
      `Alice evidence artifact is invalid: ${validation.errors.join("; ")}`,
      validation.errors,
    );
  }
}

function withoutShare(artifact: AliceEvidenceArtifact): AliceEvidenceArtifact {
  const exportInfo = { ...artifact.export };
  delete exportInfo.share;
  const preShareArtifact = {
    ...artifact,
    export: exportInfo,
  };
  assertValidAliceEvidenceArtifact(preShareArtifact);
  return preShareArtifact;
}

function sanitizeVisibleObject(object: AliceEvidenceVisibleObject): AliceEvidenceVisibleObject {
  return {
    name: stringValue(object.name),
    typeName: stringValue(object.typeName),
    visible: Boolean(object.visible),
    position: sanitizeVector(object.position),
  };
}

function sanitizeCanvasSnapshot(snapshot: AliceEvidenceCanvasSnapshot): AliceEvidenceCanvasSnapshot {
  return {
    available: Boolean(snapshot.available),
    ...(snapshot.reason ? { reason: stringValue(snapshot.reason) } : {}),
    ...(snapshot.width ? { width: finitePositiveInteger(snapshot.width) } : {}),
    ...(snapshot.height ? { height: finitePositiveInteger(snapshot.height) } : {}),
    ...(snapshot.mimeType ? { mimeType: stringValue(snapshot.mimeType) } : {}),
  };
}

function measuredBoolean(value: unknown): boolean | "unknown" {
  return value === "unknown" ? "unknown" : Boolean(value);
}

function sanitizeRuntimeReview(review: AliceEvidenceRuntimeReview): AliceEvidenceRuntimeReview {
  return {
    ...(review.cameraVrComfort !== undefined ? { cameraVrComfort: sanitizeCameraVrComfortReview(review.cameraVrComfort) } : {}),
    ...(review.accessibilityRescueCaptions !== undefined ? { accessibilityRescueCaptions: sanitizeAccessibilityCaptionsReview(review.accessibilityRescueCaptions) } : {}),
    ...(review.galleryWalkRubric !== undefined ? { galleryWalkRubric: sanitizeGalleryWalkRubricReview(review.galleryWalkRubric) } : {}),
  };
}

function sanitizeCameraVrComfortReview(value: AliceEvidenceCameraVrComfort): AliceEvidenceCameraVrComfort {
  return {
    schema_version: "alice.camera-vr-comfort-evidence/v1",
    status: "partial",
    ...(value.browserWebXrStatus ? { browserWebXrStatus: stringValue(value.browserWebXrStatus) } : {}),
    ...(value.desktopCameraAvailable !== undefined ? { desktopCameraAvailable: Boolean(value.desktopCameraAvailable) } : {}),
    ...(value.keyboardMovementAvailable !== undefined ? { keyboardMovementAvailable: measuredBoolean(value.keyboardMovementAvailable) } : {}),
    ...(value.reducedMotionRespected !== undefined ? { reducedMotionRespected: measuredBoolean(value.reducedMotionRespected) } : {}),
    trueHeadsetVrSupported: false,
    nativeVrSupported: false,
    ...(value.cameraMode ? { cameraMode: stringValue(value.cameraMode) } : {}),
    ...(Array.isArray(value.evidenceCodes)
      ? { evidenceCodes: value.evidenceCodes.slice(0, MAX_RUNTIME_REVIEW_ITEMS).map(stringValue) }
      : {}),
    ...(value.comfortChecks ? {
      comfortChecks: {
        discreteMovementStep: Boolean(value.comfortChecks.discreteMovementStep),
        stableHorizon: Boolean(value.comfortChecks.stableHorizon),
        noForcedHeadset: Boolean(value.comfortChecks.noForcedHeadset),
      },
    } : {}),
    ...(value.unsupportedReason ? { unsupportedReason: stringValue(value.unsupportedReason) } : {}),
  };
}

function sanitizeAccessibilityCaptionsReview(value: AliceEvidenceAccessibilityCaptions): AliceEvidenceAccessibilityCaptions {
  return {
    schema_version: "alice.accessibility-rescue-camera-captions/v1",
    status: "partial",
    ...(value.ariaLiveCaption ? { ariaLiveCaption: stringValue(value.ariaLiveCaption) } : {}),
    ...(value.cameraCaption ? { cameraCaption: stringValue(value.cameraCaption) } : {}),
    ...(value.objectCaption ? { objectCaption: stringValue(value.objectCaption) } : {}),
    ...(value.keyboardReviewAvailable !== undefined ? { keyboardReviewAvailable: measuredBoolean(value.keyboardReviewAvailable) } : {}),
    ...(value.highContrastReviewAvailable !== undefined ? { highContrastReviewAvailable: measuredBoolean(value.highContrastReviewAvailable) } : {}),
    ...(Array.isArray(value.captionChecks) ? {
      captionChecks: value.captionChecks.slice(0, MAX_RUNTIME_REVIEW_ITEMS).map((check) => ({
        id: stringValue(check.id),
        present: Boolean(check.present),
        ...(check.channel ? { channel: check.channel } : {}),
        ...(check.text ? { text: stringValue(check.text) } : {}),
      })),
    } : {}),
  };
}

function sanitizeGalleryWalkRubricReview(value: AliceEvidenceGalleryReview): AliceEvidenceGalleryReview {
  return {
    schema_version: "alice.gallery-walk-rubric-evidence/v1",
    status: "partial",
    ...(value.projectName ? { projectName: stringValue(value.projectName) } : {}),
    ...(value.galleryItemCount !== undefined ? { galleryItemCount: finiteNonNegativeInteger(value.galleryItemCount) } : {}),
    ...(value.reviewWorkflowSupported !== undefined ? { reviewWorkflowSupported: Boolean(value.reviewWorkflowSupported) } : {}),
    ...(value.rubricRecordingSupported !== undefined ? { rubricRecordingSupported: Boolean(value.rubricRecordingSupported) } : {}),
    liveStudioSupported: false,
    ...(value.unsupportedLiveStudioReason ? { unsupportedLiveStudioReason: stringValue(value.unsupportedLiveStudioReason) } : {}),
    ...(Array.isArray(value.rubric) ? {
      rubric: value.rubric.slice(0, MAX_RUNTIME_REVIEW_ITEMS).map((item) => ({
        id: stringValue(item.id),
        label: stringValue(item.label),
        maxScore: finiteNonNegativeInteger(item.maxScore),
        evidenceRequired: stringValue(item.evidenceRequired),
      })),
    } : {}),
    ...(Array.isArray(value.galleryItems) ? {
      galleryItems: value.galleryItems.slice(0, MAX_RUNTIME_REVIEW_ITEMS).map((item) => ({
        id: stringValue(item.id),
        title: stringValue(item.title),
        reviewPrompt: stringValue(item.reviewPrompt),
      })),
    } : {}),
  };
}

function cloneJsonRecord(value: unknown): unknown {
  const record = recordValue(value);
  return record ? JSON.parse(JSON.stringify(record)) : {};
}

function sanitizeVector(vector: AliceEvidenceVector): AliceEvidenceVector {
  return {
    x: finiteNumber(vector.x),
    y: finiteNumber(vector.y),
    z: finiteNumber(vector.z),
  };
}

function stringValue(value: string): string {
  return value.trim();
}

function finiteNumber(value: number): number {
  return Number.isFinite(value) ? Number(value.toFixed(6)) : 0;
}

function finitePositiveInteger(value: number): number {
  return Number.isFinite(value) && value > 0 ? Math.round(value) : 1;
}

function finiteNonNegativeInteger(value: number): number {
  return Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}

function recordValue(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

function nestedRecord(value: unknown, label: string, errors: string[]): Record<string, unknown> | null {
  const record = recordValue(value);
  if (!record) {
    errors.push(`${label} must be an object.`);
  }
  return record;
}

function expectLiteralFalse(value: unknown, label: string, errors: string[]): void {
  if (value !== false) {
    errors.push(`${label} must be false.`);
  }
}

function expectEqual(actual: unknown, expected: unknown, label: string, errors: string[]): void {
  if (actual !== expected) {
    errors.push(`${label} must be ${String(expected)}.`);
  }
}

function expectNonEmptyString(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || value.trim().length === 0) {
    errors.push(`${label} must be a non-empty string.`);
  }
}

function expectIsoTimestamp(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "string" || Number.isNaN(Date.parse(value))) {
    errors.push(`${label} must be an ISO timestamp.`);
  }
}

function expectPositiveInteger(value: unknown, label: string, errors: string[]): void {
  if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
    errors.push(`${label} must be a positive integer.`);
  }
}

function validateViewport(value: unknown, errors: string[]): void {
  const viewport = nestedRecord(value, "visibleBehavior.viewport", errors);
  if (!viewport) {
    return;
  }
  expectPositiveInteger(viewport.width, "visibleBehavior.viewport.width", errors);
  expectPositiveInteger(viewport.height, "visibleBehavior.viewport.height", errors);
  const snapshot = nestedRecord(viewport.canvasSnapshot, "visibleBehavior.viewport.canvasSnapshot", errors);
  if (snapshot && typeof snapshot.available !== "boolean") {
    errors.push("visibleBehavior.viewport.canvasSnapshot.available must be a boolean.");
  }
}

function validateCamera(value: unknown, errors: string[]): void {
  const camera = nestedRecord(value, "visibleBehavior.camera", errors);
  if (!camera) {
    return;
  }
  expectNonEmptyString(camera.mode, "visibleBehavior.camera.mode", errors);
  validateVector(camera.position, "visibleBehavior.camera.position", errors);
  validateVector(camera.target, "visibleBehavior.camera.target", errors);
}

function validateVisibleObjects(value: unknown, errors: string[]): void {
  if (!Array.isArray(value) || value.length === 0) {
    errors.push("visible behavior must include at least one visible object.");
    return;
  }
  for (const [index, objectValue] of value.entries()) {
    const object = nestedRecord(objectValue, `visibleBehavior.objects[${index}]`, errors);
    if (!object) {
      continue;
    }
    expectNonEmptyString(object.name, `visibleBehavior.objects[${index}].name`, errors);
    expectNonEmptyString(object.typeName, `visibleBehavior.objects[${index}].typeName`, errors);
    if (typeof object.visible !== "boolean") {
      errors.push(`visibleBehavior.objects[${index}].visible must be a boolean.`);
    }
    validateVector(object.position, `visibleBehavior.objects[${index}].position`, errors);
  }
}

function validateVector(value: unknown, label: string, errors: string[]): void {
  const vector = nestedRecord(value, label, errors);
  if (!vector) {
    return;
  }
  for (const axis of ["x", "y", "z"]) {
    if (typeof vector[axis] !== "number" || !Number.isFinite(vector[axis])) {
      errors.push(`${label}.${axis} must be a finite number.`);
    }
  }
}

const SHA256_INITIAL_HASH = [
  0x6a09e667,
  0xbb67ae85,
  0x3c6ef372,
  0xa54ff53a,
  0x510e527f,
  0x9b05688c,
  0x1f83d9ab,
  0x5be0cd19,
] as const;

const SHA256_ROUND_CONSTANTS = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
] as const;

function sha256Hex(text: string): string {
  const bytes = new TextEncoder().encode(text);
  const paddedLength = paddedSha256Length(bytes.length);
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.length] = 0x80;

  const bitLength = bytes.length * 8;
  const view = new DataView(padded.buffer);
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x100000000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash: number[] = [...SHA256_INITIAL_HASH];
  const words = new Array<number>(64).fill(0);

  for (let offset = 0; offset < padded.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < 64; index += 1) {
      const s0 = rotateRight(words[index - 15], 7) ^ rotateRight(words[index - 15], 18) ^ (words[index - 15] >>> 3);
      const s1 = rotateRight(words[index - 2], 17) ^ rotateRight(words[index - 2], 19) ^ (words[index - 2] >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let [a, b, c, d, e, f, g, h] = hash;
    for (let index = 0; index < 64; index += 1) {
      const s1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + s1 + ch + SHA256_ROUND_CONSTANTS[index] + words[index]) >>> 0;
      const s0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (s0 + maj) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) >>> 0;
    }

    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }

  return hash.map((value) => value.toString(16).padStart(8, "0")).join("");
}

function paddedSha256Length(byteLength: number): number {
  let length = byteLength + 1 + 8;
  while (length % 64 !== 0) {
    length += 1;
  }
  return length;
}

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}
