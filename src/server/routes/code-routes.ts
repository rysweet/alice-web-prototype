import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { parseMethodParams, registerMethod } from "../state.js";

export function registerCodeRoutes(app: Express, context: ServerContext): void {
  app.post("/api/code/edit-procedure", async (req, res) => {
    const response = await context.projectService.editProcedure(
      context.state,
      context.evidenceDir,
      context.evidenceService,
      req.body ?? {},
    );
    res.json(response);
  });

  app.post("/api/code/create-procedure", (req, res) => {
    const { name, parameters } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required and must be a non-empty string" });
      return;
    }
    const methodName = name.trim();
    if (context.state.procedures.has(methodName)) {
      res.status(400).json({ error: `Procedure "${methodName}" already exists` });
      return;
    }
    const parsed = parseMethodParams(parameters);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    registerMethod(context.state, methodName, false, "void", parsed.params);
    res.json({
      status: "created",
      name: methodName,
      kind: "procedure",
      parameters: parsed.params,
      totalProcedures: context.state.procedures.size,
    });
  });

  app.post("/api/code/create-function", (req, res) => {
    const { name, returnType, parameters } = req.body ?? {};
    if (!name || typeof name !== "string" || !name.trim()) {
      res.status(400).json({ error: "name is required and must be a non-empty string" });
      return;
    }
    if (!returnType || typeof returnType !== "string" || !returnType.trim()) {
      res.status(400).json({ error: "returnType is required for functions" });
      return;
    }
    const methodName = name.trim();
    if (context.state.procedures.has(methodName)) {
      res.status(400).json({ error: `Method "${methodName}" already exists` });
      return;
    }
    const parsed = parseMethodParams(parameters);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    registerMethod(context.state, methodName, true, returnType.trim(), parsed.params);
    res.json({
      status: "created",
      name: methodName,
      kind: "function",
      returnType: returnType.trim(),
      parameters: parsed.params,
      totalProcedures: context.state.procedures.size,
    });
  });
}
