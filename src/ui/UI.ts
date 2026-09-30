// UI system: DOM screens over the 3D canvas (start, vehicle, trip, pre-trip, HUD,
// pause, result, garage, places, settings) and the touch controls.
import { VEHICLES, VehicleDef } from '../data/vehicles';
import { TRIPS, TripDef, fareFor } from '../data/trips';
import type { Route } from '../map/Route';
import type { SaveData, Settings } from '../systems/Save';
import type { NavState } from '../systems/Navigation';
import type { TripResult } from '../systems/TripSystems';
import type { Found } from '../systems/Discovery';
import { Discovery } from '../systems/Discovery';
import { CATEGORY_ICON, CATEGORY_LABEL, HERO } from '../data/places';
import { VEHICLE_SVG } from './icons';
import { Minimap, drawTripMap } from './Minimap';

export type MenuView = 'start' | 'vehicle' | 'trip' | 'pretrip' | 'garage' | 'settings' | 'places';

export interface GameApi {
  save: SaveData;
  route: Route;
  trip: TripDef;
  vehicle: VehicleDef;
  setVehicle(id: string): void;
  owns(id: string): boolean;
  buyVehicle(id: string): boolean;
  selectTrip(id: string): void;
  tripUnlocked(t: TripDef): boolean;
  totalStars(): number;
  enterMenu(view: MenuView): void;
  startDrive(): void;
  depart(): void;
  pause(): void; resume(): void; restart(): void; quitToMenu(): void;
  toggleCamera(): void;
  applySettings(s: Settings): void;
  click(): void;
}

export interface TouchInput { left: boolean; right: boolean; accel: boolean; brake: boolean; horn: boolean; tilt: number | null }

export interface HudState {
  nav: NavState; kmh: number; limit: number; condition: number; fuel: number;
  x: number; z: number; heading: number;
  aboard: number; capacity: number; comfort: number; earned: number;
  phase: string; queue: number;
  next: { name: string; drop: number; wait: number } | null;
  places: string;
}

