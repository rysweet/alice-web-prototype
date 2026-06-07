import type { Express } from "express";
import { EventSystemError } from "../../events.js";
import type { ServerContext } from "../context.js";

export function registerEventRoutes(app: Express, context: ServerContext): void {
  app.post("/api/events/register", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "not launched" });
      return;
    }

    try {
      const registration = context.state.eventSystem.register(req.body ?? {});
      const evidenceArtifact = context.evidenceService.recordEventRegister(
        context.evidenceDir,
        {
          registrationId: registration.id,
          eventType: registration.eventType,
          handlerName: registration.handlerName,
          totalRegistrations: context.state.eventSystem.totalRegistrations,
        },
      );

      res.json({
        registrationId: registration.id,
        eventType: registration.eventType,
        handlerName: registration.handlerName,
        evidenceArtifact,
      });
    } catch (error) {
      if (error instanceof EventSystemError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });

  app.post("/api/events/fire", (req, res) => {
    if (!context.state.launched) {
      res.status(400).json({ error: "not launched" });
      return;
    }

    try {
      const { eventType, payload } = req.body ?? {};
      const result = context.state.eventSystem.fire(eventType, payload);
      const evidenceArtifact = context.evidenceService.recordEventFire(
        context.evidenceDir,
        {
          eventType,
          registrationsEvaluated: result.registrationsEvaluated,
          triggeredCount: result.triggered.length,
          triggered: result.triggered.map((triggered) => triggered.id),
        },
      );

      res.json({
        triggered: result.triggered,
        evidenceArtifact,
      });
    } catch (error) {
      if (error instanceof EventSystemError) {
        res.status(400).json({ error: error.message });
        return;
      }
      throw error;
    }
  });
}
