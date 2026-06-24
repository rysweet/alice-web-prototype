import type { Express, Request, Response } from "express";
import type { ServerContext } from "../context.js";
import { InvalidWebPackageError, WebPackageInputError, type TeacherShareMetadata } from "../../project-export.js";

export function registerCommunityRoutes(app: Express, context: ServerContext): void {
  app.get("/api/community/shares", (_req, res) => {
    res.json({
      schema_version: "alice-web.community-index/v1",
      platform: "alice-web-local-community",
      storage: "server-memory",
      shares: context.communityPlatform.list(),
    });
  });

  app.get("/api/community/shares/:id", (req, res) => {
    const record = context.communityPlatform.get(req.params.id);
    if (!record) {
      res.status(404).json({ error: "Community share not found" });
      return;
    }
    res.json(record);
  });

  app.post("/api/community/shares", async (req, res, next) => {
    const body = objectBody(req, res);
    if (!body) return;
    const packageBase64 = stringField(body.packageBase64);
    if (!packageBase64) {
      res.status(400).json({ error: "packageBase64 is required" });
      return;
    }

    try {
      const shareArtifacts = await context.projectService.generateShareArtifacts({
        packageBase64,
        title: stringField(body.title),
        description: stringField(body.description),
        canonicalUrl: stringField(body.canonicalUrl),
        teacher: teacherField(body.teacher),
      });
      res.status(201).json(context.communityPlatform.publish(shareArtifacts));
    } catch (error) {
      if (error instanceof WebPackageInputError) {
        res.status(400).json({ error: error.message });
        return;
      }
      if (error instanceof InvalidWebPackageError) {
        res.status(400).json(error.validation);
        return;
      }
      next(error);
    }
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

function teacherField(value: unknown): TeacherShareMetadata | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as TeacherShareMetadata
    : undefined;
}
