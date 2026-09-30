// Builds the 3D corridor from the real route: terrain, both carriageways, markings,
// barriers, bridges (deck, parapets, piers), interchange ramps, footbridges,
// street lights, signs, vegetation, roadside towns and route-tied event props.
import { Scene } from '@babylonjs/core/scene';
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { SkyMaterial } from '@babylonjs/materials/sky/skyMaterial';
import { Route, Line, LANE_W } from '../map/Route';
import { ROUTE_EVENTS, RouteEvent } from '../data/trips';
import { StreetNet, Colliders, STREET_HALF_W } from '../map/Streets';
import { buildLandmarks } from './Landmarks';
import { buildPerson, SHIRTS } from './props';
import { meshFrom, gridIndices, PartBuilder } from './geo';
import { asphaltTexture, groundTexture, signTexture, dirtTexture } from './textures';
import { buildVehicle, vehicleMaterial } from './models';

export interface Obstacle { s: number; d: number; len: number; width: number; kind: string }
export interface Closure { s0: number; s1: number; dMax: number; label: string } // road narrowed: d must stay < dMax

export type Quality = 'low' | 'high';
const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
function hash(x: number, z: number) { const s = Math.sin(x * 127.1 + z * 311.7) * 43758.5453; return s - Math.floor(s); }
function vnoise(x: number, z: number) {
  const xi = Math.floor(x), zi = Math.floor(z), xf = x - xi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = zf * zf * (3 - 2 * zf);
  const a = hash(xi, zi), b = hash(xi + 1, zi), c = hash(xi, zi + 1), d = hash(xi + 1, zi + 1);
  return (a * (1 - u) + b * u) * (1 - v) + (c * (1 - u) + d * u) * v;
}

export class World {
  readonly obstacles: Obstacle[] = [];
  readonly closures: Closure[] = [];
  readonly sbD: Float64Array; // SB centreline offset in NB road space, per NB sample
  readonly sbY: Float64Array;
  readonly sbHW: Float64Array;
  readonly sbBridge: Uint8Array;
  sun!: DirectionalLight;
  propMat!: StandardMaterial;
  readonly events: RouteEvent[] = ROUTE_EVENTS;
  readonly streets: StreetNet;
  readonly colliders = new Colliders();
  readonly updaters: ((dt: number) => void)[] = [];
  /** Bay highlight material per stop id (Passengers system lights up the stops you need). */
  readonly stopBays = new Map<string, StandardMaterial>();
  private water: { x: number; z: number; half: number; y: number }[] = [];
  private rnd = mulberry(20260930);

  constructor(readonly scene: Scene, readonly route: Route, readonly quality: Quality) {
    const nb = route.nb, sb = route.sb;
    this.streets = new StreetNet(route.file.streets);
    this.sbD = new Float64Array(nb.n); this.sbY = new Float64Array(nb.n); this.sbHW = new Float64Array(nb.n); this.sbBridge = new Uint8Array(nb.n);
    let hint = -1;
    for (let i = 0; i < nb.n; i++) {
      const p = sb.project(nb.x[i], nb.z[i], hint);
      hint = p.i;
      const q = sb.sample(p.s);
      const smp = nb.sample(nb.s[i]);
      this.sbD[i] = (q.x - nb.x[i]) * smp.nx + (q.z - nb.z[i]) * smp.nz;
      this.sbY[i] = q.y; this.sbHW[i] = sb.halfWidth(p.s); this.sbBridge[i] = q.bridge ? 1 : 0;
    }
  }

  // ---------------------------------------------------------------- public queries
  /** Index of the NB sample nearest to s. */
  idx(s: number) { const [i, t] = this.route.nb.locate(s); return t > 0.5 ? i + 1 : i; }

  /** Ground height at NB road-space (s, d), blended into both carriageways. */
  groundAt(s: number, d: number): number {
    const nb = this.route.nb;
    const i = this.idx(s);
    const roadY = nb.y[i], hw = nb.halfWidth(s);
    const T = this.route.terrainAt(s, d);
    const nearBridge = nb.bridge[Math.max(0, i - 4)] || nb.bridge[i] || nb.bridge[Math.min(nb.n - 1, i + 4)];
    const dist = d > 0 ? d - (hw + 2.9) : -d - (hw + 1.8);
    // southbound carriageway, in the same road space
    const sbNear = Math.abs(this.sbD[i]) < 300, sbY = this.sbY[i], sbBridge = !!this.sbBridge[i];
    const ds = Math.abs(d - this.sbD[i]) - (this.sbHW[i] + 1.8);
    // embankments: pull terrain towards whichever carriageway is closer
    const aN = nearBridge ? 0 : 1 - smoothstep(2, 55, dist);
    const aS = !sbNear || sbBridge ? 0 : 1 - smoothstep(2, 55, ds);
    let h = T;
    if (aN + aS > 0) {
      const target = (aN * (roadY - 0.35) + aS * (sbY - 0.35)) / (aN + aS);
      h = T + (target - T) * Math.max(aN, aS);
    }
    if (nearBridge) { const valley = Math.min(T, roadY - 8); h = Math.min(h, valley + (T - valley) * smoothstep(70, 180, dist)); }
    if (sbNear && sbBridge && ds < 60) h = Math.min(h, sbY - 7);
    // the ground must never poke through a road surface
    if (!nearBridge && dist < 1.5) h = Math.min(h, roadY - 0.3);
    if (sbNear && !sbBridge && ds < 1.5) h = Math.min(h, sbY - 0.3);
    return h;
  }

  speedLimitAt(s: number, base: number): number {
    const km = (s - this.route.startS) / 1000;
    for (const e of this.events) if (e.speedLimit && km >= e.km - 0.05 && km <= e.km + e.lengthM / 1000) return Math.min(base, e.speedLimit);
    return base;
  }

  closureAt(s: number): Closure | undefined { return this.closures.find((c) => s >= c.s0 && s <= c.s1); }

  /** Height of the ground at a world position (via NB road space). */
  groundAtXZ(x: number, z: number, hint = -1): number { const p = this.route.nb.project(x, z, hint); return this.groundAt(p.s, p.d); }

  /** True if (x,z) is open water (river under the long bridge). */
  isWater(x: number, z: number, groundY: number) {
    return this.water.some((w) => Math.abs(x - w.x) < w.half && Math.abs(z - w.z) < w.half && groundY < w.y - 0.2);
  }

  update(dt: number) { for (const u of this.updaters) u(dt); }

