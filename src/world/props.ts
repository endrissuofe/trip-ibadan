// People, delivery riders and animals (procedural, vertex-coloured, one draw call each).
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Matrix } from '@babylonjs/core/Maths/math.vector';
import { PartBuilder } from './geo';
import { vehicleMaterial } from './models';
import { signTexture } from './textures';
import { DeliveryBrand } from '../data/brands';

const SKIN = ['#5a3a28', '#6b4630', '#4a2f22', '#7a5238'];
export const SHIRTS = ['#c0392b', '#2e86c1', '#f1c40f', '#27ae60', '#8e44ad', '#e67e22', '#ecf0f1', '#16a085', '#d35400', '#34495e'];

/** Standing person, origin at the feet, facing +z. */
export function buildPerson(scene: Scene, shirt: string, variant = 0): Mesh {
  const b = new PartBuilder(scene, 'person');
  const skin = SKIN[variant % SKIN.length];
  const wrapper = variant % 3 === 1; // long wrapper/dress
  if (wrapper) b.box(0, 0.45, 0, 0.42, 0.9, 0.3, SHIRTS[(variant * 3 + 2) % SHIRTS.length]);
  else for (const x of [-0.1, 0.1]) b.box(x, 0.42, 0, 0.14, 0.84, 0.16, '#2c2f33');
  b.box(0, 1.17, 0, 0.44, 0.62, 0.26, shirt);
  b.box(0, 1.58, 0, 0.2, 0.24, 0.2, skin);
  if (variant % 4 === 2) b.box(0, 1.76, 0, 0.3, 0.14, 0.28, SHIRTS[(variant + 5) % SHIRTS.length]); // gele / cap
  for (const x of [-0.29, 0.29]) b.box(x, 1.1, 0, 0.1, 0.56, 0.12, skin);
  if (variant % 5 === 3) b.box(0.32, 0.72, 0.05, 0.28, 0.3, 0.16, '#6b4e2e'); // bag
  const m = b.build(); m.material = vehicleMaterial(scene);
  return m;
}

