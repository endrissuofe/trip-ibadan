// Real 3D model loading (change spec §20). Drop GLB files into public/models/ and list them in
// public/models/manifest.json; the game uses them instead of the procedural stand-ins.
// Nothing is fetched unless the manifest lists a file, so the game works with no models at all.
// See docs/ASSET-CONTRACT.md for what each model must contain.
import { Scene } from '@babylonjs/core/scene';
import { TransformNode } from '@babylonjs/core/Meshes/transformNode';
import { Mesh } from '@babylonjs/core/Meshes/mesh';

export interface ModelEntry { file: string; scale?: number; yaw?: number }
export interface AssetManifest { vehicles: Record<string, ModelEntry>; characters: ModelEntry[] }

let manifestP: Promise<AssetManifest> | null = null;

export function loadManifest(): Promise<AssetManifest> {
  manifestP ??= fetch(`${import.meta.env.BASE_URL}models/manifest.json`)
    .then((r) => (r.ok ? r.json() : { vehicles: {}, characters: [] }))
    .catch(() => ({ vehicles: {}, characters: [] }));
  return manifestP;
}

export interface LoadedModel {
  root: TransformNode;
  /** Named nodes from the asset contract (seat_01, light_brake_L, driver_cam, …). */
  nodes: Map<string, TransformNode>;
}

/**
 * Load the GLB for a vehicle id, if the manifest lists one (or `url` is given, e.g. for tests).
 * Returns null when there is no model or it fails to load (the procedural body stays).
 */
export async function loadVehicleModel(scene: Scene, vehicleId: string, url?: string): Promise<LoadedModel | null> {
  let entry: ModelEntry | undefined;
  if (!url) {
    entry = (await loadManifest()).vehicles[vehicleId];
    if (!entry) return null;
    url = `${import.meta.env.BASE_URL}models/${entry.file}`;
  }
  try {
    await import('@babylonjs/loaders/glTF');
    const { ImportMeshAsync } = await import('@babylonjs/core/Loading/sceneLoader');
    const res = await ImportMeshAsync(url, scene, { pluginExtension: '.glb' });
    const root = new TransformNode(`model_${vehicleId}`, scene);
    for (const m of res.meshes) if (!m.parent) m.parent = root;
    for (const t of res.transformNodes) if (!t.parent) t.parent = root;
    if (entry?.scale) root.scaling.setAll(entry.scale);
    if (entry?.yaw) root.rotation.y = entry.yaw;
    const nodes = new Map<string, TransformNode>();
    for (const n of [...res.transformNodes, ...res.meshes]) nodes.set(n.name, n);
    for (const m of res.meshes) { m.metadata = { dynamic: true }; if (m instanceof Mesh) m.receiveShadows = true; }
    return { root, nodes };
  } catch (e) {
    console.warn(`Model for ${vehicleId} failed to load; using the procedural vehicle.`, e);
    return null;
  }
}
