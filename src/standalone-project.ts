import type { AliceMethod, AliceProject, AliceStatement, AliceTypeDefinition } from "./a3p-parser.js";
import type { AliceProjectArchive } from "./project-io.js";
import { sanitizeJavaIdentifier, sanitizePackageName } from "./naming.js";

export type StandaloneBuildSystem = "maven" | "gradle" | "both";

export interface StandaloneProjectOptions {
  packageName?: string;
  buildSystem?: StandaloneBuildSystem;
  version?: string;
}

export interface StandaloneProjectResource {
  sourcePath: string;
  packagedPath: string;
  size: number;
}

export interface StandaloneJavaProject {
  projectName: string;
  packageName: string;
  mainClassName: string;
  artifactId: string;
  buildSystem: StandaloneBuildSystem;
  files: Map<string, string | Uint8Array>;
  javaSources: string[];
  resourceFiles: string[];
  buildFiles: string[];
}

const ORIGINAL_XML_MARKER = "__original_xml__";
const DEFAULT_VERSION = "1.0.0-SNAPSHOT";
const SOURCE_ROOT = "src/main/java";
const RESOURCE_ROOT = "src/main/resources";
const MAVEN_VERSION_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export function generateStandaloneJavaProject(
  archive: AliceProjectArchive,
  options: StandaloneProjectOptions = {},
): StandaloneJavaProject {
  const projectName = archive.project.projectName.trim() || "AliceProject";
  const packageName = sanitizePackageName(options.packageName ?? "org.alice.generated");
  const packagePath = packageName.replace(/\./g, "/");
  const buildSystem = options.buildSystem ?? "both";
  const version = validateMavenVersion(options.version ?? DEFAULT_VERSION);
  const artifactId = sanitizeArtifactId(projectName);
  const mainClassName = resolveMainClassName(archive.project);
  const files = new Map<string, string | Uint8Array>();
  const buildFiles: string[] = [];
  const javaSources: string[] = [];
  const resourceFiles: string[] = [];

  if (buildSystem === "maven" || buildSystem === "both") {
    buildFiles.push("pom.xml");
    files.set("pom.xml", buildPomXml({
      packageName,
      artifactId,
      version,
      mainClassName,
      projectName,
    }));
  }

  if (buildSystem === "gradle" || buildSystem === "both") {
    buildFiles.push("build.gradle", "settings.gradle");
    files.set("build.gradle", buildGradleFile({
      packageName,
      artifactId,
      version,
      mainClassName,
      projectName,
    }));
    files.set("settings.gradle", `rootProject.name = ${toJavaStringLiteral(artifactId)}\n`);
  }

  for (const source of renderJavaSources(archive.project, packageName, packagePath, mainClassName)) {
    javaSources.push(source.path);
    files.set(source.path, source.content);
  }

  const packagedResources = packageResources(archive);
  for (const resource of packagedResources) {
    const path = `${RESOURCE_ROOT}/${resource.packagedPath}`;
    resourceFiles.push(path);
    files.set(path, resource.bytes);
  }

  if (archive.manifest) {
    const manifestPath = `${RESOURCE_ROOT}/manifest.json`;
    resourceFiles.push(manifestPath);
    files.set(manifestPath, JSON.stringify(archive.manifest, null, 2));
  }

  const originalXml = archive.resources.get(ORIGINAL_XML_MARKER);
  if (originalXml) {
    const xmlPath = `${RESOURCE_ROOT}/programType.xml`;
    resourceFiles.push(xmlPath);
    files.set(xmlPath, decodeBytes(originalXml));
  }

  const descriptorPath = `${RESOURCE_ROOT}/standalone-project.json`;
  resourceFiles.push(descriptorPath);
  files.set(descriptorPath, JSON.stringify({
    projectName,
    packageName,
    mainClassName,
    artifactId,
    buildSystem,
    buildFiles,
    javaSources,
    resources: packagedResources.map((resource) => ({
      sourcePath: resource.sourcePath,
      packagedPath: resource.packagedPath,
      size: resource.bytes.length,
    } satisfies StandaloneProjectResource)),
  }, null, 2));

  return {
    projectName,
    packageName,
    mainClassName,
    artifactId,
    buildSystem,
    files,
    javaSources,
    resourceFiles,
    buildFiles,
  };
}

interface JavaSourceFile {
  path: string;
  content: string;
}

interface PackagedResource {
  sourcePath: string;
  packagedPath: string;
  bytes: Uint8Array;
}

