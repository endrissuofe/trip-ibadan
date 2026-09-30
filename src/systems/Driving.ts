// Driving + Vehicle system. The vehicle moves freely in world space (x, z, heading):
// on the expressway, off the shoulder into real inner streets (tarred or untarred),
// or across rough ground. Road-space (s, d, psi) is derived every frame for
// navigation, traffic and the carriageway's barriers.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { World } from '../world/World';
import { VehicleDef } from '../data/vehicles';
import { buildVehicle, vehicleMaterial, TrafficKind } from '../world/models';
import { blobTexture } from '../world/textures';

export interface Controls { throttle: number; brake: number; steer: number; horn: boolean }
export interface Impact { kmh: number; kind: 'barrier' | 'vehicle' | 'obstacle' | 'offroad' | 'building' | 'rider' }
export type Surface = 'expressway' | 'street' | 'dirt' | 'bush';

const MAP_EDGE = 318; // terrain is only baked this far from the expressway
const MODEL: Record<string, TrafficKind> = { sienna: 'sienna', minibus: 'minibus', hiace: 'hiace', coach: 'coach', coaster: 'minibus' };

export class PlayerVehicle {
  // world space
  x = 0; z = 0; heading = 0; v = 0; y = 0;
  // derived road space (NB carriageway)
  s = 0; d = 0; psi = 0;
  surface: Surface = 'expressway';
  streetName = '';
  steerSm = 0;
  odometer = 0;
  longAcc = 0; latAcc = 0;
  bridge = false;
  readonly mesh: Mesh;
  private blob: Mesh;
  private rollSm = 0; private pitchSm = 0;
  private bump = 0;
  private hint = -1;
  private stoppedBrakeT = 0;
  impacts: Impact[] = [];
  pos = new Vector3();
  /** 0..1 roughness felt this frame (for passenger comfort and camera shake). */
  roughness = 0;

  constructor(scene: Scene, private world: World, readonly def: VehicleDef, s0: number, d0: number) {
    this.mesh = buildVehicle(scene, MODEL[def.model] ?? 'minibus', def.bodyColor, 'player');
    const mat = vehicleMaterial(scene).clone('playerMat');
    mat.specularColor = new Color3(0.7, 0.7, 0.7); mat.specularPower = 80;
    this.mesh.material = mat;
    this.mesh.rotationQuaternion = new Quaternion();
    this.mesh.metadata = { dynamic: true };
    this.blob = MeshBuilder.CreateGround('playerBlob', { width: def.width + 0.9, height: def.length + 1.2 }, scene);
    const bm = new StandardMaterial('blobMat', scene);
    bm.diffuseTexture = blobTexture(scene); bm.useAlphaFromDiffuseTexture = true; bm.specularColor = Color3.Black(); bm.zOffset = -4;
    this.blob.material = bm; this.blob.rotationQuaternion = new Quaternion(); this.blob.metadata = { dynamic: true };
    this.reset(s0, d0);
  }

  get kmh() { return this.v * 3.6; }
  get halfLen() { return this.def.length / 2; }
  get halfWid() { return this.def.width / 2; }
  get onExpressway() { return this.surface === 'expressway'; }

  reset(s: number, d: number, headingOffset = 0) {
    const p = this.world.route.nb.toWorld(s, d);
    this.x = p.x; this.z = p.z; this.heading = p.heading + headingOffset;
    this.v = 0; this.steerSm = 0; this.odometer = 0; this.impacts = []; this.hint = -1;
    this.derive();
    this.syncMesh(0);
  }

  /** Move by a road-space offset (used by traffic collisions). */
  nudge(ds: number, dd: number) {
    const smp = this.world.route.nb.sample(this.s);
    this.x += smp.tx * ds + smp.nx * dd; this.z += smp.tz * ds + smp.nz * dd;
    this.derive();
  }

  private derive() {
    const nb = this.world.route.nb;
    const pr = nb.project(this.x, this.z, this.hint);
    this.hint = pr.i; this.s = pr.s; this.d = pr.d;
    const h = nb.sample(pr.s).heading;
    this.psi = Math.atan2(Math.sin(this.heading - h), Math.cos(this.heading - h));
  }

