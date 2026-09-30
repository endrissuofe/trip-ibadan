// Builds the game's route file from OSM + real elevation.
//   in : data/osm/road.json, data/osm/places.json
//   out: public/data/berger-mowe.json
// Elevation: AWS Terrain Tiles (Terrarium PNG, open data, SRTM-derived), cached in data/dem/.
// Usage: node tools/osm/build-route.mjs
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { PNG } from 'pngjs';

const ROUTE_ID = 'ojota-mowe';
const STEP = 5; // metres between centreline samples
const TERRAIN_STEP = 4; // every Nth centreline sample gets a terrain cross-section (20 m)
const TERRAIN_OFFSETS = []; for (let d = -500; d <= 500; d += 20) TERRAIN_OFFSETS.push(d);
const DEM_ZOOM = 13;

const road = JSON.parse(await readFile('data/osm/road.json', 'utf8'));
const places = JSON.parse(await readFile('data/osm/places.json', 'utf8'));
const streetsRaw = JSON.parse(await readFile('data/osm/streets.json', 'utf8'));
const poisRaw = JSON.parse(await readFile('data/osm/pois.json', 'utf8'));
const OJOTA = { lat: 6.5906, lon: 3.3854 }; // Ojota Interchange node, where the expressway begins

// ---------- projection (local ENU metres, origin = Ojodu Berger) ----------
const ORIGIN = { lat: 6.6416, lon: 3.3740 }; // Ojodu Berger Interchange node
const MX = 111320 * Math.cos((ORIGIN.lat * Math.PI) / 180), MZ = 110540;
const toLocal = (p) => ({ x: (p.lon - ORIGIN.lon) * MX, z: (p.lat - ORIGIN.lat) * MZ });
const toGeo = (x, z) => ({ lon: ORIGIN.lon + x / MX, lat: ORIGIN.lat + z / MZ });

// ---------- chain carriageways ----------
const ways = road.elements.filter((e) => e.type === 'way');
const key = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);
function chain(list, northward) {
  const byStart = new Map(list.map((w) => [key(w.geometry[0]), w]));
  const ends = new Set(list.map((w) => key(w.geometry.at(-1))));
  const heads = list.filter((w) => !ends.has(key(w.geometry[0])));
  heads.sort((a, b) => (northward ? a.geometry[0].lat - b.geometry[0].lat : b.geometry[0].lat - a.geometry[0].lat));
  const out = []; const used = new Set();
  let cur = heads[0];
  while (cur && !used.has(cur.id)) { used.add(cur.id); out.push(cur); cur = byStart.get(key(cur.geometry.at(-1))); }
  return out;
}
const mainline = ways.filter((w) => w.tags.highway === 'motorway');
const dir = (w) => w.geometry.at(-1).lat - w.geometry[0].lat;
const nbWays = chain(mainline.filter((w) => dir(w) > 0), true);
const sbWays = chain(mainline.filter((w) => dir(w) < 0), false);

function polyFromWays(ws) {
  const pts = [];
  for (const w of ws) {
    w.geometry.forEach((g, i) => {
      if (pts.length && i === 0) return;
      const l = toLocal(g);
      pts.push({ ...l, bridge: w.tags.bridge ? 1 : 0, lanes: +(w.tags.lanes || 2) });
    });
  }
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = s; });
  return pts;
}

function resample(pts, s0, s1) {
  const out = [];
  let j = 0;
  for (let s = Math.max(s0, 0); s <= Math.min(s1, pts.at(-1).s); s += STEP) {
    while (j < pts.length - 2 && pts[j + 1].s < s) j++;
    const a = pts[j], b = pts[j + 1];
    const t = (s - a.s) / (b.s - a.s || 1);
    // bridge flag belongs to the segment a→b, which carries b's way tags
    out.push({ x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t, bridge: b.bridge, lanes: b.lanes });
  }
  return out;
}

function smoothXZ(pts, win) {
  const out = pts.map((p) => ({ ...p }));
  for (let i = 0; i < pts.length; i++) {
    let sx = 0, sz = 0, n = 0;
    for (let k = -win; k <= win; k++) {
      const q = pts[Math.min(pts.length - 1, Math.max(0, i + k))]; sx += q.x; sz += q.z; n++;
    }
    out[i].x = sx / n; out[i].z = sz / n;
  }
  return out;
}

