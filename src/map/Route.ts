// Map + Route system: loads the baked OSM/elevation route and answers
// geometric questions in "road space" (s = metres along the carriageway,
// d = metres to the right of its centreline).
export interface RouteFile {
  id: string;
  name: string;
  source: string;
  step: number;
  startS: number;
  endS: number;
  nb: LineData;
  sb: LineData;
  terrain: { every: number; offsets: number[]; h: number[] };
  ramps: { bridge: number; layer: number; line: [number, number][] }[];
  footbridges: [number, number][][];
  landmarks: Landmark[];
  streets: StreetData[];
  pois: Poi[];
}
export interface Landmark { id: string; name: string; s: number; kind: 'start' | 'stop' | 'destination' }
/** c: 0 primary/secondary, 1 tertiary, 2 residential, 3 service, 4 track; u: untarred; a: surface assumed; p: [x,z,…] */
export interface StreetData { c: number; u: number; a: number; n: string; p: number[] }
export interface Poi { name: string; cat: string; s: number; d: number; x: number; z: number }
interface LineData { x: number[]; z: number[]; y: number[]; bridge: number[]; lanes: number[] }

export interface Sample {
  x: number; y: number; z: number;
  tx: number; tz: number; // unit tangent
  nx: number; nz: number; // unit right normal
  heading: number; // yaw (radians) for Babylon: atan2(tx, tz)
  kappa: number; // signed curvature (+ = curving right)
  lanes: number;
  bridge: boolean;
}

export const LANE_W = 3.65;

export class Line {
  readonly n: number;
  readonly x: Float64Array; readonly z: Float64Array; readonly y: Float64Array;
  readonly s: Float64Array;
  readonly heading: Float64Array;
  readonly kappa: Float64Array;
  readonly lanes: Float64Array; // smoothed lane count (fractional during merges)
  readonly bridge: Uint8Array;
  readonly length: number;

