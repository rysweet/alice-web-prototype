import express from "express";
import { createServerContext, type ServerOptions } from "./server/context.js";
import { registerCodeRoutes } from "./server/routes/code-routes.js";
import { registerEventRoutes } from "./server/routes/event-routes.js";
import { registerHealthRoutes } from "./server/routes/health-routes.js";
import { registerLaunchRoutes } from "./server/routes/launch-routes.js";
import { registerProjectRoutes } from "./server/routes/project-routes.js";
import { registerSceneRoutes } from "./server/routes/scene-routes.js";
import { registerScreenshotRoutes } from "./server/routes/screenshot-routes.js";
import { registerWorldRoutes } from "./server/routes/world-routes.js";

export type { ServerOptions } from "./server/context.js";
export { validateProjectPath } from "./server/validation.js";

type HttpError = Error & {
  status?: number;
  statusCode?: number;
};

function requestHasBody(req: express.Request): boolean {
  const contentLength = req.header("content-length");
  return (
    (contentLength !== undefined && contentLength !== "0") ||
    req.header("transfer-encoding") !== undefined
  );
}

export function createServer(options: ServerOptions): express.Express {
  const app = express();
  app.use(express.json({ limit: "1mb" }));
  app.use((req, res, next) => {
    if (requestHasBody(req) && req.body === undefined) {
      res.status(400).json({ error: "request body must be JSON" });
      return;
    }
    next();
  });

  const context = createServerContext(options);

  registerLaunchRoutes(app, context);
  registerHealthRoutes(app, context);
  registerSceneRoutes(app, context);
  registerCodeRoutes(app, context);
  registerProjectRoutes(app, context);
  registerWorldRoutes(app, context);
  registerScreenshotRoutes(app, context);
  registerEventRoutes(app, context);

  // Global error handler — suppress stack traces in responses
  app.use((err: HttpError, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    const status = err.status ?? err.statusCode;
    if (status !== undefined && status >= 400 && status < 500) {
      res.status(status).json({ error: err.message || "Bad request" });
      return;
    }

    console.error("Unhandled error:", err);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
