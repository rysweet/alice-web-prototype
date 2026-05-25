import { describe, expect, it } from "vitest";
import {
  getContextualHelp,
  getHelpTopic,
  listHelpTopics,
  searchHelpTopics,
} from "../src/help-system.js";

describe("help-system", () => {
  it("lists stable contextual help topics", () => {
    const topics = listHelpTopics();

    expect(topics.length).toBeGreaterThanOrEqual(8);
    expect(topics.some((topic) => topic.id === "code-editor")).toBe(true);
    expect(topics.some((topic) => topic.id === "run-world")).toBe(true);
  });

  it("resolves direct topic ids and aliases", () => {
    expect(getHelpTopic("code-editor")?.title).toBe("Code Editor");
    expect(getHelpTopic("run-button")?.id).toBe("run-world");
  });

  it("searches by keywords and ranks the best topic first", () => {
    const matches = searchHelpTopics("collision keyboard interaction");

    expect(matches[0]?.id).toBe("events");
    expect(matches.length).toBeGreaterThan(0);
  });

  it("finds contextual help from ide element descriptors", () => {
    const fromId = getContextualHelp({ id: "scene-canvas" });
    const fromLabel = getContextualHelp({ label: "Code Editor" });
    const fromText = getContextualHelp({ text: "Browse characters and props in the asset gallery" });

    expect(fromId?.id).toBe("scene-editor");
    expect(fromLabel?.id).toBe("code-editor");
    expect(fromText?.id).toBe("gallery");
  });

  it("returns null when no contextual help matches", () => {
    expect(getContextualHelp({ text: "totally unrelated widget" })).toBeNull();
  });
});