function withS(pts) {
  let s = 0;
  pts.forEach((p, i) => { if (i) s += Math.hypot(p.x - pts[i - 1].x, p.z - pts[i - 1].z); p.s = s; });
  return pts;
}

// ---------- elevation (Terrarium tiles) ----------
const tileCache = new Map();
const lon2tx = (lon) => ((lon + 180) / 360) * 2 ** DEM_ZOOM;
const lat2ty = (lat) => { const r = (lat * Math.PI) / 180; return ((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2) * 2 ** DEM_ZOOM; };
async function tile(tx, ty) {
  const k = tx + '/' + ty;
  if (tileCache.has(k)) return tileCache.get(k);
  const file = `data/dem/${DEM_ZOOM}-${tx}-${ty}.png`;
  let buf;
  try { await access(file); buf = await readFile(file); } catch {
    const url = `https://s3.amazonaws.com/elevation-tiles-prod/terrarium/${DEM_ZOOM}/${tx}/${ty}.png`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Trip_Ibadan-map-pipeline/0.1' } });
    if (!res.ok) throw new Error(`DEM ${url} -> ${res.status}`);
    buf = Buffer.from(await res.arrayBuffer());
    await mkdir('data/dem', { recursive: true });
    await writeFile(file, buf);
  }
  const png = PNG.sync.read(buf);
  tileCache.set(k, png);
  return png;
}
async function elevAt(lat, lon) {
  const fx = lon2tx(lon), fy = lat2ty(lat);
  const tx = Math.floor(fx), ty = Math.floor(fy);
  const png = await tile(tx, ty);
  const px = Math.min(255, Math.max(0, (fx - tx) * 256 - 0.5)), py = Math.min(255, Math.max(0, (fy - ty) * 256 - 0.5));
  const x0 = Math.floor(px), y0 = Math.floor(py), x1 = Math.min(255, x0 + 1), y1 = Math.min(255, y0 + 1);
  const h = (x, y) => { const i = (y * 256 + x) * 4; const d = png.data; return d[i] * 256 + d[i + 1] + d[i + 2] / 256 - 32768; };
  const ax = px - x0, ay = py - y0;
  return (h(x0, y0) * (1 - ax) + h(x1, y0) * ax) * (1 - ay) + (h(x0, y1) * (1 - ax) + h(x1, y1) * ax) * ay;
}
const elevLocal = (x, z) => { const g = toGeo(x, z); return elevAt(g.lat, g.lon); };

// ---------- road profile: smoothed DEM, bridges spanned, grade-limited ----------
async function roadHeights(pts) {
  const raw = [];
  for (const p of pts) raw.push(await elevLocal(p.x, p.z));
  // smooth (≈300 m window) ignoring bridge samples (DEM there is the valley)
  const W = Math.round(150 / STEP);
  const sm = raw.map((_, i) => {
    let s = 0, n = 0;
    for (let k = -W; k <= W; k++) { const j = i + k; if (j < 0 || j >= raw.length || pts[j].bridge) continue; s += raw[j]; n++; }
    return n ? s / n : raw[i];
  });
  // span bridges: linear between the ground ends, with approach ramps blended in
  let i = 0;
  while (i < pts.length) {
    if (!pts[i].bridge) { i++; continue; }
    let j = i; while (j < pts.length && pts[j].bridge) j++;
    const a = sm[Math.max(0, i - 1)], b = sm[Math.min(pts.length - 1, j)];
    for (let k = i; k < j; k++) sm[k] = a + ((b - a) * (k - i + 1)) / (j - i + 1);
    i = j;
  }
  // grade limit 4%
  const g = 0.04 * STEP;
  for (let k = 1; k < sm.length; k++) sm[k] = Math.min(sm[k - 1] + g, Math.max(sm[k - 1] - g, sm[k]));
  for (let k = sm.length - 2; k >= 0; k--) sm[k] = Math.min(sm[k + 1] + g, Math.max(sm[k + 1] - g, sm[k]));
  return sm;
}

// ---------- build northbound (player) route ----------
const nbRaw = polyFromWays(nbWays);
const bergerS = nearestS(nbRaw, toLocal(ORIGIN));
const MOWE = places.elements.find((e) => e.tags?.name === 'Mowe');
const ojotaRawS = nearestS(nbRaw, toLocal(OJOTA)), moweRawS = nearestS(nbRaw, toLocal(MOWE));
const MARGIN_BEFORE = 350, MARGIN_AFTER = 700;
void bergerS;
let nb = withS(smoothXZ(resample(nbRaw, ojotaRawS - MARGIN_BEFORE, moweRawS + MARGIN_AFTER), 3));
const nbH = await roadHeights(nb);
nb.forEach((p, i) => (p.y = nbH[i]));

function nearestS(pts, q) {
  let best = Infinity, s = 0;
  for (const p of pts) { const d = Math.hypot(p.x - q.x, p.z - q.z); if (d < best) { best = d; s = p.s; } }
  return s;
}
// normals (right-hand side of travel direction; x east, z north)
function tangent(pts, i) {
  const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
  const l = Math.hypot(b.x - a.x, b.z - a.z) || 1; return { tx: (b.x - a.x) / l, tz: (b.z - a.z) / l };
}

// ---------- southbound carriageway (visual + oncoming traffic) ----------
const sbRaw = polyFromWays(sbWays);
const nbStart = nb[0], nbEnd = nb.at(-1);
const sbS0 = nearestS(sbRaw, nbEnd), sbS1 = nearestS(sbRaw, nbStart);
const sb = withS(smoothXZ(resample(sbRaw, sbS0 - 100, sbS1 + 100), 3));
const sbH = await roadHeights(sb);
sb.forEach((p, i) => (p.y = sbH[i]));

// ---------- terrain cross-sections along the NB line ----------
const terrain = [];
for (let i = 0; i < nb.length; i += TERRAIN_STEP) {
  const { tx, tz } = tangent(nb, i);
  const nx = tz, nz = -tx; // right-hand normal
  for (const d of TERRAIN_OFFSETS) terrain.push(Math.round((await elevLocal(nb[i].x + nx * d, nb[i].z + nz * d)) * 10) / 10);
}

// ---------- ramps and footbridges ----------
const localLine = (w) => w.geometry.map((g) => { const l = toLocal(g); return [Math.round(l.x * 10) / 10, Math.round(l.z * 10) / 10]; });
const inRange = (line) => line.some(([x, z]) => Math.hypot(x - nbStart.x, z - nbStart.z) < 25000 && z > nbStart.z - 300 && z < nbEnd.z + 300);
const ramps = ways.filter((w) => w.tags.highway === 'motorway_link').map((w) => ({ bridge: w.tags.bridge ? 1 : 0, layer: +(w.tags.layer || 0), line: localLine(w) })).filter((r) => inRange(r.line));
const footbridges = ways.filter((w) => /footway|path|steps|pedestrian/.test(w.tags.highway) && w.tags.bridge).map((w) => localLine(w)).filter(inRange);

// ---------- places (stops & signage) on the route ----------
const sOf = (lat, lon) => nearestS(nb, toLocal({ lat, lon }));
const place = (name) => places.elements.find((e) => e.tags?.name === name);
const busStop = road.elements.find((e) => e.type === 'node' && /Arepo/i.test(e.tags?.name || ''));
const startS = nearestS(nb, toLocal(OJOTA)) + 120; // just past the interchange, by the park
const kara = poisRaw.elements.find((e) => e.tags?.name === 'Kara Market');
const kc = kara.center ?? kara;
// Passenger stops are the real bus stops / towns along the expressway, in travel order.
const landmarks = [
  { id: 'ojota', name: 'Ojota', s: startS, kind: 'start' },
  { id: 'berger', name: 'Berger', s: nearestS(nb, toLocal(ORIGIN)) + 150, kind: 'stop' },
  { id: 'kara', name: 'Kara', s: sOf(kc.lat, kc.lon), kind: 'stop' },
  { id: 'magboro', name: 'Magboro', s: sOf(place('Magboro').lat, place('Magboro').lon), kind: 'stop' },
  { id: 'arepo', name: 'Arepo', s: sOf(busStop.lat, busStop.lon), kind: 'stop' },
  { id: 'ibafo', name: 'Ibafo', s: sOf(place('Ibafo').lat, place('Ibafo').lon), kind: 'stop' },
  { id: 'mowe', name: 'Mowe', s: sOf(place('Mowe').lat, place('Mowe').lon), kind: 'destination' },
];
const endS = landmarks.at(-1).s;

// ---------- streets beside the expressway (drivable detours) ----------
// class: 0 primary/secondary, 1 tertiary, 2 residential/unclassified, 3 service, 4 track
const CLASS = { primary: 0, secondary: 0, tertiary: 1, unclassified: 2, residential: 2, living_street: 2, service: 3, track: 4 };
const UNPAVED = /^(unpaved|dirt|earth|ground|gravel|fine_gravel|sand|compacted|mud|laterite|grass)$/;
const PAVED = /^(paved|asphalt|concrete|paving_stones|sett|concrete:plates)$/;
const lagosEndS = nearestS(nb, toLocal(ORIGIN)) + 1100; // Ogun River bridge = Lagos/Ogun boundary (approx.)
const nbProj = (x, z) => {
  let best = Infinity, bi = 0;
  for (let i = 0; i < nb.length; i += 4) { const d = (nb[i].x - x) ** 2 + (nb[i].z - z) ** 2; if (d < best) { best = d; bi = i; } }
  let b2 = Infinity, bj = bi;
  for (let i = Math.max(0, bi - 6); i < Math.min(nb.length, bi + 7); i++) { const d = (nb[i].x - x) ** 2 + (nb[i].z - z) ** 2; if (d < b2) { b2 = d; bj = i; } }
  const { tx, tz } = tangent(nb, bj);
  return { s: nb[bj].s, d: (x - nb[bj].x) * tz - (z - nb[bj].z) * tx, i: bj };
};
const sbDist = (x, z) => { let best = Infinity; for (let i = 0; i < sb.length; i += 3) { const d = (sb[i].x - x) ** 2 + (sb[i].z - z) ** 2; if (d < best) best = d; } return Math.sqrt(best); };
const streets = [];
let streetKm = 0, unpavedKm = 0, assumedKm = 0;
for (const w of streetsRaw.elements) {
  const cls = CLASS[w.tags.highway];
  if (cls === undefined || !w.geometry) continue;
  const surf = w.tags.surface ?? '';
  const pts = w.geometry.map((g) => toLocal(g));
  let len = 0; for (let k = 1; k < pts.length; k++) len += Math.hypot(pts[k].x - pts[k - 1].x, pts[k].z - pts[k - 1].z);
  if (cls === 3 && len < 90) continue;
  const dense = [];
  for (let k = 0; k < pts.length - 1; k++) {
    const a = pts[k], b = pts[k + 1], L = Math.hypot(b.x - a.x, b.z - a.z), n = Math.max(1, Math.ceil(L / 8));
    for (let t = 0; t < n; t++) dense.push({ x: a.x + ((b.x - a.x) * t) / n, z: a.z + ((b.z - a.z) * t) / n });
  }
  dense.push(pts.at(-1));
  const unpaved = UNPAVED.test(surf) || cls === 4 ? 1 : PAVED.test(surf) || cls <= 1 ? 0 : -1;
  let run = [];
  const flush = () => {
    if (run.length >= 2) {
      const midS = run[Math.floor(run.length / 2)].s;
      let u = unpaved, assumed = 0;
      if (u === -1) { u = midS > lagosEndS ? 1 : 0; assumed = 1; }
      let L = 0; for (let k = 1; k < run.length; k++) L += Math.hypot(run[k].x - run[k - 1].x, run[k].z - run[k - 1].z);
      streetKm += L / 1000; if (u) unpavedKm += L / 1000; if (assumed) assumedKm += L / 1000;
      streets.push({ c: cls, u, a: assumed, n: w.tags.name ?? '', p: run.flatMap((q) => [Math.round(q.x * 10) / 10, Math.round(q.z * 10) / 10]) });
    }
    run = [];
  };
  for (const q of dense) {
    const pr = nbProj(q.x, q.z);
    const lanesHalf = (nb[pr.i].lanes * 3.65) / 2;
    const ok = pr.s > nb[0].s + 50 && pr.s < nb.at(-1).s - 50 && Math.abs(pr.d) < 330 && Math.abs(pr.d) > lanesHalf + 3.5 && sbDist(q.x, q.z) > 9;
    if (ok) run.push({ ...q, s: pr.s }); else flush();
  }
  flush();
}

// ---------- real named places along the road (landmarks to discover) ----------
const CAT = (t) => t.amenity === 'place_of_worship' ? (t.religion === 'muslim' ? 'mosque' : 'church')
  : t.amenity === 'marketplace' ? 'market' : t.amenity === 'fuel' ? 'fuel' : t.amenity === 'bank' ? 'bank'
  : /school|university|college/.test(t.amenity ?? '') ? 'school'
  : t.amenity === 'police' ? 'police' : t.leisure === 'park' ? 'park' : t.tourism === 'theme_park' ? 'themepark'
  : t.shop ? 'mall' : t.office === 'government' ? 'government' : t.landuse === 'residential' ? 'estate'
  : t.landuse === 'industrial' || t.landuse === 'commercial' || t.office ? 'business' : t.leisure ? 'leisure' : 'place';
const pois = [];
for (const e of poisRaw.elements) {
  const c = e.center ?? e; if (c.lat == null) continue;
  const q = toLocal(c); const pr = nbProj(q.x, q.z);
  if (pr.s < startS - 300 || pr.s > endS + 300 || Math.abs(pr.d) > 460) continue;
  const name = e.tags.name.replace(/'S/g, "'s");
  if (pois.some((p) => p.name.toLowerCase() === name.toLowerCase() && Math.abs(p.s - pr.s) < 300)) continue;
  pois.push({ name, cat: CAT(e.tags), s: Math.round(pr.s), d: Math.round(pr.d), x: Math.round(q.x), z: Math.round(q.z) });
}
pois.sort((a, b) => a.s - b.s);

const r1 = (v) => Math.round(v * 100) / 100;
const out = {
  id: ROUTE_ID,
  name: 'Ojota → Mowe',
  source: 'OpenStreetMap contributors (ODbL); elevation: AWS Terrain Tiles (SRTM-derived)',
  origin: ORIGIN,
  step: STEP,
  startS,
  endS,
  nb: { x: nb.map((p) => r1(p.x)), z: nb.map((p) => r1(p.z)), y: nb.map((p) => r1(p.y)), bridge: nb.map((p) => p.bridge), lanes: nb.map((p) => p.lanes) },
  sb: { x: sb.map((p) => r1(p.x)), z: sb.map((p) => r1(p.z)), y: sb.map((p) => r1(p.y)), bridge: sb.map((p) => p.bridge), lanes: sb.map((p) => p.lanes) },
  terrain: { every: TERRAIN_STEP, offsets: TERRAIN_OFFSETS, h: terrain },
  ramps,
  footbridges,
  landmarks,
  streets,
  pois,
};
await mkdir('public/data', { recursive: true });
const json = JSON.stringify(out);
await writeFile(`public/data/${ROUTE_ID}.json`, json);
const bridges = []; let run = null;
nb.forEach((p) => { if (p.bridge) { if (!run) run = { a: p.s }; run.b = p.s; } else if (run) { bridges.push(run); run = null; } });
console.log(`route ${ROUTE_ID}: nb ${nb.length} pts (${(nb.at(-1).s / 1000).toFixed(2)} km), sb ${sb.length} pts, terrain ${terrain.length} samples, ramps ${ramps.length}, footbridges ${footbridges.length}`);
console.log('trip:', ((out.endS - out.startS) / 1000).toFixed(2), 'km;', landmarks.map((l) => `${l.name}@${((l.s - startS) / 1000).toFixed(1)}`).join(' '));
console.log(`streets: ${streets.length} runs, ${streetKm.toFixed(1)} km (${unpavedKm.toFixed(1)} km untarred, ${assumedKm.toFixed(1)} km surface assumed); pois: ${pois.length}`);
console.log(pois.map((p) => `${((p.s - startS) / 1000).toFixed(1)}km ${p.cat}:${p.name}(${p.d}m)`).join('\n'));
console.log('bridges (km from Ojota):', bridges.map((b) => `${((b.a - startS) / 1000).toFixed(2)}–${((b.b - startS) / 1000).toFixed(2)}`).join(', '));
console.log('height range', Math.min(...nbH).toFixed(1), '→', Math.max(...nbH).toFixed(1), 'm; file', (json.length / 1024).toFixed(0), 'KB');
