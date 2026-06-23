import type { Express, Response } from "express";
import {
  InvalidWebPackageError,
  type TeacherShareMetadata,
  WebPackageInputError,
} from "../../project-export.js";
import {
  ClassBehaviorPackageError,
  type ClassBehaviorConflictStrategy,
} from "../../project-io/class-behavior-package.js";
import type { ServerContext } from "../context.js";
import {
  readJsonObjectBody,
  readOptionalStringField,
  readRequiredStringField,
  validateExistingProjectRealPath,
  validateProjectPath,
} from "../validation.js";

export function registerProjectRoutes(app: Express, context: ServerContext): void {
  app.get("/api/projects/current/classes/:typeName/behavior", async (req, res, next) => {
    try {
      const typeName = req.params.typeName;
      const packageData = await context.projectService.exportClassBehaviorPackage(context.state, typeName);
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${classBehaviorFilename(typeName)}"`);
      res.setHeader("Cache-Control", "no-store");
      res.json(packageData);
    } catch (error) {
      if (error instanceof ClassBehaviorPackageError) {
        sendClassBehaviorError(res, error);
        return;
      }
      next(error);
    }
  });

  app.post("/api/projects/current/classes/behavior", async (req, res, next) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error, code: "invalid-class-behavior-package" });
      return;
    }

    const packageData = body.body.package;
    if (packageData === undefined) {
      res.status(400).json({
        error: "package is required",
        code: "invalid-class-behavior-package",
      });
      return;
    }

    const conflictStrategy = readConflictStrategy(body.body.conflictStrategy);
    if (!conflictStrategy.ok) {
      res.status(400).json({
        error: conflictStrategy.error,
        code: "invalid-class-behavior-package",
      });
      return;
    }

    try {
      const result = await context.projectService.importClassBehaviorPackage(context.state, packageData, {
        ...(conflictStrategy.value !== undefined ? { conflictStrategy: conflictStrategy.value } : {}),
      });
      res.setHeader("Cache-Control", "no-store");
      res.json(result);
    } catch (error) {
      if (error instanceof ClassBehaviorPackageError) {
        sendClassBehaviorError(res, error);
        return;
      }
      next(error);
    }
  });

  app.get("/api/projects/current/export/typescript", async (_req, res, next) => {
    try {
      const exported = await context.projectService.exportTypeScript(context.state);
      res.setHeader("Content-Type", exported.contentType);
      res.setHeader("Content-Disposition", `attachment; filename="${exported.filename}"`);
      res.setHeader("Cache-Control", "no-store");
      res.send(exported.archive);
    } catch (error) {
      next(error);
    }
  });

  app.post("/api/project/save", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const saveSelector = readOptionalStringField(body.body, "saveSelector");
    if (!saveSelector.ok) {
      res.status(400).json({ error: saveSelector.error });
      return;
    }

    const targetPath = readOptionalStringField(body.body, "targetPath");
    if (!targetPath.ok) {
      res.status(400).json({ error: targetPath.error });
      return;
    }
    let resolvedTargetPath = targetPath.value;
    if (resolvedTargetPath !== undefined) {
      const validation = validateProjectPath(resolvedTargetPath, context.allowedProjectDirs);
      if (!validation.valid) {
        res.status(400).json({ error: validation.error });
        return;
      }
      resolvedTargetPath = validation.resolvedPath;
    }

    const response = await context.projectService.saveProject(
      context.state,
      context.evidenceDir,
      context.evidenceService,
      {
        ...(saveSelector.value !== undefined
          ? { saveSelector: saveSelector.value }
          : {}),
        ...(resolvedTargetPath !== undefined ? { targetPath: resolvedTargetPath } : {}),
        allowedProjectDirs: context.allowedProjectDirs,
      },
    );
    res.json(response);
  });

  app.post("/api/project/reopen", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const projectPath = readRequiredStringField(body.body, "project");
    if (!projectPath.ok) {
      res.status(400).json({ error: projectPath.error });
      return;
    }

    const validation = validateProjectPath(projectPath.value, context.allowedProjectDirs);
    if (!validation.valid) {
      res.status(400).json({ error: validation.error });
      return;
    }

    const realPathValidation = await validateExistingProjectRealPath(
      validation.resolvedPath,
      context.allowedProjectDirs,
    );
    if (!realPathValidation.valid) {
      res.status(400).json({ error: realPathValidation.error });
      return;
    }

    const launchResult = await context.projectService.launchProject(
      context.state,
      realPathValidation.resolvedPath,
    );
    if (!launchResult.ok) {
      res.status(400).json({ error: launchResult.error });
      return;
    }

    res.json({
      status: "reopened",
      project: context.state.projectPath,
      projectName: context.state.projectName,
      sceneObjectCount: context.state.sceneObjects.size,
    });
  });

  app.post("/api/project/export/web-package", async (req, res, next) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const input = readWebPackageOptions(body.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      res.json(await context.projectService.exportWebPackage(context.state, input.value));
    } catch (error) {
      if (error instanceof WebPackageInputError) {
        res.status(400).json({ error: error.message });
        return;
      }
      next(error);
    }
  });

  app.post("/api/project/validate-web-package", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const packageBase64 = readRequiredPackageBase64(body.body);
    if (!packageBase64.ok) {
      res.status(400).json({ error: packageBase64.error });
      return;
    }

    const validation = await context.projectService.validateWebPackage({
      packageBase64: packageBase64.value,
    });
    res.status(validation.valid ? 200 : 400).json(validation);
  });

  app.post("/api/project/share", async (req, res, next) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const packageBase64 = readRequiredPackageBase64(body.body);
    if (!packageBase64.ok) {
      res.status(400).json({ error: packageBase64.error });
      return;
    }

    const input = readWebPackageOptions(body.body);
    if (!input.ok) {
      res.status(400).json({ error: input.error });
      return;
    }

    try {
      res.json(await context.projectService.generateShareArtifacts({
        ...input.value,
        packageBase64: packageBase64.value,
      }));
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

  app.get("/api/project/templates", (_req, res) => {
    res.json({
      templates: context.templateService.listTemplates(context.state),
    });
  });

  app.post("/api/project/new", async (req, res) => {
    const body = readJsonObjectBody(req.body);
    if (!body.ok) {
      res.status(400).json({ error: body.error });
      return;
    }

    const templateId = readOptionalStringField(body.body, "templateId");
    if (!templateId.ok) {
      res.status(400).json({ error: templateId.error });
      return;
    }

    const projectName = readOptionalStringField(body.body, "projectName");
    if (!projectName.ok) {
      res.status(400).json({ error: projectName.error });
      return;
    }

    const result = await context.templateService.createProject(
      context.state,
      context.evidenceDir,
      {
        ...(templateId.value !== undefined ? { templateId: templateId.value } : {}),
        ...(projectName.value !== undefined ? { projectName: projectName.value } : {}),
      },
    );

    if (!result.ok) {
      res.status(400).json({
        error: result.error,
        availableTemplates: result.availableTemplates,
      });
      return;
    }

    res.json(result.response);
  });
}

function readWebPackageOptions(body: Record<string, unknown>):
  | { ok: true; value: { title?: string; description?: string; canonicalUrl?: string; teacher?: TeacherShareMetadata } }
  | { ok: false; error: string } {
  const title = readOptionalStringField(body, "title");
  if (!title.ok) return title;

  const description = readOptionalStringField(body, "description");
  if (!description.ok) return description;

  const canonicalUrl = readOptionalStringField(body, "canonicalUrl");
  if (!canonicalUrl.ok) return canonicalUrl;
  if (canonicalUrl.value !== undefined) {
    const url = validateShareUrl(canonicalUrl.value);
    if (!url.ok) return url;
  }

  const teacher = readTeacherShareMetadata(body.teacher);
  if (!teacher.ok) return teacher;

  return {
    ok: true,
    value: {
      ...(title.value !== undefined ? { title: title.value } : {}),
      ...(description.value !== undefined ? { description: description.value } : {}),
      ...(canonicalUrl.value !== undefined ? { canonicalUrl: canonicalUrl.value } : {}),
      ...(teacher.value !== undefined ? { teacher: teacher.value } : {}),
    },
  };
}

function readTeacherShareMetadata(value: unknown):
  | { ok: true; value?: TeacherShareMetadata }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, error: "teacher must be a JSON object" };
  }

  const teacher = value as Record<string, unknown>;
  const audience = readOptionalStringField(teacher, "audience");
  if (!audience.ok) return { ok: false, error: `teacher.${audience.error}` };
  const lessonFocus = readOptionalStringField(teacher, "lessonFocus");
  if (!lessonFocus.ok) return { ok: false, error: `teacher.${lessonFocus.error}` };
  const attribution = readOptionalStringField(teacher, "attribution");
  if (!attribution.ok) return { ok: false, error: `teacher.${attribution.error}` };
  const remix = readRemixPolicy(teacher.remix);
  if (!remix.ok) return remix;
  const tags = readStringArrayField(teacher.tags, "teacher.tags");
  if (!tags.ok) return tags;
  const standards = readStringArrayField(teacher.standards, "teacher.standards");
  if (!standards.ok) return standards;

  return {
    ok: true,
    value: {
      ...(audience.value !== undefined ? { audience: audience.value } : {}),
      ...(lessonFocus.value !== undefined ? { lessonFocus: lessonFocus.value } : {}),
      ...(remix.value !== undefined ? { remix: remix.value } : {}),
      ...(attribution.value !== undefined ? { attribution: attribution.value } : {}),
      ...(tags.value !== undefined ? { tags: tags.value } : {}),
      ...(standards.value !== undefined ? { standards: standards.value } : {}),
    },
  };
}

