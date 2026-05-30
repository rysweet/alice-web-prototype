import { describe, it, expect } from "vitest";
import { compileTweedleSource } from "../src/tweedle-compiler.js";
import { parseTweedle } from "../src/tweedle-parser.js";
import { createTypeEnvironment } from "../src/tweedle-typechecker.js";
import {
  TweedleDiagnosticCollector,
  TweedleParseError,
} from "../src/tweedle-parser-declarations.js";

describe("TweedleDiagnosticCollector", () => {
  it("collects errors and warnings", () => {
    const collector = new TweedleDiagnosticCollector();
    collector.error("missing semicolon", { line: 1, column: 10 });
    collector.warning("unused variable", { line: 2, column: 5 });
    expect(collector.diagnostics).toHaveLength(2);
    expect(collector.errors).toHaveLength(1);
    expect(collector.warnings).toHaveLength(1);
    expect(collector.hasErrors).toBe(true);
  });

  it("reports location info", () => {
    const collector = new TweedleDiagnosticCollector();
    collector.error("bad token", { line: 5, column: 12, length: 3 }, { found: "xyz", expected: "identifier" });
    const err = collector.errors[0];
    expect(err.location.line).toBe(5);
    expect(err.location.column).toBe(12);
    expect(err.found).toBe("xyz");
    expect(err.expected).toBe("identifier");
  });

  it("can be cleared", () => {
    const collector = new TweedleDiagnosticCollector();
    collector.error("oops", { line: 1, column: 0 });
    collector.clear();
    expect(collector.diagnostics).toHaveLength(0);
    expect(collector.hasErrors).toBe(false);
  });
});

describe("Tweedle parser — enhanced constructs", () => {
  it("parses a class with method and field", () => {
    const source = `class Animal {
      DecimalNumber speed <- 1.0;

      void move() {
        this.speed <- this.speed + 1.0;
      }
    }`;
    const result = parseTweedle(source);
    expect(result.name).toBe("Animal");
    expect(result.fields).toHaveLength(1);
    expect(result.methods).toHaveLength(1);
  });

  it("parses class inheritance", () => {
    const source = `class Dog extends Animal {
      void bark() {}
    }`;
    const result = parseTweedle(source);
    expect(result.superClass).toBe("Animal");
  });

  it("parses method with parameters and return type", () => {
    const source = `class Calculator {
      DecimalNumber add(DecimalNumber a, DecimalNumber b) {
        return a + b;
      }
    }`;
    const result = parseTweedle(source);
    const method = result.methods[0];
    expect(method.name).toBe("add");
    expect(method.parameters).toHaveLength(2);
    expect(method.returnType).toEqual({ type: "SimpleTypeRef", name: "DecimalNumber", isArray: false, arrayDimensions: 0, typeArguments: undefined });
  });

  it("parses doInOrder statement", () => {
    const source = `class Scene {
      void myFirstMethod() {
        doInOrder {
          this.move();
        }
      }
    }`;
    const result = parseTweedle(source);
    expect(result.methods[0].body[0].type).toBe("DoInOrder");
  });

  it("parses doTogether statement", () => {
    const source = `class Scene {
      void myMethod() {
        doTogether {
          this.move();
          this.turn();
        }
      }
    }`;
    const result = parseTweedle(source);
    expect(result.methods[0].body[0].type).toBe("DoTogether");
  });

  it("parses forEach loop", () => {
    const source = `class Scene {
      void listItems() {
        forEach (SModel item in this.getModels()) {
          item.move();
        }
      }
    }`;
    const result = parseTweedle(source);
    expect(result.methods[0].body[0].type).toBe("ForEach");
  });

  it("parses if-else statement", () => {
    const source = `class Scene {
      void check() {
        if (this.speed > 5.0) {
          this.stop();
        } else {
          this.move();
        }
      }
    }`;
    const result = parseTweedle(source);
    expect(result.methods[0].body[0].type).toBe("IfElse");
  });

  it("reports parse errors with source locations", () => {
    const badSource = `class Broken {
      void method() {
        this.foo(
      }
    }`;

    expect(() => parseTweedle(badSource)).toThrow(TweedleParseError);

    try {
      parseTweedle(badSource);
      expect.fail("should have thrown");
    } catch (error) {
      expect(error).toBeInstanceOf(TweedleParseError);
      const parseError = error as TweedleParseError;
      expect(parseError.line).toBeGreaterThan(0);
      expect(parseError.column).toBeGreaterThanOrEqual(0);
      expect(parseError.sourceLocation.line).toBe(parseError.line);
      expect(parseError.sourceLocation.column).toBe(parseError.column);
    }
  });
});

