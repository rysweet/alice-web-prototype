import { describe, expect, it } from "vitest";
import { DEFAULT_A3P_XML_ENTRY, LEGACY_A3P_XML_ENTRY } from "../a3p-parser.js";
import { ProjectIoError } from "../project-io.js";
import {
  decodeOriginalXml,
  encodeOriginalXml,
  selectOriginalXmlForWrite,
} from "./xml-pass-through.js";

const encoder = new TextEncoder();

function expectUnsafe(action: () => unknown): void {
  try {
    action();
  } catch (error) {
    expect(error).toBeInstanceOf(ProjectIoError);
    expect((error as ProjectIoError).code).toBe("unsafe-path");
    return;
  }
  throw new Error("Expected unsafe XML entry rejection");
}

describe("project-io/xml-pass-through", () => {
  it("encodes and decodes the original XML entry name with the XML text", () => {
    const encoded = encodeOriginalXml({
      entryName: LEGACY_A3P_XML_ENTRY,
      xmlText: "<node><property name=\"name\" /></node>",
    });

    expect(decodeOriginalXml(encoded)).toEqual({
      entryName: LEGACY_A3P_XML_ENTRY,
      xmlText: "<node><property name=\"name\" /></node>",
    });
  });

  it("defaults unmarked legacy resource bytes to programType.xml", () => {
    expect(decodeOriginalXml(encoder.encode("<node />"))).toEqual({
      entryName: DEFAULT_A3P_XML_ENTRY,
      xmlText: "<node />",
    });
  });

  it("selects explicit XML resources when the internal marker is absent", () => {
    const selected = selectOriginalXmlForWrite(new Map([
      [LEGACY_A3P_XML_ENTRY, encoder.encode("<legacy />")],
      [DEFAULT_A3P_XML_ENTRY, encoder.encode("<current />")],
    ]));

    expect(selected).toEqual({
      entryName: DEFAULT_A3P_XML_ENTRY,
      xmlText: "<current />",
    });
  });

  it("preserves program.xml when the marker records a legacy XML entry", () => {
    const selected = selectOriginalXmlForWrite(new Map([
      ["__original_xml__", encodeOriginalXml({
        entryName: LEGACY_A3P_XML_ENTRY,
        xmlText: "<legacy />",
      })],
    ]));

    expect(selected).toEqual({
      entryName: LEGACY_A3P_XML_ENTRY,
      xmlText: "<legacy />",
    });
  });

  it("rejects unsafe restored XML entry names from untrusted marker metadata", () => {
    expectUnsafe(() => decodeOriginalXml(encoder.encode("<!-- ../programType.xml -->\n<node />")));
    expectUnsafe(() => decodeOriginalXml(encoder.encode("<!-- C:/programType.xml -->\n<node />")));
  });
});
