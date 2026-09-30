// Chains the northbound Lagos–Ibadan Expressway out of data/osm/road.json and
// reports distance along the road for bridges, ramps, footbridges and towns.
// Usage: node tools/osm/analyze.mjs
import { readFile, writeFile } from 'node:fs/promises';

const road = JSON.parse(await readFile('data/osm/road.json', 'utf8'));
const places = JSON.parse(await readFile('data/osm/places.json', 'utf8'));

const R = 6371000;
const rad = (d) => (d * Math.PI) / 180;
function dist(a, b) {
  const x = rad(b.lon - a.lon) * Math.cos(rad((a.lat + b.lat) / 2));
  const y = rad(b.lat - a.lat);
  return Math.hypot(x, y) * R;
}
const key = (p) => p.lat.toFixed(7) + ',' + p.lon.toFixed(7);

const ways = road.elements.filter((e) => e.type === 'way');
const mainline = ways.filter((w) => w.tags.highway === 'motorway');

// Northbound = the oneway carriageway whose first node is further south than its last.
const heading = (w) => w.geometry.at(-1).lat - w.geometry[0].lat;
const nb = mainline.filter((w) => heading(w) > 0);
const sb = mainline.filter((w) => heading(w) < 0);

// Chain ways end-to-start, starting from the southernmost start node.
function chain(list) {
  const byStart = new Map(list.map((w) => [key(w.geometry[0]), w]));
  const ends = new Set(list.map((w) => key(w.geometry.at(-1))));
  let cur = list.filter((w) => !ends.has(key(w.geometry[0]))).sort((a, b) => a.geometry[0].lat - b.geometry[0].lat)[0];
  const out = [];
  const used = new Set();
  while (cur && !used.has(cur.id)) {
    used.add(cur.id);
    out.push(cur);
    cur = byStart.get(key(cur.geometry.at(-1)));
  }
  return { out, orphans: list.filter((w) => !used.has(w.id)) };
}

const { out: nbChain, orphans } = chain(nb);
const pts = [];
let s = 0;
for (const w of nbChain) {
  w.geometry.forEach((p, i) => {
    if (pts.length && i === 0) return;
    if (pts.length) s += dist(pts.at(-1), p);
    pts.push({ lat: p.lat, lon: p.lon, s, bridge: !!w.tags.bridge, layer: +(w.tags.layer || 0), way: w.id });
  });
}

function nearestS(p) {
  let best = { d: Infinity, s: 0 };
  for (const q of pts) {
    const d = dist(p, q);
    if (d < best.d) best = { d, s: q.s };
  }
  return best;
}
const km = (m) => (m / 1000).toFixed(2);

const report = [];
report.push(`Northbound chain: ${nbChain.length} ways, ${pts.length} points, ${km(s)} km`);
report.push(`Northbound ways not chained: ${orphans.length}; southbound ways: ${sb.length}`);
report.push(`Start ${pts[0].lat.toFixed(5)},${pts[0].lon.toFixed(5)}  End ${pts.at(-1).lat.toFixed(5)},${pts.at(-1).lon.toFixed(5)}`);

report.push('\nBRIDGES on northbound carriageway:');
for (const w of nbChain.filter((w) => w.tags.bridge)) {
  const a = nearestS(w.geometry[0]).s, b = nearestS(w.geometry.at(-1)).s;
  report.push(`  km ${km(a)}–${km(b)}  (${Math.round(b - a)} m)  ${w.tags['bridge:name'] || w.tags.name || ''} layer=${w.tags.layer || 0}`);
}

report.push('\nRAMPS (motorway_link) touching northbound:');
for (const w of ways.filter((w) => w.tags.highway === 'motorway_link')) {
  const a = nearestS(w.geometry[0]), b = nearestS(w.geometry.at(-1));
  const touch = a.d < 15 ? `leaves at km ${km(a.s)}` : b.d < 15 ? `joins at km ${km(b.s)}` : `nearby km ${km(Math.min(a.s, b.s))} (not on NB)`;
  report.push(`  ${touch}  ${w.tags.destination || w.tags.name || ''}`);
}

report.push('\nFOOTBRIDGES / path bridges:');
for (const w of ways.filter((w) => /footway|path|pedestrian|steps/.test(w.tags.highway))) {
  const mid = w.geometry[Math.floor(w.geometry.length / 2)];
  const n = nearestS(mid);
  report.push(`  km ${km(n.s)}  (${Math.round(n.d)} m off centreline) ${w.tags.name || ''}`);
}

report.push('\nNODES:');
for (const n of road.elements.filter((e) => e.type === 'node')) {
  const r = nearestS(n);
  report.push(`  km ${km(r.s)}  ${n.tags.highway || n.tags.barrier} ${n.tags.name || ''} (${Math.round(r.d)} m off)`);
}

report.push('\nTOWNS (place centroid → nearest point on road):');
for (const p of places.elements.sort((a, b) => a.lat - b.lat)) {
  const r = nearestS(p);
  if (r.d < 3000) report.push(`  km ${km(r.s)}  ${p.tags.name} (${p.tags.place}, centroid ${Math.round(r.d)} m from road)`);
}

console.log(report.join('\n'));
await writeFile('data/osm/northbound.json', JSON.stringify({ lengthM: s, points: pts }));
