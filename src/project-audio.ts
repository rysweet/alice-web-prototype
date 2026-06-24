import type { AudioContextLike, AudioResource, AudioRuntimeMode } from "./audio.js";
import { WebAudioPlayer } from "./audio.js";

export const SUPPORTED_AUDIO_FORMATS = ["mp3", "wav", "ogg", "m4a"] as const;
export const SUPPORTED_AUDIO_EXTENSIONS = SUPPORTED_AUDIO_FORMATS.map((format) => `.${format}`);
export const AUDIO_MANIFEST_KEY = "aliceAudio";
export const AUDIO_WORKFLOW_MANIFEST_VERSION = "alice-web.audio-manifest/v1";

export type SupportedAudioFormat = typeof SUPPORTED_AUDIO_FORMATS[number];

export interface ProjectAudioAsset {
  id: string;
  name: string;
  format: SupportedAudioFormat;
  resourcePath: string;
  sizeBytes: number;
  durationSeconds: number | null;
}

export interface ProjectAudioBackgroundMusic {
  assetId: string;
  volume: number;
  loop: boolean;
}

export interface ProjectAudioCue {
  id: string;
  assetId: string;
  animationId: string;
  timelineTimeSeconds: number;
  volume: number;
}

export interface ProjectAudioPlaybackOutput {
  play(options: {
    volume: number;
    loop: boolean;
    cueId?: string;
    animationId?: string;
    timelineTimeSeconds?: number;
  }): void;
  stop(): void;
}

export interface ProjectAudioPlaybackBridge {
  startBackgroundMusic(): void;
  updateAnimationPlayback(animationId: string, timeSeconds: number): void;
  resetAnimationPlayback(animationId: string): void;
  stopAll(): void;
  getTriggeredCueIds(): string[];
}

export interface ProjectAudioPlaybackBridgeOptions {
  createOutput(
    asset: ProjectAudioAsset,
    role: "background" | "cue",
  ): ProjectAudioPlaybackOutput;
}

export interface ProjectAudioWebAudioOutputFactoryOptions {
  resources: Map<string, AudioResource>;
  audioContext?: AudioContextLike;
  runtimeMode?: AudioRuntimeMode;
}

export interface ProjectAudioState {
  assets: ProjectAudioAsset[];
  backgroundMusic: ProjectAudioBackgroundMusic | null;
  cues: ProjectAudioCue[];
  nextAssetNumber: number;
}

export type ProjectAudioDecodeStatus = "decoded" | "decode-unavailable" | "decode-failed";
export type ProjectAudioCueTrigger = "sceneActivated" | "manual" | "worldRun";

export interface ProjectAudioResource {
  id: string;
  name: string;
  path: string;
  format: SupportedAudioFormat;
  sizeBytes: number;
  duration: number;
  decodeStatus: ProjectAudioDecodeStatus;
}

export interface BackgroundAudioState {
  resourceId: string | null;
  enabled: boolean;
  loop: boolean;
  volume: number;
  pan: number;
}

export interface AudioCueState {
  id: string;
  name: string;
  resourceId: string;
  trigger: ProjectAudioCueTrigger;
  loop: boolean;
  volume: number;
  pan: number;
}

export interface ProjectAudioWorkflowState {
  manifestVersion: typeof AUDIO_WORKFLOW_MANIFEST_VERSION;
  resources: ProjectAudioResource[];
  background: BackgroundAudioState;
  cues: AudioCueState[];
  activeCueIds: string[];
}

export interface ProjectAudioManifestResource {
  id: string;
  name: string;
  path: string;
  format: SupportedAudioFormat;
  sizeBytes: number;
  duration: number;
}

export interface ProjectAudioWorkflowManifest {
  schemaVersion: typeof AUDIO_WORKFLOW_MANIFEST_VERSION;
  resources: ProjectAudioManifestResource[];
  background: BackgroundAudioState;
  cues: AudioCueState[];
}

export interface AudioWorkflowEvidenceInput {
  supportedFormats: readonly string[];
  state: ProjectAudioState;
  savedProjectArtifact?: string;
  reloaded?: boolean;
}

export class ProjectAudioError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProjectAudioError";
  }
}

export function createEmptyProjectAudioState(): ProjectAudioState {
  return {
    assets: [],
    backgroundMusic: null,
    cues: [],
    nextAssetNumber: 1,
  };
}

