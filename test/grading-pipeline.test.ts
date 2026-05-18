import { describe, it, expect } from "vitest";
import { gradeLesson } from "../src/grading-pipeline";
import type {
  GradeInput,
  GradeResult,
  ExecutionLogEntry,
  EventRegistration,
  CriterionResult,
} from "../src/grading-pipeline";
import { Scene } from "../src/story-api/scene";
import {
  SModel,
  SBiped,
  SProp,
  SGround,
  SScene,
  SCamera,
} from "../src/story-api/entities";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyInput(scene?: Scene): GradeInput {
  return {
    scene: scene ?? new Scene(),
    executionLog: [],
    eventRegistrations: [],
    declaredMethods: [],
  };
}

function sceneWithEntities(
  entries: Array<[string, InstanceType<typeof SModel>]>,
): Scene {
  const scene = new Scene();
  for (const [name, entity] of entries) {
    scene.addEntity(name, entity);
  }
  return scene;
}

function logEntry(
  step: number,
  kind: string,
  detail: string,
): ExecutionLogEntry {
  return { step, kind, detail };
}

// ---------------------------------------------------------------------------
// GradeResult structure
// ---------------------------------------------------------------------------

describe("GradeResult structure", () => {
  it("contains lesson, passed, criteria, and score fields", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result).toHaveProperty("lesson");
    expect(result).toHaveProperty("passed");
    expect(result).toHaveProperty("criteria");
    expect(result).toHaveProperty("score");
    expect(typeof result.lesson).toBe("number");
    expect(typeof result.passed).toBe("boolean");
    expect(Array.isArray(result.criteria)).toBe(true);
    expect(typeof result.score).toBe("number");
  });

  it("each criterion has name, passed, and message", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    const result = gradeLesson(1, emptyInput(scene));

    for (const c of result.criteria) {
      expect(c).toHaveProperty("name");
      expect(c).toHaveProperty("passed");
      expect(c).toHaveProperty("message");
      expect(typeof c.name).toBe("string");
      expect(typeof c.passed).toBe("boolean");
      expect(typeof c.message).toBe("string");
    }
  });
});

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

describe("gradeLesson validation", () => {
  it("throws TypeError for lesson 0", () => {
    expect(() => gradeLesson(0, emptyInput())).toThrow(TypeError);
  });

  it("throws TypeError for lesson 9", () => {
    expect(() => gradeLesson(9, emptyInput())).toThrow(TypeError);
  });

  it("throws TypeError for non-integer lesson", () => {
    expect(() => gradeLesson(1.5, emptyInput())).toThrow(TypeError);
  });

  it("throws TypeError for negative lesson", () => {
    expect(() => gradeLesson(-1, emptyInput())).toThrow(TypeError);
  });

  it("accepts all lessons 1 through 8", () => {
    for (let i = 1; i <= 8; i++) {
      expect(() => gradeLesson(i, emptyInput())).not.toThrow();
    }
  });
});

// ---------------------------------------------------------------------------
// Lesson 1: Scene Setup
// ---------------------------------------------------------------------------

describe("Lesson 1: Scene Setup", () => {
  it("passes when scene has ≥1 non-default entity", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.lesson).toBe(1);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.criteria).toHaveLength(1);
    expect(result.criteria[0].name).toBe("entity-added");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("fails when scene is empty", () => {
    const result = gradeLesson(1, emptyInput());

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.criteria[0].name).toBe("entity-added");
    expect(result.criteria[0].passed).toBe(false);
  });

  it("excludes SGround from entity count", () => {
    const scene = new Scene();
    scene.addEntity("ground", new SGround());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.passed).toBe(false);
  });

  it("excludes SScene from entity count", () => {
    const scene = new Scene();
    scene.addEntity("scene", new SScene());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.passed).toBe(false);
  });

  it("excludes SCamera from entity count", () => {
    const scene = new Scene();
    scene.addEntity("camera", new SCamera());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.passed).toBe(false);
  });

  it("passes with entity alongside defaults", () => {
    const scene = new Scene();
    scene.addEntity("ground", new SGround());
    scene.addEntity("camera", new SCamera());
    scene.addEntity("bunny", new SBiped());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.passed).toBe(true);
  });

  it("counts multiple non-default entities", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    scene.addEntity("cat", new SProp());
    const result = gradeLesson(1, emptyInput(scene));

    expect(result.passed).toBe(true);
    expect(result.criteria[0].message).toContain("2");
  });
});

