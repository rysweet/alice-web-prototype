import { describe, expect, it } from "vitest";
import * as PublicApi from "../src/index.js";
import { DoInOrderExecutor } from "../src/control-flow.js";
import { ExpressionEvaluator } from "../src/expression-evaluator.js";
import { ArithmeticExpression } from "../src/expression-types.js";
import { StatementExecutor } from "../src/statement-executor.js";
import { SColor } from "../src/standard-classes.js";
import { VirtualMachine } from "../src/virtual-machine.js";
import * as SceneRenderer from "../src/scene-renderer.js";
import * as RenderAnimation from "../src/render-animation.js";
import * as RenderMesh from "../src/render-mesh.js";

describe("index barrel", () => {
  it("re-exports the low-level infrastructure modules under stable namespace names", () => {
    expect(PublicApi.ControlFlow.DoInOrderExecutor).toBe(DoInOrderExecutor);
    expect(PublicApi.ExpressionEvaluator.ExpressionEvaluator).toBe(ExpressionEvaluator);
    expect(PublicApi.ExpressionTypes.ArithmeticExpression).toBe(ArithmeticExpression);
    expect(PublicApi.StatementExecutor.StatementExecutor).toBe(StatementExecutor);
    expect(PublicApi.StandardClasses.SColor).toBe(SColor);
    expect(PublicApi.VirtualMachine.VirtualMachine).toBe(VirtualMachine);
    expect(PublicApi.SceneRenderer.renderSceneToPng).toBe(SceneRenderer.renderSceneToPng);
    expect(PublicApi.RenderAnimation.AnimationStateMachine).toBe(RenderAnimation.AnimationStateMachine);
    expect(PublicApi.RenderAnimation.sampleAnimationMarkers).toBe(RenderAnimation.sampleAnimationMarkers);
    expect(PublicApi.RenderMesh.MeshBuilder).toBe(RenderMesh.MeshBuilder);
  });

  it("keeps distinct namespaces for renderer and VM surfaces", () => {
    expect(Object.keys(PublicApi.SceneRenderer)).toContain("renderSceneToPng");
    expect(Object.keys(PublicApi.VirtualMachine)).toContain("VirtualMachine");
    expect(Object.keys(PublicApi.ControlFlow)).toContain("DoInOrderExecutor");
    expect(Object.keys(PublicApi.ExpressionTypes)).toContain("ArithmeticExpression");
    expect(Object.keys(PublicApi.StandardClasses)).toContain("SColor");
    expect(Object.keys(PublicApi.RenderAnimation)).toContain("renderAnimationFrame");
    expect(Object.keys(PublicApi.RenderAnimation)).toContain("sampleAnimationMarkers");
    expect(Object.keys(PublicApi.RenderMesh)).toContain("createBoxMesh");
    expect(PublicApi.SceneRenderer).not.toBe(PublicApi.VirtualMachine);
  });
});