  constructor(d: LineData) {
    const n = (this.n = d.x.length);
    this.x = Float64Array.from(d.x); this.z = Float64Array.from(d.z); this.y = Float64Array.from(d.y);
    this.bridge = Uint8Array.from(d.bridge);
    this.s = new Float64Array(n);
    for (let i = 1; i < n; i++) this.s[i] = this.s[i - 1] + Math.hypot(this.x[i] - this.x[i - 1], this.z[i] - this.z[i - 1]);
    this.length = this.s[n - 1];
    this.heading = new Float64Array(n);
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - 2), b = Math.min(n - 1, i + 2);
      this.heading[i] = Math.atan2(this.x[b] - this.x[a], this.z[b] - this.z[a]);
    }
    // curvature from heading change over ±20 m, smoothed
    const raw = new Float64Array(n);
    const W = 4;
    for (let i = 0; i < n; i++) {
      const a = Math.max(0, i - W), b = Math.min(n - 1, i + W);
      let dh = this.heading[b] - this.heading[a];
      while (dh > Math.PI) dh -= 2 * Math.PI;
      while (dh < -Math.PI) dh += 2 * Math.PI;
      raw[i] = dh / Math.max(1, this.s[b] - this.s[a]);
    }
    this.kappa = smooth(raw, 6);
    // lanes: smooth over ±80 m so merges taper instead of stepping
    this.lanes = smooth(Float64Array.from(d.lanes), 16);
  }

  /** index + fraction for arc length s (clamped). */
  locate(s: number): [number, number] {
    if (s <= 0) return [0, 0];
    if (s >= this.length) return [this.n - 2, 1];
    let lo = 0, hi = this.n - 1;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.s[m] <= s) lo = m; else hi = m; }
    return [lo, (s - this.s[lo]) / (this.s[lo + 1] - this.s[lo] || 1)];
  }

  sample(s: number, out: Sample = {} as Sample): Sample {
    const [i, t] = this.locate(s);
    const j = Math.min(this.n - 1, i + 1);
    out.x = this.x[i] + (this.x[j] - this.x[i]) * t;
    out.z = this.z[i] + (this.z[j] - this.z[i]) * t;
    out.y = this.y[i] + (this.y[j] - this.y[i]) * t;
    const h = lerpAngle(this.heading[i], this.heading[j], t);
    out.heading = h;
    out.tx = Math.sin(h); out.tz = Math.cos(h);
    out.nx = out.tz; out.nz = -out.tx;
    out.kappa = this.kappa[i] + (this.kappa[j] - this.kappa[i]) * t;
    out.lanes = this.lanes[i] + (this.lanes[j] - this.lanes[i]) * t;
    out.bridge = !!(this.bridge[i] || this.bridge[j]);
    return out;
  }

  halfWidth(s: number): number {
    const [i, t] = this.locate(s);
    return (this.lanes[i] + (this.lanes[Math.min(this.n - 1, i + 1)] - this.lanes[i]) * t) * LANE_W * 0.5;
  }

  private grid: Map<number, number> | null = null;
  private static CELL = 50;
  /** Coarse cell → nearest-sample index, so projections never need a full scan. */
  private buildGrid() {
    const g = new Map<number, { i: number; d2: number }>(), C = Line.CELL, R = 14; // ±700 m
    for (let i = 0; i < this.n; i += 2) {
      const cx = Math.floor(this.x[i] / C), cz = Math.floor(this.z[i] / C);
      for (let a = cx - R; a <= cx + R; a++) for (let b = cz - R; b <= cz + R; b++) {
        const px = (a + 0.5) * C - this.x[i], pz = (b + 0.5) * C - this.z[i], d2 = px * px + pz * pz;
        const k = a * 100003 + b, cur = g.get(k);
        if (!cur || d2 < cur.d2) g.set(k, { i, d2 });
      }
    }
    this.grid = new Map([...g].map(([k, v]) => [k, v.i]));
  }

  /** Nearest point on the line to (x,z). Searches around `hint` (index) when given, else uses a spatial grid. */
  project(x: number, z: number, hint = -1): { s: number; d: number; i: number; dist: number } {
    if (hint < 0) {
      if (!this.grid) this.buildGrid();
      hint = this.grid!.get(Math.floor(x / Line.CELL) * 100003 + Math.floor(z / Line.CELL)) ?? -1;
    }
    let a = 0, b = this.n - 2;
    if (hint >= 0) { a = Math.max(0, hint - 60); b = Math.min(this.n - 2, hint + 60); }
    let best = Infinity, bi = 0, bt = 0;
    for (let i = a; i <= b; i++) {
      const ex = this.x[i + 1] - this.x[i], ez = this.z[i + 1] - this.z[i];
      const L2 = ex * ex + ez * ez || 1;
      let t = ((x - this.x[i]) * ex + (z - this.z[i]) * ez) / L2;
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const px = this.x[i] + ex * t, pz = this.z[i] + ez * t;
      const dd = (x - px) ** 2 + (z - pz) ** 2;
      if (dd < best) { best = dd; bi = i; bt = t; }
    }
    const s = this.s[bi] + (this.s[bi + 1] - this.s[bi]) * bt;
    const smp = this.sample(s);
    const d = (x - smp.x) * smp.nx + (z - smp.z) * smp.nz;
    return { s, d, i: bi, dist: Math.sqrt(best) };
  }

  /** World position for road-space (s, d). */
  toWorld(s: number, d: number, out: Sample = {} as Sample): Sample {
    this.sample(s, out);
    out.x += out.nx * d; out.z += out.nz * d;
    return out;
  }
}

export class Route {
  readonly nb: Line;
  readonly sb: Line;
  readonly file: RouteFile;
  private readonly tRows: number;
  private readonly tCols: number;
  private readonly tRowS: Float64Array;

