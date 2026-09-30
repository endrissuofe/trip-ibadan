// Camera system: chase (default), hood, and a slow orbit for menus.
import { Scene } from '@babylonjs/core/scene';
import { UniversalCamera } from '@babylonjs/core/Cameras/universalCamera';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PlayerVehicle } from './Driving';
import { World } from '../world/World';

export type CamMode = 'chase' | 'hood' | 'orbit';

export class CameraRig {
  readonly cam: UniversalCamera;
  mode: CamMode = 'orbit';
  private pos = new Vector3();
  private look = new Vector3();
  private orbitT = 0;
  private first = true;

  constructor(scene: Scene, private world: World) {
    this.cam = new UniversalCamera('cam', new Vector3(0, 10, -20), scene);
    this.cam.minZ = 0.3; this.cam.maxZ = world.scene.fogEnd + 80; this.cam.fov = 0.95;
    this.cam.inputs.clear();
  }

  snap() { this.first = true; }

  update(dt: number, target: PlayerVehicle | null, orbitCenter?: Vector3, orbitRadius = 11, shift = 0) {
    const cam = this.cam;
    let wantPos: Vector3, wantLook: Vector3;
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
    } else {
      const fx = Math.sin(target.heading), fz = Math.cos(target.heading);
      const big = target.def.type !== 'minivan';
      if (this.mode === 'chase') {
        const dist = big ? 9.5 : 7.6, h = big ? 3.9 : 2.9;
        const speedPull = Math.min(1.5, Math.abs(target.v) / 25);
        wantPos = new Vector3(target.pos.x - fx * (dist + speedPull), target.pos.y + h, target.pos.z - fz * (dist + speedPull));
        wantLook = new Vector3(target.pos.x + fx * 8, target.pos.y + (big ? 1.9 : 1.3), target.pos.z + fz * 8);
        cam.fov += ((0.92 + Math.min(0.18, Math.abs(target.v) / 250)) - cam.fov) * Math.min(1, dt * 2);
      } else {
        const fwd = target.def.length * 0.5 - (big ? 0.5 : 1.6);
        const hy = big ? 2.2 : 1.45;
        wantPos = new Vector3(target.pos.x + fx * fwd, target.pos.y + hy, target.pos.z + fz * fwd);
        wantLook = new Vector3(target.pos.x + fx * 40, target.pos.y + hy - 0.8, target.pos.z + fz * 40);
        cam.fov = 1.0;
      }
    }
    if (this.first) { this.pos.copyFrom(wantPos); this.look.copyFrom(wantLook); this.first = false; }
    const kp = this.mode === 'hood' ? 1 : 1 - Math.exp(-dt * 7);
    const kl = this.mode === 'hood' ? 1 : 1 - Math.exp(-dt * 10);
    Vector3.LerpToRef(this.pos, wantPos, kp, this.pos);
    Vector3.LerpToRef(this.look, wantLook, kl, this.look);
    // keep above ground
    if (target) {
      const pr = this.world.route.nb.project(this.pos.x, this.pos.z);
      const g = Math.abs(pr.d) < 300 ? this.world.groundAt(pr.s, pr.d) : -1e9;
      if (this.pos.y < g + 1.2) this.pos.y = g + 1.2;
    }
    cam.position.copyFrom(this.pos);
    cam.setTarget(this.look);
  }
}
