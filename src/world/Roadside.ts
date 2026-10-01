// Roadside scenery along the expressway, from the Blender-built kit (public/models/scenery/roadside.glb,
// built by tools/blender/build_roadside.py): open drains, kiosks, bukas, POS and umbrella stalls,
// vulcanizers, petrol stations, billboards, power poles with wires, unfinished buildings, water tanks,
// elephant grass, plantain and clutter. All names and brands are fictional.
//
// Placement is deterministic and data-driven: how built-up a stretch is comes from the real OSM street
// density next to the road plus the distance to real stops, so busy Lagos sections get drains, shops and
// poles, and the open Ogun stretches get tall grass, plantain and half-built houses.
import { Vector3, Matrix, Quaternion } from '@babylonjs/core/Maths/math.vector';
import { Color4 } from '@babylonjs/core/Maths/math.color';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { CreateLineSystem } from '@babylonjs/core/Meshes/Builders/linesBuilder';
import type { World } from './World';
import { loadKit } from './assets';
import { Colliders } from '../map/Streets';

const CHUNK = 1500; // metres of road per thin-instance batch

function mulberry(a: number) {
  return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
const smoothstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

/** Footprint radius (m) of each prototype for spacing, and whether the vehicle can hit it. */
const RADIUS: Record<string, [number, boolean]> = {
  kiosk: [2.2, true], buka: [2.6, true], vulcanizer: [2.3, true], pos_stand: [1.5, true], umbrella_stall: [1.6, true],
  station: [10, true], shelter: [1.9, true], billboard_network: [3.4, true], billboard_rice: [3.4, true], billboard_safety: [3.4, true],
  church_sign: [1.4, false], water_tank: [1.2, true], power_pole: [0.4, true], unfinished: [6.4, true],
  plantain: [1.4, false], jerrycans: [0.7, false], tyre_pile: [1.0, false], sand_pile: [2.2, false], grass: [0, false],
  drain: [0, false], drain_covered: [0, false],
};

export interface RoadsideStats { placed: Record<string, number>; skipped: Record<string, number>; town: number[] }

export async function buildRoadside(w: World): Promise<RoadsideStats | null> {
  const kit = await loadKit(w.scene, 'roadside');
  if (!kit) return null;
  const nb = w.route.nb;
  const file = w.route.file;
  const rnd = mulberry(4206);
  const q = w.quality === 'high' ? 1 : 0.5;
  const stats: Record<string, number> = {};
  const lists = new Map<string, Map<number, number[]>>(); // kind → chunk → matrices
  const tmp = Matrix.Identity();
  const soft = new Colliders(); // takes up room but you can drive through it (grass, plantain, billboards' open frame)

  // ---------------------------------------------------------------- where is built up?
  // street vertices within 300 m of the road, per 100 m of chainage (real OSM data)
  const BIN = 100, nBins = Math.ceil(nb.length / BIN) + 1;
  const dens = new Float64Array(nBins);
  w.streets.data.forEach((_, si) => {
    const xs = w.streets.x[si], zs = w.streets.z[si]; let hint = -1;
    for (let k = 0; k < xs.length; k++) {
      const p = nb.project(xs[k], zs[k], hint); hint = p.i;
      if (Math.abs(p.d) < 300) dens[Math.min(nBins - 1, Math.floor(p.s / BIN))]++;
    }
  });
  const sm = new Float64Array(nBins);
  for (let i = 0; i < nBins; i++) { let a = 0, n = 0; for (let k = -4; k <= 4; k++) { const v = dens[i + k]; if (v !== undefined) { a += v; n++; } } sm[i] = a / n; }
  const sorted = [...sm].filter((v) => v > 0).sort((a, b) => a - b);
  const ref = sorted[Math.floor(sorted.length * 0.8)] || 1;
  const stops = file.landmarks;
  /** 0 = open country, 1 = busy town. */
  const town = (s: number) => {
    let t = Math.min(1, sm[Math.min(nBins - 1, Math.max(0, Math.floor(s / BIN)))] / ref);
    for (const l of stops) t = Math.max(t, 1 - smoothstep(250, 1100, Math.abs(s - l.s)));
    return t;
  };
  const nearStop = (s: number, m: number) => stops.some((l) => Math.abs(s - l.s) < m);

  // ---------------------------------------------------------------- keep-out: ramps and footbridges
  const KO = 20, ko = new Set<number>();
  const koAdd = (x: number, z: number) => ko.add(Math.floor(x / KO) * 100003 + Math.floor(z / KO));
  for (const r of file.ramps) for (let k = 0; k < r.line.length - 1; k++) {
    const [x1, z1] = r.line[k], [x2, z2] = r.line[k + 1], n = Math.max(1, Math.ceil(Math.hypot(x2 - x1, z2 - z1) / 8));
    for (let t = 0; t <= n; t++) koAdd(x1 + ((x2 - x1) * t) / n, z1 + ((z2 - z1) * t) / n);
  }
  for (const fb of file.footbridges) for (const [x, z] of fb) koAdd(x, z);
  const inKO = (x: number, z: number) => {
    const cx = Math.floor(x / KO), cz = Math.floor(z / KO);
    for (let a = -1; a <= 1; a++) for (let b = -1; b <= 1; b++) if (ko.has((cx + a) * 100003 + cz + b)) return true;
    return false;
  };

  // ---------------------------------------------------------------- placement helpers
  /** Outer edge of the road on this side, in NB road space (left = beyond the southbound carriageway). */
  const edge = (s: number, side: 1 | -1) => {
    const i = w.idx(s);
    if (side > 0) return nb.halfWidth(s);
    return Math.abs(w.sbD[i]) < 300 ? -w.sbD[i] + w.sbHW[i] : nb.halfWidth(s);
  };
  const dAt = (s: number, side: 1 | -1, off: number) => side * (edge(s, side) + off);

  /** Can something of radius r stand at (s, d)? */
  const rejects: Record<string, number> = {};
  const no = (why: string) => { rejects[why] = (rejects[why] ?? 0) + 1; return false; };
  const free = (s: number, d: number, r: number, streetGap = 4) => {
    if (s < nb.s[0] + 20 || s > nb.length - 20) return no('ends');
    const i = w.idx(s);
    const hw = nb.halfWidth(s);
    if (d > 0 && d < hw + 3) return no('road');
    if (Math.abs(d - w.sbD[i]) < w.sbHW[i] + 3 + r) return no('sb');
    if (d < 0 && d > -hw - 1) return no('road');
    if (nb.bridge[Math.max(0, i - 3)] || nb.bridge[i] || nb.bridge[Math.min(nb.n - 1, i + 3)]) return no('bridge');
    if (w.sbBridge[i] && Math.abs(d - w.sbD[i]) < 60) return no('bridge');
    const p = nb.toWorld(s, d);
    if (w.streets.nearest(p.x, p.z, r + streetGap)) return no('street');
    if (r > 0 && w.colliders.occupied(p.x, p.z, r)) return no('collider');
    if (r > 0 && soft.occupied(p.x, p.z, r)) return no('soft');
    if (inKO(p.x, p.z)) return no('ramp');
    return true;
  };

  /** Place a prototype at road-space (s, d). yawOff is added to "front faces the road". */
  const put = (kind: string, s: number, d: number, opts: { yaw?: number; absYaw?: boolean; scale?: number; sy?: number; dy?: number } = {}) => {
    if (!kit.has(kind)) return;
    const p = nb.toWorld(s, d);
    const side = d >= 0 ? 1 : -1;
    const yaw = opts.absYaw ? p.heading + (opts.yaw ?? 0) : p.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2) + (opts.yaw ?? 0);
    const sc = opts.scale ?? 1;
    const y = w.groundAt(s, d) + (opts.dy ?? 0);
    Matrix.ComposeToRef(new Vector3(sc, sc * (opts.sy ?? 1), sc), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(p.x, y, p.z), tmp);
    let byChunk = lists.get(kind); if (!byChunk) lists.set(kind, (byChunk = new Map()));
    const c = Math.floor(s / CHUNK);
    let arr = byChunk.get(c); if (!arr) byChunk.set(c, (arr = []));
    tmp.copyToArray(arr as unknown as Float32Array, arr.length);
    stats[kind] = (stats[kind] ?? 0) + 1;
    const [r, solid] = RADIUS[kind] ?? [0, false];
    if (r > 0) (solid ? w.colliders : soft).add(p.x, p.z, r * sc);
  };
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(rnd() * xs.length)];

  const S0 = nb.s[0] + 30, S1 = nb.length - 30;

  // ---------------------------------------------------------------- petrol stations (fictional KOLA OIL)
  // real fuel stations already stand where OSM has them; add ours on the long stretches without one
  const fuel = file.pois.filter((p) => p.cat === 'fuel').map((p) => p.s);
  let flip = 1 as 1 | -1;
  for (let s = S0 + 2500; s < S1 - 600; s += 3800 + rnd() * 1800) {
    if (fuel.some((f) => Math.abs(f - s) < 1500) || nearStop(s, 450)) continue;
    for (const ds of [0, 120, -120, 240, -240]) {
      const d = dAt(s + ds, flip, 16);
      if (free(s + ds, d, 11, 6)) { put('station', s + ds, d); flip = (flip * -1) as 1 | -1; break; }
    }
  }

  // ---------------------------------------------------------------- shops and stalls by the road
  const SHOPS = ['kiosk', 'kiosk', 'kiosk', 'buka', 'buka', 'umbrella_stall', 'umbrella_stall', 'pos_stand', 'pos_stand', 'vulcanizer'] as const;
  const shopRow = (s0: number, s1: number, side: 1 | -1, density: number) => {
    for (let s = s0; s < s1;) {
      if (rnd() > density) { s += 8 + rnd() * 14; continue; }
      if (side > 0 && stops.some((l) => s > l.s - 50 && s < l.s + 60)) { s += 10; continue; } // bus-stop bay, shelter and sign
      const kind = pick(SHOPS);
      const r = RADIUS[kind][0];
      const d = dAt(s + r, side, 6.5 + r + Math.pow(rnd(), 2) * 6);
      if (!free(s + r, d, r + 0.4)) { s += 3; continue; }
      put(kind, s + r, d, { yaw: (rnd() - 0.5) * 0.25 });
      // a little clutter around it
      const u = rnd(), sc = s + r;
      if (kind === 'vulcanizer') { const dd = d + side * -1.2; if (free(sc + 3.2, dd, 0.8, 2)) put('tyre_pile', sc + 3.2, dd, { yaw: rnd() * 6 }); }
      else if (u < 0.25) { if (free(sc + r + 0.9, d, 0.6, 2)) put('jerrycans', sc + r + 0.9, d, { yaw: rnd() * 6 }); }
      if (rnd() < 0.35 * q) { const dd = d + side * (5 + rnd() * 6); if (free(sc, dd, 1.4, 2)) put('plantain', sc, dd, { absYaw: true, yaw: rnd() * 6.28, scale: 0.8 + rnd() * 0.4 }); }
      s += 2 * r + 0.8 + rnd() * 4;
    }
  };
  for (const l of stops) {
    // busiest right at the stop, both ways along the road; a bit less across the dual carriageway
    shopRow(l.s - 450, l.s + 450, 1, 0.95);
    shopRow(l.s - 350, l.s + 350, -1, 0.75);
  }
  // frontage wherever the street data says people live, in 200 m blocks
  for (let s = S0; s < S1; s += 200) {
    const t = town(s + 100);
    if (t < 0.4 || nearStop(s + 100, 550)) continue;
    shopRow(s, s + 200, 1, 0.7 * t * t);
    shopRow(s, s + 200, -1, 0.4 * t * t);
  }

  // ---------------------------------------------------------------- informal bus stops (shelter + stalls) in towns
  for (let s = S0 + 600; s < S1; s += 900 + rnd() * 700) {
    if (town(s) < 0.5 || nearStop(s, 500)) continue;
    const side = 1;
    const d = dAt(s, side, 5.2);
    if (!free(s, d, 2.2, 6)) continue;
    put('shelter', s, d);
    for (const k of [-7, 6]) { const dd = dAt(s + k, side, 7 + rnd() * 2); if (free(s + k, dd, 1.6)) put(pick(['umbrella_stall', 'pos_stand'] as const), s + k, dd, { yaw: (rnd() - 0.5) * 0.4 }); }
  }

  // ---------------------------------------------------------------- billboards (angled towards oncoming traffic)
  const BOARDS = ['billboard_network', 'billboard_rice', 'billboard_safety'] as const;
  let last = '';
  for (let s = S0 + 300; s < S1; s += 450 + rnd() * 350) {
    let kind: string = pick(BOARDS); if (kind === last) kind = BOARDS[(BOARDS.indexOf(kind as typeof BOARDS[number]) + 1) % 3];
    const side: 1 | -1 = rnd() < 0.7 ? 1 : -1;
    let d = 0;
    for (const off of [12 + rnd() * 10, 26, 9]) { const dd = dAt(s, side, off); if (free(s, dd, 3.4, 5)) { d = dd; break; } }
    if (!d) continue;
    // the right side is read by you (northbound); the far side by southbound traffic
    put(kind, s, d, { yaw: side > 0 ? -0.55 : 0.55, scale: 1.6 + rnd() * 0.3 }); // the kit board is 6 m; expressway boards run 10-12 m
    last = kind;
  }

  // ---------------------------------------------------------------- church signs near towns
  for (let s = S0 + 200; s < S1; s += 1400 + rnd() * 1600) {
    if (town(s) < 0.3) continue;
    const d = dAt(s, 1, 6.5 + rnd() * 2);
    if (free(s, d, 1.4)) put('church_sign', s, d, { yaw: -0.35 });
  }

  // ---------------------------------------------------------------- unfinished buildings, water tanks, sand
  for (let s = S0; s < S1; s += 40) {
    const t = town(s);
    const ogun = s > w.route.stop('kara').s + 400;
    const p = (ogun ? 0.26 : 0.07) * (0.35 + t) * q;
    if (rnd() < p) {
      const side: 1 | -1 = rnd() < 0.6 ? 1 : -1;
      const d = dAt(s, side, 24 + Math.pow(rnd(), 1.4) * 90);
      if (free(s, d, 7, 6)) {
        put('unfinished', s, d, { yaw: (rnd() - 0.5) * 0.5, scale: 0.9 + rnd() * 0.2 });
        if (rnd() < 0.4) { const dd = d + side * 9; if (free(s + 4, dd, 2.4)) put('sand_pile', s + 4, dd, { absYaw: true, yaw: rnd() * 6 }); }
      }
    }
    if (rnd() < 0.12 * t * q) {
      const side: 1 | -1 = rnd() < 0.6 ? 1 : -1;
      const d = dAt(s, side, 20 + rnd() * 50);
      if (free(s, d, 1.3, 5)) put('water_tank', s, d, { absYaw: true, yaw: rnd() * 6 });
    }
  }

  // ---------------------------------------------------------------- plantain groves near settlements
  for (let s = S0; s < S1; s += 25) {
    const t = town(s);
    if (rnd() > (0.08 + 0.25 * t) * q) continue;
    const side: 1 | -1 = rnd() < 0.55 ? 1 : -1;
    const dBase = 16 + rnd() * 60;
    const n = 1 + Math.floor(rnd() * 4);
    for (let k = 0; k < n; k++) {
      const ss = s + (rnd() - 0.5) * 8, d = dAt(ss, side, dBase + (rnd() - 0.5) * 6);
      if (free(ss, d, 1.2, 3)) put('plantain', ss, d, { absYaw: true, yaw: rnd() * 6.28, scale: 0.75 + rnd() * 0.5 });
    }
  }

  // ---------------------------------------------------------------- open drains along the town kerb
  {
    let covered = 0;
    for (let s = S0; s < S1; s += 4) {
      if (town(s) < 0.4) continue;
      const i = w.idx(s);
      const d = nb.halfWidth(s) + 3.6;
      if (nb.bridge[Math.max(0, i - 2)] || nb.bridge[i] || nb.bridge[Math.min(nb.n - 1, i + 2)]) continue;
      const p = nb.toWorld(s, d);
      if (w.streets.nearest(p.x, p.z, 5) || inKO(p.x, p.z)) continue; // culvert gap where a street joins
      if (covered <= 0 && rnd() < 0.04) covered = 3 + Math.floor(rnd() * 5);
      const kind = covered-- > 0 || stops.some((l) => Math.abs(s - l.s) < 45) ? 'drain_covered' : 'drain';
      put(kind, s, d, { absYaw: true, dy: 0.03 });
    }
  }

  // ---------------------------------------------------------------- power poles and wires (towns)
  const wires: Vector3[][] = [];
  const wireChunks = new Map<number, Vector3[][]>();
  for (const side of [1, -1] as const) {
    let prev: { s: number; x: number; y: number; z: number; nx: number; nz: number } | null = null;
    for (let s = S0; s < S1; s += 42 + rnd() * 8) {
      if (town(s) < 0.45) { prev = null; continue; }
      const d = dAt(s, side, side > 0 ? 6.8 : 5.5);
      if (!free(s, d, 0.5, 2)) { prev = null; continue; }
      put('power_pole', s, d, { absYaw: true });
      const p = nb.toWorld(s, d), y = w.groundAt(s, d);
      const cur = { s, x: p.x, y, z: p.z, nx: p.nx, nz: p.nz };
      if (prev && s - prev.s < 70) {
        for (const o of [-0.75, 0, 0.75]) {
          const pts: Vector3[] = [];
          for (let k = 0; k <= 6; k++) {
            const t = k / 6, sag = 0.55 * 4 * t * (1 - t);
            pts.push(new Vector3(
              prev.x + prev.nx * o + (cur.x + cur.nx * o - prev.x - prev.nx * o) * t,
              prev.y + 8.62 + (cur.y - prev.y) * t - sag,
              prev.z + prev.nz * o + (cur.z + cur.nz * o - prev.z - prev.nz * o) * t));
          }
          const c = Math.floor(s / CHUNK);
          let arr = wireChunks.get(c); if (!arr) wireChunks.set(c, (arr = []));
          arr.push(pts); wires.push(pts);
        }
      }
      prev = cur;
    }
  }
  for (const [c, lines] of wireChunks) {
    const ls = CreateLineSystem(`wires-${c}`, { lines, colors: lines.map((l) => l.map(() => new Color4(0.08, 0.08, 0.08, 1))) }, w.scene);
    ls.isPickable = false;
  }
  stats.wireSpans = wires.length / 3;

  // ---------------------------------------------------------------- elephant grass on the verges
  for (const side of [1, -1] as const) {
    for (let s = S0; s < S1; s += 2.6) {
      const t = town(s);
      if (rnd() > (1 - t * 0.85) * 0.75 * q) continue;
      const off = 4.3 + Math.pow(rnd(), 1.5) * 16;
      const d = dAt(s + rnd() * 2, side, off);
      if (!free(s, d, 0, 2)) continue;
      put('grass', s, d, { absYaw: true, yaw: rnd() * 6.28, scale: 0.6 + rnd() * 0.5, sy: 0.8 + rnd() * 0.6 });
    }
  }
  // the median strip between the two carriageways, where it is wide and unpaved
  for (let s = S0; s < S1; s += 3.5) {
    const i = w.idx(s);
    const inner = -nb.halfWidth(s) - 2.5, outer = w.sbD[i] + w.sbHW[i] + 2.5;
    if (inner - outer < 4 || town(s) > 0.6 || rnd() > 0.55 * q) continue;
    const d = outer + rnd() * (inner - outer);
    const p = nb.toWorld(s, d);
    if (nb.bridge[i] || w.sbBridge[i] || w.streets.nearest(p.x, p.z, 4) || inKO(p.x, p.z)) continue;
    put('grass', s, d, { absYaw: true, yaw: rnd() * 6.28, scale: 0.5 + rnd() * 0.35, sy: 0.6 + rnd() * 0.4 });
  }

  // ---------------------------------------------------------------- instance the batches
  for (const [kind, byChunk] of lists) {
    const templates = kit.get(kind)!;
    for (const [c, arr] of byChunk) {
      const buf = new Float32Array(arr);
      for (const tpl of templates) {
        const m = tpl.clone(`rs-${kind}-${c}`) as Mesh;
        m.makeGeometryUnique(); // thin-instance buffers live on the geometry
        m.isVisible = true; m.isPickable = false;
        m.thinInstanceSetBuffer('matrix', buf, 16, true);
        m.thinInstanceRefreshBoundingInfo(false);
      }
    }
  }
  console.info('[roadside]', JSON.stringify(stats), 'skipped:', JSON.stringify(rejects));
  const profile: number[] = [];
  for (let s = S0; s < S1; s += 500) profile.push(Math.round(town(s) * 100) / 100);
  return { placed: stats, skipped: rejects, town: profile };
}