  constructor(file: RouteFile) {
    this.file = file;
    this.nb = new Line(file.nb);
    this.sb = new Line(file.sb);
    this.tCols = file.terrain.offsets.length;
    this.tRows = file.terrain.h.length / this.tCols;
    this.tRowS = new Float64Array(this.tRows);
    for (let r = 0; r < this.tRows; r++) this.tRowS[r] = this.nb.s[Math.min(this.nb.n - 1, r * file.terrain.every)];
    // bus-stop bays can't sit on a bridge deck: move them just past the bridge
    for (const l of file.landmarks) {
      let [i] = this.nb.locate(l.s);
      if (!this.nb.bridge[i] && !this.nb.bridge[Math.min(this.nb.n - 1, i + 10)]) continue;
      while (i < this.nb.n - 1 && (this.nb.bridge[i] || this.nb.bridge[Math.min(this.nb.n - 1, i + 10)])) i++;
      l.s = this.nb.s[i] + 70;
    }
    this.tripStart = file.startS; this.tripEnd = file.endS;
    // SRTM is a surface model (buildings, canopy): blur ~100 m to get the ground shape
    const h = file.terrain.h, C = this.tCols, R = this.tRows, out = new Array<number>(h.length);
    for (let r = 0; r < R; r++) for (let c = 0; c < C; c++) {
      let s = 0, n = 0;
      for (let dr = -2; dr <= 2; dr++) for (let dc = -2; dc <= 2; dc++) {
        const rr = r + dr, cc = c + dc; if (rr < 0 || rr >= R || cc < 0 || cc >= C) continue; s += h[rr * C + cc]; n++;
      }
      out[r * C + c] = s / n;
    }
    file.terrain.h = out;
  }

  static async load(id: string): Promise<Route> {
    const res = await fetch(`${import.meta.env.BASE_URL}data/${id}.json`);
    if (!res.ok) throw new Error(`Route ${id}: HTTP ${res.status}`);
    return new Route(await res.json());
  }

  /** Route origin (Ojota); events and world props are measured from here. */
  get startS() { return this.file.startS; }
  get endS() { return this.file.endS; }
  /** Current trip slice. */
  tripStart = 0; tripEnd = 0;
  get tripLength() { return this.tripEnd - this.tripStart; }
  setTrip(fromId: string, toId: string) {
    this.tripStart = this.stop(fromId).s;
    this.tripEnd = this.stop(toId).s;
  }
  stop(id: string): Landmark { const l = this.file.landmarks.find((x) => x.id === id); if (!l) throw new Error('unknown stop ' + id); return l; }
  /** Stops strictly after s0 and up to s1, in travel order. */
  stopsBetween(s0: number, s1: number) { return this.file.landmarks.filter((l) => l.s > s0 + 1 && l.s <= s1 + 1); }

  /** Raw terrain height (SRTM) at NB road-space (s, d). */
  terrainAt(s: number, d: number): number {
    const off = this.file.terrain.offsets, h = this.file.terrain.h;
    let r = 0;
    { let lo = 0, hi = this.tRows - 1; while (hi - lo > 1) { const m = (lo + hi) >> 1; if (this.tRowS[m] <= s) lo = m; else hi = m; } r = lo; }
    const r1 = Math.min(this.tRows - 1, r + 1);
    const tr = Math.min(1, Math.max(0, (s - this.tRowS[r]) / (this.tRowS[r1] - this.tRowS[r] || 1)));
    const step = off[1] - off[0];
    const fc = Math.min(this.tCols - 1.001, Math.max(0, (d - off[0]) / step));
    const c = Math.floor(fc), tc = fc - c;
    const H = (rr: number, cc: number) => h[rr * this.tCols + cc];
    const a = H(r, c) * (1 - tc) + H(r, c + 1) * tc;
    const b = H(r1, c) * (1 - tc) + H(r1, c + 1) * tc;
    return a * (1 - tr) + b * tr;
  }
}

function smooth(a: Float64Array, w: number): Float64Array {
  const out = new Float64Array(a.length);
  for (let i = 0; i < a.length; i++) {
    let s = 0, n = 0;
    for (let k = -w; k <= w; k++) { const j = i + k; if (j < 0 || j >= a.length) continue; s += a[j]; n++; }
    out[i] = s / n;
  }
  return out;
}

export function lerpAngle(a: number, b: number, t: number) {
  let d = b - a;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return a + d * t;
}
