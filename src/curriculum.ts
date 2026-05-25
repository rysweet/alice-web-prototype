export interface ConceptDefinition {
  id: string;
  name: string;
  javaEquivalent: string;
}

export interface LessonDefinition {
  id: string;
  name: string;
  objectives: string[];
  requiredConcepts: string[];
  prerequisiteLessonIds: string[];
}

export interface CurriculumMetadata {
  concepts: Record<string, ConceptDefinition>;
  lessons: LessonDefinition[];
}

export interface CurriculumProgress {
  demonstratedConcepts: string[];
}

function unique(values: Iterable<string>): string[] {
  return [...new Set(values)];
}

function copyLesson(lesson: LessonDefinition): LessonDefinition {
  return {
    ...lesson,
    objectives: [...lesson.objectives],
    requiredConcepts: [...lesson.requiredConcepts],
    prerequisiteLessonIds: [...lesson.prerequisiteLessonIds],
  };
}

export const DEFAULT_CONCEPTS: Record<string, ConceptDefinition> = {
  scene: {
    id: "scene",
    name: "Scene setup",
    javaEquivalent: "class setup and object composition",
  },
  object: {
    id: "object",
    name: "Object placement",
    javaEquivalent: "object instantiation",
  },
  method: {
    id: "method",
    name: "Method call",
    javaEquivalent: "instance method invocation",
  },
  sequence: {
    id: "sequence",
    name: "Do in order",
    javaEquivalent: "sequential statements",
  },
  loop: {
    id: "loop",
    name: "Loop",
    javaEquivalent: "for/while loop",
  },
  condition: {
    id: "condition",
    name: "Condition",
    javaEquivalent: "if/else branch",
  },
  variable: {
    id: "variable",
    name: "Variable",
    javaEquivalent: "local variable",
  },
  function: {
    id: "function",
    name: "Function",
    javaEquivalent: "method with a return value",
  },
};

export const DEFAULT_LESSONS: LessonDefinition[] = [
  {
    id: "first-world",
    name: "Build a first world",
    objectives: [
      "Add a ground and one character.",
      "Practice scene and object terminology.",
    ],
    requiredConcepts: ["scene", "object"],
    prerequisiteLessonIds: [],
  },
  {
    id: "first-animation",
    name: "Animate with methods",
    objectives: [
      "Call movement methods on scene objects.",
      "Sequence simple actions in time.",
    ],
    requiredConcepts: ["method", "sequence"],
    prerequisiteLessonIds: ["first-world"],
  },
  {
    id: "control-flow",
    name: "React with loops and conditions",
    objectives: [
      "Repeat behavior with loops.",
      "Make choices with conditionals.",
    ],
    requiredConcepts: ["loop", "condition"],
    prerequisiteLessonIds: ["first-animation"],
  },
  {
    id: "abstractions",
    name: "Track state and build helpers",
    objectives: [
      "Store values in variables.",
      "Create reusable functions with return values.",
    ],
    requiredConcepts: ["variable", "function"],
    prerequisiteLessonIds: ["control-flow"],
  },
];

export function createCurriculumMetadata(
  lessons: readonly LessonDefinition[] = DEFAULT_LESSONS,
  concepts: Readonly<Record<string, ConceptDefinition>> = DEFAULT_CONCEPTS,
): CurriculumMetadata {
  const conceptEntries = Object.entries(concepts).map(([id, concept]) => [id, { ...concept }]);
  const conceptMap = Object.fromEntries(conceptEntries) as Record<string, ConceptDefinition>;
  const lessonCopies = lessons.map(copyLesson);
  const lessonIds = new Set<string>();

  for (const lesson of lessonCopies) {
    if (lessonIds.has(lesson.id)) {
      throw new Error(`Duplicate lesson id: ${lesson.id}`);
    }
    lessonIds.add(lesson.id);
    for (const conceptId of lesson.requiredConcepts) {
      if (!conceptMap[conceptId]) {
        throw new Error(`Unknown concept id: ${conceptId}`);
      }
    }
  }

  for (const lesson of lessonCopies) {
    for (const prerequisiteLessonId of lesson.prerequisiteLessonIds) {
      if (!lessonIds.has(prerequisiteLessonId)) {
        throw new Error(`Unknown prerequisite lesson id: ${prerequisiteLessonId}`);
      }
    }
  }

  return {
    concepts: conceptMap,
    lessons: lessonCopies,
  };
}

export function createCurriculumProgress(
  demonstratedConcepts: Iterable<string> = [],
): CurriculumProgress {
  return {
    demonstratedConcepts: unique(demonstratedConcepts),
  };
}

export function getLessonById(
  curriculum: CurriculumMetadata,
  lessonId: string,
): LessonDefinition | null {
  return curriculum.lessons.find((lesson) => lesson.id === lessonId) ?? null;
}

export function mapAliceConceptToJavaEquivalent(
  curriculum: CurriculumMetadata,
  conceptId: string,
): string | null {
  return curriculum.concepts[conceptId]?.javaEquivalent ?? null;
}

export function hasDemonstratedConcept(
  progress: CurriculumProgress,
  conceptId: string,
): boolean {
  return progress.demonstratedConcepts.includes(conceptId);
}

export function recordDemonstratedConcept(
  progress: CurriculumProgress,
  conceptId: string,
): CurriculumProgress {
  return createCurriculumProgress([...progress.demonstratedConcepts, conceptId]);
}

export function getLessonPrerequisiteChain(
  curriculum: CurriculumMetadata,
  lessonId: string,
): LessonDefinition[] {
  const seen = new Set<string>();
  const visiting = new Set<string>();
  const ordered: LessonDefinition[] = [];

  function visit(currentLessonId: string): void {
    const lesson = getLessonById(curriculum, currentLessonId);
    if (!lesson) {
      throw new Error(`Unknown lesson id: ${currentLessonId}`);
    }
    if (seen.has(currentLessonId)) {
      return;
    }
    if (visiting.has(currentLessonId)) {
      throw new Error(`Lesson prerequisite cycle detected at: ${currentLessonId}`);
    }
    visiting.add(currentLessonId);
    for (const prerequisiteLessonId of lesson.prerequisiteLessonIds) {
      visit(prerequisiteLessonId);
      const prerequisiteLesson = getLessonById(curriculum, prerequisiteLessonId);
      if (prerequisiteLesson && !ordered.some((entry) => entry.id === prerequisiteLesson.id)) {
        ordered.push(prerequisiteLesson);
      }
    }
    visiting.delete(currentLessonId);
    seen.add(currentLessonId);
  }

  visit(lessonId);
  return ordered.map(copyLesson);
}

export function getMissingConceptsForLesson(
  curriculum: CurriculumMetadata,
  progress: CurriculumProgress,
  lessonId: string,
): ConceptDefinition[] {
  const lesson = getLessonById(curriculum, lessonId);
  if (!lesson) {
    throw new Error(`Unknown lesson id: ${lessonId}`);
  }
  return lesson.requiredConcepts
    .filter((conceptId) => !hasDemonstratedConcept(progress, conceptId))
    .map((conceptId) => ({ ...curriculum.concepts[conceptId] }));
}

export function isLessonUnlocked(
  curriculum: CurriculumMetadata,
  progress: CurriculumProgress,
  lessonId: string,
): boolean {
  return getLessonPrerequisiteChain(curriculum, lessonId)
    .every((lesson) => lesson.requiredConcepts.every((conceptId) => hasDemonstratedConcept(progress, conceptId)));
}
