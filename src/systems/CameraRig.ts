// Camera system (change spec §5, §15):
//  - chase: third-person. In Reverse it rises and looks behind the vehicle.
//  - hood:  driver view from the driver's seat (dashboard, steering wheel, rear-view camera).
//           In Reverse it switches to a rear-facing reversing camera.
//  - cabin: passenger compartment view: seats, passengers, conductor, boarding and payments.
//  - orbit: slow orbit for the menus.
// "Look back" (hold B, or the 👀 button) turns any driving view to face backwards.
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Viewport } from '@babylonjs/core/Maths/math.viewport';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PlayerVehicle } from './Driving';
import { World } from '../world/World';

export type CamMode = 'chase' | 'hood' | 'cabin' | 'orbit';

export class CameraRig {
  readonly cam: UniversalCamera;
  /** Small rear-view display shown in the driver view. */
  readonly mirror: UniversalCamera;
  mode: CamMode = 'orbit';
  /** Held "look back" input. */
  lookBack = false;
  /** Rear-view display enabled (off on low graphics quality). */
  mirrorEnabled = true;
  private pos = new Vector3();
  private look = new Vector3();
  private orbitT = 0;
  private first = true;
  private revBlend = 0;

  constructor(private scene: Scene, private world: World) {
    this.cam = new UniversalCamera('cam', new Vector3(0, 10, -20), scene);
    this.cam.minZ = 0.3; this.cam.maxZ = world.scene.fogEnd + 80; this.cam.fov = 0.95;
    this.cam.inputs.clear();
    this.mirror = new UniversalCamera('rearView', new Vector3(0, 10, -20), scene);
    this.mirror.minZ = 0.5; this.mirror.maxZ = 400; this.mirror.fov = 0.55;
    this.mirror.inputs.clear();
    this.mirror.viewport = new Viewport(0.39, 0.7, 0.22, 0.11);
  }

  snap() { this.first = true; }

  /** Local vehicle point → world, following the body's full transform (pitch, roll, shake). */
  private local(t: PlayerVehicle, x: number, y: number, z: number) {
    return Vector3.TransformCoordinates(new Vector3(x, y, z), t.mesh.getWorldMatrix());
  }

