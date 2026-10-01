// Procedural low-poly vehicles. Forward = +z, origin on the ground at the vehicle centre.
// Real Nigerian expressway mix: private cars, SUVs, intercity buses, trucks, tankers, danfos in traffic.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { PartBuilder } from './geo';

export type TrafficKind = 'sedan' | 'suv' | 'minibus' | 'danfo' | 'truck' | 'tanker' | 'coach' | 'sienna' | 'hiace';
export const KIND_DIMS: Record<TrafficKind, { length: number; width: number }> = {
  sedan: { length: 4.6, width: 1.8 }, suv: { length: 4.8, width: 1.95 }, sienna: { length: 5.1, width: 2.0 },
  minibus: { length: 5.4, width: 2.0 }, danfo: { length: 4.9, width: 1.9 }, hiace: { length: 4.9, width: 1.9 }, truck: { length: 12, width: 2.5 },
  tanker: { length: 11, width: 2.5 }, coach: { length: 12, width: 2.55 },
};

const GLASS = '#1a2630', TYRE = '#161616', RIM = '#9aa0a4', DARK = '#23272a', LAMP = '#e8ecef', TAIL = '#b3121b';
const TRIM = '#555b60', PLATE = '#eee8d8';

function wheels(b: PartBuilder, zs: number[], r: number, halfTrack: number, w = 0.26) {
  for (const z of zs) for (const s of [-1, 1]) {
    b.cylinder(s * halfTrack, r, z, r, w, TYRE, 'x', 14);
    b.cylinder(s * (halfTrack + 0.02), r, z, r * 0.58, w, RIM, 'x', 10);
  }
}

