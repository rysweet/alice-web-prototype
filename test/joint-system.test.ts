import { describe, expect, it } from "vitest";
import { SBiped } from "../src/biped-quadruped.js";
import {
  JointChain,
  JointId,
  JointVisualizer,
  createJointedModelResource,
} from "../src/joint-system.js";

describe("joint-system", () => {
  it("tracks hierarchical joint identifiers with parent chains", () => {
    const root = new JointId("ROOT");
    const shoulder = root.child("LEFT_SHOULDER");
    const hand = shoulder.child("LEFT_HAND");

    expect(hand.path).toEqual(["ROOT", "LEFT_SHOULDER", "LEFT_HAND"]);
    expect(root.isAncestorOf(hand)).toBe(true);
    expect(shoulder.toStoryApiJointId()).toEqual({ name: "LEFT_SHOULDER", parent: "ROOT" });
  });

  it("solves simple chains with FABRIK and CCD helpers", () => {
    const resource = createJointedModelResource("arm", [
      {
        name: "ROOT",
        parentName: null,
        localTransform: { position: { x: 0, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
        children: [
          {
            name: "ELBOW",
            parentName: "ROOT",
            localTransform: { position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
            children: [
              {
                name: "HAND",
                parentName: "ELBOW",
                localTransform: { position: { x: 1, y: 0, z: 0 }, orientation: { x: 0, y: 0, z: 0, w: 1 } },
                children: [],
              },
            ],
          },
        ],
      },
    ]);
    const chain = resource.createChain("ROOT", "ELBOW", "HAND");
    const target = { x: 1.5, y: 1.2, z: 0 };

    const fabrikDistance = chain.solveFabrik(target, 12, 1e-4);
    expect(fabrikDistance).toBeLessThan(0.01);
    expect(chain.endEffectorDistanceTo(target)).toBeLessThan(0.01);

    const ccdDistance = chain.solveCcd({ x: 1.4, y: 1.1, z: 0 }, 12, 1e-4);
    expect(ccdDistance).toBeLessThan(0.05);
    expect(chain.endEffector.worldPosition.y).toBeGreaterThan(0.5);
  });

  it("builds bind-pose resources and visualization segments from jointed models", () => {
    const biped = new SBiped("Hero");
    const visualizer = new JointVisualizer(biped, "Hero");
    const segments = visualizer.buildSegments();

    expect(biped.resource.listJointIds().map((joint) => joint.name)).toContain("LEFT_HAND");
    expect(segments.length).toBeGreaterThan(10);
    expect(segments.some((segment) => segment.joint.name === "LEFT_HAND")).toBe(true);
  });
});
