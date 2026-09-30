// People (change spec §6): passengers, conductor and bystanders.
//
// INTERIM procedural humans: proper proportions, rounded body parts, faces, hair and headwear,
// Nigerian everyday clothing (ankara wrapper and blouse, gowns, kaftans, agbada, shirts), skin-tone,
// age, build and gender-presentation variety, and articulated limbs for walking, sitting and
// hand-overs. They are built from a `Look` so each passenger in a group is different.
//
// This is the placeholder the spec's photoreal rigged characters will replace. The swap point is
// `HumanFactory` at the bottom: a GLB-based factory can implement the same three calls.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { PartBuilder } from './geo';
import { vehicleMaterial } from './models';

export type Sex = 'm' | 'f';
export type Age = 'young' | 'adult' | 'elder';
export type Outfit = 'shirt' | 'kaftan' | 'agbada' | 'polo' | 'wrapper' | 'gown' | 'skirt' | 'trousers';
export type Hair = 'low' | 'afro' | 'braids' | 'bun' | 'bald';
export type Headwear = 'none' | 'gele' | 'fila' | 'scarf' | 'cap';

export interface Look {
  sex: Sex; age: Age;
  height: number;   // metres
  build: number;    // width factor ~0.9–1.18
  skin: string;
  outfit: Outfit;
  top: string; bottom: string; accent: string;
  hair: Hair; hairColor: string;
  headwear: Headwear; headColor: string;
  shoes: string;
  bag: 'none' | 'handbag' | 'backpack' | 'briefcase';
  cane: boolean;
}

const SKINS = ['#3a2119', '#472a1f', '#553224', '#62392a', '#704331', '#7f4e38', '#8c5a41'];
const BRIGHT = ['#d4561c', '#1f6fb2', '#e0b420', '#2e8b57', '#8e2c6f', '#c0392b', '#10706a', '#f28c28', '#5b3a8c', '#b5174f', '#0f5e9c', '#6a8f1f'];
const PLAIN = ['#f3f1ea', '#2c3e50', '#6d4c41', '#9bb7d4', '#e8e2d0', '#3c4a3e', '#7a1f2b', '#d9d2c3', '#40505e'];
const TROUSERS = ['#2b2e33', '#3f454c', '#6b5a45', '#2f4a6d', '#1f2a36', '#8a7e6a'];
const SHOES = ['#1a1412', '#3b2a1e', '#5b4636', '#101010', '#7a6a58'];

const pick = <T,>(r: () => number, a: readonly T[]) => a[Math.floor(r() * a.length)];

/** A random everyday Lagos–Ibadan traveller. */
export function randomLook(r: () => number = Math.random): Look {
  const sex: Sex = r() < 0.5 ? 'm' : 'f';
  const ar = r();
  const age: Age = ar < 0.3 ? 'young' : ar < 0.82 ? 'adult' : 'elder';
  const outfit: Outfit = sex === 'm'
    ? pick(r, age === 'elder' ? ['agbada', 'kaftan', 'shirt'] as const : ['shirt', 'shirt', 'kaftan', 'polo', 'trousers'] as const)
    : pick(r, age === 'young' ? ['skirt', 'trousers', 'gown', 'wrapper'] as const : ['wrapper', 'wrapper', 'gown', 'skirt'] as const);
  const patterned = outfit === 'wrapper' || outfit === 'gown' || outfit === 'agbada' || outfit === 'kaftan';
  const top = patterned ? pick(r, BRIGHT) : r() < 0.55 ? pick(r, PLAIN) : pick(r, BRIGHT);
  const bottom = outfit === 'wrapper' || outfit === 'gown' || outfit === 'kaftan' || outfit === 'agbada' ? top : pick(r, TROUSERS);
  const hair: Hair = sex === 'm'
    ? (age === 'elder' ? (r() < 0.5 ? 'bald' : 'low') : r() < 0.85 ? 'low' : 'afro')
    : pick(r, ['braids', 'braids', 'bun', 'afro', 'low'] as const);
  const headwear: Headwear = sex === 'f'
    ? (outfit === 'wrapper' || age === 'elder' ? (r() < 0.55 ? 'gele' : r() < 0.4 ? 'scarf' : 'none') : r() < 0.15 ? 'scarf' : 'none')
    : (outfit === 'agbada' || outfit === 'kaftan' ? (r() < 0.7 ? 'fila' : 'none') : r() < 0.12 ? 'cap' : 'none');
  return {
    sex, age,
    height: (sex === 'm' ? 1.72 : 1.63) + (r() - 0.5) * 0.14 - (age === 'elder' ? 0.03 : 0),
    build: 0.9 + r() * 0.28,
    skin: pick(r, SKINS),
    outfit, top, bottom, accent: pick(r, BRIGHT),
    hair, hairColor: age === 'elder' ? pick(r, ['#8e8a86', '#b4b0aa', '#5e5a56']) : r() < 0.1 && sex === 'f' ? '#5a2a1a' : '#141110',
    headwear, headColor: pick(r, BRIGHT),
    shoes: pick(r, SHOES),
    bag: sex === 'f' ? (r() < 0.45 ? 'handbag' : 'none') : r() < 0.18 ? 'backpack' : r() < 0.1 ? 'briefcase' : 'none',
    cane: age === 'elder' && r() < 0.35,
  };
}

