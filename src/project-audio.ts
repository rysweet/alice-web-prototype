export const SUPPORTED_AUDIO_FORMATS = ["mp3", "wav", "ogg", "m4a"] as const;
export const SUPPORTED_AUDIO_EXTENSIONS = SUPPORTED_AUDIO_FORMATS.map((format) => `.${format}`);
export const AUDIO_MANIFEST_KEY = "aliceAudio";

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

export interface ProjectAudioState {
  assets: ProjectAudioAsset[];
  backgroundMusic: ProjectAudioBackgroundMusic | null;
  cues: ProjectAudioCue[];
  nextAssetNumber: number;
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
