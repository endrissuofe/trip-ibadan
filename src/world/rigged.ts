// Rigged, animated people (CC0 Quaternius bodies and animations, dressed by
// tools/blender/build_passenger.py). Two files (man, woman) hold a body, several garments,
// hair and headwear; each person switches garments on and gets their own colours from a `Look`.
// If the files are missing or fail to load, the game falls back to the procedural people.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import type { AssetContainer, InstantiatedEntries } from '@babylonjs/core/assetContainer';
import type { AnimationGroup } from '@babylonjs/core/Animations/animationGroup';
import type { Material } from '@babylonjs/core/Materials/material';
import type { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import type { Look } from './people';

export type Anim = 'Idle_Loop' | 'Idle_Talking_Loop' | 'Walk_Loop' | 'Sitting_Idle_Loop' | 'Sitting_Talking_Loop' | 'Interact';

/** Measured by the build script: model height, and where the hips are in the sitting pose. */
const BODY = { m: { height: 1.81, sitBack: 0.337, sitHip: 0.584 }, f: { height: 1.767, sitBack: 0.324, sitHip: 0.554 } };
const MAX_RIGS = 90;
const ACTIVE_RANGE = 160; // metres from the camera; beyond this a person is hidden and their animation paused

function outfit(L: Look): Set<string> {
  const on = new Set(['body', 'Eyes', 'Eyebrows', 'shoes']);
  const covered = L.sex === 'm' ? L.headwear === 'fila' || L.headwear === 'cap' : L.headwear === 'gele' || L.headwear === 'scarf';
  if (L.sex === 'm') {
    if (L.outfit === 'kaftan' || L.outfit === 'agbada') on.add('kaftan'); else on.add(L.outfit === 'shirt' ? 'top_long' : 'top_short');
    on.add('trousers');
    if (covered) on.add('fila'); else if (L.hair !== 'bald') on.add('hair_low');
  } else {
    if (L.outfit === 'gown') on.add('gown');
    else { on.add('top_short'); on.add(L.outfit === 'trousers' ? 'trousers' : 'wrapper'); }
    if (covered) on.add('gele');
    else if (L.hair !== 'bald') on.add(L.hair === 'braids' ? 'hair_long' : L.hair === 'low' ? 'hair_low' : 'hair_bun');
  }
  return on;
}

export class Rig {
  /** What the game moves around. Origin at the feet (standing) or under the hips on the seat (sitting). */
  readonly root: Mesh;
  private fit: TransformNode;
  private groups = new Map<string, AnimationGroup>();
  private current: AnimationGroup | null = null;
  private currentName = '';
  private awake = true;
  readonly seated: boolean;

  constructor(scene: Scene, private inst: InstantiatedEntries, look: Look, seated: boolean, mats: (kind: string, hex: string, base?: Material | null) => Material) {
    const b = BODY[look.sex];
    const s = look.height / b.height;
    this.seated = seated;
    this.root = new Mesh('person', scene);
    this.root.metadata = { dynamic: true };
    this.fit = new TransformNode('fit', scene);
    this.fit.parent = this.root;
    this.fit.scaling.set(s * Math.min(1.12, Math.max(0.9, look.build)), s, s);
    if (seated) this.fit.position.set(0, -(b.sitHip - 0.1) * s, b.sitBack * s);
    for (const n of inst.rootNodes) n.parent = this.fit;

    const on = outfit(look);
    for (const m of this.fit.getChildMeshes(false)) {
      if (m.getTotalVertices() === 0) continue; // the file's own root node
      const name = m.name.replace(/\.\d+$/, '').replace(/_primitive\d+$/, '');
      if (!on.has(name)) { m.dispose(); continue; }
      m.metadata = { dynamic: true }; m.isPickable = false; m.alwaysSelectAsActiveMesh = false;
      if (name === 'body') m.material = mats('skin', look.skin, m.material);
      else if (name.startsWith('hair') || name === 'Eyebrows') m.material = mats('hair', look.hairColor, m.material);
      else if (name === 'shoes') m.material = mats('cloth', look.shoes);
      else if (name === 'trousers' || name === 'wrapper') m.material = mats('cloth', look.bottom);
      else if (name === 'fila' || name === 'gele') m.material = mats('cloth', look.headColor);
      else if (name !== 'Eyes') m.material = mats('cloth', look.top);
    }
    for (const g of inst.animationGroups) {
      g.stop(); g.enableBlending = true; g.blendingSpeed = 0.09;
      this.groups.set(g.name, g);
    }
    this.root.onDisposeObservable.add(() => { Rigs.forget(this); this.inst.dispose(); });
  }

  play(name: Anim, loop = true, speed = 1) {
    const g = this.groups.get(name);
    if (!g) return;
    if (this.currentName === name) { g.speedRatio = speed; return; }
    this.current?.stop();
    this.current = g; this.currentName = name;
    g.start(loop, speed);
    if (loop) g.goToFrame(g.from + Math.random() * (g.to - g.from)); // so a crowd doesn't move in step
    if (!this.awake) g.pause();
  }

  /** Called by the manager: hide and pause when far away or switched off by the game. */
  setAwake(on: boolean) {
    if (on === this.awake) return;
    this.awake = on;
    this.fit.setEnabled(on);
    if (on) this.current?.play(this.current.loopAnimation); else this.current?.pause();
  }
}

export class Rigs {
  private static containers: { m?: AssetContainer; f?: AssetContainer } = {};
  private static live = new Set<Rig>();
  private static mats = new Map<string, Material>();
  private static scene: Scene | null = null;
  static get ready() { return !!(this.containers.m && this.containers.f); }
  static get count() { return this.live.size; }

  static async load(scene: Scene): Promise<boolean> {
    try {
      await import('@babylonjs/loaders/glTF');
      const { LoadAssetContainerAsync } = await import('@babylonjs/core/Loading/sceneLoader');
      const base = `${import.meta.env.BASE_URL}models/characters/`;
      const [m, f] = await Promise.all([
        LoadAssetContainerAsync(`${base}man.glb`, scene, { pluginExtension: '.glb' }),
        LoadAssetContainerAsync(`${base}woman.glb`, scene, { pluginExtension: '.glb' }),
      ]);
      for (const c of [m, f]) for (const g of c.animationGroups) g.stop();
      this.containers = { m, f }; this.scene = scene; this.mats.clear(); this.live.clear();
      // pause people the camera can't see closely; wake them when it comes near
      let tick = 0;
      scene.onBeforeRenderObservable.add(() => {
        if (++tick % 12) return;
        const cam = scene.activeCamera; if (!cam) return;
        for (const r of this.live) {
          const p = r.root.getAbsolutePosition();
          const dx = p.x - cam.globalPosition.x, dz = p.z - cam.globalPosition.z;
          // a seated person right against the camera (the conductor in the cabin view) would be cut open by the lens
          const dy = p.y + 0.5 - cam.globalPosition.y;
          const inLens = r.seated && dx * dx + dy * dy + dz * dz < 1.0;
          r.setAwake(r.root.isEnabled() && !inLens && dx * dx + dz * dz < ACTIVE_RANGE * ACTIVE_RANGE);
        }
      });
      return true;
    } catch (e) {
      console.warn('[people] rigged characters unavailable; using the procedural people', e);
      this.containers = {};
      return false;
    }
  }

  /** Shared materials: one per colour for cloth, one per tone for skin and hair. */
  private static material(kind: string, hex: string, base?: Material | null): Material {
    const key = `${kind}:${hex}:${base?.name ?? ''}`;
    let m = this.mats.get(key);
    if (m) return m;
    const c = Color3.FromHexString(hex);
    if (kind === 'cloth' || !base) {
      const s = new StandardMaterial(`cloth-${hex}`, this.scene!);
      s.diffuseColor = c; s.specularColor = new Color3(0.04, 0.04, 0.04);
      m = s;
    } else {
      const p = base.clone(`${kind}-${hex}`) as PBRMaterial;
      if (kind === 'skin') {
        // the baked skin is a mid-deep brown; vary it by the look's tone
        const lum = Math.min(1.45, Math.max(0.7, (c.r + c.g + c.b) / 3 / 0.26));
        p.albedoColor = new Color3(lum, lum * 0.98, lum * 0.96);
      } else {
        const l = c.toLinearSpace(); // the texture is grey-scale; this material works in linear colour
        p.albedoColor = new Color3(l.r * 1.5 + 0.004, l.g * 1.5 + 0.004, l.b * 1.5 + 0.004);
      }
      p.metallic = 0; p.roughness = 0.85;
      m = p;
    }
    this.mats.set(key, m);
    return m;
  }

  static spawn(scene: Scene, look: Look, seated = false): Rig | null {
    const c = this.containers[look.sex];
    if (!c || this.live.size >= MAX_RIGS) return null;
    const inst = c.instantiateModelsToScene((n) => n, false, { doNotInstantiate: true });
    const rig = new Rig(scene, inst, look, seated, (k, h, b) => this.material(k, h, b));
    this.live.add(rig);
    return rig;
  }

  static forget(r: Rig) { this.live.delete(r); }
}
