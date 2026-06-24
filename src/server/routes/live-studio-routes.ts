import type { Express, Request, Response } from "express";
import { buildCurrentProject } from "../state.js";
import type { ServerContext } from "../context.js";
import type { LiveParticipantRole } from "../../live-studio.js";

const ROLES = new Set<LiveParticipantRole>(["facilitator", "participant", "observer"]);

export function registerLiveStudioRoutes(app: Express, context: ServerContext): void {
  app.post("/api/workshops/live-studio/start", (req, res) => {
    const body = objectBody(req, res);
    if (!body) return;
    res.json(context.liveWorkshopStudio.start({
      project: buildCurrentProject(context.state),
      title: stringField(body.title),
      facilitatorName: stringField(body.facilitatorName),
      participantNames: stringArrayField(body.participantNames),
    }));
  });

  app.get("/api/workshops/live-studio/current", (_req, res) => {
    const session = context.liveWorkshopStudio.current();
    if (!session) {
      res.status(404).json({ error: "No live workshop studio session is active" });
      return;
    }
    res.json(session);
  });

  app.get("/api/workshops/live-studio/:id", (req, res) => {
    const session = context.liveWorkshopStudio.get(req.params.id);
    if (!session) {
      res.status(404).json({ error: "Live workshop studio session not found" });
      return;
    }
    res.json(session);
  });

  app.post("/api/workshops/live-studio/:id/participants", (req, res) => {
    const body = objectBody(req, res);
    if (!body) return;
    const displayName = stringField(body.displayName);
    if (!displayName) {
      res.status(400).json({ error: "displayName is required" });
      return;
    }
    const role = roleField(body.role);
    if (body.role !== undefined && !role) {
      res.status(400).json({ error: "role must be facilitator, participant, or observer" });
      return;
    }
    const session = context.liveWorkshopStudio.addParticipant(req.params.id, { displayName, ...(role ? { role } : {}) });
    if (!session) {
      res.status(404).json({ error: "Live workshop studio session not found" });
      return;
    }
    res.json(session);
  });

  app.post("/api/workshops/live-studio/:id/handoff", (req, res) => {
    const body = objectBody(req, res);
    if (!body) return;
    const session = context.liveWorkshopStudio.createHandoff(req.params.id, {
      summary: stringField(body.summary),
      nextFacilitator: stringField(body.nextFacilitator),
      checklist: stringArrayField(body.checklist),
    });
    if (!session) {
      res.status(404).json({ error: "Live workshop studio session not found" });
      return;
    }
    res.json(session);
  });
}

function objectBody(req: Request, res: Response): Record<string, unknown> | null {
  if (req.body === null || typeof req.body !== "object" || Array.isArray(req.body)) {
    res.status(400).json({ error: "request body must be a JSON object" });
    return null;
  }
  return req.body as Record<string, unknown>;
}

function stringField(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function stringArrayField(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter((item): item is string => typeof item === "string" && item.trim().length > 0).map((item) => item.trim());
}

function roleField(value: unknown): LiveParticipantRole | undefined {
  return typeof value === "string" && ROLES.has(value as LiveParticipantRole) ? value as LiveParticipantRole : undefined;
}
