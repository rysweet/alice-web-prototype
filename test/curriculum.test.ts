import { describe, expect, it } from "vitest";
import {
  createCurriculumMetadata,
  createCurriculumProgress,
  getLessonById,
  getLessonPrerequisiteChain,
  getMissingConceptsForLesson,
  hasDemonstratedConcept,
  isLessonUnlocked,
  mapAliceConceptToJavaEquivalent,
  recordDemonstratedConcept,
} from "../src/curriculum";

describe("curriculum metadata", () => {
  it("exposes lesson definitions and concept mappings", () => {
    const curriculum = createCurriculumMetadata();
    const lesson = getLessonById(curriculum, "first-animation");

    expect(lesson).toMatchObject({
      name: "Animate with methods",
      requiredConcepts: ["method", "sequence"],
    });
    expect(mapAliceConceptToJavaEquivalent(curriculum, "method")).toBe("instance method invocation");
    expect(mapAliceConceptToJavaEquivalent(curriculum, "missing")).toBeNull();
  });

  it("tracks demonstrated concepts without duplicating progress", () => {
    const progress = recordDemonstratedConcept(
      createCurriculumProgress(["scene", "scene"]),
      "object",
    );

    expect(progress.demonstratedConcepts).toEqual(["scene", "object"]);
    expect(hasDemonstratedConcept(progress, "object")).toBe(true);
    expect(hasDemonstratedConcept(progress, "loop")).toBe(false);
  });

  it("builds prerequisite chains in teaching order", () => {
    const curriculum = createCurriculumMetadata();

    expect(getLessonPrerequisiteChain(curriculum, "abstractions").map((lesson) => lesson.id)).toEqual([
      "first-world",
      "first-animation",
      "control-flow",
    ]);
  });

  it("reports missing concepts and lesson unlock state from demonstrated concepts", () => {
    const curriculum = createCurriculumMetadata();
    let progress = createCurriculumProgress(["scene", "object"]);

    expect(isLessonUnlocked(curriculum, progress, "first-animation")).toBe(true);
    expect(isLessonUnlocked(curriculum, progress, "control-flow")).toBe(false);
    expect(getMissingConceptsForLesson(curriculum, progress, "control-flow").map((concept) => concept.id)).toEqual([
      "loop",
      "condition",
    ]);

    progress = recordDemonstratedConcept(progress, "method");
    progress = recordDemonstratedConcept(progress, "sequence");

    expect(isLessonUnlocked(curriculum, progress, "control-flow")).toBe(true);
  });

  it("rejects missing prerequisite lessons during curriculum creation", () => {
    expect(() => createCurriculumMetadata([
      {
        id: "lesson-a",
        name: "Lesson A",
        objectives: ["Test validation."],
        requiredConcepts: ["scene"],
        prerequisiteLessonIds: ["missing-lesson"],
      },
    ])).toThrowError("Unknown prerequisite lesson id: missing-lesson");
  });
});