function readRemixPolicy(value: unknown):
  | { ok: true; value?: TeacherShareMetadata["remix"] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (value === "allowed" || value === "with-attribution" || value === "not-allowed") {
    return { ok: true, value };
  }
  return {
    ok: false,
    error: "teacher.remix must be allowed, with-attribution, or not-allowed",
  };
}

function readStringArrayField(value: unknown, fieldName: string):
  | { ok: true; value?: string[] }
  | { ok: false; error: string } {
  if (value === undefined) return { ok: true };
  if (!Array.isArray(value) || !value.every((entry) => typeof entry === "string")) {
    return { ok: false, error: `${fieldName} must be an array of strings` };
  }
  return { ok: true, value };
}

function validateShareUrl(value: string): { ok: true } | { ok: false; error: string } {
  if (/[\u0000-\u0020\u007f]/u.test(value)) {
    return { ok: false, error: "canonicalUrl must be a valid http or https URL" };
  }
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return { ok: false, error: "canonicalUrl must be a valid http or https URL" };
  }
  if (
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
    || parsed.username !== ""
    || parsed.password !== ""
    || (parsed.href !== value && !isHostOnlyHttpUrlWithoutSlash(parsed, value))
  ) {
    return { ok: false, error: "canonicalUrl must be a valid http or https URL" };
  }
  return { ok: true };
}

