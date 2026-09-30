// Heading-up minimap (with north indicator) and the static trip map.
import type { Route } from '../map/Route';

interface StreetLine { arr: Float32Array; u: number; x0: number; x1: number; z0: number; z1: number }

export class Minimap {
  private ctx: CanvasRenderingContext2D;
  private nb: Float32Array; private sb: Float32Array; private ramps: Float32Array[];
  private streets: StreetLine[];
  private last = 0;
  private scale = 0.2; // px per metre (canvas is 300 px for a 150 css px circle)

  constructor(private cv: HTMLCanvasElement, private route: Route) {
    this.ctx = cv.getContext('2d')!;
    const pack = (xs: ArrayLike<number>, zs: ArrayLike<number>, step: number) => { const out: number[] = []; for (let i = 0; i < xs.length; i += step) out.push(xs[i], zs[i]); return new Float32Array(out); };
    this.nb = pack(route.nb.x, route.nb.z, 2);
    this.sb = pack(route.sb.x, route.sb.z, 2);
    this.ramps = route.file.ramps.map((r) => new Float32Array(r.line.flat()));
    this.streets = route.file.streets.map((st) => {
      const arr = Float32Array.from(st.p);
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity;
      for (let k = 0; k < arr.length; k += 2) { x0 = Math.min(x0, arr[k]); x1 = Math.max(x1, arr[k]); z0 = Math.min(z0, arr[k + 1]); z1 = Math.max(z1, arr[k + 1]); }
      return { arr, u: st.u, x0, x1, z0, z1 };
    });
  }

  draw(px: number, pz: number, heading: number, dots: (cb: (x: number, z: number, color: string, size?: number) => void) => void) {
    const now = performance.now();
    if (now - this.last < 66) return; // ~15 fps is plenty
    this.last = now;
    const c = this.ctx, W = this.cv.width, cx = W / 2, cy = W * 0.6, k = this.scale;
    const sh = Math.sin(heading), ch = Math.cos(heading);
    const tx = (x: number, z: number): [number, number] => { const dx = x - px, dz = z - pz; return [cx + (dx * ch - dz * sh) * k, cy - (dx * sh + dz * ch) * k]; };
    const R = 1400;
    c.fillStyle = '#2b4435'; c.fillRect(0, 0, W, W);
    const line = (arr: Float32Array, color: string, width: number) => {
      c.strokeStyle = color; c.lineWidth = width; c.lineJoin = c.lineCap = 'round'; c.beginPath();
      let drawing = false;
      for (let i = 0; i < arr.length; i += 2) {
        const dx = arr[i] - px, dz = arr[i + 1] - pz;
        if (dx * dx + dz * dz > R * R) { drawing = false; continue; }
        const [x, y] = tx(arr[i], arr[i + 1]);
        if (!drawing) { c.moveTo(x, y); drawing = true; } else c.lineTo(x, y);
      }
      c.stroke();
    };
    for (const st of this.streets) {
      if (st.x1 < px - R || st.x0 > px + R || st.z1 < pz - R || st.z0 > pz + R) continue;
      line(st.arr, st.u ? '#9c6b45' : '#a9b8ae', 4);
    }
    for (const r of this.ramps) line(r, '#8aa08f', 5);
    line(this.sb, '#c9d6cf', 8);
    line(this.nb, '#1688ff', 11);
    // stops
    for (const l of this.route.file.landmarks) {
      const p = this.route.nb.sample(l.s); const [x, y] = tx(p.x, p.z);
      if (x < -10 || x > W + 10 || y < -10 || y > W + 10) continue;
      c.fillStyle = '#fff'; c.strokeStyle = '#1688ff'; c.lineWidth = 4; c.beginPath(); c.arc(x, y, 7, 0, 7); c.fill(); c.stroke();
    }
    // landmarks
    c.fillStyle = '#ffbf47';
    for (const poi of this.route.file.pois) { const [x, y] = tx(poi.x, poi.z); if (x > 0 && x < W && y > 0 && y < W) { c.beginPath(); c.arc(x, y, 5, 0, 7); c.fill(); } }
    // destination (clamped to the rim)
    const end = this.route.nb.sample(this.route.tripEnd);
    const [ex, ey] = tx(end.x, end.z);
    const clampR = W / 2 - 16;
    let ddx = ex - W / 2, ddy = ey - W / 2; const dl = Math.hypot(ddx, ddy);
    if (dl > clampR) { ddx *= clampR / dl; ddy *= clampR / dl; }
    c.fillStyle = '#ff5f68'; c.strokeStyle = '#fff'; c.lineWidth = 4;
    c.beginPath(); c.arc(W / 2 + ddx, W / 2 + ddy, 11, 0, 7); c.fill(); c.stroke();
    // traffic, riders
    dots((x, z, color, size = 6) => { const [a, b] = tx(x, z); c.fillStyle = color; c.fillRect(a - size / 2, b - size / 2, size, size); });
    // player arrow
    c.fillStyle = '#fff'; c.strokeStyle = '#1688ff'; c.lineWidth = 4;
    c.beginPath(); c.moveTo(cx, cy - 20); c.lineTo(cx + 13, cy + 14); c.lineTo(cx, cy + 7); c.lineTo(cx - 13, cy + 14); c.closePath(); c.fill(); c.stroke();
    const nx = W / 2 - sh * (W / 2 - 22), ny = W / 2 - ch * (W / 2 - 22);
    c.fillStyle = 'rgba(7,16,24,.85)'; c.beginPath(); c.arc(nx, ny, 17, 0, 7); c.fill();
    c.fillStyle = '#fff'; c.font = '800 22px Inter, Arial'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('N', nx, ny + 1);
  }
}