describe("Type checker — method resolution", () => {
  it("resolves types from parsed classes", () => {
    const vehicle = parseTweedle(`class Vehicle {
      DecimalNumber speed <- 0.0;
      void accelerate() {}
    }`);
    const car = parseTweedle(`class Car extends Vehicle {
      void honk() {}
    }`);
    const env = createTypeEnvironment([vehicle, car]);

    const resolvedVehicle = env.resolveType("Vehicle");
    expect(resolvedVehicle).not.toBeNull();
    expect(resolvedVehicle!.name).toBe("Vehicle");

    const resolvedCar = env.resolveType("Car");
    expect(resolvedCar).not.toBeNull();
    expect(resolvedCar!.superClass).toBe("Vehicle");
  });

  it("checks assignability through inheritance", () => {
    const animal = parseTweedle("class Animal {}");
    const dog = parseTweedle("class Dog extends Animal {}");
    const env = createTypeEnvironment([animal, dog]);

    expect(env.isAssignableTo("Dog", "Animal")).toBe(true);
    expect(env.isAssignableTo("Animal", "Dog")).toBe(false);
  });

  it("validates method calls with correct arg types", () => {
    const mover = parseTweedle(`class Mover {
      void moveTo(DecimalNumber x, DecimalNumber y) {}
    }`);
    const env = createTypeEnvironment([mover]);

    const result = env.checkMethodCall("Mover", "moveTo", ["DecimalNumber", "DecimalNumber"]);
    expect(result.valid).toBe(true);
  });

  it("rejects method calls on unknown class", () => {
    const env = createTypeEnvironment([]);
    const result = env.checkMethodCall("Ghost", "haunt", []);
    expect(result.valid).toBe(false);
    expect(result.errors[0]).toContain("Unknown class");
  });

  it("resolves dotted method chains", () => {
    const camera = parseTweedle(`class Camera {
      void turn(DecimalNumber amount) {}
    }`);
    const scene = parseTweedle(`class Scene {
      Camera getCamera() {
        return new Camera();
      }
    }`);
    const director = parseTweedle(`class Director {
      Scene getScene() {
        return new Scene();
      }
    }`);
    const env = createTypeEnvironment([camera, scene, director]);

    const result = env.resolveMethodChain("Director", [
      { methodName: "getScene", argTypes: [] },
      { methodName: "getCamera", argTypes: [] },
      { methodName: "turn", argTypes: ["DecimalNumber"] },
    ]);

    expect(result.valid).toBe(true);
    expect(result.steps).toHaveLength(3);
    expect(result.steps[0].className).toBe("Director");
    expect(result.steps[1].className).toBe("Scene");
    expect(result.steps[2].className).toBe("Camera");
    expect(result.finalType).toBe("void");
  });
});

describe("compileTweedleSource", () => {
  it("combines parsing and type checking", () => {
    const result = compileTweedleSource(`class Vehicle {
      void drive() {}
    }`);

    expect(result.success).toBe(true);
    expect(result.classes).toHaveLength(1);
    expect(result.typeEnvironment).not.toBeNull();
    expect(result.diagnostics).toHaveLength(0);
  });

  it("returns diagnostics for parse failures", () => {
    const result = compileTweedleSource(`class Broken {
      void drive( {
      }
    }`);

    expect(result.success).toBe(false);
    expect(result.typeEnvironment).toBeNull();
    expect(result.diagnostics).toHaveLength(1);
    expect(result.diagnostics[0].severity).toBe("error");
    expect(result.diagnostics[0].location.line).toBeGreaterThan(0);
  });
});
