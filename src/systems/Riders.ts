// Food-delivery riders: lane-splitting on the Lagos stretch of the expressway and
// riding the inner streets on their way to drop off orders.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { World } from '../world/World';
import { LANE_W } from '../map/Route';
import { buildRider } from '../world/props';
import { DELIVERY_BRANDS, DeliveryBrand } from '../data/brands';
import type { PlayerVehicle } from './Driving';

interface Rider {
  brand: DeliveryBrand; mesh: Mesh;
  mode: 'express' | 'street';
  // express (road space)
  s: number; d: number; dTarget: number; weave: number;
  // street (polyline)
  si: number; k: number; t: number; dir: 1 | -1;
  v: number; v0: number;
  x: number; y: number; z: number; heading: number;
  down: number; hitCd: number;
}

export interface RiderHit { brand: string; kmh: number }

export class Riders {
  private riders: Rider[] = [];
  private bases: Mesh[];
  private lagosEnd: number;

  constructor(scene: Scene, private world: World, private count: number) {
    this.bases = DELIVERY_BRANDS.map((b) => { const m = buildRider(scene, b); m.setEnabled(false); return m; });
    this.lagosEnd = world.route.stop('berger').s + 1100;
  }

  clear() { for (const r of this.riders) r.mesh.dispose(); this.riders = []; }

  spawn(player: PlayerVehicle) {
    this.clear();
    for (let i = 0; i < this.count * 2; i++) {
      const bi = i % DELIVERY_BRANDS.length;
      const mesh = this.bases[bi].clone('rider', null)!;
      mesh.setEnabled(true); mesh.metadata = { dynamic: true };
      mesh.getChildMeshes().forEach((c) => (c.metadata = { dynamic: true }));
      const r: Rider = { brand: DELIVERY_BRANDS[bi], mesh, mode: i < this.count ? 'express' : 'street', s: 0, d: 0, dTarget: 0, weave: 0, si: 0, k: 0, t: 0, dir: 1, v: 0, v0: 0, x: 0, y: 0, z: 0, heading: 0, down: 0, hitCd: 0 };
      this.riders.push(r);
      this.place(r, player, true);
    }
  }

  private place(r: Rider, p: PlayerVehicle, initial = false) {
    r.down = 0; r.mesh.rotation.z = 0;
    if (r.mode === 'express') {
      const nb = this.world.route.nb;
      if (p.s > this.lagosEnd + 300) { r.s = -1e6; r.mesh.setEnabled(false); return; }
      r.mesh.setEnabled(true);
      r.s = initial ? p.s - 100 + Math.random() * 700 : Math.random() < 0.6 ? p.s + 500 + Math.random() * 300 : p.s - 180;
      r.s = Math.min(r.s, this.lagosEnd);
      const hw = nb.halfWidth(r.s);
      r.d = r.dTarget = -hw + LANE_W * (1 + Math.floor(Math.random() * 2));
      r.v0 = (42 + Math.random() * 25) / 3.6; r.v = r.v0; r.weave = 1 + Math.random() * 3;
    } else {
      const near = this.world.streets.near(p.x + (Math.random() - 0.5) * 300, p.z + (Math.random() - 0.5) * 300, 160);
      if (!near.length) { r.si = -1; r.mesh.setEnabled(false); return; }
      r.mesh.setEnabled(true);
      r.si = near[Math.floor(Math.random() * near.length)];
      const n = this.world.streets.x[r.si].length;
      r.k = Math.floor(Math.random() * (n - 1)); r.t = Math.random(); r.dir = Math.random() < 0.5 ? 1 : -1;
      r.v0 = (22 + Math.random() * 16) / 3.6; r.v = r.v0;
    }
  }