export function buildVehicle(scene: Scene, kind: TrafficKind, body: string, name: string = kind): Mesh {
  const b = new PartBuilder(scene, name);
  switch (kind) {
    case 'sienna': {
      // Minivan: long roof, short sloped nose, near-vertical tailgate.
      b.prism([[-2.52, 0.34], [-2.58, 0.62], [-2.5, 1.62], [-2.22, 1.76], [0.5, 1.78], [1.42, 1.13], [2.3, 0.88], [2.55, 0.62], [2.5, 0.32]], 1.96, body);
      b.prism([[-2.54, 1.18], [-2.52, 1.6], [-2.2, 1.735], [0.53, 1.765], [1.47, 1.12], [1.3, 1.06], [-2.3, 1.06]], 1.99, GLASS);
      b.prism([[1.34, 1.13], [0.55, 1.69], [0.61, 1.72], [1.43, 1.18]], 1.5, GLASS);
      b.prism([[-2.48, 1.3], [-2.18, 1.67], [-1.94, 1.68], [-2.25, 1.3]], 1.45, GLASS);
      b.box(0, 1.42, -2.555, 1.5, 0.42, 0.04, GLASS); // rear screen
      b.box(0, 0.78, -2.57, 0.52, 0.16, 0.03, '#f1efe3'); // plate
      b.box(0, 1.72, -1.0, 1.7, 0.05, 3.0, DARK); // roof rails
      for (const z of [0.05, -1.2, -2.15]) b.box(0, 1.39, z, 2.0, 0.66, z < -2 ? 0.28 : 0.12, body);
      b.roundedBox(0, 0.42, 2.5, 1.98, 0.3, 0.2, DARK, 0.07); b.roundedBox(0, 0.42, -2.52, 1.98, 0.3, 0.2, DARK, 0.07); // bumpers
      b.box(0, 0.74, 2.53, 0.9, 0.16, 0.06, DARK); // grille
      for (const s of [-1, 1]) {
        b.box(s * 0.7, 0.86, 2.4, 0.46, 0.14, 0.2, LAMP);
        b.box(s * 0.83, 0.69, 2.49, 0.12, 0.12, 0.09, '#f5b744'); // indicators
        b.box(s * 0.8, 1.2, -2.56, 0.3, 0.5, 0.06, TAIL);
        b.box(s * 1.04, 1.12, 1.25, 0.08, 0.1, 0.2, body); // mirror
        for (const z of [0.93, -0.55, -1.72]) b.box(s * 0.99, 1.38, z, 0.035, 0.54, 0.045, TRIM); // window pillars
        b.box(s * 1.006, 0.76, -0.75, 0.025, 0.035, 0.85, TRIM); // sliding-door rail
      }
      b.box(0, 0.79, 2.56, 0.78, 0.12, 0.035, DARK); // lower grille
      b.box(0, 0.48, 2.57, 0.52, 0.13, 0.035, PLATE);
      b.box(0, 0.62, 0, 1.94, 0.12, 4.2, '#4f5459'); // side skirt shadow line
      wheels(b, [1.52, -1.5], 0.35, 0.86);
      break;
    }
    case 'minibus':
    case 'danfo':
    case 'hiace': {
      const danfo = kind === 'danfo', short = kind !== 'minibus';
      const H = short ? 1.95 : 2.28, L = short ? 2.45 : 2.7;
      b.prism([[-L, 0.34], [-L, H - 0.05], [-L + 0.15, H], [L - 0.8, H], [L - 0.62, H - 0.08], [L - 0.22, 1.22], [L, 0.95], [L + 0.02, 0.5], [L - 0.05, 0.32]], 1.9, body);
      b.prism([[-L - 0.02, 1.3], [-L - 0.02, H - 0.28], [L - 0.78, H - 0.28], [L - 0.6, H - 0.06], [L - 0.2, 1.24], [L - 0.24, 1.3]], 1.93, GLASS);
      b.prism([[L - 0.72, 1.2], [L - 1.03, H - 0.25], [L - 0.79, H - 0.17], [L - 0.52, 1.25]], 1.42, GLASS);
      for (const z of [L - 1.15, 0, -1.3]) b.box(0, (1.3 + H - 0.28) / 2, z, 1.94, H - 1.58, 0.1, body);
      for (const s of [-1, 1]) for (const z of [L - 1.45, 0.75, -0.7, -L + 0.2]) b.box(s * 0.96, 1.78, z, 0.045, H - 1.48, 0.055, danfo ? '#37332a' : TRIM);
      if (danfo) {
        b.box(0, 1.22, 0, 1.92, 0.12, 2 * L, '#111'); b.box(0, 0.8, 0, 1.92, 0.12, 2 * L, '#111');
        b.box(0, H + 0.06, -0.35, 1.55, 0.28, 0.72, '#f2b705'); // route board
      }
      else b.box(0, 1.18, 0, 1.92, 0.07, 2 * L - 0.1, '#1d5fa8'); // operator pinstripe
      b.roundedBox(0, 0.42, L, 1.9, 0.28, 0.14, DARK, 0.045); b.roundedBox(0, 0.42, -L, 1.9, 0.28, 0.14, DARK, 0.045);
      for (const s of [-1, 1]) {
        b.box(s * 0.72, 0.98, L - 0.02, 0.36, 0.16, 0.1, LAMP);
        b.box(s * 0.9, 0.74, L, 0.13, 0.12, 0.08, '#f5b744');
        b.box(s * 0.86, 1.1, -L - 0.03, 0.18, 0.5, 0.06, TAIL);
        b.box(s * 1.0, 1.55, L - 0.9, 0.08, 0.22, 0.14, DARK);
      }
      b.box(0, 0.74, L + 0.025, 0.7, 0.12, 0.06, DARK); // grille
      b.box(0, 0.47, L + 0.03, 0.5, 0.12, 0.035, PLATE);
      b.box(0, 0.95, -L - 0.035, 0.7, 0.12, 0.05, PLATE);
      wheels(b, [L - 0.9, -L + 0.95], 0.34, 0.84);
      break;
    }
    case 'sedan':
    case 'suv': {
      const suv = kind === 'suv';
      const L = suv ? 2.4 : 2.3, H = suv ? 1.78 : 1.45, sill = suv ? 0.5 : 0.36;
      b.prism([[-L, sill], [-L - 0.05, 0.85], [-L + 0.05, suv ? 1.2 : 1.0], [-L + (suv ? 0.2 : 0.75), H], [suv ? 0.9 : 0.55, H], [suv ? 1.35 : 1.25, suv ? 1.22 : 1.02], [L - 0.05, suv ? 1.05 : 0.86], [L + 0.02, 0.6], [L - 0.05, sill]], 1.8, body);
      b.prism(suv
        ? [[-L - 0.02, 1.2], [-L + 0.18, H - 0.04], [0.92, H - 0.04], [1.38, 1.2]]
        : [[-L + 0.08, 1.0], [-L + 0.78, H - 0.04], [0.57, H - 0.04], [1.28, 1.0]], 1.83, GLASS);
      b.roundedBox(0, (H + (suv ? 1.2 : 1.0)) / 2, suv ? -0.35 : -0.1, 1.85, H - (suv ? 1.22 : 1.02), 0.12, body, 0.05);
      for (const s of [-1, 1]) { b.box(s * 0.66, suv ? 0.95 : 0.78, L - 0.02, 0.4, 0.13, 0.1, LAMP); b.box(s * 0.7, suv ? 1.0 : 0.85, -L - 0.03, 0.34, 0.14, 0.06, TAIL); }
      b.box(0, sill + 0.08, L, 1.8, 0.2, 0.1, DARK); b.box(0, sill + 0.08, -L, 1.8, 0.2, 0.1, DARK);
      wheels(b, [L - 0.8, -L + 0.8], suv ? 0.38 : 0.32, 0.8);
      break;
    }
    case 'truck':
    case 'tanker': {
      // Cab-over prime mover + trailer (container or fuel tanker), the classic Lagos–Ibadan freight rig.
      b.roundedBox(0, 1.75, 4.75, 2.45, 2.3, 2.1, body, 0.2); // cab
      b.box(0, 2.2, 5.82, 2.2, 0.9, 0.05, GLASS);
      b.box(0, 0.75, 5.85, 2.4, 0.5, 0.1, DARK);
      for (const s of [-1, 1]) b.box(s * 0.9, 0.95, 5.84, 0.35, 0.18, 0.06, LAMP);
      b.box(0, 0.95, 0.2, 1.1, 0.35, 11.2, DARK); // chassis
      if (kind === 'truck') {
        b.roundedBox(0, 2.45, -1.2, 2.5, 2.6, 8.0, body === '#c9c9c9' ? '#a4552b' : '#2f5d8a', 0.09);
        b.box(0, 1.1, -1.2, 2.5, 0.1, 8.0, '#333');
        for (const s of [-1, 1]) for (const y of [1.35, 3.05, 3.48]) b.box(s * 1.26, y, -1.2, 0.035, 0.045, 7.7, '#87939b');
        b.box(0, 2.42, -5.24, 2.3, 2.1, 0.06, '#394853');
        b.box(0, 2.4, -5.29, 0.055, 2.0, 0.035, '#b2b8bc');
      } else {
        b.cylinder(0, 2.1, -1.2, 1.2, 7.6, '#d8dadc', 'z', 16);
        b.box(0, 3.3, -1.2, 0.6, 0.12, 5, '#9aa0a4');
        for (const s of [-1, 1]) b.box(s * 1.12, 2.05, -1.2, 0.025, 0.055, 6.9, '#aab0b4');
      }
      b.box(0, 1.85, 5.84, 1.25, 0.09, 0.08, TRIM); // cab visor
      b.box(0, 1.37, 5.87, 0.82, 0.36, 0.07, DARK); // grille
      for (const s of [-1, 1]) b.box(s * 0.55, 1.37, 5.92, 0.035, 0.3, 0.04, '#6c7478');
      b.box(0, 0.53, 5.86, 0.72, 0.12, 0.04, PLATE);
      for (const s of [-1, 1]) b.box(s * 1.0, 1.0, -5.22, 0.3, 0.2, 0.06, TAIL);
      wheels(b, [4.6, 1.5, -3.4, -4.6], 0.52, 1.0, 0.5);
      break;
    }
    case 'coach': {
      b.prism([[-6, 0.45], [-6, 3.35], [-5.8, 3.45], [5.7, 3.45], [6.0, 3.1], [6.05, 1.6], [6.0, 0.45]], 2.5, body);
      b.prism([[-6.02, 1.7], [-6.02, 3.05], [5.6, 3.05], [6.07, 2.9], [6.08, 1.3], [5.8, 1.7]], 2.53, GLASS);
      b.prism([[6.02, 1.55], [5.55, 3.32], [5.72, 3.35], [6.12, 2.9]], 2.0, GLASS);
      b.prism([[-5.95, 1.78], [-5.95, 3.12], [-5.65, 3.14], [-5.25, 1.78]], 2.0, GLASS);
      b.box(0, 1.35, 0, 2.54, 0.22, 11.6, '#1d5fa8');
      b.box(0, 0.7, 0, 2.52, 0.45, 11.4, '#dcdcdc');
      for (const s of [-1, 1]) {
        b.box(s * 0.9, 1.0, 6.03, 0.5, 0.18, 0.08, LAMP); b.box(s * 1.05, 1.3, -6.03, 0.24, 0.6, 0.06, TAIL);
        for (const z of [-4.7, -2.8, -0.9, 1.0, 2.9, 4.7]) b.box(s * 1.27, 2.35, z, 0.035, 1.28, 0.055, body);
        b.box(s * 1.285, 1.46, 0, 0.04, 0.075, 10.8, '#858b8e'); // luggage-bay seam
      }
      b.box(0, 1.25, 6.045, 0.85, 0.28, 0.065, DARK);
      b.box(0, 0.75, 6.06, 0.65, 0.12, 0.04, PLATE);
      wheels(b, [4.2, -3.2, -4.4], 0.52, 1.02, 0.4);
      break;
    }
  }
  return b.build();
}

export const TRAFFIC_COLORS: Record<Exclude<TrafficKind, 'sienna' | 'hiace'>, string[]> = {
  sedan: ['#c0c4c8', '#1b1d20', '#f0f0ee', '#8e1b1b', '#1f3f73', '#6b6f73', '#3a4a3a'],
  suv: ['#101214', '#e8e8e6', '#9aa0a5', '#4b3a2a'],
  minibus: ['#f2f2ee', '#e6e2d6', '#c9ccd0'],
  danfo: ['#f2b705'],
  truck: ['#c9c9c9', '#b8322a', '#e8e8e8'],
  tanker: ['#e0e0e0', '#b8322a'],
  coach: ['#f4f4f4', '#e9eef2'],
};

let sharedMat: StandardMaterial | null = null;
export function vehicleMaterial(scene: Scene) {
  if (sharedMat && sharedMat.getScene() === scene) return sharedMat;
  const m = new StandardMaterial('vehicleMat', scene);
  m.diffuseColor = Color3.White();
  m.specularColor = new Color3(0.45, 0.45, 0.45);
  m.specularPower = 48;
  m.backFaceCulling = false;
  return (sharedMat = m);
}
