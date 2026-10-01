// Vehicle interiors (change spec §15): seat layout, driver cockpit and passenger cabin.
// Procedural stand-ins for now. When real GLB vehicles arrive, the same layout comes from the
// model's named nodes (seat_01…, conductor_seat, driver_cam, cabin_cam — see docs/ASSET-CONTRACT.md).
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Matrix, Vector3 } from '@babylonjs/core/Maths/math.vector';
import { PartBuilder } from './geo';
import { vehicleMaterial } from './models';
import type { VehicleDef } from '../data/vehicles';

/** Axis the steering wheel spins around (local), matching the tilt used in buildInterior. */
export const WHEEL_TILT = Math.PI / 2 - 0.45;

export interface Seat { x: number; y: number; z: number }

export interface CabinLayout {
  floorY: number; windowY: number; roofY: number; halfW: number;
  dashZ: number; rearZ: number;
  /** Driver's eye point (left-hand drive, as in Nigeria). */
  driverEye: Vector3;
  driverSeat: Seat;
  conductorSeat: Seat;
  /** Passenger seats, front to back. Length = vehicle capacity. */
  seats: Seat[];
  /** Where passengers get in and out (right side, sliding door). */
  door: { x: number; z: number };
  /** Camera points from a real model's nodes (cabin_cam, reverse_cam, mirror_rear), when it has them. */
  cams?: { cabin?: Vector3; reverse?: Vector3; mirror?: Vector3 };
}

/** Seat layout by body type. Coordinates are local to the vehicle (x right, y up, z forward). */
export function cabinLayout(def: VehicleDef): CabinLayout {
  const cap = def.passengerCapacity;
  let p: { floorY: number; windowY: number; roofY: number; halfW: number; dashZ: number; rearZ: number; driverZ: number; eyeY: number; rowStart: number; rowEnd: number; perRow: number; seatY: number; doorZ: number };
  if (def.model === 'sienna') {
    p = { floorY: 0.5, windowY: 1.08, roofY: 1.7, halfW: 0.93, dashZ: 1.15, rearZ: -2.4, driverZ: 0.25, eyeY: 1.3, rowStart: -0.75, rowEnd: -1.8, perRow: 3, seatY: 0.62, doorZ: -0.6 };
  } else if (def.model === 'coach') {
    p = { floorY: 1.25, windowY: 1.75, roofY: 3.3, halfW: 1.2, dashZ: 5.75, rearZ: -5.85, driverZ: 5.0, eyeY: 2.45, rowStart: 4.0, rowEnd: -5.3, perRow: 4, seatY: 1.4, doorZ: 5.3 };
  } else {
    const L = def.model === 'minibus' || def.model === 'coaster' ? 2.7 : 2.45;
    const H = def.model === 'minibus' || def.model === 'coaster' ? 2.28 : 1.95;
    p = { floorY: 0.5, windowY: 1.3, roofY: H - 0.1, halfW: 0.9, dashZ: L - 0.55, rearZ: -L + 0.1, driverZ: L - 1.25, eyeY: 1.55, rowStart: L - 2.05, rowEnd: -L + 0.45, perRow: cap >= 14 ? 4 : 3, seatY: 0.62, doorZ: L - 1.9 };
  }
  const rows = Math.max(1, Math.ceil(cap / p.perRow));
  const dz = rows > 1 ? (p.rowStart - p.rowEnd) / (rows - 1) : 0;
  const seats: Seat[] = [];
  for (let r = 0; r < rows; r++) {
    const n = Math.min(p.perRow, cap - r * p.perRow);
    const span = p.halfW * 2 - 0.5;
    for (let c = 0; c < n; c++) {
      const x = p.perRow === 1 ? 0 : -span / 2 + (span * c) / (p.perRow - 1);
      seats.push({ x, y: p.seatY, z: p.rowStart - r * dz });
    }
  }
  return {
    floorY: p.floorY, windowY: p.windowY, roofY: p.roofY, halfW: p.halfW, dashZ: p.dashZ, rearZ: p.rearZ,
    driverEye: new Vector3(-0.42 * (p.halfW / 0.93), p.eyeY, p.driverZ - 0.05),
    driverSeat: { x: -0.42 * (p.halfW / 0.93), y: p.seatY, z: p.driverZ },
    conductorSeat: { x: 0.42 * (p.halfW / 0.93), y: p.seatY, z: p.driverZ },
    seats,
    door: { x: p.halfW + 0.35, z: p.doorZ },
  };
}