function renderJavaSources(
  project: AliceProject,
  packageName: string,
  packagePath: string,
  mainClassName: string,
): JavaSourceFile[] {
  const types = materializeTypes(project, mainClassName);
  const uniqueTypeNames = assignUniqueTypeNames(types.map((type) => type.name));

  return types.map((type, index) => {
    const className = uniqueTypeNames[index]!;
    return {
      path: `${SOURCE_ROOT}/${packagePath}/${className}.java`,
      content: renderJavaClass({
        packageName,
        className,
        type,
        projectMethods: className === mainClassName ? project.methods : [],
        project,
      }),
    };
  });
}

function materializeTypes(project: AliceProject, mainClassName: string): AliceTypeDefinition[] {
  const sourceTypes = project.types?.length ? [...project.types] : [];
  if (!sourceTypes.some((type) => sanitizeJavaIdentifier(type.name, mainClassName) === mainClassName)) {
    sourceTypes.unshift({
      name: mainClassName,
      superTypeName: "org.lgna.story.SProgram",
      fields: [],
      methods: [],
      constructors: [],
    });
  }
  return sourceTypes;
}

function assignUniqueTypeNames(names: string[]): string[] {
  const used = new Set<string>();
  return names.map((name, index) => {
    const fallback = index === 0 ? "Program" : `GeneratedType${index}`;
    const base = sanitizeJavaIdentifier(name, fallback);
    let candidate = base;
    let suffix = 2;
    while (used.has(candidate)) {
      candidate = `${base}${suffix}`;
      suffix += 1;
    }
    used.add(candidate);
    return candidate;
  });
}

function renderJavaClass(options: {
  packageName: string;
  className: string;
  type: AliceTypeDefinition;
  projectMethods: AliceMethod[];
  project: AliceProject;
}): string {
  const { packageName, className, type, projectMethods, project } = options;
  const members: string[] = [];

  for (const field of type.fields ?? []) {
    members.push(renderField(field));
  }

  for (const constructor of type.constructors ?? []) {
    members.push(renderConstructor(className, constructor));
  }

  for (const method of type.methods ?? []) {
    members.push(renderMethod(method, { isStatic: false }));
  }

  if (projectMethods.length > 0) {
    for (const method of projectMethods) {
      members.push(renderMethod(method, { isStatic: true }));
    }
    members.push(renderProjectSummaryMethod(project));
    members.push(renderMainMethod());
  }

  if (members.length === 0) {
    members.push(`public ${className}() {}`);
  }

  const extendsClause = renderExtendsClause(type.superTypeName);
  return `package ${packageName};\n\npublic class ${className}${extendsClause} {\n${indentMembers(members)}\n}\n`;
}

function renderField(field: NonNullable<AliceTypeDefinition["fields"]>[number]): string {
  const typeName = normalizeJavaType(field?.typeName ?? null);
  const fieldName = sanitizeJavaIdentifier(field?.name ?? "field", "field");
  const initializer = defaultJavaValue(typeName);
  return `private ${typeName} ${fieldName} = ${initializer};`;
}

function renderConstructor(className: string, method: AliceMethod): string {
  const parameters = renderParameters(method.parameters);
  const body = renderMethodBody(method, normalizeJavaType(className));
  return `public ${className}(${parameters}) {\n${indentLines(body, 2)}\n}`;
}

function renderMethod(method: AliceMethod, options: { isStatic: boolean }): string {
  const returnType = method.isFunction ? normalizeJavaType(method.returnType) : "void";
  const parameters = renderParameters(method.parameters);
  const modifiers = options.isStatic ? "public static" : "public";
  const methodName = sanitizeJavaIdentifier(method.name, "method");
  const body = renderMethodBody(method, returnType);
  return `${modifiers} ${returnType} ${methodName}(${parameters}) {\n${indentLines(body, 2)}\n}`;
}

function renderMethodBody(method: AliceMethod, returnType: string): string {
  const lines = flattenStatementComments(method.statements).map((line) => `// ${line}`);
  if (lines.length === 0) {
    lines.push("// Generated from Alice project with no direct Java body translation.");
  }
  if (method.isFunction) {
    lines.push(`return ${defaultJavaValue(returnType)};`);
  }
  return lines.join("\n");
}

function flattenStatementComments(statements: readonly AliceStatement[], depth = 0): string[] {
  const lines: string[] = [];
  const prefix = "  ".repeat(depth);
  for (const statement of statements) {
    lines.push(`${prefix}${describeStatement(statement)}`);
    for (const child of nestedStatements(statement)) {
      lines.push(...flattenStatementComments(child, depth + 1));
    }
  }
  return lines;
}

