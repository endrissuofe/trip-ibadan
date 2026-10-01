// Lists or downloads the free files of a Quaternius pack from itch.io (CC0).
// Uses itch.io's normal "No thanks, just take me to the downloads" flow.
// Usage: node tools/assets/fetch-quaternius.mjs <game-slug> [filename-substring-to-download]
//   e.g. node tools/assets/fetch-quaternius.mjs universal-base-characters            (list)
//        node tools/assets/fetch-quaternius.mjs universal-base-characters glTF       (download matches)
import { mkdir, writeFile } from 'node:fs/promises';

const [, , slug, want] = process.argv;
const base = `https://quaternius.itch.io/${slug}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Trip_Ibadan-asset-fetch';
let jar = '';
async function req(url, opts = {}, tries = 4) {
  for (let i = 0; ; i++) {
    try {
      const res = await fetch(url, { ...opts, headers: { 'User-Agent': UA, Cookie: jar, ...(opts.headers ?? {}) }, redirect: 'follow' });
      const set = res.headers.getSetCookie?.() ?? [];
      if (set.length) jar = [...new Set([...jar.split('; ').filter(Boolean), ...set.map((c) => c.split(';')[0])])].join('; ');
      if (!res.ok) throw new Error(`${url} -> HTTP ${res.status}`);
      return res;
    } catch (e) { if (i >= tries - 1) throw e; await new Promise((r) => setTimeout(r, 2500)); }
  }
}
const form = (o) => ({ method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'X-Requested-With': 'XMLHttpRequest', Referer: base }, body: new URLSearchParams(o).toString() });

const page = await (await req(base)).text();
const csrf = page.match(/name="csrf_token" value="([^"]+)"/)?.[1];
if (!csrf) throw new Error('no csrf token on the game page');
const { url: dlPage } = await (await req(`${base}/download_url`, form({ csrf_token: csrf }))).json();
const html = await (await req(dlPage)).text();
const key = dlPage.split('/download/')[1];
if (process.env.DUMP) await writeFile('tools/assets/raw/quaternius/_page.html', html);
const files = [...html.matchAll(/upload_id="(\d+)"[\s\S]{0,1500}?class="name">([^<]+)<[\s\S]{0,500}?class="file_size">\s*(?:<span>)?([^<]+)</g)].map((m) => ({ id: m[1], name: m[2].trim(), size: m[3].trim() }));
if (!files.length) throw new Error('no files found on the download page');
for (const f of files) console.log(`${f.id}  ${f.size.padStart(9)}  ${f.name}`);
if (!want) process.exit(0);

await mkdir('tools/assets/raw/quaternius', { recursive: true });
for (const f of files.filter((x) => x.name.toLowerCase().includes(want.toLowerCase()))) {
  const j = await (await req(`${base}/file/${f.id}?source=game_download&after_download_lightbox=1`, form({ csrf_token: csrf }))).json();
  if (!j.url) throw new Error("no download url: " + JSON.stringify(j));
  const url = j.url;
  const buf = Buffer.from(await (await req(url)).arrayBuffer());
  await writeFile(`tools/assets/raw/quaternius/${f.name}`, buf);
  console.log(`downloaded ${f.name} (${(buf.length / 1048576).toFixed(1)} MB)`);
}
