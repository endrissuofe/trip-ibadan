// Real named places from OSM, placed where they really are, with a building that
// matches their category and a name board facing the expressway. Headline places get
// custom scenes (statue, cattle, Ferris wheel, gate).
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix, Quaternion, Vector3 } from '@babylonjs/core/Maths/math.vector';
import type { World } from './World';
import type { Poi } from '../map/Route';
import { PartBuilder } from './geo';
import { vehicleMaterial, buildVehicle } from './models';
import { signTexture } from './textures';
import { buildPerson, buildCow, SHIRTS } from './props';
import { CATEGORY_LABEL, HERO } from '../data/places';

const FUEL_COLORS: Record<string, string> = { Oando: '#d71920', Total: '#e2001a', Capital: '#1d4f91', Fatgbems: '#0a7a3d' };

function model(w: World, poi: Poi): { mesh: Mesh; radius: number; boardY: number } {
  const b = new PartBuilder(w.scene, 'poi');
  let radius = 10, boardY = 6;
  switch (poi.cat) {
    case 'church': {
      b.box(0, 4, 0, 12, 8, 22, '#f2ede1');
      b.prism([[-6.4, 8], [0, 12], [6.4, 8]], 23, '#7c3f28');
      b.box(0, 8, 12, 5, 16, 5, '#f2ede1');
      const spire = MeshBuilder.CreateCylinder('s', { diameterTop: 0, diameterBottom: 5, height: 6, tessellation: 4 }, w.scene);
      spire.bakeTransformIntoVertices(Matrix.Translation(0, 19, 12)); b.add(spire, '#7c3f28');
      b.box(0, 23.4, 12, 0.3, 2.2, 0.3, '#d4af37'); b.box(0, 23.8, 12, 1.4, 0.3, 0.3, '#d4af37');
      for (const z of [-6, 0, 6]) for (const x of [-6.05, 6.05]) b.box(x, 4.5, z, 0.1, 3, 1.6, '#3b5b7a');
      radius = 13; boardY = 5; break;
    }
    case 'mosque': {
      b.box(0, 4, 0, 16, 8, 16, '#f4f1e8');
      const dome = MeshBuilder.CreateSphere('d', { diameter: 10, segments: 10, slice: 0.5 }, w.scene);
      dome.bakeTransformIntoVertices(Matrix.Translation(0, 8, 0)); b.add(dome, '#1f8a4c');
      b.cylinder(9, 9, 6, 1.1, 18, '#f4f1e8', 'y', 10);
      radius = 12; break;
    }
    case 'market': {
      const roofs = ['#d63031', '#0984e3', '#fdcb6e', '#00b894', '#e17055', '#6c5ce7'];
      for (let i = 0; i < 14; i++) {
        const x = (i % 5) * 6 - 12, z = Math.floor(i / 5) * 7 - 7;
        b.box(x, 1, z, 4.2, 2, 3.2, '#a67c52');
        b.box(x, 2.45, z, 5, 0.12, 4.2, roofs[i % roofs.length]);
        for (const [px, pz] of [[-2.3, -1.9], [2.3, -1.9], [-2.3, 1.9], [2.3, 1.9]]) b.box(x + px, 1.2, z + pz, 0.1, 2.4, 0.1, '#6b5a45');
      }
      radius = 18; boardY = 5; break;
    }
    case 'fuel': {
      const c = FUEL_COLORS[poi.name] ?? '#c0392b';
      b.box(0, 5.2, 0, 16, 0.9, 10, '#f4f4f4'); b.box(0, 5.2, 5.02, 16, 0.5, 0.05, c); b.box(0, 5.2, -5.02, 16, 0.5, 0.05, c);
      for (const x of [-6, 6]) for (const z of [-3, 3]) b.box(x, 2.4, z, 0.4, 4.8, 0.4, '#dcdde1');
      for (const x of [-4, 0, 4]) { b.box(x, 0.2, 0, 1.4, 0.4, 3, '#b2bec3'); b.box(x, 1, 0, 0.8, 1.6, 0.6, c); }
      b.box(-2, 2, -12, 10, 4, 6, '#ecf0f1'); b.box(-2, 3.2, -8.97, 10, 0.8, 0.05, c);
      b.box(10, 4, 4, 0.5, 8, 0.5, '#636e72'); b.box(10, 8.2, 4, 2.4, 2.4, 0.4, c);
      radius = 12; boardY = 7; break;
    }
    case 'bank': case 'mall': case 'business': case 'government': case 'police': case 'place': {
      const tall = poi.cat === 'government' || poi.cat === 'mall' ? 3 : 2;
      const wall = poi.cat === 'police' ? '#2d3a5a' : poi.cat === 'government' ? '#e8e2d0' : '#dfe6e9';
      b.box(0, tall * 1.8, 0, 18, tall * 3.6, 12, wall);
      for (let f = 0; f < tall; f++) b.box(0, f * 3.6 + 2, 6.02, 16, 1.4, 0.05, '#2d4e63');
      b.box(0, tall * 3.6 + 0.3, 0, 18.6, 0.6, 12.6, '#b2bec3');
      if (poi.cat === 'government' || poi.cat === 'police') { b.box(-11, 5, 7, 0.15, 10, 0.15, '#ccc'); b.box(-10.2, 9.3, 7, 1.6, 0.9, 0.05, '#008751'); b.box(-10.2, 9.3, 7.02, 0.55, 0.9, 0.05, '#fff'); }
      radius = 12; boardY = tall * 3.6 + 1.6; break;
    }
    case 'school': {
      b.box(0, 3.6, 0, 30, 7.2, 9, '#f5e6c8');
      for (const y of [2, 5.6]) b.box(0, y, 4.52, 28, 1.3, 0.05, '#2d4e63');
      b.box(0, 7.5, 0, 31, 0.6, 10, '#7c3f28');
      b.box(-16, 5, 9, 0.15, 10, 0.15, '#ccc'); b.box(-15.2, 9.3, 9, 1.6, 0.9, 0.05, '#008751'); b.box(-15.2, 9.3, 9.02, 0.55, 0.9, 0.05, '#fff');
      radius = 17; boardY = 8.5; break;
    }
    case 'estate': case 'leisure': {
      for (const x of [-6, 6]) b.box(x, 3, 0, 1.4, 6, 1.4, '#e8e2d0');
      b.box(0, 6.4, 0, 14, 1.4, 1.4, '#e8e2d0');
      for (const x of [-18, 18]) b.box(x, 1.2, 0, 22, 2.4, 0.3, '#d9d4c8');
      radius = 7; boardY = 5.5; break;
    }
    default: {
      b.box(0, 3, 0, 12, 6, 10, '#dfe6e9'); radius = 9;
    }
  }
  const mesh = b.build(); mesh.material = vehicleMaterial(w.scene);
  return { mesh, radius, boardY };
}