function nestedStatements(statement: AliceStatement): AliceStatement[][] {
  const groups: AliceStatement[][] = [];
  if (statement.body) groups.push(statement.body);
  if (statement.ifBody) groups.push(statement.ifBody);
  if (statement.elseBody) groups.push(statement.elseBody);
  if (statement.tryBody) groups.push(statement.tryBody);
  if (statement.catchBody) groups.push(statement.catchBody);
  if (statement.defaultCase) groups.push(statement.defaultCase);
  for (const entry of statement.cases ?? []) {
    groups.push(entry.body);
  }
  return groups;
}

function describeStatement(statement: AliceStatement): string {
  switch (statement.kind) {
    case "MethodCall": {
      const receiver = statement.object ? `${statement.object}.` : "";
      const args = statement.arguments?.join(", ") ?? "";
      return `${receiver}${statement.method ?? "method"}(${args})`;
    }
    case "CountLoop":
      return `repeat ${statement.countExpression ?? statement.count ?? 0} times`;
    case "WhileLoop":
      return `while ${statement.condition ?? "condition"}`;
    case "IfElse":
      return `if ${statement.condition ?? "condition"}`;
    case "Return":
      return `return ${statement.expression ?? "value"}`;
    case "VariableDeclaration":
      return `${statement.varType ?? "Object"} ${statement.name ?? "value"} = ${statement.value ?? "null"}`;
    default:
      return `${statement.kind}${statement.expression ? ` ${statement.expression}` : ""}`;
  }
}

function renderProjectSummaryMethod(project: AliceProject): string {
  return `private static void printProjectSummary() {\n${indentLines([
    `System.out.println(${toJavaStringLiteral(`Alice project: ${project.projectName}`)});`,
    `System.out.println(${toJavaStringLiteral(`Scene objects: ${project.sceneObjects.length}`)});`,
    `System.out.println(${toJavaStringLiteral(`Methods: ${project.methods.length}`)});`,
  ].join("\n"), 2)}\n}`;
}

function renderMainMethod(): string {
  return `public static void main(String[] args) {\n${indentLines("printProjectSummary();", 2)}\n}`;
}

function renderParameters(parameters: AliceMethod["parameters"]): string {
  return parameters
    .map((parameter, index) => `${normalizeJavaType(parameter.type)} ${sanitizeJavaIdentifier(parameter.name, `arg${index + 1}`)}`)
    .join(", ");
}

function renderExtendsClause(superTypeName: string | null | undefined): string {
  const normalized = normalizeJavaType(superTypeName ?? null);
  if (normalized === "Object") {
    return "";
  }
  return ` extends ${normalized}`;
}

function normalizeJavaType(typeName: string | null): string {
  if (!typeName) {
    return "Object";
  }
  switch (typeName) {
    case "WholeNumber":
      return "int";
    case "DecimalNumber":
      return "double";
    case "Boolean":
      return "boolean";
    case "TextString":
      return "String";
    case "void":
      return "void";
    default:
      if (/^[A-Za-z_$][A-Za-z0-9_$]*(\.[A-Za-z_$][A-Za-z0-9_$]*)*$/.test(typeName)) {
        return typeName;
      }
      const leafName = typeName.split(/[.:]/).pop() ?? typeName;
      return sanitizeJavaIdentifier(leafName, "Object");
  }
}

function defaultJavaValue(typeName: string): string {
  switch (typeName) {
    case "int":
      return "0";
    case "double":
      return "0.0";
    case "boolean":
      return "false";
    case "String":
      return '""';
    case "void":
      return "0";
    default:
      return "null";
  }
}

