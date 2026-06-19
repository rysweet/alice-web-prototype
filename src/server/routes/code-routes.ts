import type { Express } from "express";
import type { ServerContext } from "../context.js";
import { registerMethod, type MethodParam } from "../state.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
  readRequiredStringField,
} from "../validation.js";

type MethodParamsResult =
  | { ok: true; params: MethodParam[] }
  | { ok: false; error: string };

function readMethodParameters(body: Record<string, unknown>): MethodParamsResult {
  const rawParameters = body.parameters;
  if (rawParameters === undefined) {
    return { ok: true, params: [] };
  }

  if (!Array.isArray(rawParameters)) {
    return { ok: false, error: "parameters must be an array" };
  }

  const params: MethodParam[] = [];
  for (const [index, parameter] of rawParameters.entries()) {
    if (parameter === null || typeof parameter !== "object" || Array.isArray(parameter)) {
      return { ok: false, error: `parameters[${index}] must be an object` };
    }

    const parameterBody = parameter as Record<string, unknown>;
    const name = readRequiredStringField(parameterBody, "name");
    if (!name.ok) {
      return { ok: false, error: `parameters[${index}].${name.error}` };
    }

    const type = readOptionalStringField(parameterBody, "type");
    if (!type.ok) {
      return { ok: false, error: `parameters[${index}].${type.error}` };
    }

    const defaultValue = readOptionalStringField(
      parameterBody,
      "defaultValue",
    );
    if (!defaultValue.ok) {
      return { ok: false, error: `parameters[${index}].${defaultValue.error}` };
    }

    params.push({
      name: name.value,
      type: type.value ?? "Object",
      ...(defaultValue.value !== undefined ? { defaultValue: defaultValue.value } : {}),
    });
  }

  return { ok: true, params };
}

export function registerCodeRoutes(app: Express, context: ServerContext): void {
  app.post("/api/code/edit-procedure", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const procedureSelector = readOptionalStringField(body.body, "procedureSelector");
    if (!procedureSelector.ok) {
      res.status(400).json({ error: procedureSelector.error });
      return;
    }

    const editSpec = readOptionalStringField(body.body, "editSpec");
    if (!editSpec.ok) {
      res.status(400).json({ error: editSpec.error });
      return;
    }

    const response = await context.projectService.editProcedure(
      context.state,
      context.evidenceDir,
      context.evidenceService,
      {
        ...(procedureSelector.value !== undefined
          ? { procedureSelector: procedureSelector.value }
          : {}),
        ...(editSpec.value !== undefined ? { editSpec: editSpec.value } : {}),
      },
    );
    res.json(response);
  });

  app.post("/api/code/create-procedure", (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const name = readRequiredStringField(body.body, "name");
    if (!name.ok) {
      res.status(400).json({ error: name.error });
      return;
    }
    const methodName = name.value;
    if (context.state.procedures.has(methodName)) {
      res.status(400).json({ error: `Procedure "${methodName}" already exists` });
      return;
    }
    const parsed = readMethodParameters(body.body);
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
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const name = readRequiredStringField(body.body, "name");
    if (!name.ok) {
      res.status(400).json({ error: name.error });
      return;
    }

    const returnType = readRequiredStringField(body.body, "returnType");
    if (!returnType.ok) {
      res.status(400).json({ error: returnType.error });
      return;
    }

    const methodName = name.value;
    if (context.state.procedures.has(methodName)) {
      res.status(400).json({ error: `Method "${methodName}" already exists` });
      return;
    }
    const parsed = readMethodParameters(body.body);
    if (!parsed.ok) {
      res.status(400).json({ error: parsed.error });
      return;
    }

    registerMethod(context.state, methodName, true, returnType.value, parsed.params);
    res.json({
      status: "created",
      name: methodName,
      kind: "function",
      returnType: returnType.value,
      parameters: parsed.params,
      totalProcedures: context.state.procedures.size,
    });
  });
}
