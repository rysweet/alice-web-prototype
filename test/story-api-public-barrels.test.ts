import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import * as ts from "typescript";
import * as StoryApiDirectory from "../src/story-api";
import * as StoryApiIndex from "../src/story-api/index.js";
import type { AliceProject } from "../src/a3p-parser";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootBarrelPath = resolve(repoRoot, "src/index.ts");
const storyApiBarrelPath = resolve(repoRoot, "src/story-api/index.ts");
const storyApiWorldPath = resolve(repoRoot, "src/story-api/world.ts");

const STORY_API_BARREL_MODULES = [
  "./entities",
  "./implementation",
  "./scene",
  "./types",
  "./world",
];

const WORLD_ALLOWED_RUNTIME_IMPORTS = [
  "./entities",
  "./scene",
  "./types",
];

const STORY_WORLD_TYPE_EXPORTS = [
  "StoryEntitySummary",
  "StoryWorldSummary",
];

const STORY_WORLD_VALUE_EXPORTS = [
  "STORY_API_MODULES",
  "buildStoryWorld",
  "collectStoryWorldDiagnostics",
  "compareStoryWorlds",
  "countStoryApiUserTypes",
  "createDefaultStoryTransform",
  "createStorySceneSnapshot",
  "describeStoryEntities",
  "describeStoryScene",
  "describeStoryWorld",
  "getStoryWorldMethodNames",
  "hasStoryWorldEntities",
  "listStoryApiModules",
  "listStoryWorldEntityNames",
  "projectCanBuildStoryWorld",
  "projectUsesStoryApiType",
  "requireStoryWorld",
  "summarizeSceneEntities",
  "summarizeStoryWorld",
  "summarizeStoryWorldMethods",
];

