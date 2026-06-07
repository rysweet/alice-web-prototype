import { DEFAULT_A3P_XML_ENTRY, LEGACY_A3P_XML_ENTRY } from "../a3p-parser.js";
import { assertSafeWritablePath } from "./path-security.js";
import { ORIGINAL_XML_RESOURCE_PATH } from "./types.js";

export interface OriginalXmlSelection {
  entryName: string;
  xmlText: string;
}

const encoder = new TextEncoder();
const decoder = new TextDecoder();

export function encodeOriginalXml(selection: OriginalXmlSelection): Uint8Array {
  const entryName = assertSafeWritablePath(selection.entryName);
  return encoder.encode(`<!-- ${entryName} -->\n${selection.xmlText}`);
}

export function decodeOriginalXml(bytes: Uint8Array): OriginalXmlSelection {
  const stored = decoder.decode(bytes);
  const match = stored.match(/^<!--\s+([^>]+?)\s+-->\n/);
  if (!match) {
    return {
      entryName: DEFAULT_A3P_XML_ENTRY,
      xmlText: stored,
    };
  }

  return {
    entryName: assertSafeWritablePath(match[1].trim()),
    xmlText: stored.slice(match[0].length),
  };
}

export function selectOriginalXmlForWrite(
  resources: Map<string, Uint8Array>,
): OriginalXmlSelection | null {
  const storedOriginalXml = resources.get(ORIGINAL_XML_RESOURCE_PATH);
  if (storedOriginalXml) {
    return decodeOriginalXml(storedOriginalXml);
  }

  const explicitProgramTypeXml = resources.get(DEFAULT_A3P_XML_ENTRY);
  if (explicitProgramTypeXml) {
    return {
      entryName: DEFAULT_A3P_XML_ENTRY,
      xmlText: decoder.decode(explicitProgramTypeXml),
    };
  }

  const explicitLegacyXml = resources.get(LEGACY_A3P_XML_ENTRY);
  if (explicitLegacyXml) {
    return {
      entryName: LEGACY_A3P_XML_ENTRY,
      xmlText: decoder.decode(explicitLegacyXml),
    };
  }

  return null;
}
