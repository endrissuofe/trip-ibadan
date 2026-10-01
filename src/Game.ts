// Orchestrates the systems and the screen flow:
// Start → Vehicle → Trip → Pre-trip → Load at the park → Drive & drop passengers → Trip complete.
import { Engine } from '@babylonjs/core/Engines/engine';
import { Scene } from '@babylonjs/core/scene';
import { ImageProcessingConfiguration } from '@babylonjs/core/Materials/imageProcessingConfiguration';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { Route, LANE_W } from './map/Route';
import { World } from './world/World';
import { Rigs } from './world/rigged';
import { TRIPS, TripDef, ROUTE_ID } from './data/trips';
import { VehicleDef, vehicleById, VEHICLES } from './data/vehicles';
import { PlayerVehicle, Controls, Gear } from './systems/Driving';
import { GameClock } from './systems/GameClock';
import { Traffic } from './systems/Traffic';
import { Riders } from './systems/Riders';
import { Passengers } from './systems/Passengers';
import { Discovery } from './systems/Discovery';
import { CameraRig } from './systems/CameraRig';
import { Navigation } from './systems/Navigation';
import { Fuel, Damage, RoadEvents, scoreTrip } from './systems/TripSystems';
import { Audio } from './systems/Audio';
import { loadSave, writeSave, SaveData, Settings } from './systems/Save';
import { UI, GameApi, MenuView } from './ui/UI';

type State = 'loading' | 'menu' | 'drive' | 'paused' | 'result';