/** Delivery motorbike + rider with branded food box. Origin on the ground, facing +z. */
export function buildRider(scene: Scene, brand: DeliveryBrand): Mesh {
  const b = new PartBuilder(scene, 'rider-' + brand.name);
  for (const z of [0.68, -0.68]) {
    b.cylinder(0, 0.31, z, 0.31, 0.13, '#111315', 'x', 16); // tyre
    b.cylinder(0, 0.31, z + (z > 0 ? 0.005 : -0.005), 0.2, 0.145, '#92999b', 'x', 12); // alloy rim
    b.cylinder(0, 0.31, z + (z > 0 ? 0.01 : -0.01), 0.065, 0.15, '#474e52', 'x', 10);
  }
  b.roundedBox(0, 0.55, 0, 0.24, 0.25, 1.18, '#34393c', 0.08); // frame
  b.roundedBox(0, 0.61, -0.08, 0.34, 0.34, 0.52, '#24282b', 0.11); // engine
  b.roundedBox(0, 0.79, -0.13, 0.31, 0.13, 0.65, '#111315', 0.06); // saddle
  b.roundedBox(0, 0.82, 0.43, 0.38, 0.34, 0.37, '#c62828', 0.12); // fuel tank
  b.roundedBox(0, 0.73, 0.78, 0.37, 0.42, 0.18, '#2d3336', 0.1); // front fairing
  b.ellipsoid(0, 0.98, 0.89, 0.14, 0.12, 0.045, '#f3e4ad', 8); // headlamp
  b.box(0, 1.07, 0.68, 0.68, 0.045, 0.07, '#50575a'); // handlebar
  for (const x of [-0.2, 0.2]) b.cylinder(x, 0.56, 0.67, 0.045, 0.52, '#aeb4b5', 'y', 8); // fork
  b.roundedBox(0, 0.48, 0.72, 0.48, 0.11, 0.36, '#252a2d', 0.05); // front mudguard
  b.roundedBox(0, 0.49, -0.7, 0.43, 0.09, 0.38, '#24292c', 0.04); // rear mudguard
  b.box(0, 0.67, -0.88, 0.19, 0.12, 0.045, '#bd2930'); // rear lamp
  // Seated delivery rider, with bent legs and arms reaching the bars.
  b.ellipsoid(0, 1.17, 0.01, 0.25, 0.32, 0.21, brand.jacket, 10);
  for (const x of [-0.12, 0.12]) {
    b.roundedBox(x, 0.78, 0.03, 0.13, 0.16, 0.47, '#25292c', 0.055); // thighs
    b.roundedBox(x, 0.65, 0.37, 0.11, 0.12, 0.3, '#25292c', 0.045); // lower legs
  }
  for (const s of [-1, 1]) {
    b.roundedBox(s * 0.18, 1.22, 0.28, 0.11, 0.11, 0.43, brand.jacket, 0.05, s * -0.24); // arms
    b.ellipsoid(s * 0.22, 1.09, 0.57, 0.07, 0.06, 0.07, '#5c4030', 7); // hands
  }
  b.ellipsoid(0, 1.56, 0.06, 0.2, 0.23, 0.2, '#111315', 10); // rounded helmet
  b.roundedBox(0, 1.55, 0.22, 0.25, 0.1, 0.08, '#46545c', 0.035); // visor
  b.box(0, 1.77, 0.05, 0.24, 0.035, 0.12, '#252a2d'); // helmet ridge
  // Branded insulated delivery box with visible lid and corner piping.
  b.roundedBox(0, 1.23, -0.56, 0.54, 0.48, 0.52, brand.box, 0.07);
  b.box(0, 1.48, -0.56, 0.48, 0.035, 0.45, '#33393d');
  for (const x of [-0.25, 0.25]) b.box(x, 1.23, -0.56, 0.025, 0.43, 0.48, '#252a2e');
  const m = b.build(); m.material = vehicleMaterial(scene);
  const mat = new StandardMaterial('brand-' + brand.name, scene);
  mat.diffuseTexture = signTexture(scene, [brand.name], { bg: brand.box, fg: brand.text, w: 256, h: 128 });
  mat.emissiveColor = new Color3(0.3, 0.3, 0.3); mat.specularColor = Color3.Black();
  for (const [side, rot] of [[-1, Math.PI / 2], [1, -Math.PI / 2]] as const) {
    const lab = MeshBuilder.CreatePlane('brandLabel', { width: 0.44, height: 0.22 }, scene);
    lab.material = mat; lab.parent = m;
    lab.position.set(side * 0.256, 1.22, -0.5); lab.rotation.y = rot;
  }
  const back = MeshBuilder.CreatePlane('brandLabel', { width: 0.44, height: 0.22 }, scene);
  back.material = mat; back.parent = m; back.position.set(0, 1.22, -0.735); back.rotation.y = 0;
  return m;
}

export function buildCow(scene: Scene, coat: string): Mesh {
  const b = new PartBuilder(scene, 'cow');
  b.box(0, 1.05, 0, 0.62, 0.62, 1.5, coat);
  b.box(0, 1.25, 0.95, 0.34, 0.36, 0.45, coat);
  for (const x of [-0.2, 0.2]) { b.box(x * 1.4, 1.5, 1.05, 0.28, 0.05, 0.05, '#e8e2d2'); }
  b.box(0, 1.35, -0.1, 0.4, 0.25, 0.4, '#c9c1b0'); // zebu hump
  for (const [x, z] of [[-0.2, 0.55], [0.2, 0.55], [-0.2, -0.55], [0.2, -0.55]]) b.box(x, 0.38, z, 0.13, 0.76, 0.13, coat);
  const m = b.build(); m.material = vehicleMaterial(scene);
  m.bakeTransformIntoVertices(Matrix.Identity());
  return m;
}
