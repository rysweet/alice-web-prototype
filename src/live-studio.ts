import type { AliceProject } from "./a3p-parser";

export const LIVE_WORKSHOP_STUDIO_SCHEMA_VERSION = "alice.live-workshop-studio/v1" as const;

export type LiveWorkshopStage = "setup" | "live" | "handoff";
export type LiveParticipantRole = "facilitator" | "participant" | "observer";

export interface LiveStudioParticipant {
  readonly id: string;
  readonly displayName: string;
  readonly role: LiveParticipantRole;
  readonly status: "ready" | "active" | "handoff-ready";
  readonly joinedAt: string;
}

export interface LiveWorkshopHandoff {
  readonly createdAt: string;
  readonly fromRevision: number;
  readonly summary: string;
  readonly nextFacilitator?: string;
  readonly checklist: readonly string[];
}

export interface LiveWorkshopStudioSession {
  readonly schema_version: typeof LIVE_WORKSHOP_STUDIO_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly projectName: string;
  readonly stage: LiveWorkshopStage;
  readonly facilitator: LiveStudioParticipant;
  readonly participants: readonly LiveStudioParticipant[];
  readonly sync: {
    readonly mode: "server-authoritative-snapshot";
    readonly revision: number;
    readonly updatedAt: string;
  };
  readonly orchestration: {
    readonly participantCount: number;
    readonly participantRoles: readonly LiveParticipantRole[];
  };
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly handoff?: LiveWorkshopHandoff;
}

interface MutableLiveWorkshopStudioSession {
  schema_version: typeof LIVE_WORKSHOP_STUDIO_SCHEMA_VERSION;
  id: string;
  title: string;
  projectName: string;
  stage: LiveWorkshopStage;
  facilitator: LiveStudioParticipant;
  participants: LiveStudioParticipant[];
  sync: {
    mode: "server-authoritative-snapshot";
    revision: number;
    updatedAt: string;
  };
  orchestration: {
    participantCount: number;
    participantRoles: LiveParticipantRole[];
  };
  createdAt: string;
  updatedAt: string;
  handoff?: LiveWorkshopHandoff;
}

export class LiveWorkshopStudioStore {
  private sessions = new Map<string, MutableLiveWorkshopStudioSession>();
  private currentSessionId: string | null = null;
  private nextSequence = 1;

  start(input: {
    readonly project: AliceProject;
    readonly title?: string;
    readonly facilitatorName?: string;
    readonly participantNames?: readonly string[];
  }): LiveWorkshopStudioSession {
    const now = new Date().toISOString();
    const facilitator = participant("facilitator", input.facilitatorName || "Facilitator", "facilitator", now);
    const participants = [
      facilitator,
      ...(input.participantNames ?? []).map((name, index) => participant(`participant-${index + 1}`, name, "participant", now)),
    ];
    const id = this.nextSessionId(input.project.projectName, now);
    const session: MutableLiveWorkshopStudioSession = {
      schema_version: LIVE_WORKSHOP_STUDIO_SCHEMA_VERSION,
      id,
      title: cleanText(input.title) || `${input.project.projectName || "Alice project"} live studio`,
      projectName: input.project.projectName || "Alice project",
      stage: "live",
      facilitator,
      participants,
      sync: {
        mode: "server-authoritative-snapshot",
        revision: 1,
        updatedAt: now,
      },
      orchestration: orchestrationFor(participants),
      createdAt: now,
      updatedAt: now,
    };
    this.sessions.set(session.id, session);
    this.currentSessionId = session.id;
    return cloneSession(session);
  }

  current(): LiveWorkshopStudioSession | null {
    if (!this.currentSessionId) return null;
    const session = this.sessions.get(this.currentSessionId);
    return session ? cloneSession(session) : null;
  }

  get(id: string): LiveWorkshopStudioSession | null {
    const session = this.sessions.get(id);
    return session ? cloneSession(session) : null;
  }

  addParticipant(id: string, input: { readonly displayName: string; readonly role?: LiveParticipantRole }): LiveWorkshopStudioSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const now = new Date().toISOString();
    session.participants.push(participant(`participant-${session.participants.length + 1}`, input.displayName, input.role ?? "participant", now));
    touch(session, now);
    return cloneSession(session);
  }

  createHandoff(id: string, input: {
    readonly summary?: string;
    readonly nextFacilitator?: string;
    readonly checklist?: readonly string[];
  }): LiveWorkshopStudioSession | null {
    const session = this.sessions.get(id);
    if (!session) return null;
    const now = new Date().toISOString();
    session.stage = "handoff";
    session.participants = session.participants.map((item) => ({ ...item, status: "handoff-ready" }));
    session.facilitator = { ...session.facilitator, status: "handoff-ready" };
    session.handoff = {
      createdAt: now,
      fromRevision: session.sync.revision,
      summary: cleanText(input.summary) || `${session.title} is ready for the next facilitator.`,
      ...(cleanText(input.nextFacilitator) ? { nextFacilitator: cleanText(input.nextFacilitator) } : {}),
      checklist: normalizeChecklist(input.checklist),
    };
    touch(session, now);
    return cloneSession(session);
  }

  private nextSessionId(projectName: string | undefined, timestamp: string): string {
    let id = sessionId(projectName, timestamp, this.nextSequence++);
    while (this.sessions.has(id)) {
      id = sessionId(projectName, timestamp, this.nextSequence++);
    }
    return id;
  }
}

export function createLiveStudioEvidence(session: LiveWorkshopStudioSession | null) {
  return {
    supported: true,
    synchronizationSupported: true,
    participantOrchestrationSupported: true,
    handoffSupported: true,
    activeSessionId: session?.id ?? null,
    stage: session?.stage ?? "setup",
    participantCount: session?.participants.length ?? 0,
    syncRevision: session?.sync.revision ?? 0,
    handoffReady: session?.handoff !== undefined,
  } as const;
}

function participant(id: string, displayName: string, role: LiveParticipantRole, joinedAt: string): LiveStudioParticipant {
  return {
    id,
    displayName: cleanText(displayName) || role,
    role,
    status: role === "facilitator" ? "active" : "ready",
    joinedAt,
  };
}

function touch(session: MutableLiveWorkshopStudioSession, now: string): void {
  session.updatedAt = now;
  session.sync = {
    ...session.sync,
    revision: session.sync.revision + 1,
    updatedAt: now,
  };
  session.orchestration = orchestrationFor(session.participants);
}

function orchestrationFor(participants: readonly LiveStudioParticipant[]) {
  return {
    participantCount: participants.length,
    participantRoles: Array.from(new Set(participants.map((item) => item.role))),
  };
}

function normalizeChecklist(items: readonly string[] | undefined): readonly string[] {
  const values = (items ?? [])
    .map(cleanText)
    .filter((item) => item.length > 0)
    .slice(0, 12);
  return values.length > 0 ? values : [
    "Confirm project opens in Alice web.",
    "Review participant questions and blockers.",
    "Hand off remix notes to the next classroom facilitator.",
  ];
}

function sessionId(projectName: string | undefined, timestamp: string, sequence: number): string {
  const stem = cleanText(projectName).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "alice-workshop";
  return `${stem}-${Date.parse(timestamp).toString(36)}-${sequence.toString(36)}`;
}

function cloneSession(session: MutableLiveWorkshopStudioSession): LiveWorkshopStudioSession {
  return JSON.parse(JSON.stringify(session)) as LiveWorkshopStudioSession;
}

function cleanText(value: unknown): string {
  return typeof value === "string" ? value.trim().slice(0, 500) : "";
}