// Reference body (1.72 m); everything is scaled by look.height / 1.72.
const HIP = 0.9, SHOULDER = 1.43, HEAD = 1.62;

/** Torso, head, face, hair, headwear and the garment's upper/skirt part. No arms or legs. */
function addBody(b: PartBuilder, L: Look, seated: boolean) {
  const w = L.build, f = L.sex === 'f';
  const sh = (f ? 0.19 : 0.215) * w, hipR = (f ? 0.18 : 0.16) * w;
  const hipY = seated ? 0 : HIP;
  const up = hipY - HIP; // offset applied to upper body when seated
  const topCol = L.top;
  // pelvis
  b.taper(0, hipY + 0.04, 0, hipR, hipR * 0.95, 0.16, L.outfit === 'wrapper' || L.outfit === 'gown' || L.outfit === 'skirt' ? L.bottom : L.bottom, 0.72);
  // torso: waist → chest → shoulders
  b.taper(0, 1.08 + up, 0, sh * 0.82, hipR * 0.92, 0.28, topCol, 0.62);
  b.taper(0, 1.32 + up, 0, sh, sh * 0.84, 0.22, topCol, 0.62);
  if (f) b.ellipsoid(0, 1.29 + up, 0.045 * w, 0.13 * w, 0.06, 0.055, topCol, 8);
  if (L.sex === 'm' && w > 1.12 && L.outfit !== 'agbada') b.ellipsoid(0, 1.1 + up, 0.035, 0.15 * w, 0.11, 0.09 * w, topCol, 8); // belly
  b.ellipsoid(0, SHOULDER + up, 0, sh * 1.02, 0.07, 0.12, topCol, 8); // shoulder cap
  // neck + head
  b.taper(0, 1.49 + up, 0.005, 0.048, 0.055, 0.1, L.skin, 1, 10);
  const hy = HEAD + up;
  b.ellipsoid(0, hy, 0.005, 0.092, 0.118, 0.105, L.skin, 14);
  b.ellipsoid(0, hy - 0.075, 0.04, 0.062, 0.042, 0.06, L.skin, 8); // jaw/chin
  // face
  b.ellipsoid(0, hy - 0.012, 0.102, 0.016, 0.022, 0.018, L.skin, 6); // nose
  for (const s of [-1, 1]) {
    b.ellipsoid(s * 0.036, hy + 0.022, 0.088, 0.016, 0.009, 0.008, '#f2eee6', 6); // eye white
    b.ellipsoid(s * 0.036, hy + 0.022, 0.095, 0.008, 0.008, 0.004, '#1a1210', 6); // iris
    b.ellipsoid(s * 0.036, hy + 0.045, 0.088, 0.02, 0.005, 0.006, L.hairColor === '#8e8a86' ? '#5a5652' : '#1a1210', 4); // brow
    b.ellipsoid(s * 0.094, hy + 0.0, 0.0, 0.014, 0.026, 0.018, L.skin, 6); // ear
  }
  b.box(0, hy - 0.052, 0.094, 0.04, 0.008, 0.01, '#3d1f1a'); // mouth
  // hair
  const hc = L.hairColor;
  if (L.hair === 'low') b.ellipsoid(0, hy + 0.03, -0.005, 0.096, 0.1, 0.108, hc, 12);
  if (L.hair === 'afro') b.ellipsoid(0, hy + 0.06, -0.015, 0.13, 0.12, 0.13, hc, 12);
  if (L.hair === 'bun') { b.ellipsoid(0, hy + 0.03, -0.005, 0.097, 0.1, 0.109, hc, 12); b.ellipsoid(0, hy + 0.08, -0.09, 0.05, 0.05, 0.05, hc, 8); }
  if (L.hair === 'braids') {
    b.ellipsoid(0, hy + 0.03, -0.005, 0.098, 0.1, 0.11, hc, 12);
    b.taper(0, hy - 0.16, -0.075, 0.075, 0.06, 0.3, hc, 0.6, 10);
  }
  if (L.hair === 'bald') for (const s of [-1, 1]) b.ellipsoid(s * 0.08, hy - 0.005, -0.03, 0.025, 0.04, 0.06, hc, 6);
  // headwear
  if (L.headwear === 'gele') {
    b.taper(0, hy + 0.1, -0.01, 0.17, 0.1, 0.12, L.headColor, 0.8, 14);
    b.ellipsoid(0.04, hy + 0.17, -0.02, 0.15, 0.06, 0.12, L.headColor, 10);
  } else if (L.headwear === 'fila') {
    b.taper(0, hy + 0.1, -0.01, 0.085, 0.1, 0.1, L.headColor, 0.95, 12);
  } else if (L.headwear === 'scarf') {
    b.ellipsoid(0, hy + 0.035, -0.02, 0.105, 0.115, 0.12, L.headColor, 12);
    b.taper(0, hy - 0.08, -0.06, 0.09, 0.12, 0.14, L.headColor, 0.7, 10);
  } else if (L.headwear === 'cap') {
    b.ellipsoid(0, hy + 0.05, -0.005, 0.1, 0.075, 0.11, L.headColor, 10);
    b.box(0, hy + 0.035, 0.12, 0.15, 0.012, 0.09, L.headColor);
  }
  // garment skirts
  if (!seated) {
    if (L.outfit === 'wrapper' || L.outfit === 'gown') {
      b.taper(0, 0.5, 0, hipR * 1.02, hipR * 1.18, 0.82, L.bottom, 0.78);
      for (const y of [0.22, 0.5, 0.78]) b.taper(0, y, 0, hipR * (1.19 - y * 0.2) + 0.004, hipR * (1.2 - y * 0.2) + 0.004, 0.035, L.accent, 0.78); // ankara bands
    } else if (L.outfit === 'skirt') {
      b.taper(0, 0.72, 0, hipR * 1.02, hipR * 1.2, 0.36, L.bottom, 0.78);
    } else if (L.outfit === 'kaftan' || L.outfit === 'agbada') {
      const wide = L.outfit === 'agbada' ? 1.45 : 1.05;
      b.taper(0, 0.75, 0, hipR * 1.05 * wide, hipR * 1.2 * wide, 0.42, L.top, 0.75);
      b.taper(0, 1.2, 0.121 * 0.62, 0.02, 0.02, 0.3, L.accent, 1, 6); // embroidered placket
    }
  } else {
    // seated: garment drapes over the lap
    if (L.outfit === 'wrapper' || L.outfit === 'gown' || L.outfit === 'skirt' || L.outfit === 'kaftan' || L.outfit === 'agbada') {
      b.box(0, 0.04, 0.2, hipR * 2.1 * (L.outfit === 'agbada' ? 1.3 : 1), 0.1, 0.44, L.bottom);
      if (L.outfit === 'wrapper' || L.outfit === 'gown') b.box(0, -0.16, 0.44, hipR * 2.1, 0.36, 0.08, L.bottom);
    }
  }
  if (L.bag === 'backpack' && !seated) b.box(0, 1.22, -0.16 * w, 0.3 * w, 0.4, 0.14, '#2d3a44');
}

