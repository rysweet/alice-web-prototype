import JSZip from "jszip";
import { indexNodes, getProjectName } from "./dom.js";
import { extractBoundingBoxes, extractJointHierarchy, extractTextureRefs } from "./resources.js";
import { extractImportedProjectAssets, extractMethods, extractSceneObjects, extractTypes } from "./scene.js";
import {
  attachA3PSource,
  DEFAULT_A3P_XML_ENTRY,
  LEGACY_A3P_XML_ENTRY,
  snapshotAliceProject,
  type AliceProject,
} from "./types.js";
import {
  A3PArchiveLimitError,
  assertA3PArchiveBytes,
  assertA3PXmlTextSize,
  createA3PArchiveReadBudget,
  normalizeA3PParseLimits,
  readA3PZipEntryBytes,
  type A3PArchiveReadBudget,
  type A3PParseOptions,
} from "./limits.js";

export {
  A3PArchiveLimitError,
  DEFAULT_A3P_PARSE_LIMITS,
  type A3PArchiveLimitKind,
  type A3PParseLimits,
  type A3PParseOptions,
} from "./limits.js";

export async function parseA3P(
  data: ArrayBuffer | Uint8Array,
  options: A3PParseOptions = {},
): Promise<AliceProject> {
  const limits = normalizeA3PParseLimits(options);
  assertA3PArchiveBytes(data, limits);

  try {
    const zip = await JSZip.loadAsync(data);
    return parseA3PFromZip(zip, { limits });
  } catch (error) {
    if (error instanceof A3PArchiveLimitError) {
      throw error;
    }
    throw new Error("Failed to parse .a3p archive: corrupted ZIP data", {
      cause: error instanceof Error ? error : undefined,
    });
  }
}

export async function parseA3PFromZip(
  zip: JSZip,
  options: A3PParseOptions = {},
): Promise<AliceProject> {
  const limits = normalizeA3PParseLimits(options);
  const budget = createA3PArchiveReadBudget(zip, limits);

  await ensureNodeXml();
  const version = await readTextFile(zip, "version.txt", budget);
  const xmlEntry = await readA3PXmlEntryFromBudget(zip, budget);
  const doc = parseXmlString(xmlEntry.text);
  const nodeIndex = indexNodes(doc.documentElement);

  const project: AliceProject = {
    version: version.trim(),
    projectName: getProjectName(doc),
    sceneObjects: extractSceneObjects(nodeIndex.namedUserTypes, nodeIndex.keyMap),
    methods: extractMethods(nodeIndex.userMethods, nodeIndex.keyMap, { includeMain: false }),
    types: extractTypes(nodeIndex.namedUserTypes, nodeIndex.keyMap),
    jointHierarchy: extractJointHierarchy(nodeIndex.jointImplementations),
    boundingBoxes: extractBoundingBoxes(nodeIndex.modelResourceInfos),
    textureRefs: extractTextureRefs(nodeIndex.textureReferences, zip),
    importedAssets: extractImportedProjectAssets(doc),
  };

  attachA3PSource(project, {
    zip,
    xmlEntryName: xmlEntry.name,
    xmlText: xmlEntry.text,
    snapshot: snapshotAliceProject(project),
  });

  return project;
}

async function readTextFile(
  zip: JSZip,
  name: string,
  budget: A3PArchiveReadBudget,
): Promise<string> {
  const raw = await readA3PZipEntryBytes(zip, name, budget);
  if (!raw) return "";
  return new TextDecoder("utf-8").decode(raw);
}

export async function readA3PXmlEntry(
  zip: JSZip,
  options: A3PParseOptions = {},
): Promise<{ name: string; text: string }> {
  const limits = normalizeA3PParseLimits(options);
  const budget = createA3PArchiveReadBudget(zip, limits);
  return readA3PXmlEntryFromBudget(zip, budget);
}

async function readA3PXmlEntryFromBudget(
  zip: JSZip,
  budget: A3PArchiveReadBudget,
): Promise<{ name: string; text: string }> {
  const entryName = zip.file(DEFAULT_A3P_XML_ENTRY)
    ? DEFAULT_A3P_XML_ENTRY
    : zip.file(LEGACY_A3P_XML_ENTRY)
      ? LEGACY_A3P_XML_ENTRY
      : null;

  if (!entryName) {
    throw new Error(`No ${DEFAULT_A3P_XML_ENTRY} or ${LEGACY_A3P_XML_ENTRY} found in .a3p archive`);
  }

  const raw = await readA3PZipEntryBytes(zip, entryName, budget, {
    maxBytes: budget.limits.maxXmlTextBytes,
    createMaxBytesError: createXmlTextLimitError,
  });
  if (!raw) {
    throw new Error(`No ${DEFAULT_A3P_XML_ENTRY} or ${LEGACY_A3P_XML_ENTRY} found in .a3p archive`);
  }

  assertA3PXmlTextSize(entryName, raw.length, budget.limits);
  const text = decodeXmlBytes(raw);
  assertA3PXmlTextSize(entryName, text.length, budget.limits, "characters");
  return { name: entryName, text };
}

function createXmlTextLimitError(path: string, size: number, maxBytes: number): A3PArchiveLimitError {
  return new A3PArchiveLimitError(
    "xml-text-bytes",
    `A3P XML text size for ${path} is ${size} bytes and exceeds ${maxBytes} byte limit.`,
  );
}

function decodeXmlBytes(raw: Uint8Array): string {
  if (raw.length >= 2) {
    if (raw[0] === 0xfe && raw[1] === 0xff) {
      return decodeUtf16(raw, true);
    }
    if (raw[0] === 0xff && raw[1] === 0xfe) {
      return decodeUtf16(raw, false);
    }
    if (raw[0] === 0x00 || raw[1] === 0x00) {
      return decodeUtf16(raw, raw[0] === 0x00);
    }
  }

  return new TextDecoder("utf-8").decode(raw);
}

function decodeUtf16(bytes: Uint8Array, bigEndian: boolean): string {
  const label = bigEndian ? "utf-16be" : "utf-16le";
  return new TextDecoder(label).decode(bytes);
}

function parseXmlString(xml: string): Document {
  if (typeof globalThis.DOMParser !== "undefined") {
    return new globalThis.DOMParser().parseFromString(xml, "application/xml");
  }
  if (!_xmlDomParser) {
    throw new Error("Call initNodeXml() before parseXmlString in Node.js");
  }
  return _xmlDomParser.parseFromString(xml, "application/xml");
}

let _xmlDomParser: InstanceType<typeof DOMParser> | null = null;

async function ensureNodeXml(): Promise<void> {
  if (typeof globalThis.DOMParser !== "undefined") return;
  if (_xmlDomParser) return;
  const mod = await import("@xmldom/xmldom");
  _xmlDomParser = new (mod.DOMParser as unknown as typeof DOMParser)();
}
