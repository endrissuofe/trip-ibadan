// Small geometry helpers shared by world and vehicle builders.
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { VertexData } from '@babylonjs/core/Meshes/mesh.vertexData';
import { Scene } from '@babylonjs/core/scene';
import { Color4, Color3 } from '@babylonjs/core/Maths/math.color';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Matrix, Vector3, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { VertexBuffer } from '@babylonjs/core/Buffers/buffer';

export const hex = (h: string, a = 1) => { const c = Color3.FromHexString(h); return new Color4(c.r, c.g, c.b, a); };

/** Mesh from raw arrays. Normals computed if not given, then flipped so the first one points up (for ground-like strips). */
export function meshFrom(name: string, scene: Scene, positions: number[], indices: number[], opts: { uvs?: number[]; colors?: number[]; normals?: number[]; upright?: boolean } = {}) {
  const vd = new VertexData();
  vd.positions = positions;
  vd.indices = indices;
  if (opts.uvs) vd.uvs = opts.uvs;
  if (opts.colors) vd.colors = opts.colors;
  let normals = opts.normals;
  if (!normals) {
    normals = [];
    VertexData.ComputeNormals(positions, indices, normals);
    if (opts.upright) {
      let up = 0; for (let i = 1; i < normals.length; i += 3) up += normals[i];
      if (up < 0) for (let i = 0; i < normals.length; i++) normals[i] = -normals[i];
    }
  }
  vd.normals = normals;
  const m = new Mesh(name, scene);
  vd.applyToMesh(m, false);
  return m;
}

/** Grid indices for rows×cols vertices laid out row-major. */
export function gridIndices(rows: number, cols: number, out: number[] = [], base = 0) {
  for (let r = 0; r < rows - 1; r++) {
    for (let c = 0; c < cols - 1; c++) {
      const a = base + r * cols + c, b = a + 1, d = a + cols, e = d + 1;
      out.push(a, d, b, b, d, e);
    }
  }
  return out;
}

/** Accumulates vertex-coloured parts into one mesh (one draw call per vehicle). */
export class PartBuilder {
  private parts: Mesh[] = [];
  constructor(private scene: Scene, private name: string) {}

  /** Add any mesh (already positioned) painted in one colour. */
  add(m: Mesh, color: string) { return this.paint(m, hex(color)); }

  private paint(m: Mesh, c: Color4) {
    const n = m.getTotalVertices();
    const cols = new Array(n * 4);
    for (let i = 0; i < n; i++) { cols[i * 4] = c.r; cols[i * 4 + 1] = c.g; cols[i * 4 + 2] = c.b; cols[i * 4 + 3] = c.a; }
    m.setVerticesData(VertexBuffer.ColorKind, cols);
    this.parts.push(m);
    return m;
  }

  box(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string, rotY = 0) {
    const m = MeshBuilder.CreateBox('p', { width: sx, height: sy, depth: sz }, this.scene);
    m.bakeTransformIntoVertices(Matrix.RotationY(rotY).multiply(Matrix.Translation(cx, cy, cz)));
    return this.paint(m, hex(color));
  }

  /** Rounded box with a few profile steps, useful for painted bodywork and concrete edges. */
  roundedBox(cx: number, cy: number, cz: number, sx: number, sy: number, sz: number, color: string, bevel = 0.12, rotY = 0, segments = 3) {
    const half = [sx / 2, sy / 2, sz / 2];
    const r = Math.min(bevel, half[0] * 0.45, half[1] * 0.45, half[2] * 0.45);
    const steps = Math.max(2, Math.floor(segments));
    const positions: number[] = [], normals: number[] = [], uvs: number[] = [], indices: number[] = [];
    // Each face uses row and column axes whose cross product points outwards.
    const faces: [number, number, number, number][] = [
      [0, -1, 2, 1], [0, 1, 1, 2], [1, -1, 0, 2],
      [1, 1, 2, 0], [2, -1, 1, 0], [2, 1, 0, 1],
    ];
    for (const [fixed, sign, rowAxis, colAxis] of faces) {
      const base = positions.length / 3;
      for (let row = 0; row <= steps; row++) for (let col = 0; col <= steps; col++) {
        const p = [0, 0, 0];
        p[fixed] = sign * half[fixed];
        p[rowAxis] = (row / steps * 2 - 1) * half[rowAxis];
        p[colAxis] = (col / steps * 2 - 1) * half[colAxis];
        const q = p.map((v, axis) => Math.max(-half[axis] + r, Math.min(half[axis] - r, v)));
        const d = p.map((v, axis) => v - q[axis]);
        const len = Math.hypot(d[0], d[1], d[2]);
        const rounded = len > 1e-8 ? q.map((v, axis) => v + d[axis] * r / len) : p;
        positions.push(rounded[0], rounded[1], rounded[2]);
        uvs.push(col / steps, row / steps);
        if (len > 1e-8) normals.push(d[0] / len, d[1] / len, d[2] / len);
        else { const n = [0, 0, 0]; n[fixed] = sign; normals.push(n[0], n[1], n[2]); }
      }
      for (let row = 0; row < steps; row++) for (let col = 0; col < steps; col++) {
        const a = base + row * (steps + 1) + col, b = a + steps + 1;
        indices.push(a, b, a + 1, a + 1, b, b + 1);
      }
    }
    const vd = new VertexData(); vd.positions = positions; vd.normals = normals; vd.uvs = uvs; vd.indices = indices;
    const m = new Mesh('p', this.scene); vd.applyToMesh(m, false);
    m.bakeTransformIntoVertices(Matrix.RotationY(rotY).multiply(Matrix.Translation(cx, cy, cz)));
    return this.paint(m, hex(color));
  }

