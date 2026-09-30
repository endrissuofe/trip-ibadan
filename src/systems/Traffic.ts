// Traffic AI system: lane-following agents on both real carriageways.
// Car-following uses the Intelligent Driver Model; lane changes are a light MOBIL-style check.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { InstancedMesh } from '@babylonjs/core/Meshes/instancedMesh';
import { Quaternion } from '@babylonjs/core/Maths/math.vector';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { World } from '../world/World';
import { Line, LANE_W } from '../map/Route';
import { buildVehicle, vehicleMaterial, TrafficKind, KIND_DIMS, TRAFFIC_COLORS } from '../world/models';
import { blobTexture } from '../world/textures';
import { PlayerVehicle } from './Driving';

type Kind = Exclude<TrafficKind, 'sienna' | 'hiace'>;
interface Agent {
  kind: Kind; mesh: InstancedMesh; blob: InstancedMesh;
  side: 'nb' | 'sb';
  s: number; d: number; lane: number; v: number; v0: number;
  len: number; wid: number;
  changeCd: number; hitCd: number;
  zone?: boolean;
  jam?: number; // index of the gridlock this vehicle belongs to
}

const MIX: [Kind, number][] = [['sedan', 34], ['suv', 20], ['minibus', 13], ['danfo', 6], ['truck', 12], ['tanker', 5], ['coach', 10]];
const V0: Record<Kind, [number, number]> = { sedan: [85, 115], suv: [85, 110], minibus: [75, 95], danfo: [60, 80], truck: [45, 65], tanker: [45, 60], coach: [75, 95] };
const ACC: Record<Kind, number> = { sedan: 2.0, suv: 1.9, minibus: 1.5, danfo: 1.4, truck: 0.7, tanker: 0.7, coach: 0.9 };

export class Traffic {
  private agents: Agent[] = [];
  private bases = new Map<string, Mesh>();
  private blobBase: Mesh;
  private rnd = Math.random;
  private sbHint = -1;
  private playerSb = 0;
  private jamActive = new Set<number>();
  honked = 0;

  constructor(private scene: Scene, private world: World, private density: number) {
    this.blobBase = MeshBuilder.CreateGround('tblob', { width: 1, height: 1 }, scene);
    const bm = new StandardMaterial('tblobMat', scene);
    bm.diffuseTexture = blobTexture(scene); bm.useAlphaFromDiffuseTexture = true; bm.specularColor = Color3.Black(); bm.zOffset = -4;
    this.blobBase.material = bm; this.blobBase.isVisible = false;
  }

  private base(kind: Kind, color: string) {
    const key = kind + color;
    let m = this.bases.get(key);
    if (!m) {
      m = buildVehicle(this.scene, kind, color, 'traffic-' + key);
      m.material = vehicleMaterial(this.scene);
      m.isVisible = false;
      this.bases.set(key, m);
    }
    return m;
  }

  private pickKind(): Kind {
    const total = MIX.reduce((a, [, w]) => a + w, 0);
    let r = this.rnd() * total;
    for (const [k, w] of MIX) { if ((r -= w) <= 0) return k; }
    return 'sedan';
  }

  private make(kind: Kind, side: 'nb' | 'sb'): Agent {
    const colors = TRAFFIC_COLORS[kind];
    const base = this.base(kind, colors[Math.floor(this.rnd() * colors.length)]);
    const mesh = base.createInstance('car');
    mesh.rotationQuaternion = new Quaternion();
    mesh.metadata = { dynamic: true };
    const dims = KIND_DIMS[kind];
    const blob = this.blobBase.createInstance('b');
    blob.scaling.set(dims.width + 0.8, 1, dims.length + 1); blob.rotationQuaternion = new Quaternion(); blob.metadata = { dynamic: true };
    const [lo, hi] = V0[kind];
    return { kind, mesh, blob, side, s: 0, d: 0, lane: 0, v: 0, v0: (lo + this.rnd() * (hi - lo)) / 3.6, len: dims.length, wid: dims.width, changeCd: 0, hitCd: 0 };
  }

  private line(a: Agent): Line { return a.side === 'nb' ? this.world.route.nb : this.world.route.sb; }

  private lanesAt(line: Line, s: number) { const hw = line.halfWidth(s); const n = Math.max(1, Math.round((hw * 2) / LANE_W)); return { hw, n }; }
  private laneD(line: Line, s: number, lane: number) { const { hw, n } = this.lanesAt(line, s); const l = Math.min(lane, n - 1); return -hw + ((l + 0.5) * 2 * hw) / n; }