  update(dt: number, target: PlayerVehicle | null, orbitCenter?: Vector3, orbitRadius = 11, shift = 0) {
    const cam = this.cam;
    let wantPos: Vector3, wantLook: Vector3;
    let rigid = false;
    const interior = !!target && (this.mode === 'hood' || this.mode === 'cabin');
    target?.setInteriorView(interior);
    target?.mesh.computeWorldMatrix(true);
    const showMirror = !!target && this.mode === 'hood' && this.mirrorEnabled && !target.reversing && !this.lookBack;
    this.scene.activeCameras = showMirror ? [cam, this.mirror] : [cam];

    if (this.mode === 'orbit' || !target) {
      this.orbitT += dt * 0.12;
      const c = orbitCenter ?? target?.pos ?? Vector3.Zero();
      const h = (target?.heading ?? 0) + 2.2 + Math.sin(this.orbitT) * 0.9;
      wantPos = new Vector3(c.x + Math.sin(h) * orbitRadius, c.y + 3.2 + Math.sin(this.orbitT * 0.7) * 0.6, c.z + Math.cos(h) * orbitRadius);
      wantLook = new Vector3(c.x, c.y + 1.1, c.z);
      if (shift) {
        // slide the framing sideways (camera-right) so UI panels don't cover the vehicle
        const fx = wantLook.x - wantPos.x, fz = wantLook.z - wantPos.z, L = Math.hypot(fx, fz) || 1;
        const rx = fz / L, rz = -fx / L;
        wantPos.x += rx * shift; wantPos.z += rz * shift; wantLook.x += rx * shift; wantLook.z += rz * shift;
      }
    } else if (this.mode === 'chase') {
      const fx = Math.sin(target.heading), fz = Math.cos(target.heading);
      const big = target.def.type !== 'minivan';
      const dist = big ? 9.5 : 7.6, h = big ? 3.9 : 2.9;
      // reversing: rise up and look at the ground behind the vehicle
      this.revBlend += ((target.reversing ? 1 : 0) - this.revBlend) * Math.min(1, dt * 3);
      const rb = this.revBlend;
      if (this.lookBack) {
        wantPos = new Vector3(target.pos.x + fx * (dist * 0.6), target.pos.y + h + 0.6, target.pos.z + fz * (dist * 0.6));
        wantLook = new Vector3(target.pos.x - fx * 12, target.pos.y + 0.8, target.pos.z - fz * 12);
      } else {
        // normal chase, blended towards a reversing view: above the roof, looking back past the tailgate
        const speedPull = Math.min(1.5, Math.abs(target.v) / 25);
        const back = (dist + speedPull) * (1 - rb) + -2.0 * rb, up = h + rb * 2.2;
        wantPos = new Vector3(target.pos.x - fx * back, target.pos.y + up, target.pos.z - fz * back);
        const ahead = 8 * (1 - rb) - 14 * rb;
        wantLook = new Vector3(target.pos.x + fx * ahead, target.pos.y + (big ? 1.9 : 1.3) * (1 - rb) + 0.2 * rb, target.pos.z + fz * ahead);
      }
      cam.fov += ((0.92 + Math.min(0.18, Math.abs(target.v) / 250) + rb * 0.15) - cam.fov) * Math.min(1, dt * 2);
    } else if (this.mode === 'hood') {
      const L = target.layout;
      rigid = true;
      if (target.reversing || this.lookBack) {
        // reversing camera at the tailgate, looking back and down
        wantPos = this.local(target, 0, L.roofY - 0.25, L.rearZ + 0.15);
        wantLook = this.local(target, 0, 0.2, L.rearZ - 9);
        cam.fov = 1.25;
      } else {
        const e = L.driverEye;
        wantPos = this.local(target, e.x, e.y, e.z);
        wantLook = this.local(target, e.x * 0.6, e.y - 0.35, e.z + 30);
        cam.fov = 1.1;
        if (showMirror) {
          this.mirror.position.copyFrom(this.local(target, 0, L.roofY - 0.12, L.rearZ + 0.3));
          this.mirror.setTarget(this.local(target, 0, L.windowY, L.rearZ - 40));
        }
      }
    } else {
      // cabin: from the front, between the front seats, looking back over the passengers
      const L = target.layout;
      rigid = true;
      if (this.lookBack) {
        wantPos = this.local(target, 0, L.roofY - 0.2, L.rearZ + 0.25);
        wantLook = this.local(target, 0, L.floorY + 0.4, L.dashZ);
      } else {
        wantPos = this.local(target, 0, L.roofY - 0.18, L.dashZ - 0.35);
        wantLook = this.local(target, 0, L.floorY + 0.35, L.rearZ + 0.3);
      }
      cam.fov = 1.3;
    }
    if (this.first) { this.pos.copyFrom(wantPos); this.look.copyFrom(wantLook); this.first = false; }
    const kp = rigid ? 1 : 1 - Math.exp(-dt * 7);
    const kl = rigid ? 1 : 1 - Math.exp(-dt * 10);
    Vector3.LerpToRef(this.pos, wantPos, kp, this.pos);
    Vector3.LerpToRef(this.look, wantLook, kl, this.look);
    // keep above ground (outside views only)
    if (target && !rigid) {
      const pr = this.world.route.nb.project(this.pos.x, this.pos.z);
      const g = Math.abs(pr.d) < 300 ? this.world.groundAt(pr.s, pr.d) : -1e9;
      if (this.pos.y < g + 1.2) this.pos.y = g + 1.2;
    }
    cam.minZ = rigid ? 0.05 : 0.3;
    cam.position.copyFrom(this.pos);
    cam.setTarget(this.look);
  }
}