export function createDefaultProjectAudioState(): ProjectAudioWorkflowState {
  return {
    manifestVersion: AUDIO_WORKFLOW_MANIFEST_VERSION,
    resources: [],
    background: {
      resourceId: null,
      enabled: false,
      loop: false,
      volume: 1,
      pan: 0,
    },
    cues: [],
    activeCueIds: [],
  };
}

export function addProjectAudioResource(
  state: ProjectAudioWorkflowState,
  resource: ProjectAudioResource,
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  const nextResource = validateProjectAudioResource(resource);
  if (current.resources.some((existing) => existing.id === nextResource.id)) {
    throw new ProjectAudioError(`audio resource already exists: ${nextResource.id}`);
  }
  return validateProjectAudioState({
    ...current,
    resources: [...current.resources, nextResource],
  });
}

export function setBackgroundAudio(
  state: ProjectAudioWorkflowState,
  background: Partial<BackgroundAudioState> & { resourceId: string | null },
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  if (background.resourceId !== null) {
    assertKnownWorkflowResource(current, background.resourceId);
  }
  return validateProjectAudioState({
    ...current,
    background: {
      resourceId: background.resourceId,
      enabled: background.enabled ?? (background.resourceId !== null),
      loop: background.loop ?? current.background.loop,
      volume: background.volume ?? current.background.volume,
      pan: background.pan ?? current.background.pan,
    },
  });
}

export function upsertAudioCue(
  state: ProjectAudioWorkflowState,
  cue: AudioCueState,
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  const nextCue = validateAudioCue(cue, current);
  const cues = current.cues.filter((existing) => existing.id !== nextCue.id);
  return validateProjectAudioState({
    ...current,
    cues: [...cues, nextCue],
  });
}

export function removeAudioCue(
  state: ProjectAudioWorkflowState,
  cueId: string,
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  const id = normalizeNonEmptyString(cueId, "cue id");
  if (!current.cues.some((cue) => cue.id === id)) {
    throw new ProjectAudioError(`audio cue not found: ${id}`);
  }
  return validateProjectAudioState({
    ...current,
    cues: current.cues.filter((cue) => cue.id !== id),
    activeCueIds: current.activeCueIds.filter((activeId) => activeId !== id),
  });
}

export function startAudioCue(
  state: ProjectAudioWorkflowState,
  cueId: string,
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  const id = normalizeNonEmptyString(cueId, "cue id");
  assertKnownWorkflowCue(current, id);
  return validateProjectAudioState({
    ...current,
    activeCueIds: current.activeCueIds.includes(id)
      ? current.activeCueIds
      : [...current.activeCueIds, id],
  });
}

export function stopAudioCue(
  state: ProjectAudioWorkflowState,
  cueId: string,
): ProjectAudioWorkflowState {
  const current = validateProjectAudioState(state);
  const id = normalizeNonEmptyString(cueId, "cue id");
  assertKnownWorkflowCue(current, id);
  return validateProjectAudioState({
    ...current,
    activeCueIds: current.activeCueIds.filter((activeId) => activeId !== id),
  });
}

export function validateProjectAudioState(state: ProjectAudioWorkflowState): ProjectAudioWorkflowState {
  if (!isRecord(state)) {
    throw new ProjectAudioError("project audio state must be an object");
  }
  if (state.manifestVersion !== AUDIO_WORKFLOW_MANIFEST_VERSION) {
    throw new ProjectAudioError(`project audio manifestVersion must be ${AUDIO_WORKFLOW_MANIFEST_VERSION}`);
  }
  if (!Array.isArray(state.resources)) {
    throw new ProjectAudioError("project audio resources must be an array");
  }
  if (!Array.isArray(state.cues)) {
    throw new ProjectAudioError("project audio cues must be an array");
  }
  if (!Array.isArray(state.activeCueIds)) {
    throw new ProjectAudioError("project audio activeCueIds must be an array");
  }

  const resources = state.resources.map(validateProjectAudioResource);
  const resourceIds = new Set<string>();
  for (const resource of resources) {
    if (resourceIds.has(resource.id)) {
      throw new ProjectAudioError(`duplicate audio resource id: ${resource.id}`);
    }
    resourceIds.add(resource.id);
  }

  const background = validateBackgroundAudio(state.background, resources);
  const cues = state.cues.map((cue) => validateAudioCue(cue, {
    ...createDefaultProjectAudioState(),
    resources,
  }));
  const cueIds = new Set<string>();
  for (const cue of cues) {
    if (cueIds.has(cue.id)) {
      throw new ProjectAudioError(`duplicate audio cue id: ${cue.id}`);
    }
    cueIds.add(cue.id);
  }

  const activeCueIds = state.activeCueIds.map((id) => normalizeNonEmptyString(id, "active cue id"));
  for (const id of activeCueIds) {
    if (!cueIds.has(id)) {
      throw new ProjectAudioError(`active audio cue not found: ${id}`);
    }
  }

  return {
    manifestVersion: AUDIO_WORKFLOW_MANIFEST_VERSION,
    resources,
    background,
    cues,
    activeCueIds: [...new Set(activeCueIds)],
  };
}