  /** Populate traffic around the player at trip start. */
  spawnAround(player: PlayerVehicle) {
    this.clear();
    const nbCount = Math.round(24 * this.density), sbCount = Math.round(16 * this.density);
    for (let k = 0; k < nbCount; k++) {
      const a = this.make(this.pickKind(), 'nb');
      this.place(a, player.s - 150 + this.rnd() * 1050, player);
      this.agents.push(a);
    }
    // route-tied heavy truck section
    this.jamActive.clear();
    const truckEv = this.world.events.find((e) => e.kind === 'truck');
    if (truckEv) {
      for (let k = 0; k < 6; k++) {
        const a = this.make(this.rnd() < 0.7 ? 'truck' : 'tanker', 'nb');
        a.zone = true;
        this.place(a, this.world.route.startS + truckEv.km * 1000 + k * (truckEv.lengthM / 6), player, true);
        this.agents.push(a);
      }
    }
    this.updatePlayerSb(player);
    for (let k = 0; k < sbCount; k++) {
      const a = this.make(this.pickKind(), 'sb');
      this.place(a, this.playerSb - 900 + this.rnd() * 1150, player);
      this.agents.push(a);
    }
  }

  clear() { for (const a of this.agents) { a.mesh.dispose(); a.blob.dispose(); } this.agents = []; this.jamActive.clear(); }

  private jams() { return this.world.events.map((e, i) => ({ e, i, s0: this.world.route.startS + e.km * 1000, s1: this.world.route.startS + e.km * 1000 + e.lengthM })).filter((j) => j.e.kind === 'jam'); }

  /** Fill a real gridlock with crawling vehicles across every lane and the shoulder. */
  private manageJams(playerS: number) {
    for (const j of this.jams()) {
      const near = playerS > j.s0 - 1500 && playerS < j.s1 + 300;
      if (near && !this.jamActive.has(j.i)) {
        this.jamActive.add(j.i);
        const line = this.world.route.nb;
        for (let s = j.s0; s < j.s1; s += 9 + this.rnd() * 5) {
          const { hw, n } = this.lanesAt(line, s);
          for (let lane = 0; lane <= n; lane++) {
            if (lane === n && this.rnd() < 0.45) continue; // shoulder is only partly used
            if (Math.abs(s - playerS) < 20) continue;
            const kind = this.rnd() < 0.25 ? 'danfo' : this.pickKind();
            const a = this.make(kind, 'nb');
            const len = KIND_DIMS[kind].length;
            a.s = s + this.rnd() * 3 + len / 2; a.lane = Math.min(lane, n - 1);
            a.d = lane === n ? hw + 1.3 : this.laneD(line, a.s, lane) + (this.rnd() - 0.5) * 0.6;
            a.v = this.rnd() * 1.5; a.v0 = (6 + this.rnd() * 6) / 3.6; a.jam = j.i; a.changeCd = 1e9;
            this.agents.push(a); this.sync(a);
          }
        }
      } else if (!near && this.jamActive.has(j.i)) {
        this.jamActive.delete(j.i);
        for (const a of this.agents.filter((x) => x.jam === j.i)) { a.mesh.dispose(); a.blob.dispose(); }
        this.agents = this.agents.filter((x) => x.jam !== j.i);
      }
    }
  }


  private place(a: Agent, s: number, player: PlayerVehicle, slowLane = false): boolean {
    const line = this.line(a);
    s = Math.min(line.length - 30, Math.max(line.s[0] + 30, s));
    const { n } = this.lanesAt(line, s);
    if (a.side === 'nb') for (const j of this.jams()) if (this.jamActive.has(j.i) && s > j.s0 - 60 && s < j.s1 + 40) s = s < player.s ? j.s0 - 80 : j.s1 + 60;
    for (let tries = 0; tries < 6; tries++) {
      const lane = slowLane ? n - 1 : Math.floor(this.rnd() * n);
      const d = this.laneD(line, s, lane);
      if (a.side === 'nb' && Math.abs(s - player.s) < 25 && Math.abs(d - player.d) < 3) continue;
      if (this.agents.some((o) => o !== a && o.side === a.side && Math.abs(o.s - s) < 22 && Math.abs(o.d - d) < 2.5)) { s += 25; continue; }
      a.s = s; a.lane = lane; a.d = d; a.v = Math.min(this.limitV0(a, s), a.v0) * (0.8 + this.rnd() * 0.2); a.hitCd = 0;
      this.sync(a);
      return true;
    }
    a.s = -1e6; // park out of sight until next recycle
    return false;
  }