function nameBoard(w: World, text: string, sub: string, x: number, gy: number, z: number, yaw: number, lift: number, width = 7, bg = '#0b3d6b') {
  const y = gy + lift;
  const mat = new StandardMaterial('board', w.scene);
  mat.diffuseTexture = signTexture(w.scene, [text.length > 26 ? text.slice(0, 25) + '…' : text, sub], { bg, w: 512, h: 160 });
  mat.emissiveColor = new Color3(0.35, 0.35, 0.35); mat.specularColor = Color3.Black();
  const p = MeshBuilder.CreatePlane('board', { width, height: width * 0.3125 }, w.scene);
  p.material = mat; p.position.set(x, y, z); p.rotation.y = yaw;
  const back = MeshBuilder.CreatePlane('boardBack', { width, height: width * 0.3125 }, w.scene);
  back.material = w.propMat; back.position.set(x, y, z); back.rotation.y = yaw + Math.PI;
  const posts = new PartBuilder(w.scene, 'posts');
  const postH = lift - width * 0.156;
  for (const o of [-width * 0.35, width * 0.35]) posts.box(x + Math.cos(yaw) * o, gy + postH / 2, z - Math.sin(yaw) * o, 0.18, postH, 0.18, '#6b6f73');
  posts.build().material = w.propMat;
}