export function serializeProjectAudioWorkflowManifest(
  state: ProjectAudioWorkflowState,
): ProjectAudioWorkflowManifest {
  const validated = validateProjectAudioState(state);
  return {
    schemaVersion: AUDIO_WORKFLOW_MANIFEST_VERSION,
    resources: validated.resources.map(({ decodeStatus: _decodeStatus, ...resource }) => resource),
    background: { ...validated.background },
    cues: validated.cues.map((cue) => ({ ...cue })),
  };
}

export function applyProjectAudioWorkflowManifest(
  manifest: unknown,
  resources: Map<string, Uint8Array>,
): ProjectAudioWorkflowState {
  if (!isRecord(manifest)) {
    throw new ProjectAudioError("aliceAudio manifest entry must be an object");
  }
  if (manifest.schemaVersion !== AUDIO_WORKFLOW_MANIFEST_VERSION) {
    throw new ProjectAudioError(`aliceAudio.schemaVersion must be ${AUDIO_WORKFLOW_MANIFEST_VERSION}`);
  }
  if (!Array.isArray(manifest.resources)) {
    throw new ProjectAudioError("aliceAudio.resources must be an array");
  }
  if (!isRecord(manifest.background)) {
    throw new ProjectAudioError("aliceAudio.background must be an object");
  }
  if (!Array.isArray(manifest.cues)) {
    throw new ProjectAudioError("aliceAudio.cues must be an array");
  }

  const state = validateProjectAudioState({
    manifestVersion: AUDIO_WORKFLOW_MANIFEST_VERSION,
    resources: manifest.resources.map((resource) => hydrateManifestResource(resource, resources)),
    background: readWorkflowManifestBackground(manifest.background),
    cues: manifest.cues as AudioCueState[],
    activeCueIds: [],
  });
  return state;
}

export function isSupportedAudioFormat(format: string): format is SupportedAudioFormat {
  return (SUPPORTED_AUDIO_FORMATS as readonly string[]).includes(format.toLowerCase());
}

export function getSupportedAudioFormats(): string[] {
  return [...SUPPORTED_AUDIO_EXTENSIONS];
}

export function registerAudioAsset(
  state: ProjectAudioState,
  input: {
    fileName: string;
    bytes: Uint8Array;
    durationSeconds?: number | null;
  },
): ProjectAudioAsset {
  const format = getSupportedFormatFromFileName(input.fileName);
  if (input.bytes.byteLength === 0) {
    throw new ProjectAudioError("audio asset bytes must not be empty");
  }
  const durationSeconds = normalizeOptionalDuration(input.durationSeconds);
  const id = nextAudioAssetId(state);
  const safeBaseName = sanitizeAudioFileBaseName(input.fileName);
  const asset: ProjectAudioAsset = {
    id,
    name: `${safeBaseName}.${format}`,
    format,
    resourcePath: `resources/audio/${id}.${format}`,
    sizeBytes: input.bytes.byteLength,
    durationSeconds,
  };
  state.assets.push(asset);
  return asset;
}

export function setBackgroundMusic(
  state: ProjectAudioState,
  input: { assetId: string; volume?: number; loop?: boolean },
): ProjectAudioBackgroundMusic {
  assertKnownAsset(state, input.assetId);
  const backgroundMusic: ProjectAudioBackgroundMusic = {
    assetId: input.assetId,
    volume: normalizeVolume(input.volume ?? 1, "volume"),
    loop: input.loop ?? true,
  };
  state.backgroundMusic = backgroundMusic;
  return backgroundMusic;
}

