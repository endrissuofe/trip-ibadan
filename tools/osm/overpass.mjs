// Tiny Overpass client. Usage: node tools/osm/overpass.mjs <query-file> <out.json>
import { readFile, writeFile } from 'node:fs/promises';

const ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];

export async function overpass(query) {
  let lastErr;
  for (const url of ENDPOINTS) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'Trip_Ibadan-map-pipeline/0.1 (hobby game, OSM data)',
        },
        body: 'data=' + encodeURIComponent(query),
      });
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return await res.json();
    } catch (e) {
      lastErr = e;
      console.error('overpass failed:', e.message);
    }
  }
  throw lastErr;
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const [, , qfile, out] = process.argv;
  const data = await overpass(await readFile(qfile, 'utf8'));
  await writeFile(out, JSON.stringify(data));
  console.log(`wrote ${data.elements.length} elements to ${out}`);
}
