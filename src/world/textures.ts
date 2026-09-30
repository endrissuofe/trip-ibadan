// Procedural textures (no downloads): asphalt, ground, signs, blob shadow.
import { DynamicTexture } from '@babylonjs/core/Materials/Textures/dynamicTexture';
import { Scene } from '@babylonjs/core/scene';
import { Texture } from '@babylonjs/core/Materials/Textures/texture';

function rand(seed: number) { return () => ((seed = (seed * 16807) % 2147483647) / 2147483647); }

export function asphaltTexture(scene: Scene) {
  const S = 256, t = new DynamicTexture('asphalt', S, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const r = rand(7);
  ctx.fillStyle = '#4a4c4e'; ctx.fillRect(0, 0, S, S);
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) {
    const v = (r() - 0.5) * 34;
    img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v;
  }
  ctx.putImageData(img, 0, 0);
  // patches and tyre polish
  for (let k = 0; k < 14; k++) { ctx.fillStyle = `rgba(${r() < 0.5 ? '30,30,32' : '90,90,90'},${0.08 + r() * 0.12})`; ctx.fillRect(r() * S, r() * S, 20 + r() * 70, 30 + r() * 90); }
  ctx.strokeStyle = 'rgba(25,25,25,0.5)'; ctx.lineWidth = 1;
  for (let k = 0; k < 6; k++) { ctx.beginPath(); let x = r() * S, y = r() * S; ctx.moveTo(x, y); for (let j = 0; j < 6; j++) { x += (r() - 0.5) * 30; y += r() * 25; ctx.lineTo(x, y); } ctx.stroke(); }
  t.update(); t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 8;
  return t;
}

export function groundTexture(scene: Scene) {
  const S = 512, t = new DynamicTexture('ground', S, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const r = rand(11);
  ctx.fillStyle = '#687d44'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 2600; k++) {
    const g = r();
    ctx.fillStyle = g < 0.55 ? `rgba(58,90,38,${0.25 + r() * 0.4})` : g < 0.85 ? `rgba(120,122,72,${0.2 + r() * 0.3})` : `rgba(140,98,62,${0.08 + r() * 0.14})`;
    const s = 2 + r() * 14; ctx.beginPath(); ctx.ellipse(r() * S, r() * S, s, s * (0.5 + r()), r() * 3, 0, 7); ctx.fill();
  }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const v = (r() - 0.5) * 22; img.data[i] += v; img.data[i + 1] += v; img.data[i + 2] += v * 0.6; }
  ctx.putImageData(img, 0, 0);
  t.update(); t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 4;
  return t;
}

export function blobTexture(scene: Scene) {
  const S = 64, t = new DynamicTexture('blob', S, scene, false);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const g = ctx.createRadialGradient(S / 2, S / 2, 2, S / 2, S / 2, S / 2);
  g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.35)'); g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, S, S);
  t.hasAlpha = true; t.update();
  return t;
}

/** Green expressway sign / white-on-colour board. Lines: [big, small?]. */
export function signTexture(scene: Scene, lines: string[], opts: { bg?: string; fg?: string; w?: number; h?: number; arrow?: string } = {}) {
  const W = opts.w ?? 512, H = opts.h ?? 256;
  const t = new DynamicTexture('sign', { width: W, height: H }, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  ctx.fillStyle = opts.bg ?? '#0b6b3a'; ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = '#fff'; ctx.lineWidth = 10; ctx.strokeRect(12, 12, W - 24, H - 24);
  ctx.fillStyle = opts.fg ?? '#fff'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  const big = Math.round(H * 0.3);
  ctx.font = `800 ${big}px Inter, Arial, sans-serif`;
  const x = opts.arrow ? W * 0.44 : W / 2;
  if (lines.length === 1) ctx.fillText(lines[0], x, H / 2);
  else { ctx.fillText(lines[0], x, H * 0.38); ctx.font = `600 ${Math.round(H * 0.19)}px Inter, Arial, sans-serif`; ctx.fillText(lines[1], x, H * 0.72); }
  if (opts.arrow) { ctx.font = `800 ${Math.round(H * 0.5)}px Arial`; ctx.fillText(opts.arrow, W * 0.86, H / 2); }
  t.update();
  return t;
}

/** Red laterite earth road with tyre ruts and potholes (untarred streets). */
export function dirtTexture(scene: Scene) {
  const S = 256, t = new DynamicTexture('dirt', S, scene, true);
  const ctx = t.getContext() as CanvasRenderingContext2D;
  const r = rand(23);
  ctx.fillStyle = '#9b5a34'; ctx.fillRect(0, 0, S, S);
  for (let k = 0; k < 900; k++) {
    const g = r();
    ctx.fillStyle = g < 0.5 ? `rgba(120,64,34,${0.2 + r() * 0.3})` : g < 0.85 ? `rgba(178,112,70,${0.15 + r() * 0.25})` : `rgba(80,48,30,${0.2 + r() * 0.3})`;
    const s = 1 + r() * 7; ctx.beginPath(); ctx.ellipse(r() * S, r() * S, s, s * (0.4 + r()), r() * 3, 0, 7); ctx.fill();
  }
  // tyre ruts along the road (v axis)
  for (const x of [S * 0.3, S * 0.7]) {
    const g = ctx.createLinearGradient(x - 14, 0, x + 14, 0);
    g.addColorStop(0, 'rgba(70,38,20,0)'); g.addColorStop(0.5, 'rgba(70,38,20,0.35)'); g.addColorStop(1, 'rgba(70,38,20,0)');
    ctx.fillStyle = g; ctx.fillRect(x - 14, 0, 28, S);
  }
  for (let k = 0; k < 5; k++) { ctx.fillStyle = 'rgba(55,32,20,0.55)'; ctx.beginPath(); ctx.ellipse(r() * S, r() * S, 6 + r() * 10, 4 + r() * 6, r() * 3, 0, 7); ctx.fill(); }
  const img = ctx.getImageData(0, 0, S, S);
  for (let i = 0; i < img.data.length; i += 4) { const v = (r() - 0.5) * 26; img.data[i] += v; img.data[i + 1] += v * 0.8; img.data[i + 2] += v * 0.6; }
  ctx.putImageData(img, 0, 0);
  t.update(); t.wrapU = t.wrapV = Texture.WRAP_ADDRESSMODE; t.anisotropicFilteringLevel = 4;
  return t;
}
