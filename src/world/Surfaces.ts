// Photographic surfaces and lighting (Poly Haven CC0 scans; see docs/ASSET-INVENTORY.md).
// High quality: PBR materials (colour + normal + AO/roughness), image-based lighting
// from a real sky and cascaded sun shadows. Low quality: the same photos as plain
// textures, so mid-range phones keep their frame rate.
import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { PBRMaterial } from '@babylonjs/core/Materials/PBR/pbrMaterial';
import { Material } from '@babylonjs/core/Materials/material';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { DirectionalLight } from '@babylonjs/core/Lights/directionalLight';
import type { AbstractMesh } from '@babylonjs/core/Meshes/abstractMesh';
import type { Camera } from '@babylonjs/core/Cameras/camera';

export type SurfaceId =
  | 'aerial_asphalt_01' | 'asphalt_02' | 'red_laterite_soil_stones' | 'brown_mud_dry' | 'leafy_grass'
  | 'concrete_block_wall' | 'painted_plaster_wall' | 'rusty_corrugated_iron' | 'concrete_pavement';

export interface SurfaceOpts {
  /** Texture repeats per UV unit (the mesh decides how many metres a UV unit is). */
  uScale?: number; vScale?: number;
  /** Multiplies the photo's colour. */
  tint?: Color3;
  /** Extra roughness control for PBR (1 = as scanned). */
  roughness?: number;
}

const url = (id: string, kind: string) => `${import.meta.env.BASE_URL}textures/${id}_${kind}.jpg`;
const cache = new Map<string, Material>();

function tex(scene: Scene, id: string, kind: string, o: SurfaceOpts, aniso: number) {
  const t = new Texture(url(id, kind), scene);
  t.uScale = o.uScale ?? 1; t.vScale = o.vScale ?? 1;
  t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE;
  t.anisotropicFilteringLevel = aniso;
  return t;
}

/** A shared material for a scanned surface. `key` separates differently-scaled uses of the same scan. */
export function surface(scene: Scene, high: boolean, id: SurfaceId, key: string, o: SurfaceOpts = {}): Material {
  const k = `${id}:${key}:${high}`;
  const hit = cache.get(k);
  if (hit && hit.getScene() === scene) return hit;
  let mat: Material;
  if (high) {
    const m = new PBRMaterial(`surf-${key}`, scene);
    m.albedoTexture = tex(scene, id, 'diff', o, 8);
    m.bumpTexture = tex(scene, id, 'nor', o, 4);
    m.metallicTexture = tex(scene, id, 'arm', o, 2);
    m.useAmbientOcclusionFromMetallicTextureRed = true;
    m.useRoughnessFromMetallicTextureGreen = true;
    m.useMetallnessFromMetallicTextureBlue = true;
    m.metallic = 1; m.roughness = o.roughness ?? 1;
    if (o.tint) m.albedoColor = o.tint;
    m.backFaceCulling = false;
    m.environmentIntensity = 0.75;
    mat = m;
  } else {
    const m = new StandardMaterial(`surf-${key}`, scene);
    m.diffuseTexture = tex(scene, id, 'diff', o, 4);
    if (o.tint) m.diffuseColor = o.tint;
    m.specularColor = new Color3(0.04, 0.04, 0.04);
    m.backFaceCulling = false;
    mat = m;
  }
  cache.set(k, mat);
  return mat;
}

const SKY = 'kloofendal_43d_clear_puresky_1k.hdr';

/**
 * High quality only: light the scene from a real sky (reflections and soft ambient light)
 * and add cascaded sun shadows that follow the camera. Loaded lazily so Low never pays for it.
 */
export async function setupRealLighting(scene: Scene, sun: DirectionalLight, camera: Camera, casts: (m: AbstractMesh) => boolean) {
  // ?fx=noenv switches the sky lighting off; ?fx=shadow switches sun shadows on.
  // Shadows are opt-in until they are proven stable on low-end GPUs (see KNOWN-LIMITATIONS).
  const fx = new URLSearchParams(location.search).get('fx') ?? '';
  let env = null, shadows = null;
  if (!fx.includes('noenv')) {
    const { HDRCubeTexture } = await import('@babylonjs/core/Materials/Textures/hdrCubeTexture');
    env = new HDRCubeTexture(`${import.meta.env.BASE_URL}env/${SKY}`, scene, 128, false, true, false, true);
    scene.environmentTexture = env;
    scene.environmentIntensity = 0.85;
  }
  if (fx.includes('shadow')) {
    const [{ ShadowGenerator }] = await Promise.all([
      import('@babylonjs/core/Lights/Shadows/shadowGenerator'),
      import('@babylonjs/core/Lights/Shadows/shadowGeneratorSceneComponent'),
    ]);
    // one small shadow map over a fixed 90 m square that follows the camera
    sun.autoUpdateExtends = false; sun.autoCalcShadowZBounds = false;
    sun.orthoLeft = -45; sun.orthoRight = 45; sun.orthoTop = 45; sun.orthoBottom = -45;
    sun.shadowMinZ = 1; sun.shadowMaxZ = 220;
    shadows = new ShadowGenerator(1024, sun);
    shadows.usePercentageCloserFiltering = true;
    shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
    shadows.bias = 0.002; shadows.normalBias = 0.02;
    shadows.darkness = 0.4; // shadows keep some sky light
    shadows.getShadowMap()!.renderListPredicate = casts;
    const fwd = camera.getDirection(sun.direction.clone().set(0, 0, 1));
    scene.onBeforeRenderObservable.add(() => {
      camera.getDirectionToRef(fwd.set(0, 0, 1), fwd);
      sun.position.set(camera.globalPosition.x + fwd.x * 22 - sun.direction.x * 100, camera.globalPosition.y - sun.direction.y * 100, camera.globalPosition.z + fwd.z * 22 - sun.direction.z * 100);
    });
  }
  return { env, shadows };
}
