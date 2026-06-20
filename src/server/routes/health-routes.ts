import type { Express } from "express";
import type { ServerContext } from "../context.js";

export function registerHealthRoutes(app: Express, context: ServerContext): void {
  app.get("/api/health", (_req, res) => {
    res.json({
      status: "running",
      launched: context.state.launched,
      pid: process.pid,
      uptime: process.uptime(),
      runtime: "lookingglass-typescript-web",
    });
  });
}
