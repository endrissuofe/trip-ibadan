// Street network beside the expressway (real OSM streets): spatial lookup of the
// street and surface under a point, and paths for riders to follow.
import type { StreetData } from './Route';

export const STREET_HALF_W = [4.6, 3.6, 2.9, 2.2, 1.9];

export interface StreetHit { street: number; seg: number; t: number; dist: number; halfW: number; unpaved: boolean; y: number; name: string }

export class StreetNet {
  readonly x: Float32Array[]; readonly z: Float32Array[]; y: Float32Array[];
  private grid = new Map<number, number[]>(); // cell → packed (street << 12 | seg)
  private readonly CELL = 40;

  constructor(readonly data: StreetData[]) {
    this.x = data.map((st) => Float32Array.from(st.p.filter((_, k) => k % 2 === 0)));
    this.z = data.map((st) => Float32Array.from(st.p.filter((_, k) => k % 2 === 1)));
    this.y = data.map((st) => new Float32Array(st.p.length / 2));
    data.forEach((_, si) => {
      const xs = this.x[si], zs = this.z[si];
      for (let k = 0; k < xs.length - 1; k++) {
        const x0 = Math.min(xs[k], xs[k + 1]) - 6, x1 = Math.max(xs[k], xs[k + 1]) + 6;
        const z0 = Math.min(zs[k], zs[k + 1]) - 6, z1 = Math.max(zs[k], zs[k + 1]) + 6;
        for (let cx = Math.floor(x0 / this.CELL); cx <= Math.floor(x1 / this.CELL); cx++)
          for (let cz = Math.floor(z0 / this.CELL); cz <= Math.floor(z1 / this.CELL); cz++) {
            const key = cx * 100003 + cz;
            let arr = this.grid.get(key); if (!arr) this.grid.set(key, (arr = []));
            arr.push(si * 4096 + k);
          }
      }
    });
  }

  /** Bake a height for every street point (called once the terrain is known). */
  setHeights(h: (x: number, z: number) => number) {
    this.y = this.x.map((xs, si) => Float32Array.from(xs, (x, k) => h(x, this.z[si][k])));
  }

  /** Nearest street segment to (x, z) within `maxDist`, or null. */
  nearest(x: number, z: number, maxDist = 8): StreetHit | null {
    const arr = this.grid.get(Math.floor(x / this.CELL) * 100003 + Math.floor(z / this.CELL));
    if (!arr) return null;
    let best: StreetHit | null = null;
    for (const packed of arr) {
      const si = Math.floor(packed / 4096), k = packed % 4096;
      const xs = this.x[si], zs = this.z[si];
      const ax = xs[k], az = zs[k], ex = xs[k + 1] - ax, ez = zs[k + 1] - az;
      const L2 = ex * ex + ez * ez || 1;
      const t = Math.max(0, Math.min(1, ((x - ax) * ex + (z - az) * ez) / L2));
      const d = Math.hypot(x - (ax + ex * t), z - (az + ez * t));
      if (d < maxDist && (!best || d < best.dist)) {
        const st = this.data[si];
        best = { street: si, seg: k, t, dist: d, halfW: STREET_HALF_W[st.c], unpaved: !!st.u, y: this.y[si][k] + (this.y[si][k + 1] - this.y[si][k]) * t, name: st.n };
      }
    }
    return best;
  }

  /** Street indices with a point within `r` metres of (x, z). */
  near(x: number, z: number, r: number): number[] {
    const out = new Set<number>();
    const c0x = Math.floor((x - r) / this.CELL), c1x = Math.floor((x + r) / this.CELL);
    const c0z = Math.floor((z - r) / this.CELL), c1z = Math.floor((z + r) / this.CELL);
    for (let cx = c0x; cx <= c1x; cx++) for (let cz = c0z; cz <= c1z; cz++) for (const p of this.grid.get(cx * 100003 + cz) ?? []) out.add(Math.floor(p / 4096));
    return [...out];
  }
}

/** Circle colliders (buildings, landmarks) with a coarse grid. */
export class Colliders {
  private grid = new Map<number, number[]>();
  private cx: number[] = []; private cz: number[] = []; private r: number[] = [];
  add(x: number, z: number, r: number) {
    const i = this.cx.length; this.cx.push(x); this.cz.push(z); this.r.push(r);
    const key = Math.floor(x / 30) * 100003 + Math.floor(z / 30);
    let a = this.grid.get(key); if (!a) this.grid.set(key, (a = [])); a.push(i);
  }
  /** Returns push-out vector if a circle of radius `rad` at (x,z) overlaps a collider. */
  hit(x: number, z: number, rad: number): [number, number] | null {
    const gx = Math.floor(x / 30), gz = Math.floor(z / 30);
    for (let a = gx - 1; a <= gx + 1; a++) for (let b = gz - 1; b <= gz + 1; b++) {
      for (const i of this.grid.get(a * 100003 + b) ?? []) {
        const dx = x - this.cx[i], dz = z - this.cz[i], d = Math.hypot(dx, dz), m = this.r[i] + rad;
        if (d < m) { const k = (m - d) / (d || 1); return [dx * k, dz * k]; }
      }
    }
    return null;
  }
  /** True if (x,z) is within `pad` of any collider. */
  occupied(x: number, z: number, pad: number) { return this.hit(x, z, pad) !== null; }
}