  update(dt: number, ctl: Controls, engineOn: boolean) {
    const def = this.def, w = this.world, nb = w.route.nb;
    const hw = nb.halfWidth(this.s);
    this.bridge = nb.sample(this.s).bridge;
    const prevX = this.x, prevZ = this.z, prevD = this.d;

    // --- steering (assisted, speed-sensitive)
    this.steerSm += (ctl.steer - this.steerSm) * Math.min(1, dt * (ctl.steer === 0 ? 5 : 3.2));
    const handling = 0.62 + def.handling * 0.045;
    const maxSteer = (handling * 0.6) / (1 + Math.abs(this.v) / 11);
    const wb = def.length * 0.58;
    const yawRate = (this.v * Math.tan(this.steerSm * maxSteer)) / wb;

    // --- surface under the vehicle
    const onCarriageway = this.d > -hw - 1.3 && this.d < hw + 2.8;
    let street = onCarriageway ? null : w.streets.nearest(this.x, this.z, 6);
    if (street && street.dist > street.halfW + 0.6) street = null;
    this.surface = onCarriageway ? 'expressway' : street ? (street.unpaved ? 'dirt' : 'street') : 'bush';
    this.streetName = street?.name ?? '';

    // --- longitudinal
    this.stoppedBrakeT = ctl.brake > 0.5 && this.v < 0.5 ? this.stoppedBrakeT + dt : 0;
    const vmax = def.maxSpeed / 3.6;
    let a = 0;
    if (engineOn && ctl.throttle > 0) {
      if (this.v >= -0.2) a += def.acceleration * ctl.throttle * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / vmax, 2.2));
      else a += def.braking * ctl.throttle;
    }
    if (ctl.brake > 0) {
      if (this.v > 0.4) a -= def.braking * ctl.brake * (this.surface === 'dirt' || this.surface === 'bush' ? 0.75 : 1);
      else if (engineOn && this.stoppedBrakeT > 0.6) a -= 2.2 * ctl.brake;
      else this.v = Math.max(0, this.v);
    }
    const heavy = def.type === 'minivan' ? 1 : 1.35;
    a -= 0.00045 * heavy * this.v * Math.abs(this.v) + 0.15 * Math.sign(this.v);
    const av = Math.abs(this.v);
    if (this.surface === 'dirt') { a -= Math.sign(this.v) * (0.5 + av * 0.035); this.roughness = Math.min(1, av / 14); }
    else if (this.surface === 'bush') { a -= Math.sign(this.v) * (2.0 + av * 0.07); this.roughness = Math.min(1, av / 7); }
    else if (this.surface === 'street') this.roughness = Math.min(0.25, av / 60);
    else this.roughness = 0;
    if (this.onExpressway) { // grade resistance from real elevation
      const slope = (nb.sample(this.s + 3).y - nb.sample(this.s - 3).y) / 6;
      a -= 9.81 * slope * 0.8 * Math.cos(this.psi);
    }

    const prevV = this.v;
    this.v += a * dt;
    if (Math.abs(this.v) < 0.12 && ctl.throttle === 0 && ctl.brake === 0) this.v = 0;
    this.v = Math.min(vmax, Math.max(-4.5, this.v));
    this.longAcc = (this.v - prevV) / Math.max(dt, 1e-3);

    // --- integrate
    this.heading += yawRate * dt;
    this.x += Math.sin(this.heading) * this.v * dt;
    this.z += Math.cos(this.heading) * this.v * dt;
    this.latAcc = this.v * yawRate;
    this.odometer += av * dt;
    this.derive();

    // --- carriageway walls (only matter near the expressway)
    const wdt = this.halfWid + 0.05;
    const leftWall = -hw - 1.23 + wdt;
    if (Math.abs(this.d) < 40) {
      if (prevD >= leftWall - 0.05 && this.d < leftWall) this.wall(leftWall, 'barrier'); // median barrier
      if (this.bridge) {
        const par = hw + 2.8 - wdt;
        if (prevD <= par + 0.05 && this.d > par) this.wall(par, 'barrier');         // parapet, from the deck
        if (prevD > hw + 3.2 && this.d < hw + 3.2) this.wall(hw + 3.25, 'barrier'); // parapet, from outside
      }
      const cl = w.closureAt(this.s);
      if (cl && this.d > cl.dMax - wdt && this.d < cl.dMax + 3 && prevD <= cl.dMax - wdt + 0.05) this.wall(cl.dMax - wdt, 'obstacle');
      for (const o of w.obstacles) {
        if (Math.abs(this.s - o.s) < o.len / 2 + this.halfLen && Math.abs(this.d - o.d) < o.width / 2 + this.halfWid) {
          const kmh = av * 3.6;
          this.x = prevX; this.z = prevZ; this.v *= -0.15; this.derive();
          if (kmh > 3) this.impacts.push({ kmh, kind: 'obstacle' });
        }
      }
    }
    // --- edge of the map, buildings, river
    if (Math.abs(this.d) > MAP_EDGE) this.wall(Math.sign(this.d) * MAP_EDGE, 'offroad');
    if (!onCarriageway) {
      const hit = w.colliders.hit(this.x, this.z, Math.max(this.halfWid, this.halfLen * 0.6));
      if (hit) {
        const kmh = av * 3.6;
        this.x += hit[0]; this.z += hit[1]; this.v *= 0.3; this.bump = 1; this.derive();
        if (kmh > 4) this.impacts.push({ kmh, kind: 'building' });
      }
      if (w.isWater(this.x, this.z, w.groundAt(this.s, this.d))) { this.x = prevX; this.z = prevZ; this.v = 0; this.derive(); }
    }
    if (this.s < nb.s[0] + 20 || this.s > nb.length - 20) { this.x = prevX; this.z = prevZ; this.v = 0; this.derive(); }

    this.syncMesh(dt);
  }

  /** Bounce off a wall that runs along the carriageway at road-space offset `limit`. */
  private wall(limit: number, kind: Impact['kind']) {
    const kmh = Math.abs(this.v * Math.sin(this.psi)) * 3.6;
    const p = this.world.route.nb.toWorld(this.s, limit - Math.sign(limit - this.d) * 0.02);
    this.x = p.x; this.z = p.z;
    this.heading = p.heading - this.psi * 0.25;
    this.v *= 1 - Math.min(0.6, Math.abs(Math.sin(this.psi)) * 1.5 + 0.08);
    this.bump = 1;
    this.derive();
    if (kmh > 2) this.impacts.push({ kmh, kind });
  }

  /** Push from a traffic/rider collision. */
  collide(newV: number, dPush: number, kmh: number, kind: Impact['kind'] = 'vehicle') {
    this.v = newV; this.nudge(0, dPush); this.heading -= this.psi * 0.4; this.bump = 1;
    if (kmh > 2) this.impacts.push({ kmh, kind });
  }

  private heightAt(): number {
    const w = this.world, nb = w.route.nb;
    const hw = nb.halfWidth(this.s);
    if (this.d > -hw - 1.3 && this.d < hw + 2.8) return nb.sample(this.s).y;
    const g = w.groundAt(this.s, this.d);
    const st = w.streets.nearest(this.x, this.z, 6);
    if (st && st.dist < st.halfW + 0.6) return Math.max(st.y, g);
    return g;
  }

  syncMesh(dt: number) {
    const y = this.heightAt();
    this.y = dt > 0 ? this.y + (y - this.y) * Math.min(1, dt * 12) : y;
    const k = Math.min(1, dt * 5);
    this.rollSm += (Math.max(-0.08, Math.min(0.08, this.latAcc * 0.009)) - this.rollSm) * k;
    this.pitchSm += (Math.max(-0.04, Math.min(0.04, this.longAcc * 0.006)) - this.pitchSm) * k;
    const nb = this.world.route.nb;
    const slope = this.onExpressway ? ((nb.sample(this.s + 2).y - nb.sample(this.s - 2).y) / 4) * Math.cos(this.psi) : 0;
    this.bump *= Math.exp(-dt * 6);
    const shake = this.roughness * 0.035 + this.bump * 0.03;
    const jitter = shake ? (Math.random() - 0.5) * shake : 0;
    Quaternion.RotationYawPitchRollToRef(this.heading, -Math.atan(slope) + this.pitchSm + jitter, this.rollSm + jitter, this.mesh.rotationQuaternion!);
    this.mesh.position.set(this.x, this.y + jitter * 0.6, this.z);
    this.pos.copyFrom(this.mesh.position);
    this.blob.position.set(this.x, this.y + 0.05, this.z);
    Quaternion.RotationYawPitchRollToRef(this.heading, 0, 0, this.blob.rotationQuaternion!);
  }

  dispose() { this.mesh.dispose(); this.blob.dispose(); }
}