export function buildLandmarks(w: World) {
  const nb = w.route.nb;
  for (const poi of w.route.file.pois) {
    if (poi.s < nb.s[0] + 30 || poi.s > nb.length - 30) continue;
    const i = w.idx(poi.s);
    const hw = nb.halfWidth(poi.s);
    let d = poi.d;
    const side = d >= 0 ? 1 : -1;
    // keep clear of both carriageways
    if (Math.abs(d) < hw + 20) d = side * (hw + 20);
    if (side < 0 && Math.abs(d - w.sbD[i]) < w.sbHW[i] + 18) d = w.sbD[i] - (w.sbHW[i] + 22);
    // headline landmarks set back past the map edge are pulled in so you can still see them
    if (Math.abs(d) > 300 && (poi.name in HERO)) d = side * 290;
    const far = Math.abs(d) > 300;
    const smp = nb.sample(poi.s);
    const yaw = smp.heading + (side > 0 ? -Math.PI / 2 : Math.PI / 2); // front faces the road
    if (!far) {
      const p = nb.toWorld(poi.s, d);
      const g = w.groundAt(poi.s, d);
      const hero = heroScene(w, poi, p.x, g, p.z, yaw);
      const { mesh, radius, boardY } = hero ?? model(w, poi);
      mesh.position.set(p.x, g - 0.1, p.z); mesh.rotation.y = yaw;
      w.colliders.add(p.x, p.z, radius);
      // name board between the building and the road
      const bd = d - side * (radius + 4);
      const bp = nb.toWorld(poi.s, bd);
      nameBoard(w, poi.name, CATEGORY_LABEL[poi.cat] ?? '', bp.x, w.groundAt(poi.s, bd), bp.z, smp.heading, Math.min(boardY, 6), 7.5, poi.cat === 'park' || poi.cat === 'themepark' || poi.cat === 'market' ? '#6b3e1f' : '#0b3d6b');
    }
    // roadside pointer for places set back from the road
    if (Math.abs(poi.d) > 140 && ['park', 'market', 'themepark', 'school', 'government', 'mall'].includes(poi.cat)) {
      w.sign(poi.s - 60, [poi.name.length > 20 ? poi.name.slice(0, 19) + '…' : poi.name, `${side > 0 ? '→' : '←'} ${Math.round(Math.abs(poi.d) / 10) * 10} m`], { bg: poi.cat === 'park' || poi.cat === 'themepark' || poi.cat === 'market' ? '#6b3e1f' : '#1f3f73', w: 4.4 });
    }
  }
}