  /** Returns riders knocked by the player this frame. */
  update(dt: number, p: PlayerVehicle | null): RiderHit[] {
    const hits: RiderHit[] = [];
    const nb = this.world.route.nb;
    for (const r of this.riders) {
      if (!p) break;
      if (r.down > 0) {
        r.down -= dt;
        if (r.down <= 0) this.place(r, p);
        continue;
      }
      if (r.mode === 'express') {
        if (r.s < -1e5) { if (p.s < this.lagosEnd) this.place(r, p); continue; }
        const hw = nb.halfWidth(r.s);
        const inJam = this.world.events.some((e) => e.kind === 'jam' && Math.abs(r.s - (this.world.route.startS + e.km * 1000 + e.lengthM / 2)) < e.lengthM / 2 + 40);
        r.v += ((inJam ? 7 : r.v0) - r.v) * Math.min(1, dt * 1.5);
        r.weave -= dt;
        if (r.weave <= 0) {
          const nl = Math.max(1, Math.round((2 * hw) / LANE_W));
          const gaps = [...Array(nl - 1).keys()].map((k) => -hw + ((k + 1) * 2 * hw) / nl);
          gaps.push(hw + 1.2); // the shoulder
          r.dTarget = gaps[Math.floor(Math.random() * gaps.length)];
          r.weave = 2 + Math.random() * 4;
        }
        // Give the bus a wide berth: choose an open lane or the shoulder before
        // the bike reaches the bus, then brake gently if space is tight.
        const gap = r.s - p.s;
        const closing = gap >= 0 ? p.v - r.v : r.v - p.v;
        const nearPlayer = Math.abs(gap) < 75;
        const crossesPlayerPath = Math.abs(r.dTarget - p.d) < p.halfWid + 1.15;
        if (nearPlayer && (closing > 0.5 || crossesPlayerPath)) {
          const nl = Math.max(1, Math.round((2 * hw) / LANE_W));
          const candidates = [...Array(nl).keys()].map((k) => -hw + ((k + 0.5) * 2 * hw) / nl);
          candidates.push(hw + 1.2);
          candidates.sort((a, b) => {
            const safeA = Math.abs(a - p.d) - Math.max(0, p.halfWid + 1.15 - Math.abs(a - p.d)) * 2;
            const safeB = Math.abs(b - p.d) - Math.max(0, p.halfWid + 1.15 - Math.abs(b - p.d)) * 2;
            return (safeB - Math.abs(b - r.d) * 0.18) - (safeA - Math.abs(a - r.d) * 0.18);
          });
          r.dTarget = candidates[0];
          r.weave = Math.max(r.weave, 1.2);
          // only a rider coming up BEHIND the bus brakes; one ahead that slowed down would be run into sooner
          if (gap < 0 && gap > -28 && closing > 0 && Math.abs(r.d - p.d) < p.halfWid + 1.4) {
            r.v = Math.min(r.v, Math.max(0, p.v - 2.5));
          }
        }
        r.s += r.v * dt;
        r.d += Math.max(-2.2 * dt, Math.min(2.2 * dt, r.dTarget - r.d));
        const w = nb.toWorld(r.s, r.d);
        r.x = w.x; r.z = w.z; r.y = w.y; r.heading = w.heading + Math.atan2(r.dTarget - r.d, 8) * 0.5;
        r.mesh.rotation.z = Math.max(-0.16, Math.min(0.16, -(r.dTarget - r.d) * 0.035));
        if (r.s < p.s - 260 || r.s > p.s + 1000 || r.s > this.lagosEnd + 200) this.place(r, p);
      } else {
        if (r.si < 0) { if (Math.random() < dt) this.place(r, p); continue; }
        const net = this.world.streets, xs = net.x[r.si], zs = net.z[r.si], ys = net.y[r.si];
        // Slow down when riding TOWARDS the bus. A rider that is moving away from it, or has the bus
        // behind, keeps going: one that stopped dead within 8 m would block the street for good.
        const carDistance = Math.hypot(r.x - p.x, r.z - p.z);
        const towards = (Math.sin(r.heading) * (p.x - r.x) + Math.cos(r.heading) * (p.z - r.z)) / (carDistance || 1);
        const yieldSpeed = towards > 0.5 ? Math.max(1.5, (carDistance - 8) * 0.55) : r.v0;
        r.v += (Math.min(r.v0, yieldSpeed) - r.v) * Math.min(1, dt * 2.5);
        let move = r.v * dt;
        while (move > 0) {
          const L = Math.hypot(xs[r.k + 1] - xs[r.k], zs[r.k + 1] - zs[r.k]) || 1;
          const nt = r.t + (r.dir * move) / L;
          if (nt >= 0 && nt <= 1) { r.t = nt; move = 0; break; }
          move -= (r.dir > 0 ? 1 - r.t : r.t) * L;
          if (r.dir > 0 ? r.k + 1 < xs.length - 1 : r.k > 0) { r.k += r.dir; r.t = r.dir > 0 ? 0 : 1; }
          else { this.hopStreet(r); break; }
        }
        const X = this.world.streets.x[r.si], Z = this.world.streets.z[r.si], Y = this.world.streets.y[r.si];
        r.x = X[r.k] + (X[r.k + 1] - X[r.k]) * r.t; r.z = Z[r.k] + (Z[r.k + 1] - Z[r.k]) * r.t; r.y = Y[r.k] + (Y[r.k + 1] - Y[r.k]) * r.t;
        r.heading = Math.atan2((X[r.k + 1] - X[r.k]) * r.dir, (Z[r.k + 1] - Z[r.k]) * r.dir);
        // keep to the right-hand side of the street
        r.x += Math.cos(r.heading) * 1.2; r.z -= Math.sin(r.heading) * 1.2;
        void ys;
        if (Math.hypot(r.x - p.x, r.z - p.z) > 700) this.place(r, p);
      }
      r.mesh.position.set(r.x, r.y, r.z);
      r.mesh.rotation.y = r.heading;
      if (r.mode === 'street') r.mesh.rotation.z = 0;
      // collision with the player (rider in the vehicle's local frame)
      r.hitCd -= dt;
      const dx = r.x - p.x, dz = r.z - p.z;
      const lx = dx * Math.cos(p.heading) - dz * Math.sin(p.heading), lz = dx * Math.sin(p.heading) + dz * Math.cos(p.heading);
      if (r.hitCd <= 0 && Math.abs(lx) < p.halfWid + 0.35 && Math.abs(lz) < p.halfLen + 0.8) {
        const rvx = Math.sin(r.heading) * r.v - Math.sin(p.heading) * p.v, rvz = Math.cos(r.heading) * r.v - Math.cos(p.heading) * p.v;
        const kmh = Math.hypot(rvx, rvz) * 3.6;
        if (kmh > 6 && Math.abs(p.v) < 1.5) {
          // the rider ran into a stationary vehicle: not the player's fault, no penalty
          r.v = 0; r.hitCd = 2;
        } else if (kmh > 6) {
          r.down = 7; r.mesh.rotation.z = 1.35; r.hitCd = 3;
          hits.push({ brand: r.brand.name, kmh });
          p.collide(p.v * 0.8, 0, Math.min(kmh, 20), 'rider');
        } else if (r.mode === 'express') r.v = Math.min(r.v, Math.max(0, p.v - 1)); // rider brakes behind you
      }
    }
    return hits;
  }

  private hopStreet(r: Rider) {
    const net = this.world.streets;
    const xs = net.x[r.si], zs = net.z[r.si];
    const ex = r.dir > 0 ? xs[xs.length - 1] : xs[0], ez = r.dir > 0 ? zs[zs.length - 1] : zs[0];
    const cands = net.near(ex, ez, 20).filter((si) => si !== r.si);
    for (const si of cands) {
      const X = net.x[si], Z = net.z[si];
      const d0 = Math.hypot(X[0] - ex, Z[0] - ez), d1 = Math.hypot(X[X.length - 1] - ex, Z[Z.length - 1] - ez);
      if (Math.min(d0, d1) < 20) { r.si = si; if (d0 <= d1) { r.k = 0; r.t = 0; r.dir = 1; } else { r.k = X.length - 2; r.t = 1; r.dir = -1; } return; }
    }
    r.dir = r.dir > 0 ? -1 : 1; // dead end: turn around
  }

  forEach(cb: (x: number, z: number, color: string) => void) { for (const r of this.riders) if (r.mesh.isEnabled() && r.down <= 0) cb(r.x, r.z, r.brand.box); }
}