  private limitV0(a: Agent, s: number): number {
    let v0 = a.v0;
    if (a.side !== 'nb') return v0;
    const km = (s - this.world.route.startS) / 1000;
    for (const e of this.world.events) {
      const inZone = km >= e.km - 0.1 && km <= e.km + e.lengthM / 1000;
      if (inZone && e.speedLimit) v0 = Math.min(v0, (e.speedLimit - 5) / 3.6);
    }
    return v0;
  }

  private updatePlayerSb(player: PlayerVehicle) {
    const p = this.world.route.sb.project(player.pos.x, player.pos.z, this.sbHint);
    this.sbHint = p.i; this.playerSb = p.s;
  }

  /** Horn: vehicle directly ahead in the player's lane tries to move over. */
  horn(player: PlayerVehicle) {
    let best: Agent | null = null;
    for (const a of this.agents) if (a.side === 'nb' && a.s > player.s && a.s - player.s < 70 && Math.abs(a.d - player.d) < 2.5 && (!best || a.s < best.s)) best = a;
    if (best) { best.changeCd = 0; this.tryChange(best, true, player); }
  }

  update(dt: number, player: PlayerVehicle | null) {
    if (player) this.updatePlayerSb(player);
    const pS = player?.s ?? this.world.route.tripStart;
    if (player) this.manageJams(pS);
    const byLine = { nb: this.agents.filter((a) => a.side === 'nb'), sb: this.agents.filter((a) => a.side === 'sb') };

    for (const a of this.agents) {
      const line = this.line(a);
      if (a.s < -1e5) { this.recycle(a, player); continue; }
      const { n } = this.lanesAt(line, a.s);
      if (a.lane >= n) { a.lane = n - 1; }
      // leader search
      let gap = 1e9, lv = a.v0;
      for (const o of byLine[a.side]) {
        if (o === a || o.s <= a.s || Math.abs(o.d - a.d) > 2.4) continue;
        const g = o.s - a.s - (o.len + a.len) / 2;
        if (g < gap) { gap = g; lv = o.v; }
      }
      if (player && a.side === 'nb' && player.s > a.s && Math.abs(player.d - a.d) < 2.4) {
        const g = player.s - a.s - (player.halfLen * 2 + a.len) / 2;
        if (g < gap) { gap = g; lv = Math.max(0, player.v); }
      }
      // blocked lane ahead (closure / breakdown) = stopped virtual leader
      if (a.side === 'nb') {
        for (const c of this.world.closures) {
          if (a.d + a.wid / 2 > c.dMax && c.s0 > a.s && c.s0 - a.s < 250) { const g = c.s0 - a.s - a.len / 2; if (g < gap) { gap = g; lv = 0; } }
        }
        for (const o of this.world.obstacles) {
          if (Math.abs(o.d - a.d) < (o.width + a.wid) / 2 && o.s > a.s && o.s - a.s < 250) { const g = o.s - a.s - (o.len + a.len) / 2; if (g < gap) { gap = g; lv = 0; } }
        }
      }
      const v0 = this.limitV0(a, a.s);
      const aMax = ACC[a.kind], b = 3.2, T = 1.3, s0 = 4;
      const sStar = s0 + Math.max(0, a.v * T + (a.v * (a.v - lv)) / (2 * Math.sqrt(aMax * b)));
      let acc = aMax * (1 - Math.pow(a.v / Math.max(1, v0), 4) - Math.pow(sStar / Math.max(0.5, gap), 2));
      acc = Math.max(-9, acc);
      a.v = Math.max(0, a.v + acc * dt);
      a.s += a.v * dt;

      // stop-go creep inside a gridlock
      if (a.jam !== undefined && this.rnd() < dt * 0.4) a.v = 0;
      // lane change
      a.changeCd -= dt;
      if (a.changeCd <= 0 && gap < 70 && lv < v0 * 0.85) this.tryChange(a, false, player);
      const target = a.jam !== undefined ? a.d : this.laneD(line, a.s, a.lane);
      const dd = target - a.d, maxStep = 1.5 * dt;
      a.d += Math.max(-maxStep, Math.min(maxStep, dd));
      a.hitCd -= dt;

      // collisions with player
      if (player && a.side === 'nb' && a.hitCd <= 0 && Math.abs(player.d) < 25) this.collidePlayer(a, player);
      if (a.jam !== undefined) { this.sync(a, dd / Math.max(0.5, dt)); continue; }
      // recycle
      const rel = a.side === 'nb' ? a.s - pS : this.playerSb - a.s;
      if (rel < -300 || rel > 1250) this.recycle(a, player);
      else this.sync(a, dd / Math.max(0.5, dt));
    }
  }