  // ---------------------------------------------------------------- build
  async build(report: (p: number, label: string) => void) {
    const scene = this.scene;
    const times: string[] = []; let tPrev = performance.now(), lPrev = 'setup';
    const progress = (p: number, label: string) => { const t = performance.now(); times.push(`${lPrev} ${Math.round(t - tPrev)}ms`); tPrev = t; lPrev = label; report(p, label); };
    scene.clearColor = new Color4(0.78, 0.84, 0.86, 1);
    scene.fogMode = Scene.FOGMODE_LINEAR;
    scene.fogColor = new Color3(0.8, 0.84, 0.84);
    scene.fogStart = 250; scene.fogEnd = this.quality === 'high' ? 1300 : 900;
    scene.ambientColor = new Color3(0.3, 0.3, 0.3);

    const hemi = new HemisphericLight('hemi', new Vector3(0, 1, 0), scene);
    hemi.intensity = 0.75; hemi.diffuse = new Color3(1, 0.98, 0.94); hemi.groundColor = new Color3(0.36, 0.33, 0.27);
    this.sun = new DirectionalLight('sun', new Vector3(-0.35, -1, 0.45).normalize(), scene);
    this.sun.intensity = 1.05; this.sun.diffuse = new Color3(1, 0.96, 0.88);

    const sky = MeshBuilder.CreateBox('sky', { size: 900 }, scene);
    const skyMat = new SkyMaterial('skyMat', scene);
    skyMat.backFaceCulling = false; skyMat.turbidity = 14; skyMat.luminance = 1.05; skyMat.rayleigh = 1.2;
    skyMat.inclination = 0.12; skyMat.azimuth = 0.3; skyMat.fogEnabled = false;
    sky.material = skyMat; sky.infiniteDistance = true; sky.isPickable = false;

    this.propMat = new StandardMaterial('propMat', scene);
    this.propMat.specularColor = new Color3(0.08, 0.08, 0.08); this.propMat.backFaceCulling = false;

    progress(0.05, 'Laying the real terrain');  await tick(); tPrev = performance.now();
    this.buildGround();
    progress(0.3, 'Paving the expressway');  await tick(); tPrev = performance.now();
    this.buildCarriageway(this.route.nb, 'nb');
    this.buildCarriageway(this.route.sb, 'sb');
    progress(0.5, 'Raising bridges and ramps');  await tick(); tPrev = performance.now();
    this.buildBridges(this.route.nb);
    this.buildBridges(this.route.sb);
    this.buildRamps();
    this.buildFootbridges();
    progress(0.58, 'Mapping the inner streets');  await tick(); tPrev = performance.now();
    this.buildStreets();
    progress(0.66, 'Finding real landmarks');  await tick(); tPrev = performance.now();
    buildLandmarks(this);
    this.buildStops();
    this.buildEvents();
    progress(0.76, 'Building neighbourhoods');  await tick(); tPrev = performance.now();
    this.buildHouses();
    this.buildVegetation();
    this.buildLights();
    progress(0.9, 'Putting up signs');  await tick(); tPrev = performance.now();
    this.buildSigns();

    for (const m of scene.meshes) {
      if (m.name === 'sky') continue;
      m.isPickable = false;
      if (!m.metadata?.dynamic) { m.freezeWorldMatrix(); m.doNotSyncBoundingInfo = true; }
    }
    progress(1, 'Ready');
    console.info('[world build]', times.join(' · '));
  }

  // ---------------------------------------------------------------- terrain
  private buildGround() {
    const { nb } = this.route;
    const tex = groundTexture(this.scene);
    const mat = new StandardMaterial('groundMat', this.scene);
    mat.diffuseTexture = tex; mat.specularColor = new Color3(0.02, 0.02, 0.02); mat.backFaceCulling = false;
    const D = [-320, -240, -175, -125, -90, -66, -50, -39, -31, -25, -20, -16, -12.5, -9.5, -7, -4, 0, 4, 7, 9.5, 12.5, 16, 20, 25, 31, 39, 50, 66, 90, 125, 175, 240, 320];
    const every = 4, rowsPerChunk = 50;
    const rowIdx: number[] = []; for (let i = 0; i < nb.n; i += every) rowIdx.push(i);
    const landmarkS = this.route.file.landmarks.map((l) => l.s);
    for (let c0 = 0; c0 < rowIdx.length - 1; c0 += rowsPerChunk) {
      const rows = rowIdx.slice(c0, Math.min(rowIdx.length, c0 + rowsPerChunk + 1));
      const pos: number[] = [], uv: number[] = [], col: number[] = [];
      for (const i of rows) {
        const smp = nb.sample(nb.s[i]);
        const town = Math.max(0, ...landmarkS.map((ls) => 1 - smoothstep(350, 900, Math.abs(ls - nb.s[i]))));
        for (const d of D) {
          const x = smp.x + smp.nx * d, z = smp.z + smp.nz * d;
          const y = this.groundAt(nb.s[i], d);
          pos.push(x, y, z); uv.push(x / 22, z / 22);
          const hw = nb.halfWidth(nb.s[i]);
          const edge = Math.min(Math.abs(d > 0 ? d - hw : d + hw), Math.abs(Math.abs(d - this.sbD[i]) - this.sbHW[i]));
          const dust = 1 - smoothstep(4, 18, edge);
          const bush = vnoise(x / 90, z / 90), patch = vnoise(x / 23 + 7, z / 23);
          let r = 1, g = 1, b = 1;
          const dark = 0.72 + bush * 0.45; r *= dark; g *= dark * 1.03; b *= dark;
          if (patch > 0.72) { r *= 1.06; g *= 1.0; b *= 0.9; }
          const built = town * (1 - smoothstep(180, 300, Math.abs(d)));
          r = r * (1 - built) + 1.02 * built; g = g * (1 - built) + 0.93 * built; b = b * (1 - built) + 0.82 * built;
          r = r * (1 - dust) + 1.15 * dust; g = g * (1 - dust) + 0.9 * dust; b = b * (1 - dust) + 0.78 * dust;
          col.push(r, g, b, 1);
        }
      }
      const m = meshFrom('ground', this.scene, pos, gridIndices(rows.length, D.length), { uvs: uv, colors: col, upright: true });
      m.material = mat; m.receiveShadows = true;
    }
    // Water under the long river bridge(s)
    const nbL = this.route.nb;
    let i = 0;
    while (i < nbL.n) {
      if (!nbL.bridge[i]) { i++; continue; }
      let j = i; while (j < nbL.n && nbL.bridge[j]) j++;
      const len = nbL.s[j - 1] - nbL.s[i];
      if (len > 400) {
        let minT = Infinity;
        for (let k = i; k < j; k += 4) for (const d of [-80, -40, 0, 40, 80]) minT = Math.min(minT, this.route.terrainAt(nbL.s[k], d));
        const mid = nbL.sample((nbL.s[i] + nbL.s[j - 1]) / 2);
        const water = MeshBuilder.CreateGround('water', { width: 1400, height: 1400 }, this.scene);
        water.position.set(mid.x, minT + 1.2, mid.z);
        this.water.push({ x: mid.x, z: mid.z, half: 700, y: minT + 1.2 });
        const wm = new StandardMaterial('waterMat', this.scene);
        wm.diffuseColor = new Color3(0.22, 0.33, 0.3); wm.specularColor = new Color3(0.6, 0.6, 0.55); wm.specularPower = 90; wm.alpha = 0.92;
        water.material = wm;
      }
      i = j;
    }
  }