/** One arm, pivot at the shoulder (0,0,0), hanging down. */
function addArm(b: PartBuilder, L: Look, side: -1 | 1, ox = 0, oy = 0, oz = 0) {
  const sleeveLong = L.outfit === 'kaftan' || L.outfit === 'agbada' || L.outfit === 'gown';
  const sleeve = L.outfit === 'agbada' ? 0.078 : 0.052;
  b.capsule([ox, oy, oz], [ox + side * 0.02, oy - 0.29, oz], sleeve, L.top, 8);
  b.capsule([ox + side * 0.02, oy - 0.29, oz], [ox + side * 0.02, oy - 0.53, oz + 0.03], 0.04, sleeveLong ? L.top : L.skin, 8);
  if (!sleeveLong) b.capsule([ox + side * 0.01, oy - 0.02, oz], [ox + side * 0.02, oy - 0.15, oz], 0.056, L.top, 8);
  b.ellipsoid(ox + side * 0.02, oy - 0.6, oz + 0.035, 0.035, 0.055, 0.022, L.skin, 8); // hand
  if (side === 1 && L.bag === 'handbag') b.box(ox + 0.04, oy - 0.62, oz + 0.02, 0.1, 0.2, 0.26, '#6b3f2a');
  if (side === 1 && L.bag === 'briefcase') b.box(ox + 0.04, oy - 0.72, oz + 0.03, 0.08, 0.28, 0.4, '#2a1d15');
  if (side === 1 && L.cane) b.capsule([ox + 0.03, oy - 0.6, oz + 0.12], [ox + 0.03, oy - 1.43, oz + 0.2], 0.012, '#4a3322', 6);
}