const PUBLIC_STORY_API_EXPORTS = [
  "ActivationListener",
  "AxesImp",
  "BillboardImp",
  "BindingSyncDirection",
  "BooleanProperty",
  "BoundingBox",
  "BoxImp",
  "CameraImp",
  "CameraMarkerImp",
  "ConeImp",
  "CylinderImp",
  "DiscImp",
  "EntityDiagnostics",
  "EntityImp",
  "EntityImpFactory",
  "EntityMarker",
  "GroundImp",
  "IDENTITY_ORIENTATION",
  "ImplementableEntity",
  "JointId",
  "JointImp",
  "JointNode",
  "JointedModelImp",
  "MarkerImp",
  "ModelImp",
  "MoveDirection",
  "NamedEntityImpFactory",
  "NumberProperty",
  "ObjectMarkerImp",
  "Orientation",
  "OrientationProperty",
  "Position",
  "PositionProperty",
  "ProgramImp",
  "Property",
  "PropertyChange",
  "PropertyChangeSummary",
  "PropertyChangeTimelineEntry",
  "PropertyListener",
  "PropertyOptions",
  "PropertyOwnerImp",
  "ReferenceProperty",
  "RollDirection",
  "SAxes",
  "SBillboard",
  "SBiped",
  "SBox",
  "SCamera",
  "SCameraMarker",
  "SCone",
  "SCylinder",
  "SDisc",
  "SFlyer",
  "SGround",
  "SJoint",
  "SJointedModel",
  "SMarker",
  "SModel",
  "SMovableTurnable",
  "SProgram",
  "SProp",
  "SQuadruped",
  "SScene",
  "SSceneListenerDispatch",
  "SShape",
  "SSlitherer",
  "SSphere",
  "SSun",
  "SSwimmer",
  "STORY_API_DEFAULTS",
  "STORY_API_MODULES",
  "STarget",
  "STextModel",
  "SThing",
  "SThingMarker",
  "STorus",
  "STransport",
  "STurnable",
  "SVRHand",
  "SVRHeadset",
  "SVRUser",
  "Scene",
  "SceneActivationController",
  "SceneActivationListener",
  "SceneEnvironmentOptions",
  "SceneImp",
  "SceneLifecycleHost",
  "SceneLifecycleSummary",
  "SceneSnapshot",
  "ShapeImp",
  "Size",
  "SizeProperty",
  "SpatialRelation",
  "SpeechBubbleState",
  "SphereImp",
  "StoryEntitySummary",
  "StoryWorldSummary",
  "StringProperty",
  "SunImp",
  "TargetImp",
  "TextBubbleEntity",
  "TextModelImp",
  "TorusImp",
  "TransformSnapshot",
  "TransformableImp",
  "TurnDirection",
  "UNIT_SIZE",
  "Vec3",
  "ZERO_POSITION",
  "activateScene",
  "applySceneEnvironment",
  "assertSceneHasProgram",
  "assertSceneIsActive",
  "boundingBoxCenter",
  "boundingBoxContains",
  "boundingBoxSize",
  "boundingBoxesIntersect",
  "buildStoryWorld",
  "centerBoundingBox",
  "clearSceneEnvironment",
  "cloneBoundingBox",
  "cloneBoundingBoxValue",
  "cloneJointHierarchy",
  "cloneOrientation",
  "clonePosition",
  "cloneSize",
  "cloneSpeechBubbleState",
  "cloneTextBubbleEntity",
  "collectEntityDiagnostics",
  "collectStoryWorldDiagnostics",
  "combineBoundingBoxes",
  "compareStoryWorlds",
  "copySceneEnvironment",
  "countStoryApiUserTypes",
  "createBoundingBox",
  "createDefaultStoryTransform",
  "createDefaultTransform",
  "createEntityForType",
  "createJointId",
  "createOrientation",
  "createPosition",
  "createPropertyChangeTimeline",
  "createSceneFromProject",
  "createSize",
  "createSpeechBubbleState",
  "createStorySceneSnapshot",
  "createTextBubbleEntity",
  "describeEntity",
  "describeScene",
  "describeSceneLifecycle",
  "describeSpeechBubble",
  "describeStoryEntities",
  "describeStoryScene",
  "describeStoryWorld",
  "distinctPropertyValues",
  "expandBoundingBox",
  "findJointNode",
  "flattenJointHierarchy",
  "getEntityBoundingBox",
  "getInitialPropertyValue",
  "getJointCount",
  "getJointHierarchySummary",
  "getJointPath",
  "getLatestPropertyValue",
  "getSceneLifecycleState",
  "getSharedJointNames",
  "getSpeechBubbleSummary",
  "getSpeechBubbleText",
  "getStoryWorldMethodNames",
  "hasEntityBoundingBox",
  "hasJoint",
  "hasStoryWorldEntities",
  "invertBindingSyncDirection",
  "invertSpatialRelation",
  "isBindingSyncDirection",
  "isBoundingBox",
  "isJointId",
  "isJointNode",
  "isMoveDirection",
  "isOrientation",
  "isPosition",
  "isRollDirection",
  "isSize",
  "isSpatialRelation",
  "isSpeechBubbleState",
  "isTextBubbleEntity",
  "isTurnDirection",
  "listJointNames",
  "listJointNamesMatching",
  "listJointNodes",
  "listLeafJointNames",
  "listSceneEntities",
  "listSpatialRelations",
  "listStoryApiModules",
  "listStoryWorldEntityNames",
  "mergeBoundingBoxes",
  "mergePropertyChangeSummaries",
  "normalizeSceneEnvironment",
  "offsetBoundingBox",
  "orientationsEqual",
  "parseBindingSyncDirection",
  "parseMoveDirection",
  "parseRollDirection",
  "parseSpatialRelation",
  "parseTurnDirection",
  "populateSceneFromProject",
  "positionsEqual",
  "projectCanBuildStoryWorld",
  "projectUsesStoryApiType",
  "propertyChanged",
  "removeSceneEntities",
  "renameEntity",
  "requireEntityName",
  "requireSceneEntity",
  "requireStoryWorld",
  "sceneContainsEntity",
  "sizesEqual",
  "snapshotScene",
  "speechBubbleEquals",
  "speechBubbleStatesEqual",
  "summarizeJointHierarchy",
  "summarizePropertyChanges",
  "summarizeSceneEntities",
  "summarizeSceneLifecycle",
  "summarizeStoryWorld",
  "summarizeStoryWorldMethods",
  "textBubbleEntitiesEqual",
  "translateBoundingBox",
  "upsertSceneEntity",
];

const emptyProject = (projectName = "EmptyStory"): AliceProject => ({
  version: "3.6",
  projectName,
  sceneObjects: [],
  methods: [],
});

const parseSource = (source: string, fileName: string): ts.SourceFile =>
  ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);

const statementText = (sourceFile: ts.SourceFile, statement: ts.Statement): string =>
  statement.getText(sourceFile).replace(/\s+/g, " ");

const readParsedSource = async (path: string): Promise<ts.SourceFile> =>
  parseSource(await readFile(path, "utf8"), path);

const isStringModuleSpecifier = (moduleSpecifier: ts.Expression | undefined): moduleSpecifier is ts.StringLiteral =>
  moduleSpecifier !== undefined && ts.isStringLiteral(moduleSpecifier);