export function addAudioCue(
  state: ProjectAudioState,
  input: {
    id: string;
    assetId: string;
    animationId: string;
    timelineTimeSeconds: number;
    volume?: number;
  },
): ProjectAudioCue {
  assertKnownAsset(state, input.assetId);
  const id = input.id.trim();
  if (!id) {
    throw new ProjectAudioError("cue id must be a non-empty string");
  }
  if (state.cues.some((cue) => cue.id === id)) {
    throw new ProjectAudioError(`audio cue already exists: ${id}`);
  }
  const animationId = input.animationId.trim();
  if (!animationId) {
    throw new ProjectAudioError("animationId must be a non-empty string");
  }
  if (!Number.isFinite(input.timelineTimeSeconds) || input.timelineTimeSeconds < 0) {
    throw new ProjectAudioError("timelineTimeSeconds must be a finite number greater than or equal to 0");
  }
  const cue: ProjectAudioCue = {
    id,
    assetId: input.assetId,
    animationId,
    timelineTimeSeconds: input.timelineTimeSeconds,
    volume: normalizeVolume(input.volume ?? 1, "volume"),
  };
  state.cues.push(cue);
  return cue;
}

export function createProjectAudioPlaybackBridge(
  state: ProjectAudioState,
  options: ProjectAudioPlaybackBridgeOptions,
): ProjectAudioPlaybackBridge {
  const assetById = new Map(state.assets.map((asset) => [asset.id, asset]));
  const cueOutputs = new Set<ProjectAudioPlaybackOutput>();
  const triggeredThisPlaythrough = new Set<string>();
  const triggeredCueIds: string[] = [];
  const lastTimelineTimeByAnimation = new Map<string, number>();
  let backgroundOutput: ProjectAudioPlaybackOutput | null = null;

  function getAsset(assetId: string): ProjectAudioAsset {
    const asset = assetById.get(assetId);
    if (!asset) {
      throw new ProjectAudioError(`audio asset not found: ${assetId}`);
    }

    return asset;
  }

  function rememberTriggeredCue(cue: ProjectAudioCue): void {
    if (!triggeredCueIds.includes(cue.id)) {
      triggeredCueIds.push(cue.id);
    }
  }

  return {
    startBackgroundMusic(): void {
      const backgroundMusic = state.backgroundMusic;
      if (!backgroundMusic) {
        return;
      }
      backgroundOutput?.stop();
      const asset = getAsset(backgroundMusic.assetId);
      backgroundOutput = options.createOutput(asset, "background");
      backgroundOutput.play({
        volume: backgroundMusic.volume,
        loop: backgroundMusic.loop,
      });
    },

    updateAnimationPlayback(animationId: string, timeSeconds: number): void {
      const normalizedAnimationId = animationId.trim();
      if (!normalizedAnimationId) {
        throw new ProjectAudioError("animationId must be a non-empty string");
      }
      if (!Number.isFinite(timeSeconds) || timeSeconds < 0) {
        throw new ProjectAudioError("timeSeconds must be a finite number greater than or equal to 0");
      }

      const previousTime = lastTimelineTimeByAnimation.get(normalizedAnimationId);
      const fromTime = previousTime ?? Number.NEGATIVE_INFINITY;
      lastTimelineTimeByAnimation.set(normalizedAnimationId, timeSeconds);

      const cues = state.cues
        .filter((cue) => cue.animationId === normalizedAnimationId)
        .filter((cue) => cue.timelineTimeSeconds > fromTime && cue.timelineTimeSeconds <= timeSeconds)
        .sort((a, b) => a.timelineTimeSeconds - b.timelineTimeSeconds);

      for (const cue of cues) {
        const triggerKey = `${cue.animationId}\u0000${cue.id}`;
        if (triggeredThisPlaythrough.has(triggerKey)) {
          continue;
        }
        triggeredThisPlaythrough.add(triggerKey);
        rememberTriggeredCue(cue);

        const output = options.createOutput(getAsset(cue.assetId), "cue");
        cueOutputs.add(output);
        output.play({
          volume: cue.volume,
          loop: false,
          cueId: cue.id,
          animationId: cue.animationId,
          timelineTimeSeconds: cue.timelineTimeSeconds,
        });
      }
    },

    resetAnimationPlayback(animationId: string): void {
      const normalizedAnimationId = animationId.trim();
      if (!normalizedAnimationId) {
        throw new ProjectAudioError("animationId must be a non-empty string");
      }
      lastTimelineTimeByAnimation.delete(normalizedAnimationId);
      for (const cue of state.cues) {
        if (cue.animationId === normalizedAnimationId) {
          triggeredThisPlaythrough.delete(`${cue.animationId}\u0000${cue.id}`);
        }
      }
    },

    stopAll(): void {
      backgroundOutput?.stop();
      backgroundOutput = null;
      for (const output of cueOutputs) {
        output.stop();
      }
      cueOutputs.clear();
    },

    getTriggeredCueIds(): string[] {
      return [...triggeredCueIds];
    },
  };
}