/** Custom scenes for headline landmarks. Returns null to fall back to the category model. */
function heroScene(w: World, poi: Poi, x: number, y: number, z: number, yaw: number): { mesh: Mesh; radius: number; boardY: number } | null {
  const scene = w.scene;
  if (poi.name === 'Gani Fawehinmi Park') {
    const b = new PartBuilder(scene, 'ganiPark');
    b.box(0, 0.6, 0, 7, 1.2, 7, '#c8c2b4'); b.box(0, 2.2, 0, 3, 2, 3, '#b8b0a0');
    const statue = buildPerson(scene, '#8a6a3a', 0); statue.bakeTransformIntoVertices(Matrix.Scaling(2.4, 2.4, 2.4).multiply(Matrix.Translation(0, 3.2, 0)));
    b.add(statue, '#8c6b3f');
    for (let k = 0; k < 10; k++) { const a = (k / 10) * Math.PI * 2; b.box(Math.cos(a) * 14, 0.06, Math.sin(a) * 14, 5, 0.12, 5, '#9aa36b'); }
    const m = b.build(); m.material = vehicleMaterial(scene);
    return { mesh: m, radius: 6, boardY: 5 };
  }
  if (poi.name === 'Kara Market') {
    const coats = ['#f0ebe0', '#8b5a2b', '#d9cbb0', '#5a3a22', '#c9b28f'];
    const cows = coats.map((c) => { const m = buildCow(scene, c); m.isVisible = false; return m; });
    const lists: number[][] = cows.map(() => []);
    for (let k = 0; k < 42; k++) {
      const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 26;
      const cx = x + Math.cos(a) * r, cz = z + Math.sin(a) * r;
      Matrix.Compose(Vector3.One(), Quaternion.RotationYawPitchRoll(Math.random() * 6.28, 0, 0), new Vector3(cx, y, cz)).copyToArray(lists[k % 5] as unknown as Float32Array, lists[k % 5].length);
    }
    cows.forEach((c, i) => { const inst = c.clone('cattle')!; inst.makeGeometryUnique(); inst.isVisible = true; inst.thinInstanceSetBuffer('matrix', new Float32Array(lists[i]), 16); inst.thinInstanceRefreshBoundingInfo(false); });
    for (let k = 0; k < 6; k++) { const p = buildPerson(scene, SHIRTS[k], k); p.position.set(x + (Math.random() - 0.5) * 40, y, z + (Math.random() - 0.5) * 40); p.rotation.y = Math.random() * 6; }
    const b = new PartBuilder(scene, 'karaStalls');
    for (const [sx, sz] of [[-30, -18], [-24, -18], [-18, -18]]) { b.box(sx, 1.2, sz, 5, 2.4, 4, '#a67c52'); b.box(sx, 2.6, sz, 6, 0.15, 5, '#7f8c8d'); }
    const m = b.build(); m.material = vehicleMaterial(scene);
    return { mesh: m, radius: 4, boardY: 5 };
  }
  if (poi.name === 'Hi-Impact Planet') {
    const b = new PartBuilder(scene, 'hiImpact');
    for (const s of [-1, 1]) { const leg = MeshBuilder.CreateBox('l', { width: 0.8, height: 20, depth: 0.8 }, scene); leg.bakeTransformIntoVertices(Matrix.RotationZ(s * 0.22).multiply(Matrix.Translation(s * 2.2, 9.6, 1.6))); b.add(leg, '#dfe6e9'); const leg2 = leg.clone('l2'); leg2.bakeTransformIntoVertices(Matrix.Translation(0, 0, -3.2)); b.add(leg2, '#dfe6e9'); }
    b.box(-14, 2.5, 18, 10, 5, 6, '#e84393'); b.box(14, 2, 18, 8, 4, 8, '#00cec9');
    for (const s of [-1, 1]) b.box(s * 8, 4, 30, 1.2, 8, 1.2, '#6c5ce7');
    b.box(0, 8.4, 30, 17.2, 1.8, 1.2, '#6c5ce7');
    const m = b.build(); m.material = vehicleMaterial(scene);
    // the wheel itself turns
    const wb = new PartBuilder(scene, 'ferrisWheel');
    const ring = MeshBuilder.CreateTorus('r', { diameter: 28, thickness: 0.45, tessellation: 40 }, scene); ring.bakeTransformIntoVertices(Matrix.RotationZ(Math.PI / 2)); wb.add(ring, '#f5f6fa');
    const ring2 = MeshBuilder.CreateTorus('r', { diameter: 20, thickness: 0.3, tessellation: 32 }, scene); ring2.bakeTransformIntoVertices(Matrix.RotationZ(Math.PI / 2)); wb.add(ring2, '#f5f6fa');
    const cols = ['#e17055', '#fdcb6e', '#00b894', '#0984e3', '#e84393', '#6c5ce7'];
    for (let k = 0; k < 12; k++) {
      const a = (k / 12) * Math.PI * 2;
      const sp = MeshBuilder.CreateBox('sp', { width: 0.2, height: 28, depth: 0.2 }, scene); sp.bakeTransformIntoVertices(Matrix.RotationX(a)); wb.add(sp, '#dfe6e9');
      wb.box(0, Math.cos(a) * 14, Math.sin(a) * 14, 1.6, 1.6, 1.6, cols[k % cols.length]);
    }
    const wheel = wb.build(); wheel.material = vehicleMaterial(scene);
    wheel.parent = m; wheel.position.set(0, 20, 0); wheel.rotation.y = Math.PI / 2;
    wheel.metadata = { dynamic: true };
    w.updaters.push((dt) => { wheel.rotation.x += dt * 0.12; });
    void yaw;
    return { mesh: m, radius: 16, boardY: 7 };
  }
  if (poi.name === 'Mountain Top University') {
    const b = new PartBuilder(scene, 'mtu');
    for (const s of [-1, 1]) b.box(s * 9, 4.5, 0, 2.4, 9, 2.4, '#f1e9d8');
    b.box(0, 9.6, 0, 22, 2.4, 2.8, '#1f3f73');
    b.box(0, 5, -22, 40, 10, 12, '#f5e6c8'); b.box(0, 10.4, -22, 41, 0.8, 13, '#7c3f28');
    for (const y2 of [3, 7]) b.box(0, y2, -15.97, 38, 1.4, 0.05, '#2d4e63');
    const m = b.build(); m.material = vehicleMaterial(scene);
    return { mesh: m, radius: 5, boardY: 12.5 };
  }
  if (poi.name === 'BRT Depot') {
    const b = new PartBuilder(scene, 'brtDepot');
    b.box(0, 4, -8, 34, 8, 16, '#dfe6e9'); b.box(0, 8.2, -8, 35, 0.5, 17, '#1d5fa8');
    const m = b.build(); m.material = vehicleMaterial(scene);
    for (let k = 0; k < 4; k++) {
      const bus = buildVehicle(scene, 'coach', '#1d5fa8', 'brtBus'); bus.material = vehicleMaterial(scene);
      bus.position.set(x + Math.cos(yaw) * (k * 4 - 6), y, z - Math.sin(yaw) * (k * 4 - 6)); bus.rotation.y = yaw + Math.PI / 2;
    }
    return { mesh: m, radius: 14, boardY: 9.5 };
  }
  return null;
}