const getExportModuleSpecifiers = (sourceFile: ts.SourceFile): string[] =>
  sourceFile.statements
    .filter(ts.isExportDeclaration)
    .map((statement) => statement.moduleSpecifier)
    .filter(isStringModuleSpecifier)
    .map((moduleSpecifier) => moduleSpecifier.text);

const assertExportOnlyBarrel = (sourceFile: ts.SourceFile): void => {
  const nonBarrelStatements = sourceFile.statements.filter((statement) =>
    !(ts.isExportDeclaration(statement) && statement.moduleSpecifier),
  );

  expect(
    nonBarrelStatements.map((statement) => statementText(sourceFile, statement)),
    `${sourceFile.fileName} must contain only export-from declarations`,
  ).toEqual([]);
};

const hasNamespaceReExport = (
  sourceFile: ts.SourceFile,
  namespaceName: string,
  moduleSpecifier: string,
): boolean =>
  sourceFile.statements.some((statement) =>
    ts.isExportDeclaration(statement)
    && statement.moduleSpecifier !== undefined
    && ts.isStringLiteral(statement.moduleSpecifier)
    && statement.moduleSpecifier.text === moduleSpecifier
    && statement.exportClause !== undefined
    && ts.isNamespaceExport(statement.exportClause)
    && statement.exportClause.name.text === namespaceName,
  );

const hasExportModifier = (node: ts.Node): boolean =>
  Boolean(ts.canHaveModifiers(node) && ts.getModifiers(node)?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));

const getExportedDeclarationNames = (sourceFile: ts.SourceFile): string[] => {
  const names: string[] = [];

  for (const statement of sourceFile.statements) {
    if (!hasExportModifier(statement)) {
      continue;
    }

    if (
      (ts.isFunctionDeclaration(statement)
        || ts.isInterfaceDeclaration(statement)
        || ts.isTypeAliasDeclaration(statement)
        || ts.isClassDeclaration(statement)
        || ts.isEnumDeclaration(statement))
      && statement.name
    ) {
      names.push(statement.name.text);
    }

    if (ts.isVariableStatement(statement)) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) {
          names.push(declaration.name.text);
        }
      }
    }
  }

  return names.sort();
};

const getImportDeclarations = (sourceFile: ts.SourceFile): Array<{ readonly specifier: string; readonly typeOnly: boolean }> =>
  sourceFile.statements
    .filter(ts.isImportDeclaration)
    .map((statement) => ({
      specifier: ts.isStringLiteral(statement.moduleSpecifier) ? statement.moduleSpecifier.text : "",
      typeOnly: statement.importClause?.isTypeOnly ?? false,
    }));

const getTypeScriptExportNames = (modulePath: string): string[] => {
  const configPath = ts.findConfigFile(repoRoot, ts.sys.fileExists, "tsconfig.json");
  if (!configPath) {
    throw new Error("tsconfig.json not found");
  }

  const configFile = ts.readConfigFile(configPath, ts.sys.readFile);
  const parsedConfig = ts.parseJsonConfigFileContent(configFile.config, ts.sys, repoRoot);
  const program = ts.createProgram(parsedConfig.fileNames, parsedConfig.options);
  const checker = program.getTypeChecker();
  const source = program.getSourceFile(modulePath);
  if (!source) {
    throw new Error(`${modulePath} was not included in the TypeScript program`);
  }

  const moduleSymbol = checker.getSymbolAtLocation(source);
  if (!moduleSymbol) {
    throw new Error(`${modulePath} does not have a module symbol`);
  }

  return checker.getExportsOfModule(moduleSymbol)
    .map((symbol) => symbol.getName())
    .sort();
};

const sortedValueExports = (moduleNamespace: Record<string, unknown>): string[] =>
  Object.keys(moduleNamespace).sort();