/** One leg, pivot at the hip joint (0,0,0), straight down (standing). */
function addLeg(b: PartBuilder, L: Look, ox = 0, oy = 0, oz = 0) {
  const skirtLong = L.outfit === 'wrapper' || L.outfit === 'gown';
  const trouser = skirtLong || L.outfit === 'skirt' ? L.skin : L.bottom;
  b.capsule([ox, oy, oz], [ox, oy - 0.42, oz + 0.01], 0.07 * L.build, L.outfit === 'skirt' ? L.skin : trouser, 8);
  b.capsule([ox, oy - 0.42, oz + 0.01], [ox, oy - 0.82, oz - 0.01], 0.052, trouser, 8);
  b.box(ox, oy - 0.865, oz + 0.05, 0.1, 0.07, 0.25, L.shoes);
}

/** Seated legs (thighs forward, shins down) and resting arms, baked into the body. */
function addSeatedLimbs(b: PartBuilder, L: Look, armsOnLap = true) {
  const hx = L.sex === 'f' ? 0.085 : 0.095;
  const tr = L.outfit === 'wrapper' || L.outfit === 'gown' || L.outfit === 'skirt' ? L.skin : L.bottom;
  for (const s of [-1, 1] as const) {
    b.capsule([s * hx, 0.06, 0.02], [s * hx, 0.07, 0.42], 0.075 * L.build, L.outfit === 'kaftan' || L.outfit === 'agbada' ? L.top : L.bottom, 8);
    b.capsule([s * hx, 0.07, 0.42], [s * hx, -0.3, 0.48], 0.052, tr, 8);
    b.box(s * hx, -0.33, 0.55, 0.1, 0.07, 0.24, L.shoes);
    if (armsOnLap) {
      const sy = SHOULDER - HIP, sx = s * (L.sex === 'f' ? 0.2 : 0.225) * L.build;
      b.capsule([sx, sy, 0], [sx + s * 0.02, sy - 0.27, 0.06], 0.05, L.top, 8);
      b.capsule([sx + s * 0.02, sy - 0.27, 0.06], [s * 0.1, 0.16, 0.3], 0.04, L.outfit === 'kaftan' || L.outfit === 'agbada' || L.outfit === 'gown' ? L.top : L.skin, 8);
      b.ellipsoid(s * 0.09, 0.15, 0.36, 0.035, 0.022, 0.055, L.skin, 8);
    }
  }
}

const scaleOf = (L: Look) => L.height / 1.72;

function finish(b: PartBuilder, scene: Scene, s: number): Mesh {
  const m = b.build();
  m.bakeTransformIntoVertices(Matrix.Scaling(s, s, s));
  m.material = vehicleMaterial(scene);
  return m;
}

/** Static standing person, one mesh (for crowds waiting at stops). Origin at the feet, facing +z. */
export function buildStanding(scene: Scene, L: Look): Mesh {
  const b = new PartBuilder(scene, 'person');
  addBody(b, L, false);
  const sx = (L.sex === 'f' ? 0.2 : 0.225) * L.build;
  addArm(b, L, -1, -sx, SHOULDER - 0.02, 0);
  addArm(b, L, 1, sx, SHOULDER - 0.02, 0);
  const hx = L.sex === 'f' ? 0.085 : 0.095;
  addLeg(b, L, -hx, HIP - 0.03, 0); addLeg(b, L, hx, HIP - 0.03, 0);
  return finish(b, scene, scaleOf(L));
}

/** Static seated passenger, one mesh. Origin on the seat surface under the hips, facing +z. */
export function buildSeated(scene: Scene, L: Look): Mesh {
  const b = new PartBuilder(scene, 'seated');
  addBody(b, L, true);
  addSeatedLimbs(b, L);
  return finish(b, scene, scaleOf(L) * 0.97);
}

