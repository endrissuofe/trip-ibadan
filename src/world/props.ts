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
  for (const z of [0.62, -0.62]) b.cylinder(0, 0.3, z, 0.3, 0.12, '#141414', 'x', 12);
  b.box(0, 0.55, 0, 0.22, 0.26, 1.1, '#2b2b2b'); // frame/engine
  b.box(0, 0.8, -0.12, 0.28, 0.1, 0.62, '#111'); // seat
  b.box(0, 0.78, 0.5, 0.26, 0.34, 0.2, '#c62828'); // tank/fairing
  b.box(0, 1.05, 0.62, 0.62, 0.05, 0.05, '#555'); // handlebar
  b.box(0, 0.95, 0.72, 0.16, 0.14, 0.06, '#e8ecef'); // headlamp
  // rider
  for (const x of [-0.14, 0.14]) b.box(x, 0.72, 0.12, 0.13, 0.13, 0.5, '#23262a');
  b.box(0, 1.2, -0.05, 0.42, 0.56, 0.26, brand.jacket);
  for (const x of [-0.24, 0.24]) b.box(x, 1.18, 0.28, 0.09, 0.09, 0.48, brand.jacket);
  b.box(0, 1.62, -0.02, 0.28, 0.3, 0.3, '#111'); // helmet
  b.box(0, 1.62, 0.12, 0.22, 0.12, 0.04, '#44525c'); // visor
  // food box on the rack
  b.box(0, 1.2, -0.5, 0.5, 0.48, 0.46, brand.box);
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