describe("Story API public barrel source topology", () => {
  it("keeps src/index.ts as an export-only root barrel with the StoryApi namespace", async () => {
    const sourceFile = await readParsedSource(rootBarrelPath);

    assertExportOnlyBarrel(sourceFile);
    expect(hasNamespaceReExport(sourceFile, "StoryApi", "./story-api")).toBe(true);
  });

  it("keeps src/story-api/index.ts as an export-only barrel", async () => {
    const sourceFile = await readParsedSource(storyApiBarrelPath);

    assertExportOnlyBarrel(sourceFile);
  });

  it("re-exports all Story API implementation modules from the story-api barrel", async () => {
    const sourceFile = await readParsedSource(storyApiBarrelPath);

    expect(getExportModuleSpecifiers(sourceFile).sort()).toEqual([...STORY_API_BARREL_MODULES].sort());
  });

  it("moves story-world helpers into src/story-api/world.ts", async () => {
    expect(existsSync(storyApiWorldPath)).toBe(true);

    const sourceFile = await readParsedSource(storyApiWorldPath);
    expect(getExportedDeclarationNames(sourceFile)).toEqual(
      expect.arrayContaining([...STORY_WORLD_TYPE_EXPORTS, ...STORY_WORLD_VALUE_EXPORTS].sort()),
    );
  });

  it("keeps world helper implementations independent from public barrels", async () => {
    expect(existsSync(storyApiWorldPath)).toBe(true);

    const sourceFile = await readParsedSource(storyApiWorldPath);
    const imports = getImportDeclarations(sourceFile);
    const publicBarrelImports = imports
      .map((declaration) => declaration.specifier)
      .filter((specifier) =>
        specifier === "."
        || specifier === "./index"
        || specifier === "../index"
        || specifier === "../story-api"
        || specifier === "../story-api/index",
      );
    const disallowedRuntimeImports = imports
      .filter((declaration) => !declaration.typeOnly)
      .map((declaration) => declaration.specifier)
      .filter((specifier) => specifier.startsWith(".") && !WORLD_ALLOWED_RUNTIME_IMPORTS.includes(specifier));

    expect(publicBarrelImports).toEqual([]);
    expect(disallowedRuntimeImports).toEqual([]);
  });
});

describe("Story API public export contract", () => {
  it("preserves the captured TypeScript public export names", () => {
    expect(getTypeScriptExportNames(storyApiBarrelPath)).toEqual(PUBLIC_STORY_API_EXPORTS);
  }, 30000);

  it("keeps directory and index import value surfaces aligned", () => {
    expect(sortedValueExports(StoryApiDirectory)).toEqual(sortedValueExports(StoryApiIndex));
  });

  it("keeps the root StoryApi namespace aligned with direct Story API imports", async () => {
    const rootModule = await import("../src/index.js");

    expect(sortedValueExports(rootModule.StoryApi)).toEqual(sortedValueExports(StoryApiIndex));
  }, 30000);

  it("continues exposing story-world helpers from all public Story API import paths", async () => {
    const rootModule = await import("../src/index.js");

    for (const exportName of STORY_WORLD_VALUE_EXPORTS) {
      expect(StoryApiDirectory).toHaveProperty(exportName);
      expect(StoryApiIndex).toHaveProperty(exportName);
      expect(rootModule.StoryApi).toHaveProperty(exportName);
    }
  }, 30000);
});

describe("Story API helper behavior contract", () => {
  it("builds and summarizes an empty story world without changing helper output shape", () => {
    const project = emptyProject("NoObjects");
    const { scene, summary } = StoryApiDirectory.buildStoryWorld(project);

    expect(scene).toBeInstanceOf(StoryApiIndex.Scene);
    expect(summary).toMatchObject({
      projectName: "NoObjects",
      objectCount: 0,
      methodCount: 0,
      entityNames: [],
    });
    expect(summary.snapshot.entityNames).toEqual([]);
    expect(summary.snapshot.entityTypes).toEqual({});
  });

  it("keeps empty method summaries explicit", () => {
    expect(StoryApiIndex.summarizeStoryWorldMethods(emptyProject())).toBe("<no methods>");
  });

  it("keeps story-world validation and error handling stable", () => {
    const invalidProject = {
      version: "3.6",
      projectName: "Invalid",
      sceneObjects: null,
      methods: [],
    } as unknown as AliceProject;

    expect(StoryApiIndex.projectCanBuildStoryWorld(invalidProject)).toBe(false);
    expect(() => StoryApiIndex.requireStoryWorld(invalidProject)).toThrow(TypeError);
    expect(() => StoryApiIndex.requireStoryWorld(invalidProject)).toThrow(
      "project does not have the data needed to build a story world",
    );
  });

  it("compares story worlds by public summary fields only", () => {
    const left = emptyProject("Before");
    const right: AliceProject = {
      ...emptyProject("After"),
      methods: [{ name: "setupScene", isFunction: false, returnType: "void", parameters: [], statements: [] }],
    };

    expect(StoryApiIndex.compareStoryWorlds(left, right)).toEqual({
      projectNameChanged: true,
      objectCountDelta: 0,
      methodCountDelta: 1,
    });
  });
});