export class Game implements GameApi {
  save: SaveData;
  route!: Route;
  world!: World;
  trip: TripDef;
  vehicle: VehicleDef;
  private engine: Engine;
  private scene: Scene;
  private ui: UI;
  private audio = new Audio();
  private rig!: CameraRig;
  private traffic!: Traffic;
  private riders!: Riders;
  private player: PlayerVehicle | null = null;
  private pax: Passengers | null = null;
  private discovery!: Discovery;
  private nav!: Navigation;
  private fuel!: Fuel;
  private damage!: Damage;
  private events!: RoadEvents;
  private state: State = 'loading';
  private view: MenuView = 'start';
  private keys = new Set<string>();
  private tripTime = 0;
  private throttle = 0; private brake = 0;
  private lastCue = '';
  private hornOn = false;
  private disabledT = 0;
  private ridersHit = 0;
  private lastSurface = 'expressway';
  clock = new GameClock();
  private hintCd = 0;
  private lookingBack = false;
  private disputeSeen = false;
  private lastBlink = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.save = loadSave();
    this.vehicle = vehicleById(this.save.selectedVehicle);
    if (!this.owns(this.vehicle.id)) this.vehicle = VEHICLES[0];
    this.trip = TRIPS.find((t) => t.id === this.save.selectedTrip) ?? TRIPS[0];
    this.audio.setVolume(this.save.settings.sound);
    const high = this.save.settings.quality === 'high';
    this.engine = new Engine(canvas, high, { preserveDrawingBuffer: false, stencil: false, powerPreference: 'high-performance' }, true);
    const dpr = window.devicePixelRatio || 1;
    this.engine.setHardwareScalingLevel(1 / (high ? Math.min(dpr, 1.75) : Math.min(dpr, 1) * 0.85));
    this.scene = new Scene(this.engine);
    this.scene.skipPointerMovePicking = true;
    const ip = this.scene.imageProcessingConfiguration;
    ip.toneMappingEnabled = true; ip.toneMappingType = ImageProcessingConfiguration.TONEMAPPING_ACES; ip.exposure = 1.1; ip.contrast = 1.1;
    this.ui = new UI(uiRoot, this);
    window.addEventListener('resize', () => this.engine.resize());
    window.addEventListener('keydown', (e) => this.onKey(e, true));
    window.addEventListener('keyup', (e) => this.onKey(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.ui.releaseInputs(); });
    document.addEventListener('visibilitychange', () => { if (document.hidden && this.state === 'drive') this.pause(); });
    window.addEventListener('pointerdown', () => this.audio.unlock());
  }

  async boot() {
    try {
      this.ui.loading(0.02, 'Loading the real Ojota → Mowe road');
      this.route = await Route.load(ROUTE_ID);
      this.route.setTrip(this.trip.fromId, this.trip.toId);
      await Rigs.load(this.scene);
      this.world = new World(this.scene, this.route, this.save.settings.quality);
      await this.world.build((p, l) => this.ui.loading(0.05 + p * 0.9, l));
      this.rig = new CameraRig(this.scene, this.world);
      this.scene.activeCamera = this.rig.cam;
      await this.world.enableRealLighting(this.rig.cam);
      this.rig.mirrorEnabled = this.save.settings.quality === 'high';
      const high = this.save.settings.quality === 'high';
      this.traffic = new Traffic(this.scene, this.world, high ? 1 : 0.7);
      this.riders = new Riders(this.scene, this.world, high ? 7 : 5);
      this.placeShowroom();
      this.traffic.spawnAround(this.player!);
      this.scene.executeWhenReady(() => this.enterMenu('start'));
      let last = performance.now();
      this.engine.runRenderLoop(() => {
        const now = performance.now();
        const dt = Math.min(0.05, (now - last) / 1000); last = now;
        this.frame(dt);
        this.scene.render();
      });
    } catch (e) {
      console.error(e);
      this.ui.error(e instanceof Error ? e.message : String(e));
    }
  }

  // ------------------------------------------------------------------ GameApi
  click() { this.audio.unlock(); this.audio.click(); }

  owns(id: string) { const v = vehicleById(id); return v.status === 'owned' && (v.price === 0 || this.save.owned.includes(id)); }
  buyVehicle(id: string) {
    const v = vehicleById(id);
    if (this.owns(id) || v.status !== 'owned' || this.save.wallet < v.price) return false;
    this.save.wallet -= v.price; this.save.owned.push(id); writeSave(this.save);
    this.setVehicle(id);
    this.audio.chime();
    return true;
  }
  totalStars() { return Object.values(this.save.stars).reduce((a, b) => a + b, 0); }
  tripUnlocked(t: TripDef) { return !t.unlock || this.totalStars() >= t.unlock.stars; }
  selectTrip(id: string) {
    const t = TRIPS.find((x) => x.id === id);
    if (!t || !this.tripUnlocked(t)) return;
    this.trip = t; this.save.selectedTrip = id; writeSave(this.save);
    this.route.setTrip(t.fromId, t.toId);
    this.placeShowroom(); this.traffic.spawnAround(this.player!); this.rig.snap();
  }

  setVehicle(id: string) {
    if (!this.owns(id)) return;
    this.vehicle = vehicleById(id); this.save.selectedVehicle = id; writeSave(this.save);
    if (this.state === 'menu') this.placeShowroom();
  }

  enterMenu(view: MenuView) {
    this.state = 'menu'; this.view = view;
    this.audio.silence();
    this.pax?.dispose(); this.pax = null;
    this.riders.clear();
    if (view === 'pretrip') { this.placeAtStart(); this.rig.mode = 'chase'; }
    else { this.placeShowroom(); this.rig.mode = 'orbit'; }
    this.rig.snap();
    const ui = this.ui;
    ({ start: () => ui.start(), vehicle: () => ui.vehicle(), trip: () => ui.trip(), pretrip: () => ui.pretrip(), garage: () => ui.garage(), settings: () => ui.settings(), places: () => ui.places() })[view]();
  }

  startDrive() {
    this.audio.unlock();
    this.placeAtStart();
    this.fuel = new Fuel(this.vehicle);
    this.damage = new Damage(this.vehicle);
    this.events = new RoadEvents(this.world.events, this.route.startS);
    this.nav = new Navigation(this.world, this.trip.to);
    this.nav.voice = this.save.settings.voice;
    this.discovery = new Discovery(this.route, new Set(this.save.discovered));
    this.pax?.dispose();
    this.pax = new Passengers(this.scene, this.world, this.player!, this.vehicle.passengerCapacity, this.trip.fromId, this.trip.toId, this.save.settings.fareMode);
    this.clock = new GameClock(this.save.settings.pace);
    this.tripTime = 0; this.throttle = 0; this.brake = 0; this.lastCue = ''; this.disabledT = 0; this.ridersHit = 0;
    this.traffic.spawnAround(this.player!);
    this.riders.spawn(this.player!);
    this.rig.mode = 'chase'; this.rig.snap();
    this.ui.releaseInputs();
    this.ui.hud();
    this.state = 'drive';
    this.ui.toast(`${this.trip.from} Park: passengers are boarding`);
    this.nav.speak(`Welcome to ${this.trip.from} park. Load your passengers, then head for ${this.trip.to}.`);
  }

  depart() {
    this.pax?.depart();
    // leaving the park: engage Drive for the player if they are still in Park/Neutral
    if (this.player && (this.player.gear === 'P' || this.player.gear === 'N')) this.setGear('D');
  }
  setGear(g: Gear) {
    const p = this.player; if (!p || this.state !== 'drive') return;
    const before = p.gear;
    const r = p.requestGear(g);
    if (!r.ok && r.reason) this.ui.toast(r.reason, 1600);
    else if (p.gear !== before) { this.audio.click(); this.ui.toast(GEAR_NAME[p.gear], 900); }
  }
  shiftGear(dir: 1 | -1) {
    const p = this.player; if (!p) return;
    const i = ['P', 'R', 'N', 'D'].indexOf(p.gear) + dir;
    if (i >= 0 && i < 4) this.setGear((['P', 'R', 'N', 'D'] as Gear[])[i]);
  }
  lookBack(on: boolean) { this.lookingBack = on; }
  collectFare() { this.pax?.collect(); }
  returnChange() { this.pax?.returnChange(); }
  resolveDispute(choice: 'check' | 'payout' | 'back') { this.pax?.resolveDispute(choice); }
  pause() { if (this.state !== 'drive') return; this.state = 'paused'; this.audio.silence(); this.ui.pause(); }
  resume() { if (this.state !== 'paused') return; this.state = 'drive'; this.ui.releaseInputs(); this.ui.hud(); }
  restart() { this.startDrive(); }
  quitToMenu() { this.traffic.spawnAround(this.player!); this.enterMenu('start'); }
  toggleCamera() {
    const order = ['chase', 'hood', 'cabin'] as const;
    const i = order.indexOf(this.rig.mode as typeof order[number]);
    this.rig.mode = order[(i + 1) % order.length]; this.rig.snap();
    this.ui.toast(CAM_NAME[this.rig.mode] ?? '', 900);
  }

  applySettings(s: Settings) {
    this.save.settings = s; writeSave(this.save);
    this.audio.setVolume(s.sound);
    if (this.nav) this.nav.voice = s.voice;
  }

  // ------------------------------------------------------------------ placement
  private ensurePlayer() {
    if (!this.player || this.player.def !== this.vehicle) {
      this.player?.dispose();
      this.player = new PlayerVehicle(this.scene, this.world, this.vehicle, this.route.tripStart, 0);
    }
    return this.player;
  }
  /** Parked on the shoulder at the trip's start park for the menus. */
  private placeShowroom() { const p = this.ensurePlayer(); const s = this.route.tripStart + 40; p.reset(s, this.route.nb.halfWidth(s) + 1.3); }
  /** In the loading bay at the start park. */
  private placeAtStart() { const p = this.ensurePlayer(); const s = this.route.tripStart - 8; p.reset(s, this.route.nb.halfWidth(s) - LANE_W / 2 + 0.6); }

  // ------------------------------------------------------------------ input
  private onKey(e: KeyboardEvent, down: boolean) {
    const k = e.key.toLowerCase();
    if (['arrowup', 'arrowdown', 'arrowleft', 'arrowright', ' '].includes(k)) e.preventDefault();
    if (down) this.audio.unlock();
    if (down && (k === 'escape' || k === 'p')) { if (this.state === 'drive') this.pause(); else if (this.state === 'paused') this.resume(); return; }
    if (down && k === 'c' && this.state === 'drive') { this.toggleCamera(); return; }
    if (down && k === 'enter' && this.state === 'drive') { this.depart(); return; }
    if (this.state === 'drive') {
      if (down && !e.repeat && k === 'e') { this.shiftGear(1); return; }
      if (down && !e.repeat && k === 'q') { this.shiftGear(-1); return; }
      if (down && !e.repeat && k === 'r') { this.setGear('R'); return; }
      if (down && !e.repeat && k === 'n') { this.setGear('N'); return; }
      if (k === 'b') { this.lookBack(down); return; }
      if (down && !e.repeat && (k === 'z' || k === 'x' || k === 'h')) { this.player?.toggleIndicator(k === 'z' ? 'left' : k === 'x' ? 'right' : 'hazard'); return; }
      if (down && !e.repeat && k === 'f') { const t = this.pax?.txnView(); if (t?.received === null) this.collectFare(); else this.returnChange(); return; }
      if (down && !e.repeat && k === 'm') { document.querySelector('.manifest')?.classList.toggle('hidden'); return; }
    }
    if (down) this.keys.add(k); else this.keys.delete(k);
  }

  private controls(dt: number): Controls {
    const K = this.keys, T = this.ui.input;
    const accel = K.has('w') || K.has('arrowup') || T.accel;
    const brake = K.has('s') || K.has('arrowdown') || T.brake;
    const left = K.has('a') || K.has('arrowleft') || T.left;
    const right = K.has('d') || K.has('arrowright') || T.right;
    this.throttle += ((accel ? 1 : 0) - this.throttle) * Math.min(1, dt * (accel ? 3 : 8));
    this.brake += ((brake ? 1 : 0) - this.brake) * Math.min(1, dt * 6);
    let steer = (right ? 1 : 0) - (left ? 1 : 0);
    if (T.tilt !== null && this.save.settings.controls === 'tilt' && !left && !right) steer = T.tilt;
    if (this.debugAutoSteer && this.player) { // dev/test only: keep lane
      const p = this.player, lane = this.debugAutoSteer;
      const look = 18 * this.clock.worldScale(p.v) + 10;
      steer = Math.max(-1, Math.min(1, (-Math.atan2(p.d - lane, look) - p.psi) * 4));
    }
    return { throttle: this.throttle, brake: this.brake, steer, horn: K.has(' ') || T.horn };
  }

  // ------------------------------------------------------------------ frame
  private frame(dt: number) {
    if (this.state === 'loading') return;
    this.world.update(dt);
    const p = this.player!;
    if (this.state === 'menu') {
      this.traffic.update(dt, this.view === 'pretrip' ? p : null);
      const shift = this.view === 'start' ? -3 : this.view === 'vehicle' || this.view === 'garage' ? 2.6 : 0;
      this.rig.update(dt, p, undefined, this.view === 'start' ? 15 : 10.5, shift);
      return;
    }
    if (this.state === 'paused') { this.rig.update(0, p); return; }
    if (this.state === 'result') { this.traffic.update(dt, null); this.rig.update(dt, p, undefined, 13, -3.2); return; }

    // --- driving
    const pax = this.pax!;
    this.tripTime += this.clock.tick(dt); // trip timer runs on GAME time
    const ctl = this.controls(dt);
    if (pax.phase === 'loading' && ctl.throttle > 0.3) this.depart();
    this.hintCd -= dt;
    if (ctl.throttle > 0.3 && (p.gear === 'P' || p.gear === 'N') && this.hintCd <= 0) {
      this.hintCd = 3; this.ui.toast(`In ${GEAR_NAME[p.gear]}: press E (or tap D) to drive, R to reverse`, 2200);
    }
    const engineOn = !this.fuel.empty && !this.damage.disabled;
    // World pace: player, traffic and riders all cover the real road `f` times faster when cruising.
    const f = this.clock.worldScale(p.v);
    const steps = Math.max(dt > 1 / 45 ? 2 : 1, Math.ceil(dt * f * 60));
    for (let i = 0; i < steps; i++) {
      p.update(dt / steps, ctl, engineOn, f);
      this.traffic.update((dt / steps) * f, p);
    }
    for (const hit of this.riders.update(dt * f, p)) {
      this.ridersHit++;
      this.events.add(`Knocked down a ${hit.brand} rider`, (p.s - this.route.startS) / 1000);
      this.ui.toast(`You knocked down a ${hit.brand} rider! −1,500`, 3200);
      this.audio.crash(hit.kmh);
    }
    if (ctl.horn && !this.hornOn) this.traffic.horn(p);
    this.hornOn = ctl.horn;
    this.audio.horn(ctl.horn);

    const limit = this.world.speedLimitAt(p.s, this.vehicle.speedLimit);
    // passengers (read impacts before damage clears them)
    for (const m of pax.update(dt, p, ctl, limit)) { this.ui.feed(m.text, m.tone); if (m.money) this.audio.click(); if (import.meta.env.DEV) this.debugFeed.push(m.text); }
    if (p.rescued) { p.rescued = false; this.ui.feed('Area boys pushed you back onto the road', 'info'); }
    if (p.blockedT > 5 && Math.abs(p.v) < 1 && p.gear === 'D' && this.hintCd <= 0) { this.hintCd = 8; this.ui.toast('Blocked: hold the brake to back out', 2400); }
    for (const imp of p.impacts) {
      const loss = this.damage.apply(imp);
      if (imp.kind !== 'rider') this.audio.crash(imp.kmh);
      if (imp.kmh >= 25 && imp.kind !== 'offroad' && imp.kind !== 'rider') this.ui.toast(`Heavy collision! −${Math.round(loss)}% condition`);
      else if (imp.kind === 'building' && imp.kmh > 10) this.ui.toast('Mind the buildings!');
    }
    p.impacts = [];
    this.fuel.update(dt * f, p.v, ctl.throttle);

    const msg = this.events.update(dt, p.s, p.kmh, limit, p.psi, p.onExpressway);
    if (msg) { this.ui.toast(msg, 3200); this.audio.chime(); }
    if (pax.disputeView() && !this.disputeSeen) { this.disputeSeen = true; this.audio.chime(); }
    if (!pax.disputeView()) this.disputeSeen = false;
    if (p.surface !== this.lastSurface) {
      if (p.surface === 'dirt') this.ui.toast(`Untarred road${p.streetName ? `: ${p.streetName}` : ''}. Passengers feel every bump!`);
      else if (p.surface === 'street') this.ui.toast(`Inner street${p.streetName ? `: ${p.streetName}` : ''}`);
      else if (p.surface === 'expressway' && this.lastSurface !== 'expressway') this.ui.toast('Back on the expressway');
      this.lastSurface = p.surface;
    }
    const found = this.discovery.update(p.s, p.d);
    if (found) { this.ui.discovered(found); if (found.isNew) this.audio.chime(); }

    const next = pax.nextStop(p.s);
    const stopCue = next && pax.phase !== 'loading' ? { name: next.stop.name, s: next.stop.s, detail: next.stop.id === this.trip.toId ? 'final stop · pull into the blue bay' : `${next.drop ? `${next.drop} to drop` : ''}${next.drop && next.wait ? ' · ' : ''}${next.wait ? `${next.wait} waiting` : ''} · blue bay on the right` } : null;
    const nav = this.nav.state(p, stopCue);
    const cueKey = nav.icon + nav.text;
    if (cueKey !== this.lastCue) { this.lastCue = cueKey; if (p.onExpressway && nav.text !== 'Continue straight') this.nav.speak(`${nav.text}. ${nav.sub}`); }

    this.audio.setReversing(p.gear === 'R');
    if (p.blinkOn !== this.lastBlink) { this.lastBlink = p.blinkOn; if (p.blinkOn) this.audio.tick(); }
    this.audio.drive(p.kmh, ctl.throttle, ctl.brake, p.surface === 'bush' || p.surface === 'dirt', engineOn, this.vehicle.type !== 'minivan');
    this.rig.lookBack = this.lookingBack;
    this.rig.update(dt, p);
    this.ui.updateHud({
      gear: p.gear, clock: this.clock.timeOfDay(), tripTime: this.tripTime,
      nav, kmh: p.kmh, limit, condition: this.damage.condition, fuel: this.fuel.level,
      x: p.pos.x, z: p.pos.z, heading: p.heading,
      aboard: pax.aboard.length, capacity: pax.capacity, comfort: pax.comfort, earned: pax.fares + pax.tips + this.discovery.bonus,
      phase: pax.phase, queue: pax.queueAtStart,
      manifest: pax.manifest(), txn: pax.txnView(), dispute: pax.disputeView(), cabin: this.rig.mode === 'cabin',
      next: next && pax.phase !== 'loading' ? { name: next.stop.name, drop: next.drop, wait: next.wait } : null,
      places: `${this.discovery.found.length}/${this.discovery.totalOnTrip()}`,
    }, (cb) => { this.traffic.forEach((x, z, side) => cb(x, z, side === 'nb' ? '#ffffff' : '#c9d6cf')); this.riders.forEach((x, z, c) => cb(x, z, c, 7)); });

    // --- trip end
    if (pax.phase === 'done') return this.finish(true, `Arrived at ${this.trip.to}`);
    if (p.s > this.route.tripEnd + 600) return this.finish(false, `You drove past ${this.trip.to} Park with passengers on board`);
    if (this.damage.disabled) { this.disabledT += dt; if (this.disabledT > 1.5 || Math.abs(p.v) < 0.5) return this.finish(false, 'Your vehicle is disabled. The trip ends here.'); }
    if (this.fuel.empty && Math.abs(p.v) < 0.3) return this.finish(false, 'Out of fuel before the destination.');
  }

  private finish(completed: boolean, reason: string) {
    const p = this.player!, pax = this.pax!;
    this.state = 'result';
    this.audio.silence();
    if (completed) this.audio.chime();
    const overshoot = reason.startsWith('You drove past') ? 1 : 0;
    const missedAboard = pax.aboard.length;
    const res = scoreTrip({
      completed, reason, def: this.vehicle, distanceM: p.odometer, timeS: this.tripTime, condition: this.damage.condition,
      fuelUsedPct: this.fuel.usedPct, violations: this.events.violations.length + overshoot, majorCollisions: this.damage.majorCollisions,
      minorHits: this.damage.minorHits, tripLengthM: this.route.tripLength,
      delivered: pax.delivered, missed: pax.missed + missedAboard, fares: pax.fares, tips: pax.tips, rating: pax.rating, ledger: pax.ledger,
      placeBonus: this.discovery.bonus, placesFound: this.discovery.found.length, placesNew: this.discovery.found.filter((f) => f.isNew).length, ridersHit: this.ridersHit,
    });
    const key = `${this.trip.id}:${this.vehicle.id}`;
    const best = Math.max(this.save.best[key] ?? 0, completed ? res.score : 0);
    const starsBefore = this.totalStars();
    const lockedBefore = TRIPS.filter((t) => !this.tripUnlocked(t)).map((t) => t.id);
    if (completed) { this.save.best[key] = best; this.save.tripsCompleted++; }
    this.save.wallet += res.earnings;
    this.save.stars[this.trip.id] = Math.max(this.save.stars[this.trip.id] ?? 0, res.stars);
    this.save.discovered = [...new Set([...this.save.discovered, ...this.discovery.found.map((f) => Discovery.key(f.poi))])];
    writeSave(this.save);
    const unlocked = this.totalStars() > starsBefore ? TRIPS.filter((t) => lockedBefore.includes(t.id) && this.tripUnlocked(t)).map((t) => `${t.from} → ${t.to}`) : [];
    const buyable = VEHICLES.filter((v) => v.status === 'owned' && !this.owns(v.id) && this.save.wallet >= v.price && this.save.wallet - res.earnings < v.price).map((v) => `${v.name} (garage)`);
    this.nav.speak(completed ? `Trip complete. You have arrived at ${this.trip.to}.` : 'Trip ended.');
    this.rig.mode = 'orbit'; this.rig.snap();
    this.ui.result(res, best, [...unlocked, ...buyable]);
  }

  /** Debug hook for automated checks: jump along the route (km from the trip start). */
  debugTeleport(km: number, d?: number) { if (this.player) { const s = this.route.tripStart + km * 1000; this.player.reset(s, d ?? this.route.nb.halfWidth(s) - LANE_W / 2); this.pax?.depart(); this.player.gear = 'D'; } }
  /** Debug hook: run the simulation for `frames` fixed steps with the given keys held (no rendering). */
  debugStep(frames: number, keys: string[] = [], dt = 1 / 60) {
    this.keys.clear(); for (const k of keys) this.keys.add(k);
    for (let i = 0; i < frames; i++) this.frame(dt);
    this.keys.clear();
    return this.debug;
  }
  debugRender() { this.scene.render(); }
  debugPax() {
    const x = this.pax; if (!x) return null;
    return { phase: x.phase, aboard: x.aboard.length, seatsFree: x.seatsFree, manifest: x.manifest(), txn: x.txnView(), dispute: x.disputeView(), ledger: { ...x.ledger, net: x.ledger.net }, float: x.float.total, delivered: x.delivered, missed: x.missed, tips: x.tips, states: x.aboard.map((p) => p.state) };
  }
  /**
   * Dev/test only: export a stand-in GLB that follows the asset contract (a recoloured body plus
   * light_* nodes) and load it through the real model pipeline.
   */
  async debugModelPipeline() {
    if (!import.meta.env.DEV || !this.player) return null;
    const { GLTF2Export } = await import('@babylonjs/serializers/glTF/2.0');
    const { buildVehicle, vehicleMaterial } = await import('./world/models');
    const { TransformNode } = await import('@babylonjs/core/Meshes/transformNode');
    const body = buildVehicle(this.scene, 'suv', '#8e1b1b', 'contract_test_body');
    body.material = vehicleMaterial(this.scene);
    const L = TransformNode; const a = new L('light_brake_L', this.scene), b = new L('light_brake_R', this.scene);
    a.parent = body; b.parent = body; a.position.set(-0.7, 0.85, -2.35); b.position.set(0.7, 0.85, -2.35);
    const glb = await GLTF2Export.GLBAsync(this.scene, 'contract_test', { shouldExportNode: (n) => n === body || n.parent === body });
    body.dispose(); a.dispose(); b.dispose();
    const blob = Object.values(glb.files)[0] as Blob;
    const url = URL.createObjectURL(blob);
    await this.player.useModel(this.scene, url);
    return { loaded: !!this.player.model, nodes: [...(this.player.model?.nodes.keys() ?? [])] };
  }
  /** Debug: capture HUD feed messages. */
  debugFeed: string[] = [];
  /** Dev/test only: when set, steering holds this lateral offset (m). */
  debugAutoSteer = 0;
  get debug() { return { state: this.state, s: this.player?.s, d: this.player?.d, kmh: this.player?.kmh, surface: this.player?.surface, fps: this.engine.getFps(), pos: this.player?.pos ?? Vector3.Zero(), meshes: this.scene.meshes.length, pax: this.pax?.phase, gear: this.player?.gear, v: this.player?.v, heading: this.player?.heading, x: this.player?.x, z: this.player?.z, tripTime: this.tripTime, cam: this.rig?.mode }; }
}

const GEAR_NAME: Record<Gear, string> = { P: 'Park', R: 'Reverse', N: 'Neutral', D: 'Drive' };
const CAM_NAME: Record<string, string> = { chase: 'Chase camera', hood: 'Driver view', cabin: 'Cabin view' };