export function createWebAudioProjectOutputFactory(
  options: ProjectAudioWebAudioOutputFactoryOptions,
): ProjectAudioPlaybackBridgeOptions["createOutput"] {
  return (asset) => {
    const resource = options.resources.get(asset.id) ?? options.resources.get(asset.resourcePath);
    if (!resource) {
      throw new ProjectAudioError(`decoded audio resource not found for asset: ${asset.id}`);
    }
    const player = new WebAudioPlayer({
      audioContext: options.audioContext,
      runtimeMode: options.runtimeMode ?? "web-audio",
    });
    player.load(resource);
    return {
      play(playOptions): void {
        player.setVolume(playOptions.volume);
        player.play({ loop: playOptions.loop });
      },
      stop(): void {
        player.stop();
      },
    };
  };
}

export function serializeAudioManifest(state: ProjectAudioState): Record<string, unknown> {
  return {
    version: 1,
    assets: state.assets.map((asset) => ({ ...asset })),
    backgroundMusic: state.backgroundMusic ? { ...state.backgroundMusic } : null,
    cues: state.cues.map((cue) => ({ ...cue })),
  };
}

export function applyAudioManifest(
  manifest: Record<string, unknown> | null,
): ProjectAudioState {
  if (!manifest || manifest[AUDIO_MANIFEST_KEY] === undefined) {
    return createEmptyProjectAudioState();
  }
  const audio = manifest[AUDIO_MANIFEST_KEY];
  if (!isRecord(audio)) {
    throw new ProjectAudioError("aliceAudio manifest entry must be an object");
  }
  if (audio.schemaVersion === AUDIO_WORKFLOW_MANIFEST_VERSION && Array.isArray(audio.resources)) {
    return legacyStateFromWorkflowManifest(audio);
  }

  const rawAssets = audio.assets;
  const rawCues = audio.cues;
  if (!Array.isArray(rawAssets)) {
    throw new ProjectAudioError("aliceAudio.assets must be an array");
  }
  if (!Array.isArray(rawCues)) {
    throw new ProjectAudioError("aliceAudio.cues must be an array");
  }

  const state = createEmptyProjectAudioState();
  state.assets = rawAssets.map(readAudioAsset);
  const highestAssetNumber = state.assets.reduce((highest, asset) => {
    const match = /^audio-(\d+)$/.exec(asset.id);
    return match ? Math.max(highest, Number.parseInt(match[1], 10)) : highest;
  }, 0);
  state.nextAssetNumber = highestAssetNumber + 1;

  if (audio.backgroundMusic !== undefined && audio.backgroundMusic !== null) {
    if (!isRecord(audio.backgroundMusic)) {
      throw new ProjectAudioError("aliceAudio.backgroundMusic must be an object or null");
    }
    state.backgroundMusic = readBackgroundMusic(audio.backgroundMusic, state);
  }
  state.cues = rawCues.map((cue) => {
    if (!isRecord(cue)) {
      throw new ProjectAudioError("aliceAudio.cues entries must be objects");
    }
    return readCue(cue, state);
  });

  return state;
}

export function mergeAudioManifest(
  manifest: Record<string, unknown> | null,
  state: ProjectAudioState,
): Record<string, unknown> {
  return {
    ...(manifest ?? {}),
    [AUDIO_MANIFEST_KEY]: serializeAudioManifest(state),
  };
}