function buildPomXml(options: {
  packageName: string;
  artifactId: string;
  version: string;
  mainClassName: string;
  projectName: string;
}): string {
  const { packageName, artifactId, version, mainClassName, projectName } = options;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<project xmlns="http://maven.apache.org/POM/4.0.0" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xsi:schemaLocation="http://maven.apache.org/POM/4.0.0 https://maven.apache.org/xsd/maven-4.0.0.xsd">\n  <modelVersion>4.0.0</modelVersion>\n  <groupId>${packageName}</groupId>\n  <artifactId>${artifactId}</artifactId>\n  <version>${escapeXml(version)}</version>\n  <name>${escapeXml(projectName)}</name>\n  <properties>\n    <maven.compiler.source>17</maven.compiler.source>\n    <maven.compiler.target>17</maven.compiler.target>\n    <project.build.sourceEncoding>UTF-8</project.build.sourceEncoding>\n  </properties>\n  <build>\n    <plugins>\n      <plugin>\n        <groupId>org.apache.maven.plugins</groupId>\n        <artifactId>maven-jar-plugin</artifactId>\n        <version>3.4.2</version>\n        <configuration>\n          <archive>\n            <manifest>\n              <mainClass>${packageName}.${mainClassName}</mainClass>\n            </manifest>\n          </archive>\n        </configuration>\n      </plugin>\n      <plugin>\n        <groupId>org.codehaus.mojo</groupId>\n        <artifactId>exec-maven-plugin</artifactId>\n        <version>3.5.0</version>\n        <configuration>\n          <mainClass>${packageName}.${mainClassName}</mainClass>\n        </configuration>\n      </plugin>\n    </plugins>\n  </build>\n</project>\n`;
}

function buildGradleFile(options: {
  packageName: string;
  artifactId: string;
  version: string;
  mainClassName: string;
  projectName: string;
}): string {
  const { packageName, version, mainClassName, projectName } = options;
  return `plugins {\n  id 'java'\n  id 'application'\n}\n\ngroup = ${toJavaStringLiteral(packageName)}\nversion = ${toJavaStringLiteral(version)}\n\njava {\n  toolchain {\n    languageVersion = JavaLanguageVersion.of(17)\n  }\n}\n\napplication {\n  mainClass = ${toJavaStringLiteral(`${packageName}.${mainClassName}`)}\n}\n\njar {\n  manifest {\n    attributes('Main-Class': ${toJavaStringLiteral(`${packageName}.${mainClassName}`)})\n  }\n}\n\nrepositories {\n  mavenCentral()\n}\n\n// Generated from Alice project: ${projectName.replace(/\r?\n/g, " ")}\n`;
}

function packageResources(archive: AliceProjectArchive): PackagedResource[] {
  const usedPaths = new Set<string>();
  const packaged: PackagedResource[] = [];
  for (const [sourcePath, bytes] of archive.resources) {
    if (sourcePath === ORIGINAL_XML_MARKER) {
      continue;
    }
    const relativePath = uniquifyResourcePath(sanitizeResourcePath(sourcePath), usedPaths);
    packaged.push({
      sourcePath,
      packagedPath: relativePath,
      bytes: new Uint8Array(bytes),
    });
  }
  return packaged;
}

function sanitizeResourcePath(path: string): string {
  const normalized = path.replace(/\\/g, "/");
  const sanitizedSegments = normalized
    .split("/")
    .filter((segment) => segment.length > 0)
    .map((segment) => sanitizeResourceSegment(segment));
  if (sanitizedSegments.length === 0) {
    return "resource.bin";
  }
  return sanitizedSegments.join("/");
}

function sanitizeResourceSegment(segment: string): string {
  if (segment === ".") {
    return "resource";
  }
  if (segment === "..") {
    return "parent";
  }
  const sanitized = segment
    .replace(/[^A-Za-z0-9._-]+/g, "_")
    .replace(/^\.+/g, (value) => value.replace(/\./g, "_"));
  return sanitized || "resource";
}

function uniquifyResourcePath(path: string, used: Set<string>): string {
  if (!used.has(path)) {
    used.add(path);
    return path;
  }
  const segments = path.split("/");
  const last = segments.pop() ?? "resource";
  const dotIndex = last.lastIndexOf(".");
  const stem = dotIndex > 0 ? last.slice(0, dotIndex) : last;
  const extension = dotIndex > 0 ? last.slice(dotIndex) : "";
  let suffix = 2;
  let candidate = path;
  while (used.has(candidate)) {
    candidate = [...segments, `${stem}-${suffix}${extension}`].join("/");
    suffix += 1;
  }
  used.add(candidate);
  return candidate;
}

function resolveMainClassName(project: AliceProject): string {
  const preferred = project.types?.find((type) => sanitizeJavaIdentifier(type.name, "Program") === "Program")?.name
    ?? project.projectName
    ?? "AliceProject";
  return sanitizeJavaIdentifier(preferred, "AliceProject");
}

function sanitizeArtifactId(projectName: string): string {
  const base = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return base.length > 0 ? base : "alice-project";
}

function validateMavenVersion(version: string): string {
  if (!MAVEN_VERSION_PATTERN.test(version)) {
    throw new Error(
      "Standalone project version must be a non-empty Maven version containing only letters, numbers, dots, underscores, and hyphens.",
    );
  }
  return version;
}

function indentMembers(members: string[]): string {
  return members.map((member) => indentLines(member, 1)).join("\n\n");
}

function indentLines(text: string, depth: number): string {
  const indent = "  ".repeat(depth);
  return text.split("\n").map((line) => `${indent}${line}`).join("\n");
}

function toJavaStringLiteral(value: string): string {
  return JSON.stringify(value);
}

function decodeBytes(bytes: Uint8Array): string {
  return new TextDecoder().decode(bytes);
}

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