  /** Cylinder along the given axis (x: wheels, z: tanks, y: poles/trunks). */
  cylinder(cx: number, cy: number, cz: number, r: number, len: number, color: string, axis: 'x' | 'y' | 'z' = 'x', tess = 12) {
    const m = MeshBuilder.CreateCylinder('p', { diameter: r * 2, height: len, tessellation: tess }, this.scene);
    const rot = axis === 'x' ? Matrix.RotationZ(Math.PI / 2) : axis === 'z' ? Matrix.RotationX(Math.PI / 2) : Matrix.Identity();
    m.bakeTransformIntoVertices(rot.multiply(Matrix.Translation(cx, cy, cz)));
    return this.paint(m, hex(color));
  }

  /** Side profile (z forward, y up) extruded across x ∈ [-w/2, w/2]. Profile must be star-shaped around its centroid. */
  prism(profile: [number, number][], w: number, color: string, x0 = 0) {
    const pos: number[] = [], idx: number[] = [], nor: number[] = [], uv: number[] = [];
    const n = profile.length;
    let cz = 0, cy = 0; for (const [z, y] of profile) { cz += z; cy += y; } cz /= n; cy /= n;
    const push = (x: number, y: number, z: number, nx: number, ny: number, nz: number) => { pos.push(x, y, z); nor.push(nx, ny, nz); uv.push(0, 0); return pos.length / 3 - 1; };
    for (const side of [-1, 1]) {
      const x = x0 + (side * w) / 2;
      const c = push(x, cy, cz, side, 0, 0);
      const ring = profile.map(([z, y]) => push(x, y, z, side, 0, 0));
      for (let i = 0; i < n; i++) idx.push(c, ring[i], ring[(i + 1) % n]);
    }
    for (let i = 0; i < n; i++) {
      const [z1, y1] = profile[i], [z2, y2] = profile[(i + 1) % n];
      let ny = -(z2 - z1), nz = y2 - y1; // perpendicular to edge
      const mz = (z1 + z2) / 2 - cz, my = (y1 + y2) / 2 - cy;
      if (nz * mz + ny * my < 0) { ny = -ny; nz = -nz; }
      const L = Math.hypot(ny, nz) || 1; ny /= L; nz /= L;
      const a = push(x0 - w / 2, y1, z1, 0, ny, nz), b = push(x0 + w / 2, y1, z1, 0, ny, nz);
      const c = push(x0 + w / 2, y2, z2, 0, ny, nz), d = push(x0 - w / 2, y2, z2, 0, ny, nz);
      idx.push(a, b, c, a, c, d);
    }
    const vd = new VertexData(); vd.positions = pos; vd.indices = idx; vd.normals = nor; vd.uvs = uv;
    const m = new Mesh('p', this.scene); vd.applyToMesh(m);
    return this.paint(m, hex(color));
  }

  /** Ellipsoid centred at (cx, cy, cz) with radii rx, ry, rz. */
  ellipsoid(cx: number, cy: number, cz: number, rx: number, ry: number, rz: number, color: string, seg = 10) {
    const m = MeshBuilder.CreateSphere('p', { diameterX: rx * 2, diameterY: ry * 2, diameterZ: rz * 2, segments: seg }, this.scene);
    m.bakeTransformIntoVertices(Matrix.Translation(cx, cy, cz));
    return this.paint(m, hex(color));
  }

  /** Vertical tapered cylinder (e.g. torso, skirt), flattened front-to-back by `depth`. */
  taper(cx: number, cy: number, cz: number, rTop: number, rBottom: number, h: number, color: string, depth = 0.7, tess = 14) {
    const m = MeshBuilder.CreateCylinder('p', { diameterTop: rTop * 2, diameterBottom: rBottom * 2, height: h, tessellation: tess }, this.scene);
    m.bakeTransformIntoVertices(Matrix.Scaling(1, 1, depth).multiply(Matrix.Translation(cx, cy, cz)));
    return this.paint(m, hex(color));
  }

  /** Capsule (rounded limb) from point a to point b. */
  capsule(a: [number, number, number], b: [number, number, number], r: number, color: string, tess = 8) {
    const A = new Vector3(...a), B = new Vector3(...b);
    const d = B.subtract(A), len = d.length();
    const m = MeshBuilder.CreateCapsule('p', { radius: r, height: len + r * 2, tessellation: tess, subdivisions: 1, capSubdivisions: 3 }, this.scene);
    const q = new Quaternion();
    const up = new Vector3(0, 1, 0), dir = d.normalizeToNew();
    const axis = Vector3.Cross(up, dir);
    const dot = Math.max(-1, Math.min(1, Vector3.Dot(up, dir)));
    if (axis.lengthSquared() < 1e-8) Quaternion.RotationAxisToRef(new Vector3(1, 0, 0), dot > 0 ? 0 : Math.PI, q);
    else Quaternion.RotationAxisToRef(axis.normalize(), Math.acos(dot), q);
    const rot = new Matrix(); q.toRotationMatrix(rot);
    const mid = A.add(B).scale(0.5);
    m.bakeTransformIntoVertices(rot.multiply(Matrix.Translation(mid.x, mid.y, mid.z)));
    return this.paint(m, hex(color));
  }

  get count() { return this.parts.length; }

  build(): Mesh {
    let m: Mesh;
    try { m = Mesh.MergeMeshes(this.parts, true, true)!; }
    catch (e) {
      // say WHICH model failed and what each part carries; the engine's own message names neither
      const kinds = [...new Set(this.parts.map((p) => (p.getVerticesDataKinds() ?? []).slice().sort().join(',')))];
      throw new Error(`PartBuilder "${this.name}": ${(e as Error).message} [${kinds.join(' | ')}]`);
    }
    m.name = this.name;
    this.parts = [];
    return m;
  }
}