function getSupportedFormatFromFileName(fileName: string): SupportedAudioFormat {
  const dotIndex = fileName.lastIndexOf(".");
  const format = dotIndex === -1 ? "" : fileName.slice(dotIndex + 1).toLowerCase();
  if (!isSupportedAudioFormat(format)) {
    throw new ProjectAudioError(
      `unsupported audio format: ${format || "unknown"}. Supported formats: ${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}`,
    );
  }
  return format;
}

function sanitizeAudioFileBaseName(fileName: string): string {
  const baseName = fileName
    .split(/[\\/]/)
    .pop()
    ?.replace(/\.[^.]*$/, "")
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .replace(/\.\./g, "_")
    .replace(/^[-_.]+|[-_.]+$/g, "");
  return baseName || "audio";
}

function nextAudioAssetId(state: ProjectAudioState): string {
  while (true) {
    const id = `audio-${state.nextAssetNumber}`;
    state.nextAssetNumber += 1;
    if (!state.assets.some((asset) => asset.id === id)) {
      return id;
    }
  }
}

function normalizeOptionalDuration(value: number | null | undefined): number | null {
  if (value === undefined || value === null) {
    return null;
  }
  if (!Number.isFinite(value) || value < 0) {
    throw new ProjectAudioError("durationSeconds must be a finite number greater than or equal to 0");
  }
  return value;
}

