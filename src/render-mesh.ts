export interface MeshVector3 {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface MeshUv {
  readonly u: number;
  readonly v: number;
}

export interface MeshBounds {
  readonly min: MeshVector3;
  readonly max: MeshVector3;
  readonly size: MeshVector3;
  readonly center: MeshVector3;
}

export interface MeshData {
  readonly vertices: readonly MeshVector3[];
  readonly normals: readonly MeshVector3[];
  readonly uvs: readonly MeshUv[];
  readonly indices: readonly number[];
  readonly bounds: MeshBounds;
}

export interface MeshBuildOptions {
  readonly computeNormals?: boolean;
}

export interface BoxMeshOptions {
  readonly width?: number;
  readonly height?: number;
  readonly depth?: number;
  readonly center?: MeshVector3;
}

export interface SphereMeshOptions {
  readonly radius?: number;
  readonly widthSegments?: number;
  readonly heightSegments?: number;
  readonly center?: MeshVector3;
}

export interface CylinderMeshOptions {
  readonly radiusTop?: number;
  readonly radiusBottom?: number;
  readonly height?: number;
  readonly radialSegments?: number;
  readonly heightSegments?: number;
  readonly openEnded?: boolean;
  readonly center?: MeshVector3;
}

const ZERO_VECTOR: MeshVector3 = { x: 0, y: 0, z: 0 };
const ZERO_UV: MeshUv = { u: 0, v: 0 };

function cloneVector3(value: MeshVector3): MeshVector3 {
  return { x: value.x, y: value.y, z: value.z };
}

function cloneUv(value: MeshUv): MeshUv {
  return { u: value.u, v: value.v };
}

function addVector3(a: MeshVector3, b: MeshVector3): MeshVector3 {
  return { x: a.x + b.x, y: a.y + b.y, z: a.z + b.z };
}

function subtractVector3(a: MeshVector3, b: MeshVector3): MeshVector3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

function crossVector3(a: MeshVector3, b: MeshVector3): MeshVector3 {
  return {
    x: (a.y * b.z) - (a.z * b.y),
    y: (a.z * b.x) - (a.x * b.z),
    z: (a.x * b.y) - (a.y * b.x),
  };
}

function normalizeVector3(value: MeshVector3): MeshVector3 {
  const magnitude = Math.hypot(value.x, value.y, value.z);
  if (magnitude === 0 || !Number.isFinite(magnitude)) {
    return ZERO_VECTOR;
  }
  return {
    x: value.x / magnitude,
    y: value.y / magnitude,
    z: value.z / magnitude,
  };
}

function clampSegments(value: number | undefined, minimum: number): number {
  return Math.max(minimum, Math.floor(value ?? minimum));
}

function offsetVector3(value: MeshVector3, center: MeshVector3): MeshVector3 {
  return {
    x: center.x + value.x,
    y: center.y + value.y,
    z: center.z + value.z,
  };
}

export function computeBoundingBox(vertices: readonly MeshVector3[]): MeshBounds {
  if (vertices.length === 0) {
    return {
      min: ZERO_VECTOR,
      max: ZERO_VECTOR,
      size: ZERO_VECTOR,
      center: ZERO_VECTOR,
    };
  }

  let minX = vertices[0]!.x;
  let minY = vertices[0]!.y;
  let minZ = vertices[0]!.z;
  let maxX = vertices[0]!.x;
  let maxY = vertices[0]!.y;
  let maxZ = vertices[0]!.z;

  for (const vertex of vertices) {
    minX = Math.min(minX, vertex.x);
    minY = Math.min(minY, vertex.y);
    minZ = Math.min(minZ, vertex.z);
    maxX = Math.max(maxX, vertex.x);
    maxY = Math.max(maxY, vertex.y);
    maxZ = Math.max(maxZ, vertex.z);
  }

  const min = { x: minX, y: minY, z: minZ };
  const max = { x: maxX, y: maxY, z: maxZ };
  return {
    min,
    max,
    size: {
      x: max.x - min.x,
      y: max.y - min.y,
      z: max.z - min.z,
    },
    center: {
      x: (min.x + max.x) * 0.5,
      y: (min.y + max.y) * 0.5,
      z: (min.z + max.z) * 0.5,
    },
  };
}

export function computeVertexNormals(vertices: readonly MeshVector3[], indices: readonly number[]): MeshVector3[] {
  const accumulated = vertices.map(() => ({ x: 0, y: 0, z: 0 }));

  for (let index = 0; index + 2 < indices.length; index += 3) {
    const aIndex = indices[index]!;
    const bIndex = indices[index + 1]!;
    const cIndex = indices[index + 2]!;
    const a = vertices[aIndex];
    const b = vertices[bIndex];
    const c = vertices[cIndex];
    if (!a || !b || !c) {
      continue;
    }

    const ab = subtractVector3(b, a);
    const ac = subtractVector3(c, a);
    const faceNormal = crossVector3(ab, ac);
    if (faceNormal.x === 0 && faceNormal.y === 0 && faceNormal.z === 0) {
      continue;
    }

    accumulated[aIndex] = addVector3(accumulated[aIndex]!, faceNormal);
    accumulated[bIndex] = addVector3(accumulated[bIndex]!, faceNormal);
    accumulated[cIndex] = addVector3(accumulated[cIndex]!, faceNormal);
  }

  return accumulated.map(normalizeVector3);
}

export class MeshBuilder {
  readonly #vertices: MeshVector3[] = [];
  readonly #normals: Array<MeshVector3 | null> = [];
  readonly #uvs: MeshUv[] = [];
  readonly #indices: number[] = [];

  addVertex(position: MeshVector3, normal: MeshVector3 | null = null, uv: MeshUv = ZERO_UV): number {
    this.#vertices.push(cloneVector3(position));
    this.#normals.push(normal ? cloneVector3(normal) : null);
    this.#uvs.push(cloneUv(uv));
    return this.#vertices.length - 1;
  }

  addTriangle(a: number, b: number, c: number): this {
    this.#indices.push(a, b, c);
    return this;
  }

  addQuad(a: number, b: number, c: number, d: number): this {
    return this.addTriangle(a, b, c).addTriangle(a, c, d);
  }

  addIndices(indices: readonly number[]): this {
    this.#indices.push(...indices);
    return this;
  }

  build(options: MeshBuildOptions = {}): MeshData {
    const vertices = this.#vertices.map(cloneVector3);
    const indices = [...this.#indices];
    const computeNormals = options.computeNormals ?? this.#normals.some((normal) => normal === null);
    const normals = computeNormals
      ? computeVertexNormals(vertices, indices)
      : this.#normals.map((normal) => cloneVector3(normal ?? ZERO_VECTOR));

    return {
      vertices,
      normals,
      uvs: this.#uvs.map(cloneUv),
      indices,
      bounds: computeBoundingBox(vertices),
    };
  }
}

export function createBoxMesh(options: BoxMeshOptions = {}): MeshData {
  const width = options.width ?? 1;
  const height = options.height ?? 1;
  const depth = options.depth ?? 1;
  const center = options.center ?? ZERO_VECTOR;
  const halfWidth = width * 0.5;
  const halfHeight = height * 0.5;
  const halfDepth = depth * 0.5;
  const builder = new MeshBuilder();

  const addFace = (corners: readonly MeshVector3[], normal: MeshVector3) => {
    const start = corners.map((corner, index) => builder.addVertex(
      offsetVector3(corner, center),
      normal,
      [
        { u: 0, v: 0 },
        { u: 1, v: 0 },
        { u: 1, v: 1 },
        { u: 0, v: 1 },
      ][index],
    ));
    builder.addQuad(start[0]!, start[1]!, start[2]!, start[3]!);
  };

  addFace([
    { x: -halfWidth, y: -halfHeight, z: halfDepth },
    { x: halfWidth, y: -halfHeight, z: halfDepth },
    { x: halfWidth, y: halfHeight, z: halfDepth },
    { x: -halfWidth, y: halfHeight, z: halfDepth },
  ], { x: 0, y: 0, z: 1 });
  addFace([
    { x: halfWidth, y: -halfHeight, z: -halfDepth },
    { x: -halfWidth, y: -halfHeight, z: -halfDepth },
    { x: -halfWidth, y: halfHeight, z: -halfDepth },
    { x: halfWidth, y: halfHeight, z: -halfDepth },
  ], { x: 0, y: 0, z: -1 });
  addFace([
    { x: -halfWidth, y: halfHeight, z: halfDepth },
    { x: halfWidth, y: halfHeight, z: halfDepth },
    { x: halfWidth, y: halfHeight, z: -halfDepth },
    { x: -halfWidth, y: halfHeight, z: -halfDepth },
  ], { x: 0, y: 1, z: 0 });
  addFace([
    { x: -halfWidth, y: -halfHeight, z: -halfDepth },
    { x: halfWidth, y: -halfHeight, z: -halfDepth },
    { x: halfWidth, y: -halfHeight, z: halfDepth },
    { x: -halfWidth, y: -halfHeight, z: halfDepth },
  ], { x: 0, y: -1, z: 0 });
  addFace([
    { x: halfWidth, y: -halfHeight, z: halfDepth },
    { x: halfWidth, y: -halfHeight, z: -halfDepth },
    { x: halfWidth, y: halfHeight, z: -halfDepth },
    { x: halfWidth, y: halfHeight, z: halfDepth },
  ], { x: 1, y: 0, z: 0 });
  addFace([
    { x: -halfWidth, y: -halfHeight, z: -halfDepth },
    { x: -halfWidth, y: -halfHeight, z: halfDepth },
    { x: -halfWidth, y: halfHeight, z: halfDepth },
    { x: -halfWidth, y: halfHeight, z: -halfDepth },
  ], { x: -1, y: 0, z: 0 });

  return builder.build({ computeNormals: false });
}

export function createSphereMesh(options: SphereMeshOptions = {}): MeshData {
  const radius = options.radius ?? 0.5;
  const widthSegments = clampSegments(options.widthSegments, 3);
  const heightSegments = clampSegments(options.heightSegments, 2);
  const center = options.center ?? ZERO_VECTOR;
  const builder = new MeshBuilder();

  for (let y = 0; y <= heightSegments; y += 1) {
    const v = y / heightSegments;
    const phi = v * Math.PI;
    const sinPhi = Math.sin(phi);
    const cosPhi = Math.cos(phi);

    for (let x = 0; x <= widthSegments; x += 1) {
      const u = x / widthSegments;
      const theta = u * Math.PI * 2;
      const local = {
        x: radius * Math.cos(theta) * sinPhi,
        y: radius * cosPhi,
        z: radius * Math.sin(theta) * sinPhi,
      };
      builder.addVertex(
        offsetVector3(local, center),
        normalizeVector3(local),
        { u, v: 1 - v },
      );
    }
  }

  for (let y = 0; y < heightSegments; y += 1) {
    for (let x = 0; x < widthSegments; x += 1) {
      const a = (y * (widthSegments + 1)) + x;
      const b = a + widthSegments + 1;
      if (y !== 0) {
        builder.addTriangle(a, b, a + 1);
      }
      if (y !== heightSegments - 1) {
        builder.addTriangle(b, b + 1, a + 1);
      }
    }
  }

  return builder.build({ computeNormals: false });
}

function addCylinderCap(
  builder: MeshBuilder,
  radius: number,
  y: number,
  radialSegments: number,
  center: MeshVector3,
  isTop: boolean,
): void {
  const normal = isTop ? { x: 0, y: 1, z: 0 } : { x: 0, y: -1, z: 0 };
  const centerIndex = builder.addVertex(
    { x: center.x, y: center.y + y, z: center.z },
    normal,
    { u: 0.5, v: 0.5 },
  );
  const rimIndices: number[] = [];

  for (let index = 0; index <= radialSegments; index += 1) {
    const u = index / radialSegments;
    const theta = u * Math.PI * 2;
    const cosTheta = Math.cos(theta);
    const sinTheta = Math.sin(theta);
    rimIndices.push(builder.addVertex(
      {
        x: center.x + (radius * cosTheta),
        y: center.y + y,
        z: center.z + (radius * sinTheta),
      },
      normal,
      { u: (cosTheta + 1) * 0.5, v: (sinTheta + 1) * 0.5 },
    ));
  }

  for (let index = 0; index < radialSegments; index += 1) {
    if (isTop) {
      builder.addTriangle(centerIndex, rimIndices[index + 1]!, rimIndices[index]!);
    } else {
      builder.addTriangle(centerIndex, rimIndices[index]!, rimIndices[index + 1]!);
    }
  }
}

export function createCylinderMesh(options: CylinderMeshOptions = {}): MeshData {
  const radiusTop = options.radiusTop ?? 0.5;
  const radiusBottom = options.radiusBottom ?? radiusTop;
  const height = options.height ?? 1;
  const radialSegments = clampSegments(options.radialSegments, 3);
  const heightSegments = clampSegments(options.heightSegments, 1);
  const openEnded = options.openEnded ?? false;
  const center = options.center ?? ZERO_VECTOR;
  const halfHeight = height * 0.5;
  const normalSlope = height === 0 ? 0 : (radiusBottom - radiusTop) / height;
  const builder = new MeshBuilder();

  for (let ySegment = 0; ySegment <= heightSegments; ySegment += 1) {
    const v = ySegment / heightSegments;
    const radius = radiusTop + ((radiusBottom - radiusTop) * v);
    const y = halfHeight - (v * height);

    for (let radialIndex = 0; radialIndex <= radialSegments; radialIndex += 1) {
      const u = radialIndex / radialSegments;
      const theta = u * Math.PI * 2;
      const cosTheta = Math.cos(theta);
      const sinTheta = Math.sin(theta);
      builder.addVertex(
        {
          x: center.x + (radius * cosTheta),
          y: center.y + y,
          z: center.z + (radius * sinTheta),
        },
        normalizeVector3({ x: cosTheta, y: normalSlope, z: sinTheta }),
        { u, v: 1 - v },
      );
    }
  }

  for (let ySegment = 0; ySegment < heightSegments; ySegment += 1) {
    for (let radialIndex = 0; radialIndex < radialSegments; radialIndex += 1) {
      const a = (ySegment * (radialSegments + 1)) + radialIndex;
      const b = a + radialSegments + 1;
      const c = b + 1;
      const d = a + 1;
      builder.addTriangle(a, b, d);
      builder.addTriangle(b, c, d);
    }
  }

  if (!openEnded) {
    if (radiusTop > 0) {
      addCylinderCap(builder, radiusTop, halfHeight, radialSegments, center, true);
    }
    if (radiusBottom > 0) {
      addCylinderCap(builder, radiusBottom, -halfHeight, radialSegments, center, false);
    }
  }

  return builder.build({ computeNormals: false });
}
