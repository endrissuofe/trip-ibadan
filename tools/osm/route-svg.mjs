// Draws the v1 slice (Berger → Mowe) from data/osm/northbound.json as an SVG.
// Usage: node tools/osm/route-svg.mjs   → design/route-map.svg
import { readFile, writeFile } from 'node:fs/promises';

const BERGER_S = 1400; // chain metres where game km 0 sits (Ojodu Berger interchange)
const MOWE_S = 19200;

const { points } = JSON.parse(await readFile('data/osm/northbound.json', 'utf8'));
const slice = points.filter((p) => p.s >= BERGER_S - 200 && p.s <= MOWE_S + 200);

const lat0 = slice[0].lat;
const toXY = (p) => ({
  x: p.lon * 111320 * Math.cos((lat0 * Math.PI) / 180),
  y: -p.lat * 110540,
});
const xy = slice.map(toXY);
const minX = Math.min(...xy.map((p) => p.x)), maxX = Math.max(...xy.map((p) => p.x));
const minY = Math.min(...xy.map((p) => p.y)), maxY = Math.max(...xy.map((p) => p.y));
const W = 420, H = 760, pad = 60;
const k = Math.min((W - 2 * pad) / (maxX - minX), (H - 2 * pad) / (maxY - minY));
const P = (p) => { const q = toXY(p); return [pad + (q.x - minX) * k, pad + (q.y - minY) * k]; };
const path = (pts) => pts.map((p, i) => (i ? 'L' : 'M') + P(p).map((v) => v.toFixed(1)).join(' ')).join(' ');

// Bridge runs
const bridges = [];
let run = null;
for (const p of slice) {
  if (p.bridge) { (run ||= []).push(p); } else if (run) { bridges.push(run); run = null; }
}
if (run) bridges.push(run);

const at = (s) => slice.reduce((a, b) => (Math.abs(b.s - s) < Math.abs(a.s - s) ? b : a));
const stops = [
  ['BERGER', 0, 'start · park'],
  ['MAGBORO', 10.4, 'stop 1'],
  ['Arepo', 13.0, 'roadside'],
  ['IBAFO', 13.8, 'stop 2'],
  ['MOWE', 17.8, 'stop 3 · end'],
];

let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" font-family="Inter,sans-serif">
<rect width="${W}" height="${H}" rx="16" fill="#6f7a4c"/>
<path d="${path(slice)}" fill="none" stroke="#2b2b2b" stroke-width="9" stroke-linecap="round" stroke-linejoin="round"/>
<path d="${path(slice)}" fill="none" stroke="#E0592A" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
`;
for (const b of bridges) {
  svg += `<path d="${path(b)}" fill="none" stroke="#fff" stroke-width="7" stroke-linecap="butt"/>\n`;
  const [x, y] = P(b[Math.floor(b.length / 2)]);
  const len = Math.round(b.at(-1).s - b[0].s);
  svg += `<text x="${(x - 12).toFixed(0)}" y="${(y + 4).toFixed(0)}" font-size="11" fill="#fff" text-anchor="end">bridge ${len} m</text>\n`;
}
for (const [name, km, role] of stops) {
  const [x, y] = P(at(BERGER_S + km * 1000));
  svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="7" fill="#0F1B2D" stroke="#fff" stroke-width="2"/>
<text x="${(x + 14).toFixed(0)}" y="${(y + 1).toFixed(0)}" font-size="14" font-weight="800" fill="#fff">${name}</text>
<text x="${(x + 14).toFixed(0)}" y="${(y + 15).toFixed(0)}" font-size="11" fill="#f1eee6">km ${km.toFixed(1)} · ${role}</text>\n`;
}
svg += `<text x="20" y="${H - 20}" font-size="11" fill="#f1eee6">Northbound carriageway · OpenStreetMap © contributors · N ↑</text>
</svg>`;
await writeFile('design/route-map.svg', svg);
console.log(`route-map.svg: ${slice.length} pts, ${bridges.length} bridge runs, ${((MOWE_S - BERGER_S) / 1000).toFixed(1)} km`);
