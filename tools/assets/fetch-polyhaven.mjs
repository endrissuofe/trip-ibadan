// Fetches the approved CC0 Poly Haven assets and writes phone-sized copies to public/.
// Raw downloads are cached in tools/assets/raw/ (not committed).
// Usage: node tools/assets/fetch-polyhaven.mjs
import { mkdir, writeFile, readFile, access, stat } from 'node:fs/promises';
import sharp from 'sharp';

const UA = 'Trip_Ibadan-asset-pipeline/0.1';
// name → [output size for colour+normal, output size for the AO/rough/metal map]
const TEXTURES = {
  asphalt_02: [1024, 512], aerial_asphalt_01: [1024, 512], red_laterite_soil_stones: [1024, 512],
  brown_mud_dry: [1024, 512], leafy_grass: [1024, 512], concrete_block_wall: [512, 512],
  painted_plaster_wall: [512, 512], rusty_corrugated_iron: [512, 512], concrete_pavement: [512, 512],
};
const HDRI = 'kloofendal_43d_clear_puresky';

async function cached(url, file) {
  try { await access(file); return readFile(file); } catch { /* fetch below */ }
  const res = await fetch(url, { headers: { 'User-Agent': UA } });
  if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(file, buf);
  return buf;
}
const files = async (id) => (await fetch(`https://api.polyhaven.com/files/${id}`, { headers: { 'User-Agent': UA } })).json();

await mkdir('tools/assets/raw', { recursive: true });
await mkdir('public/textures', { recursive: true });
await mkdir('public/env', { recursive: true });
let total = 0;
for (const [id, [size, armSize]] of Object.entries(TEXTURES)) {
  const f = await files(id);
  const maps = { diff: f.Diffuse['1k'].jpg.url, nor: f.nor_gl['1k'].jpg.url, arm: f.arm['1k'].jpg.url };
  for (const [kind, url] of Object.entries(maps)) {
    const raw = await cached(url, `tools/assets/raw/${id}_${kind}_1k.jpg`);
    const out = `public/textures/${id}_${kind}.jpg`;
    const px = kind === 'arm' ? armSize : size;
    await sharp(raw).resize(px, px).jpeg({ quality: kind === 'nor' ? 84 : 76, mozjpeg: true }).toFile(out);
    total += (await stat(out)).size;
  }
  console.log('texture', id);
}
const h = await files(HDRI);
const hdr = await cached(h.hdri['1k'].hdr.url, `tools/assets/raw/${HDRI}_1k.hdr`);
await writeFile(`public/env/${HDRI}_1k.hdr`, hdr);
total += hdr.length;
console.log(`done: ${(total / 1048576).toFixed(2)} MB written to public/`);