/** Articulated person for walking (boarding, alighting). */
export class Walker {
  readonly root: Mesh;
  private limbs: { m: Mesh; phase: number; amp: number }[] = [];
  private t = Math.random() * 6;

  constructor(scene: Scene, readonly look: Look) {
    const s = scaleOf(look);
    const body = new PartBuilder(scene, 'walker');
    addBody(body, look, false);
    this.root = finish(body, scene, s);
    const sx = (look.sex === 'f' ? 0.2 : 0.225) * look.build, hx = look.sex === 'f' ? 0.085 : 0.095;
    for (const side of [-1, 1] as const) {
      const a = new PartBuilder(scene, 'arm'); addArm(a, look, side);
      const am = finish(a, scene, s); am.parent = this.root; am.position.set(side * sx * s, (SHOULDER - 0.02) * s, 0);
      this.limbs.push({ m: am, phase: side === 1 ? 0 : Math.PI, amp: 0.38 });
      const l = new PartBuilder(scene, 'leg'); addLeg(l, look);
      const lm = finish(l, scene, s); lm.parent = this.root; lm.position.set(side * hx * s, (HIP - 0.03) * s, 0);
      this.limbs.push({ m: lm, phase: side === 1 ? Math.PI : 0, amp: 0.46 });
    }
    for (const m of [this.root, ...this.limbs.map((l) => l.m)]) m.metadata = { dynamic: true };
  }

  /** Swing limbs; `speed` in m/s (0 = standing still). */
  animate(dt: number, speed: number) {
    const k = Math.min(1, speed / 1.3);
    this.t += dt * (3.2 + speed * 3.4) * (this.look.age === 'elder' ? 0.8 : 1);
    for (const l of this.limbs) l.m.rotation.x = Math.sin(this.t + l.phase) * l.amp * k;
  }

  dispose() { this.root.dispose(); }
}

/**
 * The conductor: seated, with a right arm that reaches across to take money and hand back change.
 * Origin on the seat surface, facing +z. Call `reach(0..1)` to animate the hand-over.
 */
export class ConductorFigure {
  readonly root: Mesh;
  private arm: Mesh;
  constructor(scene: Scene, readonly look: Look) {
    const s = scaleOf(look) * 0.97;
    const b = new PartBuilder(scene, 'conductor');
    addBody(b, look, true);
    addSeatedLimbs(b, look, false);
    // left arm resting
    const sx = 0.225 * look.build;
    b.capsule([-sx, SHOULDER - HIP, 0], [-sx - 0.02, SHOULDER - HIP - 0.27, 0.06], 0.05, look.top, 8);
    b.capsule([-sx - 0.02, SHOULDER - HIP - 0.27, 0.06], [-0.1, 0.16, 0.3], 0.04, look.skin, 8);
    // a small wad of notes in the left hand
    b.box(-0.09, 0.19, 0.34, 0.07, 0.03, 0.12, '#7aa36a');
    this.root = finish(b, scene, s);
    const a = new PartBuilder(scene, 'conductorArm'); addArm(a, look, 1);
    this.arm = finish(a, scene, s); this.arm.parent = this.root; this.arm.position.set(sx * s, (SHOULDER - HIP - 0.02) * s, 0);
    this.arm.metadata = { dynamic: true }; this.root.metadata = { dynamic: true };
  }
  /** 0 = arm resting, 1 = reaching back towards the passenger. `turn` swings the arm sideways. */
  reach(k: number, turn = 0.6) {
    this.arm.rotation.x = -1.35 * k;       // raise forward/up…
    this.arm.rotation.z = turn * k;        // …and across
    this.root.rotation.y = Math.PI * 0.42 * k; // twist round to face the cabin
  }
  dispose() { this.root.dispose(); }
}

/**
 * Swap point for real character models. A GLB-backed factory (rigged, skinned humans with
 * walk/sit/hand-over animations) can implement the same interface without touching gameplay code.
 */
export interface HumanFactory {
  standing(scene: Scene, look: Look): Mesh;
  seated(scene: Scene, look: Look): Mesh;
  walker(scene: Scene, look: Look): Walker;
}
export const proceduralHumans: HumanFactory = {
  standing: buildStanding,
  seated: buildSeated,
  walker: (scene, look) => new Walker(scene, look),
};