function isHostOnlyHttpUrlWithoutSlash(parsed: URL, value: string): boolean {
  return parsed.href === `${value}/`
    && parsed.pathname === "/"
    && parsed.search === ""
    && parsed.hash === ""
    && !value.endsWith("/");
}

function readRequiredPackageBase64(body: Record<string, unknown>):
  | { ok: true; value: string }
  | { ok: false; error: string } {
  const value = body.packageBase64;
  if (typeof value !== "string" || value.trim() === "") {
    return { ok: false, error: "packageBase64 is required and must be a non-empty string" };
  }
  return { ok: true, value: value.trim() };
}

function readConflictStrategy(value: unknown):
  | { ok: true; value: ClassBehaviorConflictStrategy | undefined }
  | { ok: false; error: string } {
  if (value === undefined) {
    return { ok: true, value: undefined };
  }
  if (
    value === "rename" ||
    value === "replace" ||
    value === "merge" ||
    value === "reject"
  ) {
    return { ok: true, value };
  }
  return { ok: false, error: "conflictStrategy must be rename, replace, merge, or reject" };
}

function classBehaviorFilename(typeName: string): string {
  const safeBase = typeName
    .trim()
    .replace(/[^A-Za-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    || "class-behavior";
  return `${safeBase}.alice-class-behavior.json`;
}

function sendClassBehaviorError(
  res: Response,
  error: ClassBehaviorPackageError,
): void {
  res.setHeader("Cache-Control", "no-store");
  res.status(error.status).json({
    error: error.message,
    code: error.code,
    ...(error.existingName ? { existingName: error.existingName } : {}),
  });
}