  private tryChange(a: Agent, forced: boolean, player: PlayerVehicle | null) {
    const line = this.line(a);
    const { n } = this.lanesAt(line, a.s);
    const options = [a.lane - 1, a.lane + 1].filter((l) => l >= 0 && l < n);
    for (const l of options) {
      const d = this.laneD(line, a.s, l);
      if (a.side === 'nb') {
        const cl = this.world.closureAt(a.s + 60);
        if (cl && d + a.wid / 2 > cl.dMax) continue;
      }
      const clear = this.agents.every((o) => o === a || o.side !== a.side || Math.abs(o.d - d) > 2.4 || (o.s > a.s + 30 || o.s < a.s - 18));
      const playerClear = !player || a.side !== 'nb' || Math.abs(player.d - d) > 2.4 || player.s > a.s + 25 || player.s < a.s - 15;
      if (clear && playerClear) { a.lane = l; a.changeCd = 4 + this.rnd() * 3; return; }
    }
    a.changeCd = forced ? 1 : 1.5;
  }

  private collidePlayer(a: Agent, p: PlayerVehicle) {
    const ds = p.s - a.s, dd = p.d - a.d;
    const ox = (p.halfLen * 2 + a.len) / 2 - Math.abs(ds), oy = (p.halfWid * 2 + a.wid) / 2 - Math.abs(dd);
    if (ox <= 0 || oy <= 0) return;
    const rel = Math.abs(p.v - a.v) * 3.6;
    if (ox < oy + 0.6) {
      // nose-to-tail
      const newPlayerV = ds < 0 ? Math.min(p.v, a.v - 0.5) : Math.max(p.v, a.v + 0.5);
      a.v = ds < 0 ? Math.max(a.v, p.v * 0.6) : Math.min(a.v, p.v * 0.6);
      p.nudge(Math.sign(ds) * (ox + 0.05), 0);
      p.collide(newPlayerV, 0, rel);
    } else {
      const push = Math.sign(dd || 1) * (oy + 0.05);
      p.collide(p.v * 0.88, push * 0.8, Math.abs(p.v * Math.sin(p.psi)) * 3.6 + rel * 0.3 + 3);
      a.d -= push * 0.2;
    }
    a.hitCd = 0.6;
  }

  private recycle(a: Agent, player: PlayerVehicle | null) {
    if (a.zone && player && a.s > player.s + 1250) return; // zone trucks wait for the player
    if (!player) {
      // attract mode loops around the start
      const base = a.side === 'nb' ? this.world.route.tripStart : this.playerSb;
      this.place(a, a.side === 'nb' ? base - 250 + this.rnd() * 100 : base - 900, { s: -1e9, d: 0 } as PlayerVehicle);
      return;
    }
    a.zone = false;
    if (a.side === 'nb') {
      const ahead = this.rnd() < (player.v < 12 ? 0.55 : 0.8);
      this.place(a, ahead ? player.s + 750 + this.rnd() * 450 : player.s - 280 + this.rnd() * 40, player);
      if (!ahead) a.v = Math.max(a.v, player.v + 3);
    } else {
      this.place(a, this.playerSb - 1000 + this.rnd() * 250, player);
    }
  }

  private sync(a: Agent, lateralRate = 0) {
    const line = this.line(a);
    const p = line.toWorld(a.s, a.d);
    const yaw = p.heading + Math.atan2(lateralRate, Math.max(2, a.v)) * 0.8;
    a.mesh.position.set(p.x, p.y, p.z);
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, a.mesh.rotationQuaternion!);
    a.blob.position.set(p.x, p.y + 0.04, p.z);
    Quaternion.RotationYawPitchRollToRef(yaw, 0, 0, a.blob.rotationQuaternion!);
  }

  /** For the minimap. */
  forEach(cb: (x: number, z: number, side: 'nb' | 'sb') => void) { for (const a of this.agents) if (a.s > -1e5) cb(a.mesh.position.x, a.mesh.position.z, a.side); }
}
