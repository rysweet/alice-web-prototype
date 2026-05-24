import { describe, expect, it } from "vitest";
import { parseTweedle } from "../src/tweedle-parser.js";
import { TweedleVM } from "../src/tweedle-vm.js";

describe("TweedleVM faithful execution", () => {
  it("executes a real Alice-style first lesson scene method", () => {
    const moveDirection = parseTweedle(`enum MoveDirection {
      FORWARD(axis: Direction.FORWARD),
      BACKWARD(axis: Direction.BACKWARD);

      Direction axis;

      MoveDirection(Direction axis) {
        this.axis <- axis;
      }
    }`);
    const turnDirection = parseTweedle(`enum TurnDirection {
      LEFT(axis: Direction.UP),
      RIGHT(axis: Direction.DOWN);

      Direction axis;

      TurnDirection(Direction axis) {
        this.axis <- axis;
      }
    }`);
    const scene = parseTweedle(`class MyScene extends SScene models Scene {
      SBiped myCharacter <- new SBiped();

      void myFirstMethod() {
        this.myCharacter.move(MoveDirection.FORWARD, 1.0);
        this.myCharacter.turn(TurnDirection.LEFT, 0.25);
        this.myCharacter.say("Hello!");
      }
    }`);

    const result = new TweedleVM().execute(scene, {
      declarations: [moveDirection, turnDirection],
      entryMethod: "myFirstMethod",
      instanceName: "myScene",
    });

    const methodCalls = result.execution_log.filter((entry) => entry.kind === "MethodCall").map((entry) => entry.detail);
    expect(methodCalls).toEqual([
      "this.myCharacter.move(MoveDirection.FORWARD, 1)",
      "this.myCharacter.turn(TurnDirection.LEFT, 0.25)",
      'this.myCharacter.say("Hello!")',
    ]);
  });

  it("executes parameterized functions with arithmetic return values", () => {
    const ast = parseTweedle(`class Calculator {
      WholeNumber add(WholeNumber left, WholeNumber right) {
        return left + right;
      }
    }`);

    const result = new TweedleVM().execute(ast, {
      entryMethod: "add",
      arguments: ["2", "3"],
      instanceName: "calculator",
    });

    expect(result.returnValues.get("add")).toBe("5");
  });

  it("executes doInOrder, countUpTo, while, if/else, assignments, arithmetic, and string concatenation", () => {
    const ast = parseTweedle(`class FlowScene {
      TextString run(WholeNumber start) {
        WholeNumber total <- start;
        TextString message <- "begin";
        doInOrder {
          total <- total + 1;
          countUpTo (index < 3) {
            total <- total + 2;
          }
        }
        while (total < 8) {
          total <- total + 1;
        }
        if (total == 8) {
          message <- message .. "-done";
        } else {
          message <- message .. "-fail";
        }
        return message;
      }
    }`);

    const result = new TweedleVM().execute(ast, {
      entryMethod: "run",
      arguments: ["1"],
      instanceName: "flowScene",
    });

    expect(result.returnValues.get("run")).toBe("begin-done");
    expect(result.execution_log.some((entry) => entry.kind === "DoInOrder")).toBe(true);
    expect(result.execution_log.some((entry) => entry.kind === "CountUpTo")).toBe(true);
    expect(result.execution_log.some((entry) => entry.kind === "WhileLoop")).toBe(true);
    expect(result.execution_log.some((entry) => entry.kind === "IfElse")).toBe(true);
  });

  it("executes array operations and forEach loops", () => {
    const ast = parseTweedle(`class ArrayScene {
      TextString joinValues() {
        WholeNumber[] values <- {1, 2, 3};
        values[1] <- 5;
        TextString out <- "";
        forEach (WholeNumber value in values) {
          out <- out .. value;
        }
        return out;
      }
    }`);

    const result = new TweedleVM().execute(ast, {
      entryMethod: "joinValues",
      instanceName: "arrayScene",
    });

    expect(result.returnValues.get("joinValues")).toBe("153");
    expect(result.execution_log.some((entry) => entry.kind === "ForEach")).toBe(true);
  });

  it("registers and dispatches real Alice-style event listeners with lambdas", () => {
    const scene = parseTweedle(`class Scene extends SScene models Scene {
      Box box <- new Box();

      void initializeEventListeners() {
        this.addSceneActivationListener(listener: (SceneActivationEvent event)-> {
          this.myFirstMethod();
        });
      }

      void myFirstMethod() {
        this.box.say("ready");
      }
    }`);

    const vm = new TweedleVM();
    vm.execute(scene, { entryMethod: "initializeEventListeners", instanceName: "scene" });
    const result = vm.dispatchEvent("addSceneActivationListener", { type: "SceneActivationEvent" });

    expect(result.execution_log.some((entry) => entry.kind === "EventListener" && entry.detail.includes("addSceneActivationListener"))).toBe(true);
    expect(result.execution_log.some((entry) => entry.kind === "MethodCall" && entry.detail === 'this.box.say("ready")')).toBe(true);
  });

  it("executes real enum declarations through enum constant instances", () => {
    const moveDirection = parseTweedle(`enum MoveDirection {
      LEFT(axis: Direction.LEFT),
      RIGHT(axis: Direction.RIGHT),
      FORWARD(axis: Direction.FORWARD),
      BACKWARD(axis: Direction.BACKWARD);

      Direction axis;

      MoveDirection(Direction axis) {
        this.axis <- axis;
      }

      Direction getAxis() {
        return this.axis;
      }
    }`);

    const result = new TweedleVM().execute(moveDirection, {
      entryMethod: "getAxis",
      instanceName: "MoveDirection.FORWARD",
    });

    expect(result.returnValues.get("getAxis")).toBe("Direction.FORWARD");
  });

  it("executes real doTogether overrides from DirectionalBox-style code", () => {
    const ast = parseTweedle(`class DirectionalBox extends SBox models Box {
      SBox nose <- new SBox();
      SBox hat <- new SBox();

      void setOpacity(Portion opacity) {
        doTogether {
          super.setOpacity(opacity: opacity);
          nose.setOpacity(opacity: opacity);
          hat.setOpacity(opacity: opacity);
        }
      }
    }`);

    const result = new TweedleVM().execute(ast, {
      entryMethod: "setOpacity",
      arguments: ["Portion.NONE"],
      instanceName: "directionalBox",
    });

    const methodCalls = result.execution_log.filter((entry) => entry.kind === "MethodCall").map((entry) => entry.detail);
    expect(result.execution_log.some((entry) => entry.kind === "DoTogether")).toBe(true);
    expect(methodCalls).toContain("super.setOpacity(opacity)");
    expect(methodCalls).toContain("nose.setOpacity(opacity)");
    expect(methodCalls).toContain("hat.setOpacity(opacity)");
  });

  it("dispatches overridden methods on the runtime type", () => {
    const animal = parseTweedle(`class Animal {
      TextString speak() {
        return "animal";
      }
    }`);
    const dog = parseTweedle(`class Dog extends Animal {
      TextString speak() {
        return "dog";
      }
    }`);

    const result = new TweedleVM().execute(dog, {
      declarations: [animal],
      entryMethod: "speak",
      instanceName: "dog",
    });

    expect(result.returnValues.get("speak")).toBe("dog");
  });
});