function normalizeVolume(value: number, label: string): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new ProjectAudioError(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function assertKnownAsset(state: ProjectAudioState, assetId: string): void {
  if (!state.assets.some((asset) => asset.id === assetId)) {
    throw new ProjectAudioError(`audio asset not found: ${assetId}`);
  }
}

function assertKnownWorkflowResource(state: ProjectAudioWorkflowState, resourceId: string): void {
  if (!state.resources.some((resource) => resource.id === resourceId)) {
    throw new ProjectAudioError(`audio resource not found: ${resourceId}`);
  }
}

function assertKnownWorkflowCue(state: ProjectAudioWorkflowState, cueId: string): void {
  if (!state.cues.some((cue) => cue.id === cueId)) {
    throw new ProjectAudioError(`audio cue not found: ${cueId}`);
  }
}

function validateProjectAudioResource(resource: ProjectAudioResource): ProjectAudioResource {
  if (!isRecord(resource)) {
    throw new ProjectAudioError("audio resource must be an object");
  }
  const id = normalizeNonEmptyString(resource.id, "audio resource id");
  const name = normalizeNonEmptyString(resource.name, "audio resource name");
  const resourcePath = normalizeNonEmptyString(resource.path, "audio resource path");
  assertSafeAudioResourcePath(resourcePath);
  const format = normalizeAudioFormat(resource.format);
  const pathFormat = getSupportedFormatFromResourcePath(resourcePath);
  if (format !== pathFormat) {
    throw new ProjectAudioError(`audio resource path extension must match format '${format}': ${resourcePath}`);
  }
  const decodeStatus = resource.decodeStatus;
  if (!["decoded", "decode-unavailable", "decode-failed"].includes(decodeStatus)) {
    throw new ProjectAudioError("audio resource decodeStatus is invalid");
  }
  return {
    id,
    name,
    path: resourcePath,
    format,
    sizeBytes: normalizeNonNegativeNumber(resource.sizeBytes, "audio resource sizeBytes"),
    duration: normalizeNonNegativeNumber(resource.duration, "audio resource duration"),
    decodeStatus,
  };
}

function validateBackgroundAudio(
  background: BackgroundAudioState,
  resources: ProjectAudioResource[],
): BackgroundAudioState {
  if (!isRecord(background)) {
    throw new ProjectAudioError("audio background must be an object");
  }
  const resourceId = background.resourceId === null
    ? null
    : normalizeNonEmptyString(background.resourceId, "background resourceId");
  if (resourceId && !resources.some((resource) => resource.id === resourceId)) {
    throw new ProjectAudioError(`audio resource not found: ${resourceId}`);
  }
  return {
    resourceId,
    enabled: readBoolean(background.enabled, "background enabled"),
    loop: readBoolean(background.loop, "background loop"),
    volume: normalizeUnitNumber(background.volume, "background volume"),
    pan: normalizePan(background.pan, "background pan"),
  };
}

function validateAudioCue(
  cue: AudioCueState,
  state: Pick<ProjectAudioWorkflowState, "resources">,
): AudioCueState {
  if (!isRecord(cue)) {
    throw new ProjectAudioError("audio cue must be an object");
  }
  const resourceId = normalizeNonEmptyString(cue.resourceId, "cue resourceId");
  if (!state.resources.some((resource) => resource.id === resourceId)) {
    throw new ProjectAudioError(`audio resource not found: ${resourceId}`);
  }
  const trigger = cue.trigger;
  if (!["sceneActivated", "manual", "worldRun"].includes(trigger)) {
    throw new ProjectAudioError("audio cue trigger is invalid");
  }
  return {
    id: normalizeNonEmptyString(cue.id, "cue id"),
    name: normalizeNonEmptyString(cue.name, "cue name"),
    resourceId,
    trigger,
    loop: readBoolean(cue.loop, "cue loop"),
    volume: normalizeUnitNumber(cue.volume, "cue volume"),
    pan: normalizePan(cue.pan, "cue pan"),
  };
}

function hydrateManifestResource(
  resource: unknown,
  resources: Map<string, Uint8Array>,
): ProjectAudioResource {
  if (!isRecord(resource)) {
    throw new ProjectAudioError("aliceAudio.resources entries must be objects");
  }
  const path = readRequiredString(resource, "path");
  const bytes = resources.get(path);
  if (!bytes) {
    throw new ProjectAudioError(`missing audio resource bytes for ${path}`);
  }
  return validateProjectAudioResource({
    id: readRequiredString(resource, "id"),
    name: readRequiredString(resource, "name"),
    path,
    format: readRequiredString(resource, "format") as SupportedAudioFormat,
    sizeBytes: readRequiredNumber(resource, "sizeBytes"),
    duration: readRequiredNumber(resource, "duration"),
    decodeStatus: "decode-unavailable",
  });
}

function readWorkflowManifestBackground(background: Record<string, unknown>): BackgroundAudioState {
  const resourceId = background.resourceId === null
    ? null
    : normalizeNonEmptyString(background.resourceId, "aliceAudio.background.resourceId");
  const enabled = background.enabled;
  const loop = background.loop;
  if (typeof enabled !== "boolean") {
    throw new ProjectAudioError("aliceAudio.background.enabled must be a boolean");
  }
  if (typeof loop !== "boolean") {
    throw new ProjectAudioError("aliceAudio.background.loop must be a boolean");
  }
  return {
    resourceId,
    enabled,
    loop,
    volume: normalizeUnitNumber(background.volume, "aliceAudio.background.volume"),
    pan: normalizePan(background.pan, "aliceAudio.background.pan"),
  };
}

function legacyStateFromWorkflowManifest(audio: Record<string, unknown>): ProjectAudioState {
  const state = createEmptyProjectAudioState();
  const resources = Array.isArray(audio.resources) ? audio.resources : [];
  for (const resource of resources) {
    if (!isRecord(resource)) {
      throw new ProjectAudioError("aliceAudio.resources entries must be objects");
    }
    const format = normalizeAudioFormat(readRequiredString(resource, "format"));
    const asset: ProjectAudioAsset = {
      id: readRequiredString(resource, "id"),
      name: readRequiredString(resource, "name"),
      format,
      resourcePath: readRequiredString(resource, "path"),
      sizeBytes: readRequiredNumber(resource, "sizeBytes"),
      durationSeconds: readRequiredNumber(resource, "duration"),
    };
    state.assets.push(asset);
  }
  return state;
}

function normalizeNonEmptyString(value: unknown, label: string): string {
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`${label} must be a non-empty string`);
  }
  return value.trim();
}

function normalizeAudioFormat(value: unknown): SupportedAudioFormat {
  const format = normalizeNonEmptyString(value, "audio format").toLowerCase();
  if (!isSupportedAudioFormat(format)) {
    throw new ProjectAudioError(`unsupported audio format: ${format}`);
  }
  return format;
}

function normalizeNonNegativeNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) {
    throw new ProjectAudioError(`${label} must be a finite number greater than or equal to 0`);
  }
  return value;
}

