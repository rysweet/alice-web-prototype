import { describe, expect, it } from "vitest";
import * as PublicApi from "../src/index.js";
import { ExpressionEvaluator } from "../src/expression-evaluator.js";
import { StatementExecutor } from "../src/statement-executor.js";
import { VirtualMachine } from "../src/virtual-machine.js";
import * as SceneRenderer from "../src/scene-renderer.js";
import * as RenderMesh from "../src/render-mesh.js";

describe("index barrel", () => {
  it("re-exports the low-level infrastructure modules under stable namespace names", () => {
    expect(PublicApi.ExpressionEvaluator.ExpressionEvaluator).toBe(ExpressionEvaluator);
    expect(PublicApi.StatementExecutor.StatementExecutor).toBe(StatementExecutor);
    expect(PublicApi.VirtualMachine.VirtualMachine).toBe(VirtualMachine);
    expect(PublicApi.SceneRenderer.renderSceneToPng).toBe(SceneRenderer.renderSceneToPng);
    expect(PublicApi.RenderMesh.MeshBuilder).toBe(RenderMesh.MeshBuilder);
  });

  it("keeps distinct namespaces for renderer and VM surfaces", () => {
    expect(Object.keys(PublicApi.SceneRenderer)).toContain("renderSceneToPng");
    expect(Object.keys(PublicApi.VirtualMachine)).toContain("VirtualMachine");
    expect(Object.keys(PublicApi.RenderMesh)).toContain("createBoxMesh");
    expect(PublicApi.SceneRenderer).not.toBe(PublicApi.VirtualMachine);
  });
});