/** Full-route overview for the trip screen (north up); the chosen trip is highlighted. */
export function drawTripMap(cv: HTMLCanvasElement, route: Route) {
  const dpr = Math.min(2, devicePixelRatio || 1);
  const W = (cv.width = cv.clientWidth * dpr), H = (cv.height = Math.max(300, cv.clientHeight) * dpr);
  const c = cv.getContext('2d')!;
  const nb = route.nb;
  const iA = nb.locate(route.startS)[0], iB = nb.locate(route.endS)[0];
  const i0 = nb.locate(route.tripStart)[0], i1 = nb.locate(route.tripEnd)[0];
  let minX = Infinity, maxX = -Infinity, minZ = Infinity, maxZ = -Infinity;
  for (let i = iA; i <= iB; i++) { minX = Math.min(minX, nb.x[i]); maxX = Math.max(maxX, nb.x[i]); minZ = Math.min(minZ, nb.z[i]); maxZ = Math.max(maxZ, nb.z[i]); }
  const pad = 42 * dpr, k = Math.min((W - 2 * pad) / (maxX - minX + 1), (H - 2 * pad) / (maxZ - minZ));
  const ox = (W - (maxX - minX) * k) / 2;
  const P = (x: number, z: number): [number, number] => [ox + (x - minX) * k, H - pad - (z - minZ) * k];
  const g = c.createLinearGradient(0, 0, W, H); g.addColorStop(0, '#263e32'); g.addColorStop(0.5, '#3f5a3c'); g.addColorStop(1, '#28413a');
  c.fillStyle = g; c.fillRect(0, 0, W, H);
  c.strokeStyle = 'rgba(210,225,210,.18)'; c.lineWidth = 1 * dpr;
  for (const st of route.file.streets) { c.beginPath(); for (let j = 0; j < st.p.length; j += 2) { const [a, b] = P(st.p[j], st.p[j + 1]); if (j) c.lineTo(a, b); else c.moveTo(a, b); } c.stroke(); }
  const path = (a: number, b: number) => { c.beginPath(); for (let i = a; i <= b; i++) { const [x, y] = P(nb.x[i], nb.z[i]); if (i === a) c.moveTo(x, y); else c.lineTo(x, y); } c.stroke(); };
  c.lineJoin = c.lineCap = 'round';
  c.strokeStyle = 'rgba(200,215,225,.45)'; c.lineWidth = 5 * dpr; path(iA, iB);
  c.strokeStyle = '#1688ff'; c.lineWidth = 7 * dpr; c.shadowColor = '#1688ff'; c.shadowBlur = 12 * dpr; path(i0, i1); c.shadowBlur = 0;
  const pin = (x: number, y: number, color: string, label: string, big: boolean) => {
    c.fillStyle = '#fff'; c.strokeStyle = color; c.lineWidth = (big ? 5 : 3) * dpr;
    c.beginPath(); c.arc(x, y, (big ? 9 : 5) * dpr, 0, 7); c.fill(); c.stroke();
    c.font = `800 ${(big ? 14 : 11) * dpr}px Inter, Arial`; c.textBaseline = 'middle';
    const w = c.measureText(label).width + 12 * dpr;
    c.fillStyle = 'rgba(11,21,29,.85)'; c.fillRect(x + 14 * dpr, y - 11 * dpr, w, 22 * dpr);
    c.fillStyle = '#fff'; c.fillText(label, x + 20 * dpr, y);
  };
  for (const l of route.file.landmarks) {
    const p = nb.sample(l.s), [x, y] = P(p.x, p.z);
    const isStart = Math.abs(l.s - route.tripStart) < 5, isEnd = Math.abs(l.s - route.tripEnd) < 5;
    pin(x, y, isStart ? '#1688ff' : isEnd ? '#ff5f68' : '#56b2ff', l.name, isStart || isEnd);
  }
  c.fillStyle = 'rgba(255,255,255,.6)'; c.font = `600 ${10 * dpr}px Inter, Arial`; c.textBaseline = 'alphabetic';
  c.fillText('Map data © OpenStreetMap contributors', 10 * dpr, H - 8 * dpr);
  c.fillText('N ↑', W - 36 * dpr, 20 * dpr);
}
