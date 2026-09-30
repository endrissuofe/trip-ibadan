// Passengers: load at the park, drop each passenger at their real stop, pick up
// people waiting along the way. Fares + comfort-based tips; missed stops cost you.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { World } from '../world/World';
import { Landmark, LANE_W } from '../map/Route';
import { buildPerson, SHIRTS } from '../world/props';
import { fareFor, NAMES, MISSED_STOP_LINES, HAPPY_LINES, BUMPY_LINES } from '../data/trips';
import type { PlayerVehicle, Controls } from './Driving';

export interface Pax { name: string; dest: string; destName: string; fare: number; missed: boolean; mesh?: InstancedMesh; from: string }
export type PaxPhase = 'loading' | 'riding' | 'stopping' | 'done';
export interface PaxMsg { text: string; money?: number; tone: 'good' | 'bad' | 'info' }

export class Passengers {
  aboard: Pax[] = [];
  waiting = new Map<string, Pax[]>();
  phase: PaxPhase = 'loading';
  comfort = 100;
  fares = 0; tips = 0; delivered = 0; missed = 0;
  private ratings: number[] = [];
  private stops: Landmark[];
  private timer = 0;
  private stoppingAt: Landmark | null = null;
  private bases: Mesh[];
  private walkers: { m: InstancedMesh; tx: number; tz: number; t: number; fade: boolean }[] = [];
  private bumpyCd = 0;
  private passed = new Set<string>();

  constructor(scene: Scene, private world: World, readonly capacity: number, private startId: string, private endId: string) {
    this.bases = SHIRTS.map((c, i) => { const m = buildPerson(scene, c, i); m.isVisible = false; return m; });
    const r = world.route;
    this.stops = r.stopsBetween(r.stop(startId).s, r.stop(endId).s);
    // queue at the park: a full load, destinations weighted towards the far end
    const q: Pax[] = [];
    for (let i = 0; i < capacity; i++) q.push(this.makePax(r.stop(startId), i));
    this.waiting.set(startId, q);
    // people waiting at the stops along the way
    this.stops.slice(0, -1).forEach((st, k) => {
      const n = 1 + Math.floor(Math.random() * 3);
      this.waiting.set(st.id, Array.from({ length: n }, (_, i) => this.makePax(st, k * 7 + i)));
    });
    this.placeWaiting();
  }

  private makePax(from: Landmark, seed: number): Pax {
    const later = this.world.route.stopsBetween(from.s, this.world.route.stop(this.endId).s);
    const pick = later[Math.min(later.length - 1, Math.floor(Math.pow(Math.random(), 0.7) * later.length))];
    const km = (pick.s - from.s) / 1000;
    return { name: NAMES[(seed * 7 + Math.floor(Math.random() * NAMES.length)) % NAMES.length], dest: pick.id, destName: pick.name, fare: fareFor(km), missed: false, from: from.id };
  }

  /** Waiting passengers stand by the bay of their stop. */
  private placeWaiting() {
    const nb = this.world.route.nb;
    for (const [id, list] of this.waiting) {
      const st = this.world.route.stop(id);
      list.forEach((p, i) => {
        if (p.mesh) return;
        const hw = nb.halfWidth(st.s);
        const w = nb.toWorld(st.s + 6 + i * 1.3 - (id === this.startId ? 12 : 0), hw + 4.4 + (i % 2) * 0.8);
        p.mesh = this.bases[(i + id.length) % this.bases.length].createInstance('pax');
        p.mesh.position.set(w.x, w.y, w.z); p.mesh.rotation.y = w.heading - Math.PI / 2;
        p.mesh.metadata = { dynamic: true };
      });
    }
  }

  get seatsFree() { return this.capacity - this.aboard.length; }
  get rating() { return this.ratings.length ? this.ratings.reduce((a, b) => a + b, 0) / this.ratings.length : 5; }
  get queueAtStart() { return this.waiting.get(this.startId)?.length ?? 0; }

  /** The next stop that needs you (drop-offs, or pick-ups with free seats). */
  nextStop(s: number): { stop: Landmark; drop: number; wait: number } | null {
    for (const st of this.stops) {
      if (st.s < s - 45) continue;
      const drop = this.aboard.filter((p) => p.dest === st.id || p.missed).length;
      const wait = this.seatsFree > 0 ? (this.waiting.get(st.id)?.length ?? 0) : 0;
      if (drop || wait || st.id === this.endId) return { stop: st, drop, wait };
    }
    return null;
  }

  depart() { if (this.phase === 'loading') this.phase = 'riding'; }