function normalizeUnitNumber(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0 || value > 1) {
    throw new ProjectAudioError(`${label} must be a finite number between 0 and 1`);
  }
  return value;
}

function normalizePan(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < -1 || value > 1) {
    throw new ProjectAudioError(`${label} must be a finite number between -1 and 1`);
  }
  return value;
}

function readBoolean(value: unknown, label: string): boolean {
  if (typeof value !== "boolean") {
    throw new ProjectAudioError(`${label} must be a boolean`);
  }
  return value;
}

function assertSafeAudioResourcePath(resourcePath: string): void {
  if (
    resourcePath.startsWith("/") ||
    resourcePath.includes("\\") ||
    resourcePath.split("/").includes("..") ||
    !resourcePath.startsWith("resources/audio/")
  ) {
    throw new ProjectAudioError(`audio resource path must stay under resources/audio: ${resourcePath}`);
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function readRequiredString(record: Record<string, unknown>, field: string): string {
  const value = record[field];
  if (typeof value !== "string" || !value.trim()) {
    throw new ProjectAudioError(`aliceAudio.${field} must be a non-empty string`);
  }
  return value.trim();
}

function readRequiredNumber(record: Record<string, unknown>, field: string): number {
  const value = record[field];
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new ProjectAudioError(`aliceAudio.${field} must be a finite number`);
  }
  return value;
}

function readAudioAsset(value: unknown): ProjectAudioAsset {
  if (!isRecord(value)) {
    throw new ProjectAudioError("aliceAudio.assets entries must be objects");
  }
  const format = readRequiredString(value, "format").toLowerCase();
  if (!isSupportedAudioFormat(format)) {
    throw new ProjectAudioError(`aliceAudio asset has unsupported format: ${format}`);
  }
  const resourcePath = readRequiredString(value, "resourcePath");
  const resourcePathFormat = getSupportedFormatFromResourcePath(resourcePath);
  if (resourcePathFormat !== format) {
    throw new ProjectAudioError(
      `aliceAudio.resourcePath extension must match asset format '${format}': ${resourcePath}`,
    );
  }
  const durationValue = value.durationSeconds;
  const durationSeconds = durationValue === null || durationValue === undefined
    ? null
    : readRequiredNumber(value, "durationSeconds");
  return {
    id: readRequiredString(value, "id"),
    name: readRequiredString(value, "name"),
    format,
    resourcePath,
    sizeBytes: readRequiredNumber(value, "sizeBytes"),
    durationSeconds,
  };
}

function getSupportedFormatFromResourcePath(resourcePath: string): SupportedAudioFormat {
  const dotIndex = resourcePath.lastIndexOf(".");
  const format = dotIndex === -1 ? "" : resourcePath.slice(dotIndex + 1).toLowerCase();
  if (!isSupportedAudioFormat(format)) {
    throw new ProjectAudioError(
      `aliceAudio.resourcePath must reference a supported audio file (${SUPPORTED_AUDIO_EXTENSIONS.join(", ")}): ${resourcePath}`,
    );
  }
  return format;
}

function readBackgroundMusic(
  value: Record<string, unknown>,
  state: ProjectAudioState,
): ProjectAudioBackgroundMusic {
  const assetId = readRequiredString(value, "assetId");
  assertKnownAsset(state, assetId);
  const volume = readRequiredNumber(value, "volume");
  const loop = value.loop;
  if (typeof loop !== "boolean") {
    throw new ProjectAudioError("aliceAudio.backgroundMusic.loop must be a boolean");
  }
  return {
    assetId,
    volume: normalizeVolume(volume, "backgroundMusic.volume"),
    loop,
  };
}

function readCue(value: Record<string, unknown>, state: ProjectAudioState): ProjectAudioCue {
  const assetId = readRequiredString(value, "assetId");
  assertKnownAsset(state, assetId);
  const timelineTimeSeconds = readRequiredNumber(value, "timelineTimeSeconds");
  if (timelineTimeSeconds < 0) {
    throw new ProjectAudioError("aliceAudio cue timelineTimeSeconds must be greater than or equal to 0");
  }
  return {
    id: readRequiredString(value, "id"),
    assetId,
    animationId: readRequiredString(value, "animationId"),
    timelineTimeSeconds,
    volume: normalizeVolume(readRequiredNumber(value, "volume"), "cue.volume"),
  };
}