const $ = (html: string) => { const t = document.createElement('template'); t.innerHTML = html.trim(); return t.content.firstElementChild as HTMLElement; };
const fmtKm = (m: number) => (m >= 1000 ? `${(m / 1000).toFixed(m >= 10000 ? 0 : 1)} km` : `${Math.round(m / 10) * 10} m`);
const fmtTime = (s: number) => { const m = Math.floor(s / 60), r = Math.round(s % 60); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min ${String(r).padStart(2, '0')} s`; };
const naira = (n: number) => `₦${Math.round(n).toLocaleString()}`;
const starStr = (n: number, of = 3) => '★'.repeat(n) + '☆'.repeat(Math.max(0, of - n));
const svgFor = (v: VehicleDef) => VEHICLE_SVG[v.model === 'sienna' ? 'sienna' : v.model === 'minibus' ? 'bus' : v.id] ?? VEHICLE_SVG.bus;

export class UI {
  readonly input: TouchInput = { left: false, right: false, accel: false, brake: false, horn: false, tilt: null };
  private cur: HTMLElement | null = null;
  private hudEls: Record<string, HTMLElement> = {};
  private minimap: Minimap | null = null;
  private toastTimer = 0;
  private cardTimer = 0;
  private lastHud = '';
  private vehicleIdx = 0;
  private settingsReturn: 'start' | 'pause' = 'start';

  constructor(private root: HTMLElement, private game: GameApi) {
    window.addEventListener('deviceorientation', (e) => {
      if (this.game.save.settings.controls !== 'tilt' || e.beta == null || e.gamma == null) { this.input.tilt = null; return; }
      const angle = (screen.orientation?.angle ?? (window as unknown as { orientation?: number }).orientation ?? 0) as number;
      const raw = angle === 90 ? e.beta : angle === -90 || angle === 270 ? -e.beta : e.gamma;
      this.input.tilt = Math.max(-1, Math.min(1, raw / 22));
    });
  }

  private mount(el: HTMLElement) {
    this.cur?.remove();
    this.cur = el;
    this.root.appendChild(el);
    el.querySelectorAll('button').forEach((b) => b.addEventListener('click', () => this.game.click()));
    return el;
  }

  // ------------------------------------------------------------------ loading
  loading(p: number, label: string) {
    if (!this.cur?.classList.contains('loading')) {
      this.mount($(`<div class="screen loading"><div style="width:min(420px,86vw)"><div class="logo">TRIP_IBADAN</div><div class="logo-rule"></div>
        <div class="muted" style="margin-bottom:26px">Lagos → Ibadan · real road</div>
        <div class="bar"><i data-p style="width:0%"></i></div><div class="muted" data-l style="margin-top:10px;font-size:13px"></div></div></div>`));
    }
    (this.cur!.querySelector('[data-p]') as HTMLElement).style.width = `${Math.round(p * 100)}%`;
    (this.cur!.querySelector('[data-l]') as HTMLElement).textContent = label;
  }

  error(msg: string) {
    this.mount($(`<div class="screen loading"><div class="panel" style="max-width:460px"><h2>Couldn't start the trip</h2><p class="muted">${msg}</p><button class="btn primary" onclick="location.reload()">Try again</button></div></div>`));
  }

  // ------------------------------------------------------------------ start
  start() {
    const s = this.game.save;
    const found = s.discovered.length, total = this.game.route.file.pois.length;
    const el = this.mount($(`<div class="screen start shade-l"><div class="col">
      <div class="logo">TRIP_IBADAN</div><div class="logo-rule"></div>
      <div class="sub">Lagos <span style="color:var(--blue2)">→</span> Ibadan</div>
      <div class="wallet"><span>💰 ${naira(s.wallet)}</span><span>⭐ ${this.game.totalStars()}</span><span>📍 ${found}/${total}</span></div>
      <div class="stack" style="max-width:300px">
        <button class="btn primary" data-a="start">Start trip</button>
        <button class="btn" data-a="garage">Garage</button>
        <button class="btn" data-a="places">Places</button>
        <button class="btn" data-a="settings">Settings</button>
      </div></div>
      <div class="credit">Road data © OpenStreetMap contributors · Elevation: AWS Terrain Tiles</div></div>`));
    el.querySelector('[data-a=start]')!.addEventListener('click', () => this.game.enterMenu('vehicle'));
    el.querySelector('[data-a=garage]')!.addEventListener('click', () => this.game.enterMenu('garage'));
    el.querySelector('[data-a=places]')!.addEventListener('click', () => this.game.enterMenu('places'));
    el.querySelector('[data-a=settings]')!.addEventListener('click', () => { this.settingsReturn = 'start'; this.game.enterMenu('settings'); });
  }

  // ------------------------------------------------------------------ vehicle
  vehicle() {
    const owned = VEHICLES.filter((v) => this.game.owns(v.id));
    this.vehicleIdx = Math.max(0, owned.findIndex((v) => v.id === this.game.vehicle.id));
    const render = () => {
      const v = owned[this.vehicleIdx];
      const bars = (label: string, icon: string, val: number, max: number, txt: string) =>
        `<div class="stat"><span>${icon}</span><span>${label}</span><div class="bar"><i style="width:${Math.min(100, (val / max) * 100)}%"></i></div><b>${txt}</b></div>`;
      const el = this.mount($(`<div class="screen select shade-b"><div></div>
        <div class="panel vcard">
          <div class="muted" style="font-size:12px;letter-spacing:.12em">CHOOSE YOUR RIDE</div>
          <div class="vhead" style="margin:6px 0 2px"><button class="arrow" data-a="prev" aria-label="Previous vehicle">‹</button>
            <div style="text-align:center"><h2>${v.name}</h2><div class="muted" style="font-size:13px">${v.tagline}</div></div>
            <button class="arrow" data-a="next" aria-label="Next vehicle">›</button></div>
          ${bars('Passengers', '👥', v.passengerCapacity, 18, String(v.passengerCapacity))}
          ${bars('Speed', '⏱', v.ratings.speed, 10, `${v.ratings.speed}/10`)}
          ${bars('Handling', '🛞', v.ratings.handling, 10, `${v.ratings.handling}/10`)}
          ${bars('Fuel efficiency', '⛽', v.ratings.fuel, 10, `${v.ratings.fuel}/10`)}
          <button class="btn primary wide" data-a="select" style="margin-top:8px">Select</button>
          <div class="thumbs">${owned.map((o, i) => `<div class="thumb ${i === this.vehicleIdx ? 'on' : ''}" data-i="${i}">${svgFor(o)}${o.name}</div>`).join('')}</div>
          <button class="btn wide" data-a="back" style="margin-top:10px">Back</button>
        </div></div>`));
      el.querySelector('[data-a=prev]')!.addEventListener('click', () => { this.vehicleIdx = (this.vehicleIdx + owned.length - 1) % owned.length; this.game.setVehicle(owned[this.vehicleIdx].id); render(); });
      el.querySelector('[data-a=next]')!.addEventListener('click', () => { this.vehicleIdx = (this.vehicleIdx + 1) % owned.length; this.game.setVehicle(owned[this.vehicleIdx].id); render(); });
      el.querySelectorAll('.thumb').forEach((t) => t.addEventListener('click', () => { this.vehicleIdx = +(t as HTMLElement).dataset.i!; this.game.setVehicle(owned[this.vehicleIdx].id); render(); }));
      el.querySelector('[data-a=select]')!.addEventListener('click', () => this.game.enterMenu('trip'));
      el.querySelector('[data-a=back]')!.addEventListener('click', () => this.game.enterMenu('start'));
    };
    this.game.setVehicle(owned[this.vehicleIdx].id);
    render();
  }

  // ------------------------------------------------------------------ trip
  trip() {
    const r = this.game.route;
    const t = this.game.trip;
    const km = r.tripLength / 1000;
    const stops = r.stopsBetween(r.tripStart, r.tripEnd);
    const list = TRIPS.map((x) => {
      const open = this.game.tripUnlocked(x);
      const st = this.game.save.stars[x.id] ?? 0;
      return `<button class="tripitem ${x.id === t.id ? 'on' : ''}" data-t="${x.id}" ${open ? '' : 'disabled'}>
        <b>${x.from} → ${x.to}</b><span class="stars">${open ? starStr(st) : `🔒 ${x.unlock?.stars}★ to unlock`}</span></button>`;
    }).join('');
    const el = this.mount($(`<div class="screen trip center"><div class="wrap">
      <div class="panel">
        <div class="muted" style="font-size:12px;letter-spacing:.12em">SELECT TRIP</div>
        <div class="triplist">${list}</div>
        <div class="muted" style="font-size:13px;margin:8px 0">${t.blurb}</div>
        <ul class="stops compact"><li>${t.from}</li>${stops.slice(0, -1).map((s) => `<li class="dim">${s.name}</li>`).join('')}<li class="end">${t.to}</li></ul>
        <div class="kv"><span class="muted">Distance</span><b>${km.toFixed(1)} km (real road)</b></div>
        <div class="kv"><span class="muted">Fare to ${t.to}</span><b>${naira(fareFor(km))} per seat</b></div>
        <div class="kv"><span class="muted">Road</span><b>Lagos–Ibadan Expressway</b></div>
        <div class="stack" style="margin-top:14px"><button class="btn primary" data-a="go">Start trip</button><button class="btn" data-a="back">Back</button></div>
      </div>
      <div class="panel" style="padding:8px"><canvas class="tripmap"></canvas></div>
    </div></div>`));
    const cv = el.querySelector('canvas') as HTMLCanvasElement;
    requestAnimationFrame(() => drawTripMap(cv, r));
    el.querySelectorAll('[data-t]').forEach((b) => b.addEventListener('click', () => { this.game.selectTrip((b as HTMLElement).dataset.t!); this.trip(); }));
    el.querySelector('[data-a=go]')!.addEventListener('click', () => this.game.enterMenu('pretrip'));
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.game.enterMenu('vehicle'));
  }

  // ------------------------------------------------------------------ pre-trip
  pretrip() {
    const r = this.game.route, v = this.game.vehicle, t = this.game.trip;
    const km = r.tripLength / 1000;
    const stops = r.stopsBetween(r.tripStart, r.tripEnd);
    const el = this.mount($(`<div class="screen pretrip shade-l"><div class="panel">
      <h2>YOUR TRIP</h2>
      <ul class="stops compact" style="margin:12px 0 6px"><li>${t.from} Park</li>${stops.slice(0, -1).map((s) => `<li class="dim">${s.name}</li>`).join('')}<li class="end">${t.to}</li></ul>
      <div class="kv"><span class="muted">Distance</span><b>${km.toFixed(1)} km</b></div>
      <div class="kv"><span class="muted">Vehicle</span><b>${v.name} · ${v.passengerCapacity} seats</b></div>
      <div class="kv"><span class="muted">Passengers</span><b>Load at the park, drop at their stops</b></div>
      <div class="kv" style="border:0"><span class="muted">Fuel</span><b>100%</b></div><div class="bar"><i style="width:100%"></i></div>
      <div class="kv" style="border:0"><span class="muted">Vehicle condition</span><b>100%</b></div><div class="bar green"><i style="width:100%"></i></div>
      <p class="muted" style="font-size:13px">Traffic jams at Berger, Kara and Arepo: cut through the inner streets. Watch for Chowdeck and Glovo riders!</p>
      <div class="stack"><button class="btn primary" data-a="drive">Drive</button><button class="btn" data-a="back">Change trip</button></div>
    </div></div>`));
    el.querySelector('[data-a=drive]')!.addEventListener('click', () => this.game.startDrive());
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.game.enterMenu('trip'));
  }

  // ------------------------------------------------------------------ HUD
  hud() {
    const touch = matchMedia('(pointer: coarse)').matches;
    const el = this.mount($(`<div class="hud">
      <div class="hbox nav-card"><div class="ico" data-h="ico">↑</div><div><div class="t" data-h="t"></div><div class="d" data-h="d"></div><div class="s" data-h="s"></div></div></div>
      <div class="hbox status">
        <div class="lab"><span>Vehicle</span><b data-h="condT"></b></div><div class="bar green"><i data-h="cond"></i></div>
        <div class="lab" style="margin-top:5px"><span>Fuel</span><b data-h="fuelT"></b></div><div class="bar"><i data-h="fuel"></i></div>
        <div class="lab" style="margin-top:5px"><span>Comfort</span><b data-h="comfT"></b></div><div class="bar amber"><i data-h="comf"></i></div>
        <div class="lab" style="margin-top:6px"><span>👥 <b data-h="pax"></b></span><span>💰 <b data-h="earn"></b></span><span>📍 <b data-h="places"></b></span></div>
        <div class="nextstop" data-h="next"></div>
      </div>
      <div class="hbox progress"><div class="bar"><i data-h="prog"></i></div><div class="row"><span data-h="rem"></span><span data-h="pct"></span></div></div>
      <div class="hbox speed"><div class="v" data-h="kmh">0</div><div class="u">km/h</div></div>
      <div class="limit" data-h="limit">100</div>
      <div class="mm"><canvas width="300" height="300"></canvas></div>
      <button class="hudbtn" style="right:calc(${touch ? 176 : 190}px + var(--safe-r))" data-a="pause" aria-label="Pause">❚❚</button>
      <button class="hudbtn" style="right:calc(${touch ? 226 : 240}px + var(--safe-r))" data-a="cam" aria-label="Camera">🎥</button>
      <div class="toast" data-h="toast"></div>
      <div class="found" data-h="found"></div>
      <div class="feed" data-h="feed"></div>
      <div class="loadpanel hbox" data-h="load"><div><b data-h="loadT"></b><div class="muted" style="font-size:12px">Passengers are boarding. Accelerate or tap Depart when ready.</div></div><button class="btn primary" data-a="depart">Depart</button></div>
      ${touch ? `<div class="ctl left"><button class="circle" data-k="left" aria-label="Steer left">◀</button><button class="circle" data-k="right" aria-label="Steer right">▶</button></div>
      <div class="ctl right"><button class="circle small" data-k="horn">HORN</button><button class="pedal brake" data-k="brake">BRAKE</button><button class="pedal accel" data-k="accel">ACCEL</button></div>`
        : `<div class="keys-hint">W/↑ accelerate · S/↓ brake/reverse · A D/← → steer · Space horn · C camera · Esc pause</div>`}
      <div class="rotate ${touch ? 'need' : ''}">↻ Turn your phone sideways to drive</div>
    </div>`));
    this.hudEls = {};
    el.querySelectorAll('[data-h]').forEach((n) => (this.hudEls[(n as HTMLElement).dataset.h!] = n as HTMLElement));
    this.minimap = new Minimap(el.querySelector('.mm canvas') as HTMLCanvasElement, this.game.route);
    el.querySelector('[data-a=pause]')!.addEventListener('click', () => this.game.pause());
    el.querySelector('[data-a=cam]')!.addEventListener('click', () => this.game.toggleCamera());
    el.querySelector('[data-a=depart]')!.addEventListener('click', () => this.game.depart());
    el.querySelectorAll('[data-k]').forEach((b) => {
      const k = (b as HTMLElement).dataset.k as 'left' | 'right' | 'accel' | 'brake' | 'horn';
      const on = (e: Event) => { e.preventDefault(); this.input[k] = true; b.classList.add('pressed'); };
      const off = (e: Event) => { e.preventDefault(); this.input[k] = false; b.classList.remove('pressed'); };
      b.addEventListener('pointerdown', on); b.addEventListener('pointerup', off); b.addEventListener('pointercancel', off); b.addEventListener('pointerleave', off);
      b.addEventListener('contextmenu', (e) => e.preventDefault());
    });
    this.lastHud = '';
  }

  updateHud(h: HudState, dots: (cb: (x: number, z: number, color: string, size?: number) => void) => void) {
    const E = this.hudEls;
    if (!E.kmh) return;
    const kmh = Math.round(Math.abs(h.kmh));
    const nextTxt = h.next ? `🚏 ${h.next.name}: ${h.next.drop ? `${h.next.drop} drop` : ''}${h.next.drop && h.next.wait ? ' · ' : ''}${h.next.wait ? `${h.next.wait} waiting` : ''}${!h.next.drop && !h.next.wait ? 'final stop' : ''}` : '';
    const key = [h.nav.icon, h.nav.text, h.nav.sub, Math.round(h.nav.distM / 100), kmh, h.limit, Math.round(h.condition), Math.round(h.fuel), Math.round(h.comfort), Math.round(h.nav.progress * 200), h.aboard, h.earned, h.places, nextTxt, h.phase, h.queue].join('|');
    if (key !== this.lastHud) {
      this.lastHud = key;
      E.ico.textContent = h.nav.icon;
      E.t.textContent = h.nav.text;
      E.d.textContent = fmtKm(h.nav.distM);
      E.s.textContent = h.nav.sub;
      E.kmh.textContent = String(kmh);
      E.limit.textContent = String(h.limit);
      E.limit.classList.toggle('over', kmh > h.limit + 7);
      E.cond.style.width = `${h.condition}%`; E.condT.textContent = `${Math.round(h.condition)}%`;
      E.cond.parentElement!.className = `bar ${h.condition > 60 ? 'green' : h.condition > 30 ? 'amber' : 'red'}`;
      E.fuel.style.width = `${h.fuel}%`; E.fuelT.textContent = `${Math.round(h.fuel)}%`;
      E.fuel.parentElement!.className = `bar ${h.fuel > 25 ? '' : 'red'}`;
      E.comf.style.width = `${h.comfort}%`; E.comfT.textContent = h.comfort > 80 ? '😊' : h.comfort > 55 ? '😐' : h.comfort > 30 ? '😣' : '😡';
      E.pax.textContent = `${h.aboard}/${h.capacity}`;
      E.earn.textContent = naira(h.earned);
      E.places.textContent = h.places;
      E.next.textContent = nextTxt;
      E.prog.style.width = `${h.nav.progress * 100}%`;
      E.rem.textContent = `${fmtKm(h.nav.remainingM)} to ${this.game.trip.to}`;
      E.pct.textContent = `${Math.round(h.nav.progress * 100)}%`;
      E.load.style.display = h.phase === 'loading' ? 'flex' : 'none';
      E.loadT.textContent = `Loading at ${this.game.trip.from} Park · ${h.aboard}/${h.capacity}`;
    }
    this.minimap?.draw(h.x, h.z, h.heading, dots);
  }

  toast(msg: string, ms = 2600) {
    const t = this.hudEls.toast; if (!t) return;
    t.textContent = msg; t.classList.add('on');
    clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => t.classList.remove('on'), ms);
  }

  /** Passenger/money messages stacked at the side. */
  feed(msg: string, tone: 'good' | 'bad' | 'info') {
    const f = this.hudEls.feed; if (!f) return;
    const n = $(`<div class="fi ${tone}"></div>`); n.textContent = msg;
    f.prepend(n);
    while (f.children.length > 3) f.lastElementChild!.remove();
    setTimeout(() => n.classList.add('out'), 4200); setTimeout(() => n.remove(), 5000);
  }

  discovered(f: Found) {
    const c = this.hudEls.found; if (!c) return;
    const hero = HERO[f.poi.name];
    c.innerHTML = '';
    c.appendChild($(`<div><div class="ic">${CATEGORY_ICON[f.poi.cat] ?? '📍'}</div><div><div class="k">${f.isNew ? 'NEW PLACE DISCOVERED' : 'YOU PASSED'}${f.bonus ? ` · +${naira(f.bonus)}` : ''}</div>
      <div class="n"></div><div class="c">${CATEGORY_LABEL[f.poi.cat] ?? 'Landmark'}${hero ? ` · ${hero.blurb}` : ''}</div></div></div>`));
    (c.querySelector('.n') as HTMLElement).textContent = f.poi.name;
    c.classList.add('on');
    clearTimeout(this.cardTimer);
    this.cardTimer = window.setTimeout(() => c.classList.remove('on'), hero ? 5200 : 3400);
  }

  releaseInputs() { Object.assign(this.input, { left: false, right: false, accel: false, brake: false, horn: false }); }

  // ------------------------------------------------------------------ pause
  pause() {
    const r = this.game.route;
    const el = this.mount($(`<div class="screen pause center"><div class="panel">
      <h2>PAUSED</h2><p class="muted">${this.game.trip.from} → ${this.game.trip.to} · ${(r.tripLength / 1000).toFixed(1)} km trip</p>
      <div class="stack"><button class="btn primary" data-a="resume">Resume</button><button class="btn" data-a="restart">Restart trip</button>
      <button class="btn" data-a="settings">Settings</button><button class="btn danger" data-a="quit">Quit to menu</button></div></div></div>`));
    el.querySelector('[data-a=resume]')!.addEventListener('click', () => this.game.resume());
    el.querySelector('[data-a=restart]')!.addEventListener('click', () => this.game.restart());
    el.querySelector('[data-a=settings]')!.addEventListener('click', () => { this.settingsReturn = 'pause'; this.settings(); });
    el.querySelector('[data-a=quit]')!.addEventListener('click', () => this.game.quitToMenu());
  }

  // ------------------------------------------------------------------ result
  result(res: TripResult, best: number, unlocked: string[]) {
    const t = this.game.trip;
    const el = this.mount($(`<div class="screen result shade-l" style="justify-content:flex-start"><div class="panel">
      <h2>${res.completed ? 'TRIP COMPLETE' : 'TRIP ENDED'}</h2>
      <div style="color:var(--blue2);font-weight:700">${t.from} → ${t.to}</div>
      <div class="bigstars">${starStr(res.stars)}</div>
      ${res.completed ? '' : `<div class="fail">${res.reason}</div>`}
      <ul class="missions">${res.missions.map((m) => `<li class="${m.done ? 'ok' : ''}">${m.done ? '✔' : '✘'} ${m.label}</li>`).join('')}</ul>
      <table>
        <tr><td>Passengers delivered</td><td>${res.delivered}${res.missed ? ` · ${res.missed} missed` : ''}</td></tr>
        <tr><td>Fares + tips</td><td>${naira(res.fares)} + ${naira(res.tips)}</td></tr>
        <tr><td>Passenger rating</td><td>${res.rating.toFixed(1)} ★</td></tr>
        <tr><td>Places discovered</td><td>${res.placesFound}${res.placesNew ? ` (${res.placesNew} new, +${naira(res.placeBonus)})` : ''}</td></tr>
        <tr><td>Distance · time</td><td>${res.distanceKm.toFixed(1)} km · ${fmtTime(res.timeS)}</td></tr>
        <tr><td>Damage · fuel used</td><td>${Math.round(res.damagePct)}% · ${Math.round(res.fuelUsedPct)}%</td></tr>
        <tr><td>Traffic violations</td><td>${res.violations}</td></tr>
      </table>
      <div style="display:flex;justify-content:space-between;align-items:flex-end;gap:10px">
        <div><div class="muted" style="font-size:12px;letter-spacing:.12em">TRIP SCORE</div><div class="score">${res.score.toLocaleString()}</div>
        <div class="muted" style="font-size:12px">${res.score >= best && res.completed ? 'New best!' : `Best: ${best.toLocaleString()}`}</div></div>
        <div style="text-align:right"><div class="muted" style="font-size:12px">EARNED</div><div class="earned">${naira(res.earnings)}</div></div>
      </div>
      ${unlocked.length ? `<div class="unlock">🔓 Unlocked: ${unlocked.join(', ')}</div>` : ''}
      <details style="margin-top:8px"><summary class="muted" style="font-size:13px">Score breakdown</summary>
        <table>${res.breakdown.map(([k, v]) => `<tr><td>${k}</td><td style="color:${v < 0 ? 'var(--red)' : 'inherit'}">${v > 0 ? '+' : ''}${v.toLocaleString()}</td></tr>`).join('')}</table></details>
      <div class="stack" style="margin-top:12px"><button class="btn primary" data-a="again">${res.completed ? 'Next trip' : 'Try again'}</button><button class="btn" data-a="garage">Garage</button></div>
    </div></div>`));
    el.querySelector('[data-a=again]')!.addEventListener('click', () => (res.completed ? this.game.enterMenu('trip') : this.game.restart()));
    el.querySelector('[data-a=garage]')!.addEventListener('click', () => this.game.enterMenu('garage'));
  }

  // ------------------------------------------------------------------ garage
  garage() {
    const s = this.game.save;
    const el = this.mount($(`<div class="screen garage shade-b" style="align-items:flex-end"><div class="panel" style="width:100%">
      <div style="display:flex;justify-content:space-between;align-items:baseline;gap:10px;flex-wrap:wrap"><h2>GARAGE</h2><span class="muted">💰 ${naira(s.wallet)} · ⭐ ${this.game.totalStars()} · ${s.tripsCompleted} trips</span></div>
      <div class="row" style="margin-top:12px">${VEHICLES.map((v) => {
        const own = this.game.owns(v.id), soon = v.status === 'locked';
        const btn = soon ? `<button class="btn" disabled style="margin-top:8px;width:100%">Coming soon</button>`
          : own ? `<button class="btn primary" style="margin-top:8px;width:100%" data-sel="${v.id}">${v.id === this.game.vehicle.id ? 'Selected' : 'Select'}</button>`
          : `<button class="btn ${s.wallet >= v.price ? 'primary' : ''}" style="margin-top:8px;width:100%" ${s.wallet >= v.price ? '' : 'disabled'} data-buy="${v.id}">Buy ${naira(v.price)}</button>`;
        return `<div class="gcard ${v.id === this.game.vehicle.id ? 'on' : ''}">${svgFor(v)}<b>${v.name}</b>
          <div class="muted" style="font-size:12px">${v.passengerCapacity} seats · ${own ? 'Owned' : soon ? 'Locked' : 'For sale'}</div>${btn}</div>`;
      }).join('')}</div>
      <button class="btn" data-a="back" style="margin-top:6px">Back</button></div></div>`));
    el.querySelectorAll('[data-sel]').forEach((b) => b.addEventListener('click', () => { this.game.setVehicle((b as HTMLElement).dataset.sel!); this.garage(); }));
    el.querySelectorAll('[data-buy]').forEach((b) => b.addEventListener('click', () => { if (this.game.buyVehicle((b as HTMLElement).dataset.buy!)) this.garage(); }));
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.game.enterMenu('start'));
  }

  // ------------------------------------------------------------------ places collection
  places() {
    const known = new Set(this.game.save.discovered);
    const pois = this.game.route.file.pois;
    const r = this.game.route;
    const el = this.mount($(`<div class="screen places center"><div class="panel" style="width:min(640px,100%)">
      <div style="display:flex;justify-content:space-between;align-items:baseline"><h2>PLACES</h2><span class="muted">${pois.filter((p) => known.has(Discovery.key(p))).length}/${pois.length} discovered</span></div>
      <p class="muted" style="font-size:13px;margin:4px 0 10px">Real places along the Lagos–Ibadan Expressway. Drive past them to add them to your collection.</p>
      <div class="plist">${pois.map((p) => {
        const k = known.has(Discovery.key(p));
        const km = ((p.s - r.startS) / 1000).toFixed(1);
        return `<div class="pi ${k ? '' : 'locked'}"><span class="pic">${k ? CATEGORY_ICON[p.cat] ?? '📍' : '❔'}</span><div><b>${k ? p.name : '???'}</b><div class="muted" style="font-size:12px">${k ? CATEGORY_LABEL[p.cat] ?? '' : 'Undiscovered'} · km ${km} from Ojota${HERO[p.name] ? ' · ★ landmark' : ''}</div></div></div>`;
      }).join('')}</div>
      <button class="btn wide" data-a="back" style="margin-top:10px">Back</button></div></div>`));
    el.querySelector('[data-a=back]')!.addEventListener('click', () => this.game.enterMenu('start'));
  }

  // ------------------------------------------------------------------ settings
  settings() {
    const cur = { ...this.game.save.settings };
    const el = this.mount($(`<div class="screen settings center"><div class="panel">
      <h2>SETTINGS</h2>
      <div class="set"><span>Graphics quality</span><select data-s="quality"><option value="high">High</option><option value="low">Low (faster)</option></select></div>
      <div class="set"><span>Sound volume</span><input type="range" min="0" max="1" step="0.05" data-s="sound"></div>
      <div class="set"><span>Music volume <span class="muted" style="font-size:12px">(radio coming soon)</span></span><input type="range" min="0" max="1" step="0.05" data-s="music"></div>
      <div class="set"><span>Controls</span><select data-s="controls"><option value="buttons">Touch buttons</option><option value="tilt">Tilt to steer</option></select></div>
      <div class="set"><span>Voice navigation</span><select data-s="voice"><option value="1">On</option><option value="0">Off</option></select></div>
      <div class="set"><span>Language</span><select data-s="language"><option value="en">English</option></select></div>
      <p class="muted" style="font-size:12px">Graphics quality changes tree and house density after the game reloads.</p>
      <button class="btn primary wide" data-a="save">Save &amp; back</button></div></div>`));
    const q = (k: string) => el.querySelector(`[data-s=${k}]`) as HTMLInputElement & HTMLSelectElement;
    q('quality').value = cur.quality; q('sound').value = String(cur.sound); q('music').value = String(cur.music);
    q('controls').value = cur.controls; q('voice').value = cur.voice ? '1' : '0'; q('language').value = cur.language;
    el.querySelector('[data-a=save]')!.addEventListener('click', async () => {
      const next: Settings = { quality: q('quality').value as Settings['quality'], sound: +q('sound').value, music: +q('music').value, controls: q('controls').value as Settings['controls'], voice: q('voice').value === '1', language: 'en' };
      if (next.controls === 'tilt') {
        const DOE = DeviceOrientationEvent as unknown as { requestPermission?: () => Promise<string> };
        if (DOE?.requestPermission) { try { await DOE.requestPermission(); } catch { /* denied */ } }
      }
      const reload = next.quality !== cur.quality;
      this.game.applySettings(next);
      if (reload) { location.reload(); return; }
      if (this.settingsReturn === 'pause') this.pause(); else this.game.enterMenu('start');
    });
  }
}