  // ---------------------------------------------------------------- road surface, markings, barriers
  private buildCarriageway(line: Line, tag: string) {
    const asphalt = asphaltTexture(this.scene);
    const roadMat = new StandardMaterial(`road-${tag}`, this.scene);
    roadMat.diffuseTexture = asphalt; roadMat.specularColor = new Color3(0.08, 0.08, 0.08); roadMat.backFaceCulling = false;
    const markMat = new StandardMaterial(`mark-${tag}`, this.scene);
    markMat.diffuseColor = new Color3(0.95, 0.95, 0.92); markMat.emissiveColor = new Color3(0.25, 0.25, 0.25);
    markMat.specularColor = Color3.Black(); markMat.backFaceCulling = false; markMat.zOffset = -2;

    const CH = 100;
    for (let c0 = 0; c0 < line.n - 1; c0 += CH) {
      const c1 = Math.min(line.n - 1, c0 + CH);
      // --- surface: [median shoulder | lanes | outer shoulder]
      const pos: number[] = [], uv: number[] = [], col: number[] = [];
      const cols = 6;
      for (let i = c0; i <= c1; i++) {
        const s = line.s[i], smp = line.sample(s), hw = line.halfWidth(s);
        const ds = [-hw - 1.3, -hw, -hw, hw, hw, hw + 2.8];
        const cs = [0.8, 0.8, 1, 1, 0.84, 0.84];
        ds.forEach((d, k) => {
          pos.push(smp.x + smp.nx * d, smp.y + (k === 0 || k === 5 ? -0.02 : 0), smp.z + smp.nz * d);
          uv.push(d / 3.4, s / 7);
          const c = cs[k]; col.push(c * 1.02, c, c * 0.97, 1);
        });
      }
      const road = meshFrom(`road-${tag}`, this.scene, pos, gridIndices(c1 - c0 + 1, cols), { uvs: uv, colors: col, upright: true });
      road.material = roadMat; road.receiveShadows = true;

      // --- markings
      const mp: number[] = [], mi: number[] = [];
      const quad = (sA: number, sB: number, d: number, w: number) => {
        const base = mp.length / 3;
        for (const s of [sA, (sA + sB) / 2, sB]) {
          const p = line.sample(s);
          const hw = line.halfWidth(s);
          const dd = d === 999 ? hw - 0.25 : d === -999 ? -hw + 0.25 : d;
          for (const o of [-w / 2, w / 2]) mp.push(p.x + p.nx * (dd + o), p.y + 0.025, p.z + p.nz * (dd + o));
        }
        gridIndices(3, 2, mi, base);
      };
      const sA = line.s[c0], sB = line.s[c1];
      for (let s = sA; s < sB; s += 6) { quad(s, Math.min(sB, s + 6), 999, 0.18); quad(s, Math.min(sB, s + 6), -999, 0.18); }
      for (let s = Math.ceil(sA / 12) * 12; s < sB - 4; s += 12) {
        const hw = line.halfWidth(s), nl = Math.max(1, Math.round((hw * 2) / LANE_W));
        for (let k = 1; k < nl; k++) quad(s, s + 4, -hw + (k * 2 * hw) / nl, 0.15);
      }
      if (mi.length) { const mk = meshFrom(`mark-${tag}`, this.scene, mp, mi, { upright: true }); mk.material = markMat; }

      // --- median barrier (New Jersey profile) on the left edge
      const prof: [number, number][] = [[-0.32, 0], [-0.14, 0.32], [-0.1, 0.86], [0.1, 0.86], [0.14, 0.32], [0.32, 0]];
      this.extrudeAlong(line, c0, c1, prof, (s) => -line.halfWidth(s) - 1.55, '#b8b4aa', () => true);
      // --- parapet on the outer edge of bridges
      this.extrudeAlong(line, c0, c1, [[-0.2, -0.05], [-0.2, 1.0], [0.2, 1.0], [0.2, -0.05]], (s) => line.halfWidth(s) + 3.0, '#c4c0b6', (i) => !!line.bridge[i]);
    }
  }

  /** Extrude a cross-section profile (d offset, height) along the line where pred(i) holds. */
  private extrudeAlong(line: Line, c0: number, c1: number, prof: [number, number][], dAt: (s: number) => number, color: string, pred: (i: number) => boolean) {
    let run: number[] = [];
    const flush = () => {
      if (run.length < 2) { run = []; return; }
      const pos: number[] = [], col: number[] = [];
      const c = Color3.FromHexString(color);
      for (const i of run) {
        const s = line.s[i], p = line.sample(s), d0 = dAt(s);
        for (const [dd, h] of prof) { pos.push(p.x + p.nx * (d0 + dd), p.y + h, p.z + p.nz * (d0 + dd)); col.push(c.r, c.g, c.b, 1); }
      }
      const m = meshFrom('barrier', this.scene, pos, gridIndices(run.length, prof.length), { colors: col });
      m.material = this.propMat;
      run = [];
    };
    for (let i = c0; i <= c1; i++) { if (pred(i)) run.push(i); else flush(); }
    flush();
  }

