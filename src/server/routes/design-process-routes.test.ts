import * as fs from "fs";
import * as path from "path";
import { afterEach, describe, expect, it } from "vitest";
import request from "supertest";
import { createServer } from "../../server.js";
import { LOCAL_API_TOKEN_HEADER } from "../security.js";

const API_TOKEN = "test-local-api-token";
const evidenceDirs: string[] = [];

function makeEvidenceDir(name: string): string {
  const dir = path.resolve("target/test-work/design-process-routes", name);
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
  evidenceDirs.push(dir);
  return dir;
}

function postLocal(app: ReturnType<typeof createServer>, route: string) {
  return request(app).post(route).set(LOCAL_API_TOKEN_HEADER, API_TOKEN);
}

function designProcessRequest() {
  return {
    scenario: "design-process-story-or-game",
    mode: "game",
    designBrief: "Game: guide the hero from goal setup to win feedback.",
    sceneSketches: [
      { name: "setup-state", character: "prototypeHero", action: "explains the win goal" },
      { name: "win-state", character: "prototypeHero", action: "reports the successful revision" },
    ],
    bridgeMappings: [
      { scene: "setup-state", aliceConcept: "myFirstMethod", controls: "prototypeHero goal narration" },
      { scene: "win-state", aliceConcept: "conditional", controls: "revised win feedback" },
    ],
    playtestObservation: "First playtest showed the goal, but the win feedback was missing.",
    revisionNote: "Added a second narration line after playtest so the player sees the win feedback.",
    reviewNote: "Review confirms plan, build, playtest, revise, and review evidence are present.",
    accessibilityChoice: "Use narrated text instead of extra characters.",
  };
}

afterEach(() => {
  for (const dir of evidenceDirs.splice(0)) {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

describe("design-process story-or-game evidence route", () => {
  it("records plan/build/playtest/revise/review evidence after a real revision loop", async () => {
    const app = createServer({ port: 0, evidenceDir: makeEvidenceDir("happy"), localApiToken: API_TOKEN });

    await postLocal(app, "/api/launch").send({}).expect(200);
    await postLocal(app, "/api/scene/add-object")
      .send({ className: "Biped", name: "prototypeHero" })
      .expect(200);
    await postLocal(app, "/api/code/edit-procedure")
      .send({ procedureSelector: "scene.myFirstMethod", editSpec: "append-comment:prototypeHero.say(goal)" })
      .expect(200);
    await postLocal(app, "/api/world/run").send({}).expect(200);
    await postLocal(app, "/api/code/edit-procedure")
      .send({ procedureSelector: "scene.myFirstMethod", editSpec: "append-comment:prototypeHero.say(revision)" })
      .expect(200);
    await postLocal(app, "/api/world/run").send({}).expect(200);

    const response = await postLocal(app, "/api/design-process/story-or-game/evidence")
      .send(designProcessRequest())
      .expect(200);

    expect(response.body.schema_version).toBe("lookingglass.design-process-story-or-game-evidence/v1");
    expect(response.body.status).toBe("evidence-recorded");
    expect(response.body.phases).toEqual(["plan", "build", "playtest", "revise", "review"]);
    expect(response.body.journeyEvidence.build.authoredObjectNames).toContain("prototypeHero");
    expect(response.body.journeyEvidence.playtest.runCount).toBe(2);
    expect(response.body.journeyEvidence.revise.bridgeMappings).toHaveLength(2);
    expect(response.body.journeyEvidence.review.reviewNote).toContain("Review confirms");
    expect(response.body.doesNotClaim).toContain("automated creative assessment");
    expect(fs.existsSync(response.body.evidenceArtifact)).toBe(true);
  });

  it("rejects evidence before the revision run exists", async () => {
    const app = createServer({ port: 0, evidenceDir: makeEvidenceDir("missing-revision-run"), localApiToken: API_TOKEN });

    await postLocal(app, "/api/launch").send({}).expect(200);
    await postLocal(app, "/api/scene/add-object")
      .send({ className: "Biped", name: "prototypeHero" })
      .expect(200);
    await postLocal(app, "/api/code/edit-procedure")
      .send({ procedureSelector: "scene.myFirstMethod", editSpec: "append-comment:prototypeHero.say(goal)" })
      .expect(200);
    await postLocal(app, "/api/world/run").send({}).expect(200);

    const response = await postLocal(app, "/api/design-process/story-or-game/evidence")
      .send(designProcessRequest())
      .expect(400);

    expect(response.body.error).toContain("revision-loop evidence requires");
  });
});