// ---------------------------------------------------------------------------
// Lesson 2: Movement
// ---------------------------------------------------------------------------

describe("Lesson 2: Movement", () => {
  it("passes with move MethodCall in log", () => {
    const result = gradeLesson(2, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 1.0)"),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("movement-statement");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("passes with turn MethodCall in log", () => {
    const result = gradeLesson(2, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.turn(LEFT, 0.5)"),
      ],
    });

    expect(result.passed).toBe(true);
  });

  it("fails with no move or turn in log", () => {
    const result = gradeLesson(2, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.say(Hello)"),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.criteria[0].passed).toBe(false);
  });

  it("fails with empty execution log", () => {
    const result = gradeLesson(2, emptyInput());

    expect(result.passed).toBe(false);
  });

  it("ignores non-MethodCall entries", () => {
    const result = gradeLesson(2, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat move 3 times"),
      ],
    });

    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 3: Event Handling
// ---------------------------------------------------------------------------

describe("Lesson 3: Event Handling", () => {
  it("passes with ≥1 event registration", () => {
    const result = gradeLesson(3, {
      ...emptyInput(),
      eventRegistrations: [
        { eventType: "sceneActivated", handlerName: "initScene" },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("event-listener");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("passes with multiple event registrations", () => {
    const result = gradeLesson(3, {
      ...emptyInput(),
      eventRegistrations: [
        { eventType: "sceneActivated", handlerName: "initScene" },
        { eventType: "keyPress", handlerName: "onKey" },
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].message).toContain("2");
  });

  it("fails with no event registrations", () => {
    const result = gradeLesson(3, emptyInput());

    expect(result.passed).toBe(false);
    expect(result.criteria[0].passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 4: Loops
// ---------------------------------------------------------------------------

describe("Lesson 4: Loops", () => {
  it("passes with CountLoop in execution log", () => {
    const result = gradeLesson(4, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("count-loop");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("fails without CountLoop", () => {
    const result = gradeLesson(4, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 1.0)"),
      ],
    });

    expect(result.passed).toBe(false);
  });

  it("fails with empty log", () => {
    const result = gradeLesson(4, emptyInput());
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 5: Conditionals
// ---------------------------------------------------------------------------

describe("Lesson 5: Conditionals", () => {
  it("passes with IfElse in execution log", () => {
    const result = gradeLesson(5, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "IfElse", "condition 'x > 0' → ifBody"),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("if-else");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("fails without IfElse", () => {
    const result = gradeLesson(5, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
      ],
    });

    expect(result.passed).toBe(false);
  });

  it("fails with empty log", () => {
    const result = gradeLesson(5, emptyInput());
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 6: Functions
// ---------------------------------------------------------------------------

describe("Lesson 6: Functions", () => {
  it("passes with custom method call", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.doBunnyDance()"),
      ],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("custom-method");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("fails when only built-in methods are called", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 1.0)"),
        logEntry(2, "MethodCall", "this.turn(LEFT, 0.5)"),
        logEntry(3, "MethodCall", "this.say(Hello)"),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.criteria[0].passed).toBe(false);
  });

  it("considers 'move' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 1.0)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'turn' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.turn(LEFT, 0.5)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'roll' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.roll(LEFT, 0.5)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'say' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.say(Hello)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'think' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.think(Hmm)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'resize' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.resize(2.0)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'setOpacity' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.setOpacity(0.5)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'setColor' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.setColor(RED)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'delay' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.delay(1.0)"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'myFirstMethod' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.myFirstMethod()"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("considers 'run' a built-in", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.run()"),
      ],
    });
    expect(result.passed).toBe(false);
  });

  it("passes when custom method mixed with built-ins", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "MethodCall", "this.move(FORWARD, 1.0)"),
        logEntry(2, "MethodCall", "this.celebrate()"),
      ],
    });
    expect(result.passed).toBe(true);
  });

  it("fails with empty log", () => {
    const result = gradeLesson(6, emptyInput());
    expect(result.passed).toBe(false);
  });

  it("ignores non-MethodCall entries for custom method detection", () => {
    const result = gradeLesson(6, {
      ...emptyInput(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat doBunnyDance 3 times"),
      ],
    });
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 7: Scene Transitions
// ---------------------------------------------------------------------------

describe("Lesson 7: Scene Transitions", () => {
  it("passes with ≥2 declared methods", () => {
    const result = gradeLesson(7, {
      ...emptyInput(),
      declaredMethods: ["myFirstMethod", "doBunnyDance"],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].name).toBe("multiple-methods");
    expect(result.criteria[0].passed).toBe(true);
  });

  it("passes with 3 methods", () => {
    const result = gradeLesson(7, {
      ...emptyInput(),
      declaredMethods: ["myFirstMethod", "doBunnyDance", "celebrate"],
    });

    expect(result.passed).toBe(true);
    expect(result.criteria[0].message).toContain("3");
  });

  it("fails with only 1 method", () => {
    const result = gradeLesson(7, {
      ...emptyInput(),
      declaredMethods: ["myFirstMethod"],
    });

    expect(result.passed).toBe(false);
    expect(result.criteria[0].passed).toBe(false);
  });

  it("fails with 0 methods", () => {
    const result = gradeLesson(7, emptyInput());
    expect(result.passed).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Lesson 8: Final Project (composite)
// ---------------------------------------------------------------------------

describe("Lesson 8: Final Project", () => {
  function fullL8Input(): GradeInput {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    scene.addEntity("cat", new SProp());
    scene.addEntity("dog", new SProp());
    return {
      scene,
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        logEntry(2, "IfElse", "condition 'x > 0' → ifBody"),
        logEntry(3, "MethodCall", "this.celebrate()"),
      ],
      eventRegistrations: [],
      declaredMethods: ["myFirstMethod", "celebrate"],
    };
  }

  it("passes when all 4 criteria met", () => {
    const result = gradeLesson(8, fullL8Input());

    expect(result.lesson).toBe(8);
    expect(result.passed).toBe(true);
    expect(result.score).toBe(1.0);
    expect(result.criteria).toHaveLength(4);
  });

  it("has correct criterion names", () => {
    const result = gradeLesson(8, fullL8Input());
    const names = result.criteria.map((c) => c.name);

    expect(names).toContain("entities-3plus");
    expect(names).toContain("has-loop");
    expect(names).toContain("has-conditional");
    expect(names).toContain("has-custom-method");
  });

  it("fails with <3 entities", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    scene.addEntity("cat", new SProp());
    const result = gradeLesson(8, {
      ...fullL8Input(),
      scene,
    });

    expect(result.passed).toBe(false);
    const entityCrit = result.criteria.find((c) => c.name === "entities-3plus");
    expect(entityCrit?.passed).toBe(false);
  });

  it("excludes SGround/SScene/SCamera from L8 entity count", () => {
    const scene = new Scene();
    scene.addEntity("ground", new SGround());
    scene.addEntity("scene", new SScene());
    scene.addEntity("camera", new SCamera());
    scene.addEntity("bunny", new SBiped());
    scene.addEntity("cat", new SProp());
    // Only 2 non-default entities — should fail entities-3plus
    const result = gradeLesson(8, {
      ...fullL8Input(),
      scene,
    });

    const entityCrit = result.criteria.find((c) => c.name === "entities-3plus");
    expect(entityCrit?.passed).toBe(false);
  });

  it("fails without loop", () => {
    const result = gradeLesson(8, {
      ...fullL8Input(),
      executionLog: [
        logEntry(1, "IfElse", "condition 'x > 0' → ifBody"),
        logEntry(2, "MethodCall", "this.celebrate()"),
      ],
    });

    expect(result.passed).toBe(false);
    const loopCrit = result.criteria.find((c) => c.name === "has-loop");
    expect(loopCrit?.passed).toBe(false);
  });

  it("fails without conditional", () => {
    const result = gradeLesson(8, {
      ...fullL8Input(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        logEntry(2, "MethodCall", "this.celebrate()"),
      ],
    });

    expect(result.passed).toBe(false);
    const condCrit = result.criteria.find((c) => c.name === "has-conditional");
    expect(condCrit?.passed).toBe(false);
  });

  it("fails without custom method", () => {
    const result = gradeLesson(8, {
      ...fullL8Input(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        logEntry(2, "IfElse", "condition 'x > 0' → ifBody"),
        logEntry(3, "MethodCall", "this.move(FORWARD, 1.0)"),
      ],
    });

    expect(result.passed).toBe(false);
    const methodCrit = result.criteria.find(
      (c) => c.name === "has-custom-method",
    );
    expect(methodCrit?.passed).toBe(false);
  });

  it("scores 0.75 when 3 of 4 criteria pass", () => {
    const result = gradeLesson(8, {
      ...fullL8Input(),
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        logEntry(2, "IfElse", "condition 'x > 0' → ifBody"),
        // No custom method call — only built-ins
        logEntry(3, "MethodCall", "this.move(FORWARD, 1.0)"),
      ],
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.75);
  });

  it("scores 0.5 when 2 of 4 criteria pass", () => {
    const scene = new Scene();
    scene.addEntity("bunny", new SBiped());
    // Only 1 entity — entities-3plus fails

    const result = gradeLesson(8, {
      scene,
      executionLog: [
        logEntry(1, "CountLoop", "repeat 3 times"),
        // No IfElse — has-conditional fails
        logEntry(2, "MethodCall", "this.celebrate()"),
      ],
      eventRegistrations: [],
      declaredMethods: ["myFirstMethod", "celebrate"],
    });

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0.5);
  });

  it("scores 0.0 with completely empty input", () => {
    const result = gradeLesson(8, emptyInput());

    expect(result.passed).toBe(false);
    expect(result.score).toBe(0);
    expect(result.criteria.every((c) => !c.passed)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Scoring invariants
// ---------------------------------------------------------------------------

describe("scoring invariants", () => {
  it("score is 1.0 when passed is true for single-criterion lessons", () => {
    for (const lesson of [1, 2, 3, 4, 5, 6, 7]) {
      let input: GradeInput;
      switch (lesson) {
        case 1: {
          const s = new Scene();
          s.addEntity("bunny", new SBiped());
          input = emptyInput(s);
          break;
        }
        case 2:
          input = {
            ...emptyInput(),
            executionLog: [logEntry(1, "MethodCall", "this.move(FORWARD, 1)")],
          };
          break;
        case 3:
          input = {
            ...emptyInput(),
            eventRegistrations: [
              { eventType: "sceneActivated", handlerName: "init" },
            ],
          };
          break;
        case 4:
          input = {
            ...emptyInput(),
            executionLog: [logEntry(1, "CountLoop", "repeat 3 times")],
          };
          break;
        case 5:
          input = {
            ...emptyInput(),
            executionLog: [logEntry(1, "IfElse", "condition → ifBody")],
          };
          break;
        case 6:
          input = {
            ...emptyInput(),
            executionLog: [logEntry(1, "MethodCall", "this.celebrate()")],
          };
          break;
        case 7:
          input = {
            ...emptyInput(),
            declaredMethods: ["methodA", "methodB"],
          };
          break;
        default:
          input = emptyInput();
      }

      const result = gradeLesson(lesson, input);
      expect(result.passed).toBe(true);
      expect(result.score).toBe(1.0);
    }
  });

  it("score is 0.0 when all criteria fail", () => {
    for (let lesson = 1; lesson <= 8; lesson++) {
      const result = gradeLesson(lesson, emptyInput());
      expect(result.passed).toBe(false);
      expect(result.score).toBe(0);
    }
  });

  it("lessons 1-7 have exactly 1 criterion each", () => {
    for (let lesson = 1; lesson <= 7; lesson++) {
      const result = gradeLesson(lesson, emptyInput());
      expect(result.criteria).toHaveLength(1);
    }
  });

  it("lesson 8 has exactly 4 criteria", () => {
    const result = gradeLesson(8, emptyInput());
    expect(result.criteria).toHaveLength(4);
  });

  it("lesson number in result matches input", () => {
    for (let lesson = 1; lesson <= 8; lesson++) {
      const result = gradeLesson(lesson, emptyInput());
      expect(result.lesson).toBe(lesson);
    }
  });
});