  // ---------------------------------------------------------------- bridges
  private buildBridges(line: Line) {
    const pier = new PartBuilder(this.scene, 'pier');
    pier.cylinder(0, -0.5, 0, 0.7, 1, '#a9a59c', 'y', 12);
    const pierMesh = pier.build();
    pierMesh.material = this.propMat;
    const mats: number[] = [];
    let i = 0;
    while (i < line.n) {
      if (!line.bridge[i]) { i++; continue; }
      let j = i; while (j < line.n && line.bridge[j]) j++;
      // deck slab + fascia
      const pos: number[] = [], col: number[] = [];
      for (let k = Math.max(0, i - 1); k <= Math.min(line.n - 1, j); k++) {
        const p = line.sample(line.s[k]), hw = line.halfWidth(line.s[k]);
        for (const [d, h] of [[-hw - 1.9, 0], [-hw - 1.9, -1.6], [hw + 3.3, -1.6], [hw + 3.3, 0]] as const) {
          pos.push(p.x + p.nx * d, p.y + h, p.z + p.nz * d); col.push(0.62, 0.6, 0.56, 1);
        }
      }
      const deck = meshFrom('deck', this.scene, pos, gridIndices(pos.length / 12, 4), { colors: col });
      deck.material = this.propMat;
      // piers every ~30 m
      for (let s = line.s[i] + 15; s < line.s[j - 1] - 5; s += 30) {
        const p = line.sample(s), hw = line.halfWidth(s);
        for (const d of [-hw * 0.55, hw * 0.55 + 1]) {
          const x = p.x + p.nx * d, z = p.z + p.nz * d;
          const pr = this.route.nb.project(x, z);
          const g = this.groundAt(pr.s, pr.d) - 1.5;
          const top = p.y - 1.6, h = top - g;
          if (h < 1) continue;
          Matrix.Compose(new Vector3(1, h, 1), Quaternion.Identity(), new Vector3(x, top, z)).copyToArray(mats as unknown as Float32Array, mats.length);
        }
      }
      i = j;
    }
    if (mats.length) { pierMesh.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16); pierMesh.thinInstanceRefreshBoundingInfo(false); }
    else pierMesh.dispose();
  }

  // ---------------------------------------------------------------- interchange ramps
  private buildRamps() {
    const nb = this.route.nb;
    const mat = new StandardMaterial('rampMat', this.scene);
    mat.diffuseTexture = asphaltTexture(this.scene); mat.specularColor = new Color3(0.06, 0.06, 0.06); mat.backFaceCulling = false;
    for (const ramp of this.route.file.ramps) {
      // resample to 5 m
      const pts: [number, number][] = [];
      for (let k = 0; k < ramp.line.length - 1; k++) {
        const [x1, z1] = ramp.line[k], [x2, z2] = ramp.line[k + 1];
        const L = Math.hypot(x2 - x1, z2 - z1), n = Math.max(1, Math.ceil(L / 5));
        for (let t = 0; t < n; t++) pts.push([x1 + ((x2 - x1) * t) / n, z1 + ((z2 - z1) * t) / n]);
      }
      pts.push(ramp.line[ramp.line.length - 1]);
      let hint = -1;
      const ys: number[] = [], keep: boolean[] = [];
      for (const [x, z] of pts) {
        const pr = nb.project(x, z, hint); hint = pr.i;
        const hw = nb.halfWidth(pr.s);
        keep.push(Math.abs(pr.d) < 320 && pr.s > 20 && pr.s < nb.length - 20);
        const roadY = nb.sample(pr.s).y;
        let y: number;
        if (ramp.bridge) y = Math.max(roadY, this.route.terrainAt(pr.s, pr.d)) + 6.8 * Math.max(1, ramp.layer);
        else if (Math.abs(pr.d) < hw + 4) y = roadY + 0.01;
        else y = this.groundAt(pr.s, pr.d) + 0.3;
        ys.push(y);
      }
      const sm = ys.map((_, k) => { let s = 0, n = 0; for (let q = -3; q <= 3; q++) { const v = ys[k + q]; if (v !== undefined) { s += v; n++; } } return s / n; });
      const pos: number[] = [], uv: number[] = [];
      let rows = 0, acc = 0;
      for (let k = 0; k < pts.length; k++) {
        if (!keep[k]) continue;
        const a = pts[Math.max(0, k - 1)], b = pts[Math.min(pts.length - 1, k + 1)];
        const L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1, tx = (b[0] - a[0]) / L, tz = (b[1] - a[1]) / L;
        if (k) acc += 5;
        for (const d of [-3.6, 3.6]) { pos.push(pts[k][0] + tz * d, sm[k], pts[k][1] - tx * d); uv.push(d / 3.4, acc / 7); }
        rows++;
      }
      if (rows < 2) continue;
      const m = meshFrom('ramp', this.scene, pos, gridIndices(rows, 2), { uvs: uv, upright: true });
      m.material = mat;
      if (ramp.bridge) {
        const dp: number[] = [], dc: number[] = [];
        for (let r = 0; r < rows; r++) {
          const x1 = pos[r * 6], y1 = pos[r * 6 + 1], z1 = pos[r * 6 + 2], x2 = pos[r * 6 + 3], z2 = pos[r * 6 + 5];
          for (const [x, y, z] of [[x1, y1 + 0.9, z1], [x1, y1 - 1.3, z1], [x2, y1 - 1.3, z2], [x2, y1 + 0.9, z2]]) { dp.push(x, y, z); dc.push(0.66, 0.64, 0.6, 1); }
        }
        const deck = meshFrom('rampdeck', this.scene, dp, gridIndices(rows, 4), { colors: dc });
        deck.material = this.propMat;
      }
    }
  }

  private buildFootbridges() {
    const nb = this.route.nb;
    for (const fb of this.route.file.footbridges) {
      const A = fb[0], B = fb[fb.length - 1];
      const mid = nb.project((A[0] + B[0]) / 2, (A[1] + B[1]) / 2);
      if (Math.abs(mid.d) > 60) continue;
      const len = Math.hypot(B[0] - A[0], B[1] - A[1]);
      if (len < 15) continue;
      const yaw = Math.atan2(B[0] - A[0], B[1] - A[1]);
      const deckY = Math.max(nb.sample(mid.s).y, this.sbY[this.idx(mid.s)]) + 6.3;
      const b = new PartBuilder(this.scene, 'footbridge');
      b.box(0, 0, 0, 2.6, 0.45, len + 4, '#9d9a92');
      for (const s of [-1, 1]) b.box(s * 1.25, 0.8, 0, 0.08, 1.2, len + 4, '#2f6f8f');
      b.box(0, 1.9, 0, 2.7, 0.08, len + 4, '#2f6f8f'); // roof bars
      const m = b.build();
      m.material = this.propMat;
      m.position.set((A[0] + B[0]) / 2, deckY, (A[1] + B[1]) / 2);
      m.rotation.y = yaw;
      for (const P of [A, B]) {
        const pr = nb.project(P[0], P[1]);
        const g = this.groundAt(pr.s, pr.d);
        const tower = MeshBuilder.CreateBox('fbtower', { width: 3.2, depth: 4.5, height: deckY - g }, this.scene);
        tower.position.set(P[0], (deckY + g) / 2, P[1]); tower.rotation.y = yaw; tower.material = this.propMat;
      }
    }
  }

  // ---------------------------------------------------------------- vegetation & towns
  private buildVegetation() {
    const nb = this.route.nb;
    const pb = new PartBuilder(this.scene, 'palmTree');
    pb.cylinder(0, 4.5, 0, 0.18, 9, '#6b5a45', 'y', 6);
    for (let k = 0; k < 7; k++) {
      const leaf = MeshBuilder.CreateBox('leaf', { width: 0.9, height: 0.08, depth: 4.2 }, this.scene);
      leaf.bakeTransformIntoVertices(Matrix.Translation(0, 0, 2).multiply(Matrix.RotationX(0.45)).multiply(Matrix.RotationY((k / 7) * Math.PI * 2)).multiply(Matrix.Translation(0, 9, 0)));
      pb.add(leaf, k % 2 ? '#3f6a2a' : '#4f7a30');
    }
    const palmMesh = pb.build();
    const tb2 = new PartBuilder(this.scene, 'broadleaf');
    tb2.cylinder(0, 2.2, 0, 0.3, 4.4, '#5b4a3a', 'y', 6);
    for (const [x, y, z, r] of [[0, 6, 0, 3.4], [1.6, 5.2, 0.8, 2.4], [-1.4, 5.4, -0.6, 2.5], [0.3, 7.4, -0.4, 2.2]]) {
      const s = MeshBuilder.CreateIcoSphere('c', { radius: r, subdivisions: 1 }, this.scene); s.bakeTransformIntoVertices(Matrix.Scaling(1, 0.78, 1).multiply(Matrix.Translation(x, y, z)));
      tb2.add(s, '#3d5e2a');
    }
    const broad = tb2.build();
    const bb = new PartBuilder(this.scene, 'bush');
    for (const [x, z, r] of [[0, 0, 1.4], [1.1, 0.4, 1.0], [-0.9, -0.3, 1.1]]) {
      const s = MeshBuilder.CreateIcoSphere('b', { radius: r, subdivisions: 1 }, this.scene); s.bakeTransformIntoVertices(Matrix.Scaling(1, 0.7, 1).multiply(Matrix.Translation(x, r * 0.5, z)));
      bb.add(s, '#4e6b32');
    }
    const bush = bb.build();
    for (const m of [palmMesh, broad, bush]) { m.material = vehicleMaterial(this.scene); m.isVisible = false; }

    const q = this.quality === 'high' ? 1 : 0.55;
    const chunk = 1000;
    for (let s0 = nb.s[0]; s0 < nb.length; s0 += chunk) {
      const lists: Record<string, number[]> = { palm: [], broad: [], bush: [] };
      const count = { palm: 70 * q, broad: 150 * q, bush: 260 * q };
      for (const kind of ['palm', 'broad', 'bush'] as const) {
        for (let k = 0; k < count[kind]; k++) {
          const s = s0 + this.rnd() * chunk;
          if (s > nb.length) continue;
          const side = this.rnd() < 0.5 ? -1 : 1;
          const d = side * (16 + Math.pow(this.rnd(), 1.6) * 300);
          const i = this.idx(s);
          if (Math.abs(d - this.sbD[i]) < this.sbHW[i] + 10) continue;
          if (nb.bridge[i] && Math.abs(d) < 40) continue;
          const p = nb.toWorld(s, d);
          if (this.streets.nearest(p.x, p.z, 9) || this.colliders.occupied(p.x, p.z, 3)) continue;
          const g = this.groundAt(s, d);
          const sc = kind === 'bush' ? 0.7 + this.rnd() * 0.9 : 0.75 + this.rnd() * 0.6;
          Matrix.Compose(new Vector3(sc, sc * (0.85 + this.rnd() * 0.3), sc), Quaternion.RotationYawPitchRoll(this.rnd() * 6.28, 0, 0), new Vector3(p.x, g - 0.1, p.z))
            .copyToArray(lists[kind] as unknown as Float32Array, lists[kind].length);
        }
      }
      for (const [kind, base] of [['palm', palmMesh], ['broad', broad], ['bush', bush]] as const) {
        if (!lists[kind].length) continue;
        const inst = base.clone(`${kind}-chunk`)!; inst.makeGeometryUnique(); // thin-instance buffers live on the geometry
        inst.isVisible = true;
        inst.thinInstanceSetBuffer('matrix', new Float32Array(lists[kind]), 16);
        inst.thinInstanceRefreshBoundingInfo(false);
      }
    }
  }

  // ---------------------------------------------------------------- inner streets (real OSM streets)
  private buildStreets() {
    const nb = this.route.nb;
    this.streets.setHeights((x, z) => { const p = nb.project(x, z); return this.groundAt(p.s, p.d) + 0.32; });
    const paved = new StandardMaterial('streetPaved', this.scene);
    paved.diffuseTexture = asphaltTexture(this.scene); paved.specularColor = new Color3(0.05, 0.05, 0.05); paved.backFaceCulling = false;
    const dirt = new StandardMaterial('streetDirt', this.scene);
    dirt.diffuseTexture = dirtTexture(this.scene); dirt.specularColor = Color3.Black(); dirt.backFaceCulling = false;
    const bins = new Map<string, { pos: number[]; uv: number[]; col: number[]; idx: number[] }>();
    const net = this.streets;
    net.data.forEach((st, si) => {
      const xs = net.x[si], zs = net.z[si], ys = net.y[si], n = xs.length;
      if (n < 2) return;
      const hw = STREET_HALF_W[st.c];
      const key = (st.u ? 'd' : 'p') + Math.floor(nb.project(xs[0], zs[0]).s / 1500);
      let bin = bins.get(key); if (!bin) bins.set(key, (bin = { pos: [], uv: [], col: [], idx: [] }));
      const base = bin.pos.length / 3;
      let acc = 0;
      for (let k = 0; k < n; k++) {
        const a = Math.max(0, k - 1), b = Math.min(n - 1, k + 1);
        const L = Math.hypot(xs[b] - xs[a], zs[b] - zs[a]) || 1, tx = (xs[b] - xs[a]) / L, tz = (zs[b] - zs[a]) / L;
        if (k) acc += Math.hypot(xs[k] - xs[k - 1], zs[k] - zs[k - 1]);
        const nx = tz, nz = -tx;
        for (const [o, dy, u] of [[-hw - 0.8, -1.2, -0.3], [-hw, 0, 0], [hw, 0, 1], [hw + 0.8, -1.2, 1.3]] as const) {
          bin.pos.push(xs[k] + nx * o, ys[k] + dy, zs[k] + nz * o); bin.uv.push(st.u ? u : (u * hw) / 1.7, st.u ? acc / 6 : acc / 7);
          const c = st.u ? 0.95 + ((si * 7) % 5) * 0.03 : 0.88; bin.col.push(c, c, c, 1);
        }
      }
      gridIndices(n, 4, bin.idx, base);
    });
    for (const [key, b] of bins) {
      const m = meshFrom('street', this.scene, b.pos, b.idx, { uvs: b.uv, colors: b.col, upright: true });
      m.material = key[0] === 'd' ? dirt : paved;
    }
  }

  /** Houses lining the real streets (Lagos is dense; Ogun thins out). */
  private buildHouses() {
    const nb = this.route.nb;
    const variants: Mesh[] = [];
    const walls = ['#e8e1d3', '#d9d4c8', '#efe6d0', '#cfd6d8', '#e4d2b8', '#f0d9c0'];
    const roofs = ['#8a4b2d', '#9a5a36', '#6f6f6f', '#7c3f28', '#5d6d7e'];
    for (let v = 0; v < 8; v++) {
      const b = new PartBuilder(this.scene, 'house');
      const storeys = v < 5 ? 1 : 2;
      const h = storeys * 3.2;
      b.box(0, h / 2, 0, 9, h, 7, walls[v % walls.length]);
      if (v === 7) b.box(0, h + 0.25, 0, 9.4, 0.5, 7.4, '#b2bec3'); // flat-roofed block
      else b.prism([[-3.8, h], [0, h + 1.6], [3.8, h]], 9.6, roofs[v % roofs.length]);
      b.box(0, 1.1, 3.51, 1.2, 2.2, 0.05, '#4a3a2a');
      for (let f = 0; f < storeys; f++) for (const x of [-2.8, 2.8]) b.box(x, f * 3.2 + 1.7, 3.51, 1.4, 1.1, 0.05, '#27323a');
      if (v === 5 || v === 6) { b.box(0, 2.6, 4.4, 9, 0.2, 1.8, '#8a8a8a'); b.box(0, 3.4, 3.52, 6, 0.8, 0.05, SHIRTS[v]); } // shop front + awning
      b.box(0, 0.9, 7.2, 10, 1.8, 0.2, '#cfc6b4'); // fence wall
      const m = b.build(); m.material = vehicleMaterial(this.scene); m.isVisible = false;
      variants.push(m);
    }
    const perKm = this.quality === 'high' ? 420 : 200;
    const perChunk = new Map<number, number>();
    const chunks = new Map<number, number[][]>();
    let placed = 0;
    const net = this.streets;
    for (let si = 0; si < net.data.length; si++) {
      let hint = -1;
      const st = net.data[si];
      if (st.c === 4) continue;
      const xs = net.x[si], zs = net.z[si], n = xs.length;
      const hw = STREET_HALF_W[st.c];
      for (let k = 1; k < n - 1; k += 2) {
        const pr = nb.project(xs[k], zs[k], hint); hint = pr.i;
        const inLagos = pr.s < this.route.stop('berger').s + 1100;
        if (this.rnd() > (inLagos ? 0.85 : 0.55)) continue;
        const L = Math.hypot(xs[k + 1] - xs[k - 1], zs[k + 1] - zs[k - 1]) || 1, tx = (xs[k + 1] - xs[k - 1]) / L, tz = (zs[k + 1] - zs[k - 1]) / L;
        for (const side of [-1, 1]) {
          const off = hw + 7 + this.rnd() * 3;
          const x = xs[k] + tz * off * side, z = zs[k] - tx * off * side;
          const p = nb.project(x, z, pr.i);
          const hwN = nb.halfWidth(p.s), i = this.idx(p.s);
          if (Math.abs(p.d) < hwN + 16 || Math.abs(p.d) > 315 || Math.abs(p.d - this.sbD[i]) < this.sbHW[i] + 14) continue;
          if (nb.bridge[i] && Math.abs(p.d) < 90) continue;
          const other = net.nearest(x, z, 11);
          if ((other && other.street !== si) || this.colliders.occupied(x, z, 5.5)) continue;
          const g = this.groundAt(p.s, p.d);
          const yaw = Math.atan2(-tz * side, tx * side) ; // front (+z) faces the street
          const v = Math.floor(this.rnd() * variants.length);
          const key = Math.floor(p.s / 1000);
          if ((perChunk.get(key) ?? 0) >= perKm) continue;
          perChunk.set(key, (perChunk.get(key) ?? 0) + 1);
          let lists = chunks.get(key); if (!lists) chunks.set(key, (lists = variants.map(() => [])));
          const sc = 0.85 + this.rnd() * 0.35;
          Matrix.Compose(new Vector3(sc, 1, sc), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(x, g - 0.2, z)).copyToArray(lists[v] as unknown as Float32Array, lists[v].length);
          this.colliders.add(x, z, 4.8 * sc);
          placed++;
        }
      }
    }
    for (const lists of chunks.values()) variants.forEach((base, v) => {
      if (!lists[v].length) return;
      const inst = base.clone('houses')!; inst.makeGeometryUnique(); inst.isVisible = true;
      inst.thinInstanceSetBuffer('matrix', new Float32Array(lists[v]), 16); inst.thinInstanceRefreshBoundingInfo(false);
    });
  }

  private buildLights() {
    const nb = this.route.nb;
    const lb = new PartBuilder(this.scene, 'lampPost');
    lb.cylinder(0, 5, 0, 0.1, 10, '#8c9196', 'y', 6);
    for (const s of [-1, 1]) { lb.box(s * 1.2, 9.9, 0, 2.4, 0.1, 0.12, '#8c9196'); lb.box(s * 2.3, 9.8, 0, 0.7, 0.14, 0.32, '#dfe6ea'); }
    const lamp = lb.build(); lamp.material = vehicleMaterial(this.scene);
    const mats: number[] = [];
    const zones = this.route.file.landmarks.map((l) => [l.s - 700, l.s + 700]);
    zones.push([this.route.startS - 400, this.route.startS + 3200]);
    for (let s = nb.s[0]; s < nb.length; s += 42) {
      if (!zones.some(([a, bb]) => s >= a && s <= bb)) continue;
      const p = nb.toWorld(s, -nb.halfWidth(s) - 1.55);
      Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(p.heading, 0, 0), new Vector3(p.x, p.y + 0.8, p.z)).copyToArray(mats as unknown as Float32Array, mats.length);
    }
    lamp.thinInstanceSetBuffer('matrix', new Float32Array(mats), 16); lamp.thinInstanceRefreshBoundingInfo(false);
  }

  // ---------------------------------------------------------------- signs
  sign(s: number, lines: string[], opts: { bg?: string; arrow?: string; overhead?: boolean; d?: number; w?: number } = {}) {
    const nb = this.route.nb;
    const p = nb.sample(s), hw = nb.halfWidth(s);
    const W = opts.w ?? (opts.overhead ? 7 : 4.6), H = W / 2;
    const mat = new StandardMaterial('signMat', this.scene);
    mat.diffuseTexture = signTexture(this.scene, lines, { bg: opts.bg, arrow: opts.arrow });
    mat.emissiveColor = new Color3(0.35, 0.35, 0.35); mat.specularColor = Color3.Black(); mat.backFaceCulling = true;
    const plane = MeshBuilder.CreatePlane('sign', { width: W, height: H, sideOrientation: Mesh.DEFAULTSIDE }, this.scene);
    plane.material = mat;
    const d = opts.overhead ? hw - W / 2 - 0.2 : opts.d ?? hw + 4.4;
    const q = nb.toWorld(s, d);
    const topY = p.y + (opts.overhead ? 7.2 : 2.3 + H);
    plane.position.set(q.x, topY - H / 2, q.z);
    plane.rotation.y = p.heading; // readable by northbound drivers
    const back = MeshBuilder.CreatePlane('signBack', { width: W, height: H }, this.scene);
    back.position.copyFrom(plane.position); back.rotation.y = p.heading + Math.PI; back.material = this.propMat;
    const b = new PartBuilder(this.scene, 'signPosts');
    if (opts.overhead) {
      for (const dd of [-hw - 1.55, hw + 3.4]) { const r = nb.toWorld(s, dd); b.box(r.x, p.y + 4, r.z, 0.35, 8, 0.35, '#7e8388'); }
      const l = nb.toWorld(s, -hw - 1.55), r = nb.toWorld(s, hw + 3.4);
      b.box((l.x + r.x) / 2, topY + 0.3, (l.z + r.z) / 2, Math.hypot(r.x - l.x, r.z - l.z), 0.35, 0.35, '#7e8388', p.heading);
    } else {
      for (const o of [-W * 0.35, W * 0.35]) { const r = nb.toWorld(s, d + o); b.box(r.x, p.y + (topY - p.y) / 2, r.z, 0.12, topY - p.y, 0.12, '#7e8388'); }
    }
    b.build().material = this.propMat;
  }

  private buildSigns() {
    const lm = this.route.file.landmarks;
    this.sign(this.route.startS + 300, ['Lagos–Ibadan Expr.', 'Berger · Ibadan ↑'], { w: 5.4 });
    for (const l of lm) {
      if (l.kind === 'start') continue;
      const s = l.s - 900;
      if (!lm.some((o) => o !== l && Math.abs(o.s - s) < 250)) this.sign(s, [l.name.toUpperCase(), '1 km'], { arrow: '↑' });
    }
    for (const e of this.events.filter((x) => x.kind === 'jam')) this.sign(this.route.startS + e.km * 1000 - 700, ['TRAFFIC AHEAD', 'Expect delays'], { bg: '#e07a10', w: 4.4 });
  }

  // ---------------------------------------------------------------- route events (tied to real sections)
  private buildEvents() {
    const nb = this.route.nb;
    const start = this.route.startS;
    const coneMesh = (() => {
      const b = new PartBuilder(this.scene, 'cone');
      const c = MeshBuilder.CreateCylinder('c', { diameterTop: 0.05, diameterBottom: 0.36, height: 0.75, tessellation: 8 }, this.scene);
      c.bakeTransformIntoVertices(Matrix.Translation(0, 0.38, 0)); b.add(c, '#ff6a13');
      b.box(0, 0.02, 0, 0.45, 0.04, 0.45, '#222');
      const m = b.build(); m.material = vehicleMaterial(this.scene); return m;
    })();
    const cones: number[] = [];
    const cone = (s: number, d: number) => { const p = nb.toWorld(s, d); Matrix.Translation(p.x, p.y, p.z).copyToArray(cones as unknown as Float32Array, cones.length); };

    for (const e of this.events) {
      const s = start + e.km * 1000;
      const hw = nb.halfWidth(s);
      if (e.kind === 'breakdown') {
        const truck = buildVehicle(this.scene, 'truck', '#b8322a', 'brokenTruck');
        truck.material = vehicleMaterial(this.scene);
        const d = hw + 0.7, p = nb.toWorld(s, d);
        truck.position.set(p.x, p.y, p.z); truck.rotation.y = p.heading + 0.04;
        this.obstacles.push({ s, d, len: 12, width: 2.5, kind: 'breakdown' });
        for (const k of [18, 26]) cone(s - k, hw - 0.6);
        const tri = MeshBuilder.CreateCylinder('triangle', { diameter: 0.7, height: 0.05, tessellation: 3 }, this.scene);
        const tp = nb.toWorld(s - 35, hw - 1); tri.position.set(tp.x, tp.y + 0.35, tp.z); tri.rotation.set(Math.PI / 2, tp.heading, 0);
        tri.material = this.propMat;
      } else if (e.kind === 'construction') {
        const s1 = s + e.lengthM;
        const laneEdge = hw - LANE_W;
        this.closures.push({ s0: s - 60, s1, dMax: laneEdge, label: e.label });
        for (let k = s - 60; k < s1; k += 8) { const t = Math.min(1, (k - (s - 60)) / 60); cone(k, hw - 0.3 - t * (LANE_W - 0.6)); }
        const boards = new PartBuilder(this.scene, 'works');
        for (let k = s + 10; k < s1 - 10; k += 40) {
          const p = nb.toWorld(k, hw - 1.8);
          boards.box(p.x, p.y + 0.55, p.z, 3.2, 1.1, 0.25, k % 80 < 40 ? '#f28c28' : '#f4f4f4', p.heading);
          const w = nb.toWorld(k + 15, hw + 0.5);
          boards.box(w.x, w.y + 0.3, w.z, 2.2, 0.6, 1.4, '#6b5a45', w.heading);
        }
        boards.build().material = this.propMat;
        this.sign(s - 300, ['ROAD WORKS', 'Right lane closed'], { bg: '#e07a10', w: 4.4 });
      } else if (e.kind === 'checkpoint') {
        const s1 = s + e.lengthM;
        this.closures.push({ s0: s + 40, s1: s1 - 40, dMax: -hw + LANE_W + 0.2, label: e.label });
        for (let k = s; k < s1; k += 7) {
          const mid = (s + s1) / 2, t = 1 - Math.min(1, Math.abs(k - mid) / ((s1 - s) / 2 - 20));
          cone(k, hw - 0.3 - Math.max(0, t) * (2 * hw - LANE_W - 0.6));
        }
        const van = buildVehicle(this.scene, 'suv', '#1c2a4a', 'policeVan');
        van.material = vehicleMaterial(this.scene);
        const vp = nb.toWorld(s + e.lengthM / 2 + 10, hw + 1.4); van.position.set(vp.x, vp.y, vp.z); van.rotation.y = vp.heading;
        const people = new PartBuilder(this.scene, 'officers');
        for (const [k, d] of [[0, hw - 3.8], [8, hw - 2.4], [16, hw + 0.8]] as const) {
          const p = nb.toWorld(s + e.lengthM / 2 + k, d);
          people.box(p.x, p.y + 0.5, p.z, 0.45, 1.0, 0.3, '#1b2433');
          people.box(p.x, p.y + 1.35, p.z, 0.5, 0.7, 0.32, '#23324d');
          people.box(p.x, p.y + 1.85, p.z, 0.26, 0.28, 0.26, '#4a3326');
        }
        people.build().material = this.propMat;
        this.sign(s - 300, ['POLICE CHECKPOINT', 'Slow down · 30 km/h'], { bg: '#1f3f73', w: 5 });
      }
    }
    if (cones.length) { coneMesh.thinInstanceSetBuffer('matrix', new Float32Array(cones), 16); coneMesh.thinInstanceRefreshBoundingInfo(false); }
    else coneMesh.dispose();
  }

  /** Bus-stop bays at every real stop, the Ojota motor park at the start and Mowe park at the end. */
  private buildStops() {
    const nb = this.route.nb;
    const people = SHIRTS.slice(0, 6).map((c, i) => { const m = buildPerson(this.scene, c, i); m.isVisible = false; return m; });
    for (const l of this.route.file.landmarks) {
      const s = l.s, hw = nb.halfWidth(s);
      // painted bay across the right lane + shoulder (brightened when you have passengers for this stop)
      const pos: number[] = [], col: number[] = [];
      for (let k = -40; k <= 40; k += 5) {
        const p = nb.sample(s + k), h2 = nb.halfWidth(s + k);
        for (const d of [h2 - LANE_W + 0.3, h2 + 2.6]) { const q = nb.toWorld(s + k, d); pos.push(q.x, p.y + 0.03, q.z); col.push(0.09, 0.53, 1, 1); }
      }
      const bay = meshFrom('bay', this.scene, pos, gridIndices(pos.length / 6, 2), { colors: col, upright: true });
      const bm = new StandardMaterial('bayMat-' + l.id, this.scene);
      bm.alpha = 0.12; bm.emissiveColor = new Color3(0.05, 0.3, 0.6); bm.zOffset = -3; bm.backFaceCulling = false;
      bay.material = bm; this.stopBays.set(l.id, bm);
      const title = l.kind === 'start' ? 'OJOTA MOTOR PARK' : l.kind === 'destination' ? l.name.toUpperCase() + ' PARK' : l.name.toUpperCase();
      this.sign(s - 10, [title, l.kind === 'stop' ? 'Bus stop' : 'Intercity park'], { bg: '#1688ff', d: hw + 7.5, w: 4.6 });
      const b = new PartBuilder(this.scene, 'stop');
      if (l.kind === 'stop') {
        // shelter
        const p = nb.toWorld(s + 12, hw + 5.2);
        b.box(p.x, p.y + 2.5, p.z, 7, 0.2, 2.6, '#1d5fa8', p.heading);
        for (const o of [-3, 3]) { const q = nb.toWorld(s + 12 + o, hw + 6.2); b.box(q.x, q.y + 1.25, q.z, 0.15, 2.5, 0.15, '#9aa0a4'); }
        const bq = nb.toWorld(s + 12, hw + 5.8); b.box(bq.x, bq.y + 0.5, bq.z, 5, 0.12, 0.6, '#6b5a45', bq.heading);
      } else {
        // motor park: blocks, canopy, parked intercity buses
        for (let k = 0; k < 6; k++) {
          const p = nb.toWorld(s - 45 + k * 14, hw + 24);
          b.box(p.x, p.y + 1.8, p.z, 11, 3.6, 7, k % 2 ? '#e4d2b8' : '#d9d4c8', p.heading);
          b.box(p.x, p.y + 3.8, p.z, 11.6, 0.3, 7.6, '#8a4b2d', p.heading);
        }
        const c = nb.toWorld(s, hw + 12); b.box(c.x, c.y + 4.2, c.z, 30, 0.3, 9, '#1d5fa8', c.heading);
        for (const o of [-14, 14]) for (const dd of [8, 16]) { const q = nb.toWorld(s + o, hw + dd); b.box(q.x, q.y + 2.1, q.z, 0.3, 4.2, 0.3, '#9aa0a4'); }
        for (let k = 0; k < 4; k++) {
          const m = buildVehicle(this.scene, k % 2 ? 'minibus' : 'sienna', k % 2 ? '#f2f2ee' : '#b7bcc1', 'parked');
          m.material = vehicleMaterial(this.scene);
          const p = nb.toWorld(s - 30 + k * 9, hw + 13); m.position.set(p.x, p.y, p.z); m.rotation.y = p.heading + 0.25;
          this.colliders.add(p.x, p.z, 2.6);
        }
      }
      b.build().material = vehicleMaterial(this.scene);
      // a few bystanders (waiting passengers are managed by the Passengers system)
      for (let k = 0; k < 3; k++) {
        const q = nb.toWorld(s + 20 + k * 3, hw + 8 + this.rnd() * 3);
        const inst = people[(k + l.id.length) % people.length].createInstance('bystander');
        inst.position.set(q.x, q.y, q.z); inst.rotation.y = q.heading + Math.PI / 2 + (this.rnd() - 0.5);
      }
    }
  }
}

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
