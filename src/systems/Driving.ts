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
import { cabinLayout, buildInterior, CabinLayout, WHEEL_TILT } from '../world/interior';
import { loadVehicleModel, LoadedModel } from '../world/assets';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Matrix } from '@babylonjs/core/Maths/math.vector';

export interface Controls { throttle: number; brake: number; steer: number; horn: boolean }
/** Gear order (change spec §5): PARK → REVERSE → NEUTRAL → DRIVE. */
export type Gear = 'P' | 'R' | 'N' | 'D';
export const GEARS: Gear[] = ['P', 'R', 'N', 'D'];
/** Changing between P, R and D is only allowed below this speed (m/s). */
export const SHIFT_MAX_SPEED = 0.8;
/** Reverse speed cap (m/s) ≈ 16 km/h. */
export const REVERSE_MAX_SPEED = 4.5;
const VERGE_W = 14; // m beside the carriageway that counts as firm verge
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
  /** Current gear. Reverse is its own state, not "negative throttle". */
  gear: Gear = 'P';
  /** Brake lights on this frame. */
  braking = false;
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
    this.buildLights(scene);
    this.layout = cabinLayout(def);
    this.interior = buildInterior(scene, this.layout, this.mesh);
    this.steeringWheel = this.interior.getChildMeshes().find((m) => m.metadata?.steering) as Mesh;
    this.steeringWheel.rotationQuaternion = new Quaternion();
    void this.useModel(scene);
    this.reset(s0, d0);
  }

  get kmh() { return this.v * 3.6; }
  get halfLen() { return this.def.length / 2; }
  get halfWid() { return this.def.width / 2; }
  get onExpressway() { return this.surface === 'expressway'; }

  reset(s: number, d: number, headingOffset = 0) {
    const p = this.world.route.nb.toWorld(s, d);
    this.x = p.x; this.z = p.z; this.heading = p.heading + headingOffset;
    this.v = 0; this.steerSm = 0; this.odometer = 0; this.impacts = []; this.hint = -1; this.gear = 'P'; this.braking = false;
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

  /**
   * Ask for a gear. Neutral is always allowed; P, R and D need the vehicle (almost) stopped.
   * Returns a reason when refused so the HUD can tell the player.
   */
  requestGear(g: Gear): { ok: boolean; reason?: string } {
    if (g === this.gear) return { ok: true };
    // judged on real ground speed too: a vehicle held against a wall isn't moving, whatever the engine is doing
    if (g !== 'N' && Math.abs(this.v) > SHIFT_MAX_SPEED && this.stillT < 1) return { ok: false, reason: 'Stop the vehicle before changing gear' };
    if (Math.abs(this.v) > SHIFT_MAX_SPEED) this.v = 0;
    this.gear = g;
    return { ok: true };
  }
  /** Step along P-R-N-D: +1 towards Drive, −1 towards Park. */
  shiftGear(dir: 1 | -1) {
    const i = GEARS.indexOf(this.gear) + dir;
    if (i < 0 || i >= GEARS.length) return { ok: false };
    return this.requestGear(GEARS[i]);
  }
  get reversing() { return this.gear === 'R' || this.autoRev; }
  private bumpedT = 0; // seconds since the last knock with another vehicle (counts down from 4)
  private wallCd = 0;
  private autoRev = false; private brakeHold = 0;
  private tryT = 0;   // seconds the driver has been pulling continuously
  private stillT = 0; // seconds since the vehicle last got 1.2 m away from its anchor point
  private anchorX = 0; private anchorZ = 0;
  /** Seconds since the vehicle was last against something solid (counts down from 6). */
  blockedT = 0;
  /** Set when the vehicle was lifted back onto the road after being wedged; the game clears it. */
  rescued = false;
  private touching = false; // in contact with a building, stall or pole on the previous step

  /**
   * @param dt real seconds
   * @param travelScale game pace factor for how fast the vehicle covers the real road (1 = real).
   *   Steering keeps its real-time feel; only the distance covered per second is scaled.
   */
  update(dt: number, ctl: Controls, engineOn: boolean, travelScale = 1) {
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
    // Speed `v` is SIGNED along the vehicle's forward axis (negative = moving backwards).
    // Engine force depends on the gear; brake, drag and rolling resistance always oppose
    // the current motion and never push the vehicle through zero. (The old model made the
    // BRAKE pedal drive the car backwards, so there was no way to brake while reversing.)
    const vmax = def.maxSpeed / 3.6;
    const prevV = this.v;
    // Back-out assist: stopped in Drive just after hitting something, holding the
    // BRAKE for half a second backs the vehicle away without touching the gear selector. The
    // accelerator then stops it and drives forward again as normal.
    if (this.autoRev && (this.gear !== 'D' || (ctl.throttle > 0.1 && this.v > -0.3))) this.autoRev = false;
    this.bumpedT = Math.max(0, this.bumpedT - dt);
    const mayBackOut = this.gear === 'D' && (this.blockedT > 0 || this.bumpedT > 0) && ctl.brake > 0.6 && ctl.throttle < 0.1 && Math.abs(this.v) < 0.3;
    this.brakeHold = this.autoRev || mayBackOut ? this.brakeHold + dt : 0;
    if (!this.autoRev && mayBackOut && this.brakeHold > 0.5) this.autoRev = true;
    const gear: Gear = this.autoRev ? 'R' : this.gear;
    const thr = this.autoRev ? ctl.brake : ctl.throttle, brk = this.autoRev ? ctl.throttle : ctl.brake;
    let drive = 0; // engine acceleration, signed
    if (engineOn && thr > 0) {
      if (gear === 'D') drive = def.acceleration * thr * Math.max(0, 1 - Math.pow(Math.max(0, this.v) / vmax, 2.2));
      else if (gear === 'R') drive = -def.acceleration * 0.6 * thr * Math.max(0, 1 - Math.max(0, -this.v) / REVERSE_MAX_SPEED);
    }
    // grade from real elevation acts in every gear (a car in N can roll back down a slope)
    let grade = 0;
    if (this.onExpressway) {
      const slope = (nb.sample(this.s + 3).y - nb.sample(this.s - 3).y) / 6;
      grade = -9.81 * slope * 0.8 * Math.cos(this.psi);
    }
    let v = this.v + (drive + grade) * dt;

    const heavy = def.type === 'minivan' ? 1 : 1.35;
    const av0 = Math.abs(v);
    const offroadK = this.surface === 'dirt' || this.surface === 'bush' ? 0.75 : 1;
    let resist = 0.00045 * heavy * v * v + 0.15 + brk * def.braking * offroadK;
    // Rough ground slows the vehicle mostly through speed-dependent drag. The fixed part must stay
    // well below what reverse gear can produce (0.6 × acceleration), or the vehicle gets stuck there.
    if (this.surface === 'dirt') { resist += 0.3 + av0 * 0.05; this.roughness = Math.min(1, av0 / 14); }
    else if (this.surface === 'bush') {
      // The strip beside the road (drain, kerb, verge) is firm ground: a vehicle that drops a wheel in
      // the drain must be able to pull straight back out. Open bush further away drags much more.
      const verge = Math.abs(this.d) < hw + VERGE_W;
      resist += verge ? 0.25 + av0 * 0.06 : 0.45 + av0 * 0.25;
      this.roughness = Math.min(1, av0 / (verge ? 12 : 7));
    }
    else if (this.surface === 'street') this.roughness = Math.min(0.25, av0 / 60);
    else this.roughness = 0;
    if (this.gear === 'P') resist += 25; // parking pawl
    v = towardsZero(v, resist * dt);
    // engine can't carry the car the "wrong" way through zero in D or R
    if (gear === 'D' && prevV >= 0 && v < 0 && grade >= 0) v = 0;
    if (gear === 'R' && prevV <= 0 && v > 0 && grade <= 0) v = 0;
    if (Math.abs(v) < 0.12 && thr === 0) v = 0;
    this.v = Math.min(vmax, Math.max(-REVERSE_MAX_SPEED, v));
    this.longAcc = (this.v - prevV) / Math.max(dt, 1e-3);
    this.braking = brk > 0.05;
    const av = Math.abs(this.v);

    // --- integrate. Signed v in the bicycle model gives correct steering when reversing.
    // Pace: the vehicle covers ground `travelScale` times faster, while yaw rate stays real,
    // so steering feels the same and the turning radius grows with the pace.
    const f = travelScale;
    this.heading += yawRate * dt;
    this.x += Math.sin(this.heading) * this.v * f * dt;
    this.z += Math.cos(this.heading) * this.v * f * dt;
    this.latAcc = this.v * yawRate;
    this.odometer += av * f * dt;
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
          this.x = prevX; this.z = prevZ; this.v *= -0.15; this.blockedT = 6; this.derive();
          // if the previous spot was already inside it (pushed there by traffic), slide out sideways
          if (Math.abs(this.s - o.s) < o.len / 2 + this.halfLen && Math.abs(this.d - o.d) < o.width / 2 + this.halfWid) {
            this.nudge(0, (this.d < o.d ? -1 : 1) * (o.width / 2 + this.halfWid - Math.abs(this.d - o.d) + 0.05));
          }
          if (kmh > 3) this.impacts.push({ kmh, kind: 'obstacle' });
        }
      }
    }
    // --- edge of the map, buildings, river
    if (Math.abs(this.d) > MAP_EDGE) this.wall(Math.sign(this.d) * MAP_EDGE, 'offroad');
    if (!onCarriageway) {
      // long coaches use a narrower circle than their length, or they can't fit between roadside stalls
      const hit = w.colliders.hit(this.x, this.z, Math.min(Math.max(this.halfWid, this.halfLen * 0.6), this.halfWid + 0.9));
      if (hit) {
        // Only lose speed when driving INTO the object; backing or steering away from it is free.
        const L = Math.hypot(hit[0], hit[1]) || 1;
        const vx = Math.sin(this.heading) * this.v, vz = Math.cos(this.heading) * this.v;
        const into = -(vx * hit[0] + vz * hit[1]) / L; // closing speed towards the object, m/s
        this.x += hit[0] * 1.05; this.z += hit[1] * 1.05;
        if (into > 0.3 && !this.touching && this.blockedT < 5.2) {
          // (blockedT < 5.2: at most one knock every 0.8 s, so a vehicle rattling between two stalls
          // isn't wrecked by a burst of repeat hits)
          // the knock costs speed once; after that the vehicle slides round the object instead of
          // being stopped again on every frame (which used to pin it against stalls and poles)
          this.v *= 0.45; this.bump = 1;
          if (into * 3.6 > 4) this.impacts.push({ kmh: into * 3.6, kind: 'building' });
        }
        if (into > 0.05) {
          // Pressed against it: the nose (or tail, in reverse) swings away so the vehicle slips past
          // instead of sitting there, and the speed can't build up while it is held back.
          const nx = hit[0] / L, nz = hit[1] / L;
          const g = Math.cos(this.heading) * nx - Math.sin(this.heading) * nz; // which way turns the nose away
          const dir = Math.abs(g) > 0.04 ? Math.sign(g) : ctl.steer !== 0 ? Math.sign(ctl.steer) : 1;
          this.heading += dir * Math.sign(this.v || 1) * 1.6 * dt;
          const cap = 1.5 + Math.abs(this.v) * Math.sqrt(Math.max(0, 1 - Math.min(1, into / Math.max(Math.abs(this.v), 1e-3)) ** 2));
          if (Math.abs(this.v) > cap) this.v = Math.sign(this.v) * cap;
        }
        this.touching = true; this.blockedT = 6;
        this.derive();
      } else this.touching = false;
      if (w.isWater(this.x, this.z, w.groundAt(this.s, this.d))) { this.x = prevX; this.z = prevZ; this.v = 0; this.derive(); }
    }
    // --- last resort: wedged beside the road with the engine pulling and nothing moving
    const trying = engineOn && thr > 0.5 && (gear === 'D' || gear === 'R');
    // Has the vehicle really got anywhere? Judged on net distance from an anchor point, because a vehicle
    // wedged between two objects is shoved back and forth every step and looks "fast" step to step.
    if (Math.hypot(this.x - this.anchorX, this.z - this.anchorZ) > 1.2) { this.anchorX = this.x; this.anchorZ = this.z; this.stillT = 0; }
    else this.stillT += dt;
    this.tryT = trying ? this.tryT + dt : 0;
    this.blockedT = Math.max(0, this.blockedT - dt);
    this.wallCd = Math.max(0, this.wallCd - dt);
    // off the road near the kerb, or anywhere the vehicle has just been against a wall, stall or barrier
    // (not a traffic queue: traffic never sets blockedT)
    const held = (!onCarriageway && Math.abs(this.d) < hw + 30) || this.blockedT > 0;
    if (held && this.tryT > 2 && this.stillT > 2) {
      const lane = nb.toWorld(this.s, hw - 1.8);
      this.x = lane.x; this.z = lane.z; this.heading = lane.heading; this.v = 0; this.steerSm = 0;
      // Stop safely after the tow. Do not leave the player in Reverse or keep the
      // brake-triggered reverse assist active after the vehicle has been repositioned.
      this.gear = 'P'; this.autoRev = false; this.brakeHold = 0;
      this.tryT = 0; this.stillT = 0; this.blockedT = 0; this.touching = false; this.rescued = true; this.derive();
    }
    if (this.s < nb.s[0] + 20 || this.s > nb.length - 20) { this.x = prevX; this.z = prevZ; this.v = 0; this.derive(); }

    this.syncMesh(dt);
  }

  /** Bounce off a wall that runs along the carriageway at road-space offset `limit`. */
  private wall(limit: number, kind: Impact['kind']) {
    const kmh = Math.abs(this.v * Math.sin(this.psi)) * 3.6;
    // Put the vehicle back on the side it came from. (It used to land 2 cm BEYOND the wall, so it hit
    // the wall again on every step, lost speed each time and could never steer or reverse away.)
    const p = this.world.route.nb.toWorld(this.s, limit + Math.sign(limit - this.d) * 0.03);
    this.x = p.x; this.z = p.z;
    const rev = this.v < 0 ? Math.PI : 0;
    // direction of TRAVEL relative to the road (the tail leads when reversing): keep the part along the
    // wall, and turn the part into the wall into a small bounce away from it
    const along = Math.cos(this.psi + rev), lat = Math.sin(this.psi + rev);
    const lat2 = -0.25 * lat, along2 = (along < 0 ? -1 : 1) * Math.sqrt(1 - lat2 * lat2);
    this.heading = p.heading + Math.atan2(lat2, along2) - rev;
    this.v *= 1 - Math.min(0.6, Math.abs(lat) * 1.5 + 0.01);
    this.bump = 1; this.blockedT = 6;
    this.derive();
    // one knock per scrape: rubbing along a barrier is not a string of separate crashes
    if (kmh > 3 && this.wallCd <= 0) { this.impacts.push({ kmh, kind }); this.wallCd = 1; }
  }

  /** Push from a traffic/rider collision. */
  collide(newV: number, dPush: number, kmh: number, kind: Impact['kind'] = 'vehicle') {
    this.v = newV; this.nudge(0, dPush); this.heading -= this.psi * 0.4; this.bump = 1;
    if (kind === 'vehicle') this.bumpedT = 4;
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
    this.blinkT += dt;
    this.blinkOn = this.indicator !== 'off' && this.blinkT % 0.7 < 0.35;
    this.syncLights();
    if (this.modelWheel) {
      // the torus's own axis is its local Y: spin around it
      this.modelWheel.rotationQuaternion = this.modelWheelBase.multiply(Quaternion.RotationAxis(Vector3.Up(), this.steerSm * 2.4));
    } else if (this.interiorOn) {
      const a = -this.steerSm * 2.4; // wheel turns ~140° at full lock
      Quaternion.RotationAxisToRef(new Vector3(0, Math.cos(WHEEL_TILT), Math.sin(WHEEL_TILT)), a, this.steeringWheel.rotationQuaternion!);
    }
    Quaternion.RotationYawPitchRollToRef(this.heading, 0, 0, this.blob.rotationQuaternion!);
  }

  // ------------------------------------------------------------ interior views
  readonly layout: CabinLayout;
  readonly interior: Mesh;
  private steeringWheel: Mesh;
  private interiorOn = false;
  /** Driver/cabin cameras: hide the outer body and show the cockpit/cabin. */
  setInteriorView(on: boolean) {
    if (on === this.interiorOn) return;
    this.interiorOn = on;
    this.mesh.isVisible = !on && !this.model;
    // a real model brings its own cabin (seats, dashboard, wheel): keep it and skip the stand-in interior
    this.model?.root.setEnabled(true);
    this.interior.setEnabled(on && !this.model);
  }

  // ------------------------------------------------------------ real 3D model (optional)
  model: LoadedModel | null = null;
  private disposed = false;
  /**
   * Swap the procedural body for a real GLB when one is listed in public/models/manifest.json.
   * Lamps snap to the model's light_* nodes when it has them (docs/ASSET-CONTRACT.md).
   */
  async useModel(scene: Scene, url?: string) {
    const m = await loadVehicleModel(scene, this.def.id, url);
    if (!m || this.disposed) { m?.root.dispose(); return; }
    this.model?.root.dispose();
    this.model = m;
    m.root.parent = this.mesh;
    this.mesh.isVisible = false;
    this.mesh.computeWorldMatrix(true);
    const inv = Matrix.Invert(this.mesh.getWorldMatrix());
    const localOf = (n: TransformNode) => { n.computeWorldMatrix(true); return Vector3.TransformCoordinates(n.getAbsolutePosition(), inv); };
    // lamp lens size travels in the node's scale (width, height); base glow planes are bw × bh
    const snap = (lamps: Mesh[], names: [string, string], bw: number, bh: number) => lamps.forEach((l, i) => {
      const n = m.nodes.get(names[i]); if (!n) return;
      l.position.copyFrom(localOf(n));
      const sx = Math.abs(n.scaling.x), sy = Math.abs(n.scaling.y);
      if (sx !== 1 || sy !== 1) l.scaling.set(sx / bw, sy / bh, 1);
    });
    const brakes = this.mesh.getChildMeshes(true).filter((x) => x.name === 'lamp_brake') as Mesh[];
    snap(brakes, ['light_brake_L', 'light_brake_R'], 0.3, 0.5);
    snap(this.reverseLamps, ['light_reverse_L', 'light_reverse_R'], 0.2, 0.12);
    for (const l of this.indicatorLamps) {
      const front = l.m.rotation.y !== 0;
      const n = m.nodes.get(`indicator_${front ? 'F' : 'R'}${l.side < 0 ? 'L' : 'R'}`);
      if (n) { l.m.position.copyFrom(localOf(n)); l.m.scaling.set(0.9, 0.9, 1); }
    }
    // the model's cabin replaces the stand-in layout: seats, conductor, door, cameras (docs/ASSET-CONTRACT.md)
    const L = this.layout;
    const at = (name: string) => { const n = m.nodes.get(name); return n ? localOf(n) : undefined; };
    const seats = [...m.nodes.keys()].filter((k) => /^seat_\d+$/.test(k)).sort().map((k) => localOf(m.nodes.get(k)!));
    if (seats.length >= this.def.passengerCapacity) L.seats = seats.slice(0, this.def.passengerCapacity).map((v) => ({ x: v.x, y: v.y, z: v.z }));
    const cs = at('conductor_seat'); if (cs) L.conductorSeat = { x: cs.x, y: cs.y, z: cs.z };
    const door = at('door_passenger'); if (door) L.door = { x: door.x, z: door.z };
    const eye = at('driver_cam'); if (eye) L.driverEye = eye;
    L.cams = { cabin: at('cabin_cam'), reverse: at('reverse_cam'), mirror: at('mirror_rear') };
    const sw = m.nodes.get('steering_wheel');
    if (sw) { this.modelWheel = sw; this.modelWheelBase = (sw.rotationQuaternion ?? Quaternion.FromEulerVector(sw.rotation)).clone(); }
    this.interior.setEnabled(false);
  }
  private modelWheel: TransformNode | null = null;
  private modelWheelBase = new Quaternion();
  get interiorView() { return this.interiorOn; }

  // ------------------------------------------------------------ lights
  private brakeMat!: StandardMaterial;
  private reverseMat!: StandardMaterial;
  private reverseLamps: Mesh[] = [];
  private indicatorLamps: { m: Mesh; side: -1 | 1 }[] = [];
  private indMat!: StandardMaterial;
  /** Turn indicators / hazards (toggle). */
  indicator: 'off' | 'left' | 'right' | 'hazard' = 'off';
  private blinkT = 0;
  /** True on the "on" half of the blink cycle (for the HUD and the tick sound). */
  blinkOn = false;

  /** Brake and reverse lamps as separate emissive meshes on the rear of the body. */
  private buildLights(scene: Scene) {
    const L = this.def.length, model = MODEL[this.def.model] ?? 'minibus';
    const z = -L / 2 - 0.045;
    const spot = model === 'sienna' ? { bx: 0.8, by: 1.2, bh: 0.5, rx: 0.5, ry: 0.98 }
      : model === 'coach' ? { bx: 1.05, by: 1.3, bh: 0.6, rx: 0.75, ry: 0.95 }
      : { bx: 0.86, by: 1.1, bh: 0.5, rx: 0.55, ry: 0.72 };
    this.brakeMat = new StandardMaterial('brakeLampMat', scene);
    this.brakeMat.diffuseColor = Color3.Black(); this.brakeMat.specularColor = Color3.Black();
    this.brakeMat.emissiveColor = new Color3(0.35, 0.02, 0.03); this.brakeMat.backFaceCulling = false;
    this.reverseMat = new StandardMaterial('reverseLampMat', scene);
    this.reverseMat.diffuseColor = Color3.Black(); this.reverseMat.specularColor = Color3.Black();
    this.reverseMat.emissiveColor = new Color3(1, 1, 0.94); this.reverseMat.backFaceCulling = false;
    for (const sx of [-1, 1]) {
      const b = MeshBuilder.CreatePlane('lamp_brake', { width: 0.3, height: spot.bh }, scene);
      b.material = this.brakeMat; b.parent = this.mesh; b.position.set(sx * spot.bx, spot.by, z); b.metadata = { dynamic: true };
      const r = MeshBuilder.CreatePlane('lamp_reverse', { width: 0.2, height: 0.12 }, scene);
      r.material = this.reverseMat; r.parent = this.mesh; r.position.set(sx * spot.rx, spot.ry, z - 0.005); r.metadata = { dynamic: true };
      r.isVisible = false;
      this.reverseLamps.push(r);
    }
    // indicators: rear corners and front corners
    this.indMat = new StandardMaterial('indicatorMat', scene);
    this.indMat.diffuseColor = Color3.Black(); this.indMat.specularColor = Color3.Black();
    this.indMat.emissiveColor = new Color3(1, 0.55, 0.05); this.indMat.backFaceCulling = false;
    for (const sx of [-1, 1] as const) for (const zEnd of [z, -z]) {
      const m = MeshBuilder.CreatePlane('lamp_indicator', { width: 0.16, height: 0.1 }, scene);
      m.material = this.indMat; m.parent = this.mesh; m.metadata = { dynamic: true };
      m.position.set(sx * (spot.bx + 0.08), zEnd < 0 ? spot.by - 0.3 : spot.ry + 0.05, zEnd + (zEnd < 0 ? -0.006 : 0.006));
      if (zEnd > 0) m.rotation.y = Math.PI;
      m.isVisible = false;
      this.indicatorLamps.push({ m, side: sx });
    }
  }

  private syncLights() {
    const on = this.braking;
    this.brakeMat.emissiveColor.set(on ? 1 : 0.35, on ? 0.08 : 0.02, on ? 0.08 : 0.03);
    const outside = !this.interiorOn;
    for (const r of this.reverseLamps) r.isVisible = this.reversing && outside;
    const ind = this.indicator;
    for (const l of this.indicatorLamps) {
      const want = ind === 'hazard' || (ind === 'left' && l.side === -1) || (ind === 'right' && l.side === 1);
      l.m.isVisible = want && this.blinkOn && outside;
    }
  }
  /** Toggle an indicator (pressing the same side again turns it off). */
  toggleIndicator(which: 'left' | 'right' | 'hazard') { this.indicator = this.indicator === which ? 'off' : which; this.blinkT = 0; }

  dispose() { this.disposed = true; this.mesh.dispose(); this.blob.dispose(); this.brakeMat.dispose(); this.reverseMat.dispose(); this.indMat.dispose(); }
}

/** Move `v` towards zero by `amount`, never crossing it. */
function towardsZero(v: number, amount: number) {
  if (v > 0) return Math.max(0, v - amount);
  if (v < 0) return Math.min(0, v + amount);
  return 0;
}