  update(dt: number, p: PlayerVehicle, ctl: Controls, limit: number): PaxMsg[] {
    const out: PaxMsg[] = [];
    const nb = this.world.route.nb;
    this.animateWalkers(dt);
    // ---- comfort
    if (this.phase === 'riding' || this.phase === 'stopping') {
      let drop = p.roughness * 5 * dt;
      if (ctl.brake > 0.8 && p.kmh > 45) drop += 7 * dt;
      if (Math.abs(p.latAcc) > 4.5) drop += 5 * dt;
      if (p.kmh > limit + 15) drop += 2 * dt;
      for (const imp of p.impacts) drop += Math.min(25, imp.kmh * 0.7);
      this.comfort = Math.max(0, Math.min(100, this.comfort - drop + (drop === 0 ? 1.2 * dt : 0)));
      this.bumpyCd -= dt;
      if (drop > 4 && this.bumpyCd <= 0 && this.aboard.length) { this.bumpyCd = 14; out.push({ text: `${this.aboard[0].name}: "${BUMPY_LINES[Math.floor(Math.random() * BUMPY_LINES.length)]}"`, tone: 'bad' }); }
    }
    // ---- highlight bays you need
    const next = this.nextStop(p.s);
    for (const [id, mat] of this.world.stopBays) mat.alpha = (next?.stop.id === id) || (this.phase === 'loading' && id === this.startId) ? 0.5 : 0.1;

    // ---- loading at the park
    if (this.phase === 'loading') {
      if (p.kmh > 4) { this.phase = 'riding'; out.push({ text: `Departed with ${this.aboard.length}/${this.capacity} passengers`, tone: 'info' }); }
      else {
        this.timer -= dt;
        const q = this.waiting.get(this.startId)!;
        if (this.timer <= 0 && q.length && this.seatsFree > 0) {
          this.timer = 0.9;
          this.board(q.shift()!, p);
          if (!q.length || !this.seatsFree) out.push({ text: 'Full load! Oya, let\'s go 🚐', tone: 'good' });
        }
      }
      return out;
    }

    // ---- missed stops
    for (const st of this.stops) {
      if (this.passed.has(st.id) || p.s < st.s + 70 || !p.onExpressway && p.s < st.s + 400) continue;
      this.passed.add(st.id);
      const left = this.aboard.filter((x) => x.dest === st.id && !x.missed);
      for (const x of left) {
        x.missed = true; this.missed++;
        out.push({ text: `${x.name}: "${MISSED_STOP_LINES[Math.floor(Math.random() * MISSED_STOP_LINES.length)].replace('{stop}', st.name)}"`, tone: 'bad' });
      }
      // people who were waiting there are gone too
      for (const w of this.waiting.get(st.id) ?? []) w.mesh?.dispose();
      this.waiting.set(st.id, []);
    }

    // ---- stopping at a bay
    if (this.phase === 'riding' && next) {
      const st = next.stop, hw = nb.halfWidth(st.s);
      const inBay = Math.abs(p.s - st.s) < 45 && p.d > hw - LANE_W - 0.7 && p.onExpressway;
      if (inBay && p.kmh < 8 && (next.drop || next.wait || st.id === this.endId)) { this.phase = 'stopping'; this.stoppingAt = st; this.timer = 0.4; }
    }
    if (this.phase === 'stopping' && this.stoppingAt) {
      const st = this.stoppingAt;
      if (p.kmh > 12) { this.phase = 'riding'; this.stoppingAt = null; return out; }
      this.timer -= dt;
      if (this.timer <= 0) {
        const off = this.aboard.find((x) => x.dest === st.id || x.missed || st.id === this.endId);
        const q = this.waiting.get(st.id) ?? [];
        if (off) {
          this.timer = 0.8;
          this.aboard.splice(this.aboard.indexOf(off), 1);
          const tip = off.missed ? 0 : this.comfort > 65 ? Math.round((off.fare * 0.3 * (this.comfort - 65)) / 35 / 50) * 50 : 0;
          const paid = off.missed ? Math.round(off.fare / 2 / 50) * 50 : off.fare;
          this.fares += paid; this.tips += tip; this.delivered += off.missed ? 0 : 1;
          this.ratings.push(off.missed ? 1 : 1 + (4 * this.comfort) / 100);
          this.spawnWalker(p, false);
          out.push({ text: off.missed ? `${off.name} paid half: ₦${paid.toLocaleString()}` : `${off.name} paid ₦${paid.toLocaleString()}${tip ? ` + ₦${tip} tip` : ''}${Math.random() < 0.3 ? ` · "${HAPPY_LINES[Math.floor(Math.random() * HAPPY_LINES.length)]}"` : ''}`, money: paid + tip, tone: off.missed ? 'bad' : 'good' });
        } else if (q.length && this.seatsFree > 0 && st.id !== this.endId) {
          this.timer = 1.0;
          this.board(q.shift()!, p);
          out.push({ text: `Picked up a passenger for ${this.aboard[this.aboard.length - 1].destName}`, tone: 'info' });
        } else {
          this.phase = st.id === this.endId ? 'done' : 'riding';
          this.passed.add(st.id);
          this.stoppingAt = null;
          if (this.phase === 'riding') out.push({ text: `${st.name} done. ${this.aboard.length} on board`, tone: 'info' });
        }
      }
    }
    return out;
  }

  private board(x: Pax, p: PlayerVehicle) {
    this.aboard.push(x);
    if (x.mesh) { this.walkers.push({ m: x.mesh, tx: p.x, tz: p.z, t: 0.8, fade: true }); x.mesh = undefined; }
  }

  private spawnWalker(p: PlayerVehicle, _in: boolean) {
    const m = this.bases[Math.floor(Math.random() * this.bases.length)].createInstance('alight');
    const rx = Math.cos(p.heading), rz = -Math.sin(p.heading);
    m.position.set(p.x + rx * 1.4, p.y, p.z + rz * 1.4); m.rotation.y = p.heading + Math.PI / 2; m.metadata = { dynamic: true };
    this.walkers.push({ m, tx: p.x + rx * 9, tz: p.z + rz * 9, t: 3, fade: true });
  }

  private animateWalkers(dt: number) {
    this.walkers = this.walkers.filter((w) => {
      w.t -= dt;
      const k = Math.min(1, dt * 1.6);
      w.m.position.x += (w.tx - w.m.position.x) * k; w.m.position.z += (w.tz - w.m.position.z) * k;
      if (w.t <= 0) { w.m.dispose(); return false; }
      return true;
    });
  }

  dispose() {
    for (const list of this.waiting.values()) for (const p of list) p.mesh?.dispose();
    for (const w of this.walkers) w.m.dispose();
    for (const b of this.bases) b.dispose();
  }
}
