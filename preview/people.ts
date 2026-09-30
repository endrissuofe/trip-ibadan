// Dev-only preview of the procedural people. Not part of the game build.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ArcRotateCamera } from '@babylonjs/core/Cameras/arcRotateCamera';
import { HemisphericLight } from '@babylonjs/core/Lights/hemisphericLight';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Color3, Color4 } from '@babylonjs/core/Maths/math.color';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { randomLook, buildStanding, buildSeated, Walker, ConductorFigure } from '../src/world/people';

const canvas = document.getElementById('c') as HTMLCanvasElement;
const engine = new Engine(canvas, true, { preserveDrawingBuffer: true });
const scene = new Scene(engine);
scene.clearColor = new Color4(0.62, 0.77, 0.88, 1);
const params = new URLSearchParams(location.search);
const mode = params.get('mode') ?? 'stand';
const cam = new ArcRotateCamera('c', Math.PI / 2 + 0.25, 1.35, mode === 'close' ? 3.2 : 9, new Vector3(0, mode === 'seat' ? 0.5 : 1.0, 0), scene);
const hemi = new HemisphericLight('h', new Vector3(0, 1, 0), scene); hemi.intensity = 0.75; hemi.groundColor = new Color3(0.35, 0.3, 0.25);
const sun = new DirectionalLight('s', new Vector3(-0.4, -1, 0.6), scene); sun.intensity = 0.9;
const g = MeshBuilder.CreateGround('g', { width: 40, height: 40 }, scene); const gm = new StandardMaterial('gm', scene); gm.diffuseColor = new Color3(0.45, 0.42, 0.36); g.material = gm;
let seed = Number(params.get('seed') ?? 3);
const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const n = mode === 'close' ? 3 : 9;
const walkers: Walker[] = [];
for (let i = 0; i < n; i++) {
  const look = randomLook(rnd);
  const x = (i - (n - 1) / 2) * (mode === 'close' ? 0.75 : 0.85);
  if (mode === 'seat') { const m = buildSeated(scene, look); m.position.set(x, 0.45, 0); }
  else if (mode === 'walk') { const w = new Walker(scene, look); w.root.position.set(x, 0, 0); walkers.push(w); }
  else if (mode === 'conductor') { const c = new ConductorFigure(scene, look); c.root.position.set(x, 0.45, 0); c.reach((i % 3) / 2); }
  else { const m = buildStanding(scene, look); m.position.set(x, 0, 0); }
}
for (const w of walkers) w.animate(0.35 + Math.random(), 1.2);
(window as unknown as { ready: boolean }).ready = false;
scene.executeWhenReady(() => { scene.render(); (window as unknown as { ready: boolean }).ready = true; });
engine.runRenderLoop(() => scene.render());