const TRIM = '#2b2f33', FLOOR = '#1c1e20', FABRIC = '#3d4650', FABRIC2 = '#57606b', DASH = '#15181b', ROOF = '#bcb7ad';

/**
 * Interior shell (floor, lower walls, pillars, roof, seats, dashboard, steering wheel), parented to the body.
 * Shown only in the driver and cabin cameras, when the outer body is hidden.
 */
export function buildInterior(scene: Scene, L: CabinLayout, parent: Mesh): Mesh {
  const b = new PartBuilder(scene, 'interior');
  const len = L.dashZ - L.rearZ, midZ = (L.dashZ + L.rearZ) / 2, W = L.halfW * 2;
  b.box(0, L.floorY - 0.03, midZ, W, 0.06, len, FLOOR);
  for (const s of [-1, 1]) {
    b.box(s * L.halfW, (L.floorY + L.windowY) / 2, midZ, 0.05, L.windowY - L.floorY, len, TRIM); // lower wall
    b.box(s * L.halfW, L.windowY, midZ, 0.09, 0.05, len, '#40464c'); // window sill
    const pillars = Math.max(2, Math.round(len / 1.4));
    for (let i = 0; i <= pillars; i++) {
      const z = L.rearZ + (len * i) / pillars;
      b.box(s * L.halfW, (L.windowY + L.roofY) / 2, z, 0.06, L.roofY - L.windowY, 0.09, TRIM);
    }
  }
  b.box(0, L.roofY, midZ, W, 0.05, len, ROOF);
  b.box(0, (L.floorY + L.windowY) / 2, L.rearZ, W, L.windowY - L.floorY, 0.05, TRIM); // tailgate lower
  // dashboard + instrument cluster
  const dashH = L.windowY - L.floorY + 0.08;
  b.box(0, L.floorY + dashH / 2, L.dashZ, W, dashH, 0.45, DASH);
  b.box(L.driverSeat.x, L.windowY + 0.02, L.dashZ - 0.18, 0.42, 0.14, 0.12, '#0b0d0f');
  for (const dx of [-0.09, 0.09]) b.cylinder(L.driverSeat.x + dx, L.windowY + 0.02, L.dashZ - 0.245, 0.055, 0.01, '#6f7f8a', 'z', 16); // gauges
  // seats (driver, conductor, passengers)
  const seat = (x: number, y: number, z: number, col: string) => {
    b.box(x, y - 0.02, z, 0.46, 0.1, 0.46, col);
    b.box(x, y + 0.33, z - 0.24, 0.46, 0.62, 0.09, col);
    b.box(x, y + 0.7, z - 0.24, 0.22, 0.14, 0.08, col); // headrest
    b.box(x, (L.floorY + y) / 2, z, 0.36, y - L.floorY, 0.36, '#23272a');
  };
  seat(L.driverSeat.x, L.driverSeat.y, L.driverSeat.z, FABRIC);
  seat(L.conductorSeat.x, L.conductorSeat.y, L.conductorSeat.z, FABRIC);
  L.seats.forEach((s, i) => seat(s.x, s.y, s.z, i % 2 ? FABRIC2 : FABRIC));
  // steering column
  b.cylinder(L.driverSeat.x, L.windowY - 0.15, L.dashZ - 0.35, 0.035, 0.45, '#222', 'z', 8);
  const m = b.build();
  m.material = vehicleMaterial(scene);
  // steering wheel (separate so it can turn)
  const wheel = MeshBuilder.CreateTorus('steeringWheel', { diameter: 0.38, thickness: 0.035, tessellation: 24 }, scene);
  wheel.bakeTransformIntoVertices(Matrix.RotationX(WHEEL_TILT));
  wheel.material = vehicleMaterial(scene);
  const cols: number[] = []; for (let i = 0; i < wheel.getTotalVertices(); i++) cols.push(0.06, 0.07, 0.08, 1);
  wheel.setVerticesData('color', cols);
  wheel.parent = m;
  wheel.position.set(L.driverSeat.x, L.windowY - 0.08, L.dashZ - 0.55);
  wheel.metadata = { dynamic: true, steering: true };
  m.parent = parent;
  m.metadata = { dynamic: true };
  m.setEnabled(false);
  return m;
}
