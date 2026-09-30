// Passengers and conductor (change spec §7–§13, §16–§19).
//
// Each passenger has a destination, a fare and a state:
//   WAITING → BOARDING → SEATED → PAYING → TRAVELLING → REQUESTING_STOP → DESTINATION_REACHED → EXITING → LEFT
//   (temporary: WAITING_FOR_CHANGE, TALKING/ANGRY during a dispute)
// The conductor collects each fare after boarding: takes the money, works out the change from
// a real float of Naira notes, hands it back (or owes it if there's no change yet). Occasionally
// a payment turns into a short dispute the player can settle. Passengers leave the list only
// after they have physically walked out of the vehicle.
import { Scene } from '@babylonjs/core/scene';
import { Mesh } from '@babylonjs/core/Meshes/mesh';
import { MeshBuilder } from '@babylonjs/core/Meshes/meshBuilder';
import { StandardMaterial } from '@babylonjs/core/Materials/standardMaterial';
import { Color3 } from '@babylonjs/core/Maths/math.color';
import { Vector3 } from '@babylonjs/core/Maths/math.vector';
import { World } from '../world/World';
import { Landmark, LANE_W } from '../map/Route';
import { randomLook, buildStanding, buildSeated, Walker, ConductorFigure, Look } from '../world/people';
import { signTexture } from '../world/textures';
import { fareFor, NAMES } from '../data/trips';
import type { PlayerVehicle, Controls } from './Driving';
import { Float, Ledger, tenderFor, rollDispute, DisputeKind } from './Economy';
import { Dialogue, naira, Vars } from './Dialogue';
import { LINES, Intent } from '../data/dialogue';

export type PaxState =
  | 'WAITING' | 'BOARDING' | 'SEATED' | 'PAYING' | 'WAITING_FOR_CHANGE' | 'TRAVELLING'
  | 'REQUESTING_STOP' | 'DESTINATION_REACHED' | 'EXITING' | 'LEFT' | 'TALKING';
export type MoodLabel = 'Happy' | 'Satisfied' | 'Neutral' | 'Annoyed' | 'Angry';

export interface Pax {
  id: number; name: string; look: Look;
  from: string; dest: string; destName: string; fare: number;
  state: PaxState;
  paid: boolean; tendered: number; changeDue: number; changeGiven: number; owed: number;
  seat: number; moodAdj: number; missed: boolean; angry: boolean;
  stand?: Mesh; seated?: Mesh; label?: Mesh;
}
export type PaxPhase = 'loading' | 'riding' | 'stopping' | 'done';
export interface PaxMsg { text: string; money?: number; tone: 'good' | 'bad' | 'info'; who?: string }

export interface TxnView {
  name: string; seat: number; dest: string; fare: number;
  received: number | null; change: number; given: number | null;
  stage: 'collect' | 'change' | 'done'; manual: boolean; canAct: boolean;
}
export interface DisputeView { id: number; name: string; text: string; checked: boolean; details: string; timeLeft: number }
export interface ManifestRow { seat: number; name: string; dest: string; fare: number; status: string; mood: MoodLabel; requesting: boolean }

const BOARD_SPEED = 1.4;       // m/s walking
const MAX_WALKING = 3;          // at most this many boarding at once
const BOARD_STAGGER = 0.7;      // s between passengers starting to walk
const REQUEST_STOP_M = 900;     // passenger calls out this far before their stop (real metres)
const DISPUTE_TIMEOUT = 10;     // s before the conductor settles it himself

interface Walk { w: Walker; pax: Pax; to: 'door' | 'away'; tx: number; tz: number; t: number; limit: number }
interface Txn { pax: Pax; t: number; tender: number[]; received: number | null; given: number | null; stage: 'ask' | 'collect' | 'change' | 'done'; short: number; dispute: DisputeKind | null }
interface Dispute { pax: Pax; kind: DisputeKind; short: number; claim: number; checked: boolean; t: number }
interface Note { m: Mesh; a: Vector3; b: Vector3; t: number }

export class Passengers {
  aboard: Pax[] = [];
  waiting = new Map<string, Pax[]>();
  phase: PaxPhase = 'loading';
  comfort = 100;
  tips = 0; delivered = 0; missed = 0;
  readonly ledger = new Ledger();
  readonly float = new Float();
  private ratings: number[] = [];
  private stops: Landmark[];
  private stoppingAt: Landmark | null = null;
  private walks: Walk[] = [];
  private boardQ: Pax[] = [];
  private boardT = 0;
  private exitT = 0;
  private payQ: Pax[] = [];
  private txn: Txn | null = null;
  private disputeNow: Dispute | null = null;
  private paysSinceDispute = 3;
  private bumpyCd = 0; private happyCd = 40; private longStopT = 0; private manualNagT = 0;
  private passed = new Set<string>();
  private requested = new Set<string>();
  private seatsUsed: (Pax | null)[];
  private conductor: ConductorFigure;
  private notes: Note[] = [];
  private noteMat: StandardMaterial;
  private dlg: Dialogue;
  private nextId = 1;
  private out: PaxMsg[] = [];
  private rnd: () => number;

  constructor(
    private scene: Scene, private world: World, private player: PlayerVehicle,
    readonly capacity: number, private startId: string, private endId: string,
    public fareMode: 'conductor' | 'manual' = 'conductor', seed = Math.floor(Math.random() * 1e9),
  ) {
    let s = seed % 2147483647 || 1;
    this.rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
    this.dlg = new Dialogue(LINES, this.rnd);
    this.seatsUsed = new Array(capacity).fill(null);
    const r = world.route;
    this.stops = r.stopsBetween(r.stop(startId).s, r.stop(endId).s);
    // queue at the park: a full load, destinations weighted towards the far end
    this.waiting.set(startId, Array.from({ length: capacity }, () => this.makePax(r.stop(startId))));
    // people waiting at the stops along the way
    for (const st of this.stops.slice(0, -1)) this.waiting.set(st.id, Array.from({ length: 1 + Math.floor(this.rnd() * 3) }, () => this.makePax(st)));
    this.placeWaiting();
    // conductor in the front passenger seat
    const cl = randomLook(this.rnd);
    Object.assign(cl, { sex: 'm', age: 'adult', cane: false, bag: 'none', outfit: 'shirt', headwear: this.rnd() < 0.4 ? 'cap' : 'none' });
    this.conductor = new ConductorFigure(scene, cl);
    const cs = player.layout.conductorSeat;
    this.conductor.root.parent = player.mesh;
    this.conductor.root.position.set(cs.x, cs.y, cs.z);
    this.noteMat = new StandardMaterial('nairaNote', scene);
    this.noteMat.diffuseColor = new Color3(0.45, 0.62, 0.42); this.noteMat.emissiveColor = new Color3(0.15, 0.22, 0.14);
    this.noteMat.specularColor = Color3.Black(); this.noteMat.backFaceCulling = false;
    this.say('conductor_call', { dest: world.route.stop(endId).name }, 'Conductor', 'info'); // shown on the first frame
  }

  // ------------------------------------------------------------------ setup
  private makePax(from: Landmark): Pax {
    const r = this.world.route;
    const later = r.stopsBetween(from.s, r.stop(this.endId).s);
    const pick = later[Math.min(later.length - 1, Math.floor(Math.pow(this.rnd(), 0.7) * later.length))];
    const km = (pick.s - from.s) / 1000;
    const look = randomLook(this.rnd);
    return {
      id: this.nextId++, name: this.freshName(), look,
      from: from.id, dest: pick.id, destName: pick.name, fare: fareFor(km), state: 'WAITING',
      paid: false, tendered: 0, changeDue: 0, changeGiven: 0, owed: 0, seat: -1, moodAdj: 0, missed: false, angry: false,
    };
  }

  private usedNames = new Set<string>();
  /** Unique names within a trip (so the passenger list is readable). */
  private freshName() {
    const free = NAMES.filter((n) => !this.usedNames.has(n));
    const n = free.length ? free[Math.floor(this.rnd() * free.length)] : `${NAMES[Math.floor(this.rnd() * NAMES.length)]} ${this.nextId}`;
    this.usedNames.add(n);
    return n;
  }

  /** Test hook: force the next eligible payment to become a dispute. */
  forceDispute = false;

  /** Waiting passengers stand by the bay of their stop. */
  private placeWaiting() {
    const nb = this.world.route.nb;
    for (const [id, list] of this.waiting) {
      const st = this.world.route.stop(id);
      list.forEach((p, i) => {
        if (p.stand) return;
        const hw = nb.halfWidth(st.s);
        // at the park the queue forms alongside the loading bay, close to the passenger door
        const along = id === this.startId ? this.world.route.tripStart - 12 + i * 1.1 : st.s + 6 + i * 1.3;
        const w = nb.toWorld(along, hw + (id === this.startId ? 3.2 : 4.4) + (i % 2) * 0.8);
        p.stand = buildStanding(this.scene, p.look);
        p.stand.position.set(w.x, w.y, w.z); p.stand.rotation.y = w.heading - Math.PI / 2 + (this.rnd() - 0.5) * 0.6;
        p.stand.metadata = { dynamic: true };
      });
    }
  }

  // ------------------------------------------------------------------ queries used by the game + HUD
  get fares() { return this.ledger.net; }
  get seatsFree() { return this.capacity - this.aboard.length - this.boardQ.length - this.walks.filter((w) => w.to === 'door').length; }
  get rating() { return this.ratings.length ? this.ratings.reduce((a, b) => a + b, 0) / this.ratings.length : 5; }
  get queueAtStart() { return this.waiting.get(this.startId)?.length ?? 0; }
  moodOf(p: Pax) { return Math.max(0, Math.min(100, this.comfort + p.moodAdj)); }
  moodLabel(p: Pax): MoodLabel { const m = this.moodOf(p); return m > 85 ? 'Happy' : m > 70 ? 'Satisfied' : m > 50 ? 'Neutral' : m > 30 ? 'Annoyed' : 'Angry'; }

  /** The next stop that needs you (drop-offs, or pick-ups with free seats). */
  nextStop(s: number): { stop: Landmark; drop: number; wait: number } | null {
    for (const st of this.stops) {
      if (st.s < s - 45) continue;
      const drop = this.aboard.filter((p) => p.dest === st.id || p.missed).length;
      const wait = this.seatsFree > 0 ? (this.waiting.get(st.id)?.length ?? 0) : 0;
      if (drop || wait || st.id === this.endId) return { stop: st, drop, wait };
    }
    return null;
  }

  manifest(): ManifestRow[] {
    return this.aboard.slice().sort((a, b) => a.seat - b.seat).map((p) => ({
      seat: p.seat + 1, name: p.name, dest: p.destName, fare: p.fare, mood: this.moodLabel(p),
      requesting: p.state === 'REQUESTING_STOP',
      status: p.state === 'TALKING' ? 'dispute' : p.state === 'WAITING_FOR_CHANGE' ? `owed ${naira(p.owed)}` : p.state === 'PAYING' ? 'paying'
        : p.state === 'EXITING' || p.state === 'DESTINATION_REACHED' ? 'getting down' : p.paid ? 'paid' : 'not paid',
    }));
  }

  txnView(): TxnView | null {
    const t = this.txn; if (!t) return null;
    const manual = this.fareMode === 'manual';
    return {
      name: t.pax.name, seat: t.pax.seat + 1, dest: t.pax.destName, fare: t.pax.fare,
      received: t.received, change: t.received !== null ? t.received - t.pax.fare : 0, given: t.given,
      stage: t.stage === 'ask' || t.stage === 'collect' ? 'collect' : t.stage === 'change' ? 'change' : 'done',
      manual, canAct: manual && Math.abs(this.player.v) < 0.6,
    };
  }

  disputeView(): DisputeView | null {
    const d = this.disputeNow; if (!d) return null;
    const p = d.pax;
    const text = d.kind === 'short_change'
      ? `${p.name} says the change is short by ${naira(d.short)}.`
      : `${p.name} says they handed over ${naira(d.claim)}.`;
    const details = `Fare ${naira(p.fare)} · received ${naira(p.tendered)} · change due ${naira(p.changeDue)} · change given ${naira(p.changeGiven)}`;
    return { id: p.id, name: p.name, text, checked: d.checked, details, timeLeft: Math.max(0, DISPUTE_TIMEOUT - d.t) };
  }

  depart() {
    if (this.phase !== 'loading') return;
    this.phase = 'riding';
    this.finishBoardingNow();
  }

  // ------------------------------------------------------------------ player actions (HUD buttons)
  /** Manual fare mode: take the passenger's money. */
  collect() {
    const t = this.txn; const v = this.txnView();
    if (!t || !v?.canAct || t.received !== null) return;
    this.receive(t);
  }
  /** Manual fare mode: hand back the change. */
  returnChange() {
    const t = this.txn; const v = this.txnView();
    if (!t || !v?.canAct || t.received === null || t.given !== null) return;
    this.giveChange(t);
  }
  /** Dispute choices: look at the transaction, pay the passenger, or back the conductor. */
  resolveDispute(choice: 'check' | 'payout' | 'back') {
    const d = this.disputeNow; if (!d) return;
    if (choice === 'check') { d.checked = true; return; }
    const p = d.pax, conductorWrong = d.kind === 'short_change';
    const amount = conductorWrong ? d.short : d.claim - p.tendered;
    if (choice === 'payout') {
      this.payOut(amount);
      p.moodAdj += 8;
      if (conductorWrong) { p.changeGiven += amount; this.ledger.changeReturned += amount; }
      else this.ledger.refunds += amount; // they already had their change: this is money lost
      this.say('dispute_paid_out', { short: naira(amount) }, 'Conductor', 'info');
      this.push(conductorWrong ? `You paid ${p.name} the missing ${naira(amount)}. Fair call.` : `You paid ${p.name} ${naira(amount)}, but they already had their change. −${naira(amount)}`, conductorWrong ? 'good' : 'bad');
    } else {
      if (conductorWrong) {
        p.moodAdj -= 25; p.angry = true;
        this.push(`${p.name} was right: the conductor short-changed them by ${naira(amount)}. They're angry.`, 'bad');
        this.ledger.owedOutstanding += amount;
      } else {
        p.moodAdj -= 4; this.ledger.disputesWon++;
        this.say('dispute_pax_wrong', { amount: naira(p.tendered) }, 'Conductor', 'good');
      }
    }
    this.endDispute();
  }

  // ------------------------------------------------------------------ frame
  private flush() { const o = this.out; this.out = []; return o; }

  update(dt: number, p: PlayerVehicle, ctl: Controls, limit: number): PaxMsg[] {
    const nb = this.world.route.nb;
    this.animate(dt, p);
    const riding = this.phase === 'riding' || this.phase === 'stopping';

    // ---- comfort (driving quality)
    if (riding) {
      let drop = p.roughness * 5 * dt;
      if (ctl.brake > 0.8 && p.kmh > 45) drop += 7 * dt;
      if (Math.abs(p.latAcc) > 4.5) drop += 5 * dt;
      if (p.kmh > limit + 15) drop += 2 * dt;
      for (const imp of p.impacts) drop += Math.min(25, imp.kmh * 0.7);
      this.comfort = Math.max(0, Math.min(100, this.comfort - drop + (drop === 0 ? 1.2 * dt : 0)));
      this.bumpyCd -= dt; this.happyCd -= dt;
      const someone = this.aboard.find((x) => x.state === 'TRAVELLING');
      if (drop > 4 && this.bumpyCd <= 0 && someone) { this.bumpyCd = 14; this.say('bumpy', {}, someone.name, 'bad'); }
      else if (this.comfort > 95 && this.happyCd <= 0 && someone && p.kmh > 60) { this.happyCd = 90; this.say('happy', {}, someone.name, 'good'); }
      // long stops away from a bus stop annoy people
      const atStop = this.phase === 'stopping';
      if (Math.abs(p.v) < 0.5 && !atStop && this.aboard.length) {
        this.longStopT += dt;
        if (this.longStopT > 25) { for (const x of this.aboard) x.moodAdj -= 0.6 * dt; }
        if (this.longStopT > 25 && this.longStopT - dt <= 25) this.say('long_stop', {}, this.aboard[0].name, 'bad');
      } else this.longStopT = 0;
    }

    // ---- bay highlight
    const next = this.nextStop(p.s);
    for (const [id, mat] of this.world.stopBays) mat.alpha = (next?.stop.id === id) || (this.phase === 'loading' && id === this.startId) ? 0.5 : 0.1;

    // ---- boarding (park and stops), conductor, disputes
    this.updateBoarding(dt, p);
    this.updateConductor(dt, p);
    if (this.disputeNow) {
      this.disputeNow.t += dt;
      if (this.disputeNow.t > DISPUTE_TIMEOUT) this.autoResolveDispute();
    }

    if (this.phase === 'loading') {
      if (p.kmh > 8) { this.depart(); this.push(`Departed with ${this.aboard.length}/${this.capacity} passengers`, 'info'); }
      else {
        const q = this.waiting.get(this.startId)!;
        if (q.length && this.seatsFree > 0 && this.boardQ.length === 0) this.boardQ.push(...q.splice(0, this.seatsFree));
        if (!q.length && this.boardQ.length === 0 && !this.walks.some((w) => w.to === 'door') && this.aboard.length === this.capacity && !this.fullSaid) {
          this.fullSaid = true; this.push("Full load! Oya, let's go 🚐", 'good');
        }
      }
      return this.flush();
    }

    // ---- passengers call out as their stop approaches
    for (const x of this.aboard) {
      if (x.state !== 'TRAVELLING' && x.state !== 'WAITING_FOR_CHANGE') continue;
      const st = this.world.route.stop(x.dest);
      if (st.s - p.s < REQUEST_STOP_M && st.s - p.s > -40 && !x.missed) {
        if (x.state === 'TRAVELLING') x.state = 'REQUESTING_STOP';
        if (!this.requested.has(st.id)) { this.requested.add(st.id); this.say('request_stop', { dest: st.name }, x.name, 'info'); }
        this.setLabel(x, st.name);
      }
    }

    // ---- missed stops
    for (const st of this.stops) {
      if (this.passed.has(st.id) || p.s < st.s + 70 || (!p.onExpressway && p.s < st.s + 400)) continue;
      this.passed.add(st.id);
      for (const x of this.aboard.filter((y) => y.dest === st.id && !y.missed && y.state !== 'EXITING')) {
        x.missed = true; this.missed++; x.moodAdj -= 25; x.angry = true;
        if (x.state === 'REQUESTING_STOP') x.state = 'TRAVELLING';
        this.say('missed_stop', { dest: st.name }, x.name, 'bad');
        const refund = Math.round(x.fare / 2 / 50) * 50;
        if (x.paid) {
          this.payOut(refund); this.ledger.refunds += refund;
          this.push(`${x.name}: "${this.dlg.say('missed_refund', { dest: st.name })}" −${naira(refund)}`, 'bad', -refund);
        }
        this.setLabel(x, 'Missed stop!');
      }
      for (const w of this.waiting.get(st.id) ?? []) w.stand?.dispose();
      this.waiting.set(st.id, []);
    }

    // ---- stopping at a bay
    if (this.phase === 'riding' && next) {
      const st = next.stop, hw = nb.halfWidth(st.s);
      const inBay = Math.abs(p.s - st.s) < 45 && p.d > hw - LANE_W - 0.7 && p.onExpressway;
      if (inBay && p.kmh < 8 && (next.drop || next.wait || st.id === this.endId)) {
        this.phase = 'stopping'; this.stoppingAt = st; this.exitT = 0.5;
        if (next.drop && st.id !== this.endId) this.say('announce_stop', { stop: st.name }, 'Conductor', 'info');
      }
    }
    if (this.phase === 'stopping' && this.stoppingAt) {
      const st = this.stoppingAt;
      if (p.kmh > 12) {
        this.finishBoardingNow();
        this.phase = 'riding'; this.stoppingAt = null;
        return this.flush();
      }
      const final = st.id === this.endId;
      // 1) everyone for this stop gets down, one at a time
      const leaving = this.aboard.filter((x) => (x.dest === st.id || x.missed || final) && x.state !== 'EXITING' && x.state !== 'LEFT');
      this.exitT -= dt;
      if (leaving.length && this.exitT <= 0 && !this.disputeNow) {
        this.exitT = 0.8;
        this.startExit(leaving[0], p);
      }
      // 2) then waiting passengers board
      const q = this.waiting.get(st.id) ?? [];
      if (!leaving.length && !final && q.length && this.seatsFree > 0 && this.boardQ.length === 0) this.boardQ.push(...q.splice(0, this.seatsFree));
      // 3) done when nobody is moving about
      const busy = leaving.length || this.boardQ.length || this.walks.some((w) => w.to === 'door') || this.aboard.some((x) => x.state === 'EXITING');
      if (!busy) {
        if (final) { if (!this.walks.length) this.phase = 'done'; }
        else {
          this.phase = 'riding'; this.passed.add(st.id); this.stoppingAt = null;
          this.push(`${st.name} done. ${this.aboard.length} on board`, 'info');
        }
      }
    }
    return this.flush();
  }
  private fullSaid = false;

  // ------------------------------------------------------------------ boarding / alighting
  private doorWorld(p: PlayerVehicle) {
    const d = p.layout.door;
    return Vector3.TransformCoordinates(new Vector3(d.x, 0, d.z), p.mesh.getWorldMatrix());
  }

  private updateBoarding(dt: number, p: PlayerVehicle) {
    this.boardT -= dt;
    const walkingIn = this.walks.filter((w) => w.to === 'door').length;
    if (this.boardQ.length && this.boardT <= 0 && walkingIn < MAX_WALKING && Math.abs(p.v) < 1) {
      this.boardT = BOARD_STAGGER;
      const x = this.boardQ.shift()!;
      x.state = 'BOARDING';
      const w = new Walker(this.scene, x.look);
      const at = x.stand ? x.stand.position.clone() : this.doorWorld(p).add(new Vector3(2, 0, 0));
      w.root.position.copyFrom(at);
      x.stand?.dispose(); x.stand = undefined;
      const door = this.doorWorld(p);
      this.walks.push({ w, pax: x, to: 'door', tx: door.x, tz: door.z, t: 0, limit: Math.hypot(door.x - at.x, door.z - at.z) / (BOARD_SPEED * 0.7) + 2 });
    }
  }

  /** Vehicle is leaving: anyone still walking over hops straight in; the boarding queue goes back to waiting. */
  private finishBoardingNow() {
    for (const w of this.walks.filter((x) => x.to === 'door')) { w.w.dispose(); this.seat(w.pax); }
    this.walks = this.walks.filter((x) => x.to !== 'door');
    // anyone not yet walking stays at the stop
    for (const x of this.boardQ) { x.state = 'WAITING'; this.waiting.get(x.from)?.push(x); }
    this.boardQ = [];
    this.placeWaiting();
  }

  private seat(x: Pax) {
    const i = this.seatsUsed.indexOf(null);
    if (i < 0) return; // no seat (shouldn't happen)
    this.seatsUsed[i] = x; x.seat = i;
    x.state = 'SEATED';
    this.aboard.push(x);
    const s = this.player.layout.seats[i];
    x.seated = buildSeated(this.scene, x.look);
    x.seated.parent = this.player.mesh; x.seated.position.set(s.x, s.y, s.z); x.seated.metadata = { dynamic: true };
    x.seated.setEnabled(this.player.interiorView);
    // destination request as they sit down (spec §8)
    if (this.rnd() < 0.35) this.say('greet', {}, 'Conductor', 'info');
    this.say('destination', { dest: x.destName }, x.name, 'info');
    this.payQ.push(x);
  }

  private startExit(x: Pax, p: PlayerVehicle) {
    x.state = 'DESTINATION_REACHED';
    // settle any change still owed before they go
    if (x.owed > 0) this.settleOwed(x, true);
    if (!x.paid) {
      this.ledger.unpaid += x.fare;
      this.push(`${x.name} got down without paying! −${naira(x.fare)}`, 'bad');
      this.payQ = this.payQ.filter((y) => y !== x);
    }
    if (this.txn?.pax === x) {
      const t = this.txn;
      if (t.received !== null && t.given === null) this.giveChange(t);
      this.txn = null;
    }
    x.state = 'EXITING';
    x.seated?.dispose(); x.seated = undefined; x.label?.dispose(); x.label = undefined;
    const door = this.doorWorld(p);
    const rx = Math.cos(p.heading), rz = -Math.sin(p.heading); // vehicle's right
    const w = new Walker(this.scene, x.look);
    w.root.position.copyFrom(door); w.root.rotation.y = p.heading + Math.PI / 2;
    this.walks.push({ w, pax: x, to: 'away', tx: door.x + rx * 7 - Math.sin(p.heading) * 1.5, tz: door.z + rz * 7 - Math.cos(p.heading) * 1.5, t: 0, limit: 8 });
  }

  /** Walker reached the kerb: the passenger has left; now they come off the list (spec §9). */
  private left(x: Pax) {
    x.state = 'LEFT';
    this.aboard.splice(this.aboard.indexOf(x), 1);
    if (x.seat >= 0) this.seatsUsed[x.seat] = null;
    this.ledger.served++;
    const mood = this.moodOf(x);
    if (!x.missed) this.delivered++;
    this.ratings.push(x.missed ? 1 : 1 + (4 * mood) / 100);
    const tip = x.missed || !x.paid ? 0 : mood > 65 ? Math.round((x.fare * 0.3 * (mood - 65)) / 35 / 50) * 50 : 0;
    this.tips += tip;
    if (!x.missed && this.rnd() < 0.5) this.say('alight', {}, x.name, 'good');
    this.push(`${x.name} got down at ${this.stoppingAt?.name ?? x.destName}${tip ? ` · tip ${naira(tip)}` : ''}`, x.missed ? 'bad' : 'good', tip || undefined);
  }

  // ------------------------------------------------------------------ conductor and fares
  private updateConductor(dt: number, p: PlayerVehicle) {
    // start the next payment
    if (!this.txn && !this.disputeNow && this.payQ.length) {
      const x = this.payQ.shift()!;
      if (x.state === 'SEATED') {
        x.state = 'PAYING';
        const tender = tenderFor(x.fare, this.rnd);
        this.txn = { pax: x, t: 0, tender: tender.notes, received: null, given: null, stage: 'ask', short: 0, dispute: null };
        if (this.fareMode === 'conductor' || this.rnd() < 0.5) this.say('ask_fare', { dest: x.destName, fare: naira(x.fare) }, 'Conductor', 'info');
      }
    }
    const t = this.txn;
    let reach = 0;
    if (t) {
      t.t += dt;
      if (this.fareMode === 'conductor') {
        if (t.stage === 'ask' && t.t > 1.0) this.receive(t);
        else if (t.stage === 'change' && t.t > 1.0) this.giveChange(t);
        else if (t.stage === 'done' && t.t > 0.8) this.endTxn(t);
        reach = t.stage === 'done' ? Math.max(0, 1 - t.t / 0.8) : Math.min(1, t.t / 0.6);
      } else {
        if (t.stage === 'ask') t.stage = 'collect';
        this.manualNagT += dt;
        if (this.manualNagT > 20 && t.received === null) { this.manualNagT = 0; this.say('manual_wait', {}, t.pax.name, 'info'); }
        if (t.stage === 'done' && t.t > 0.8) this.endTxn(t);
        reach = t.stage === 'done' ? Math.max(0, 1 - t.t / 0.8) : 0.3;
      }
    }
    this.conductor.reach(reach);
    this.conductor.root.setEnabled(p.interiorView);
    for (const x of this.aboard) x.seated?.setEnabled(p.interiorView);
  }

  private receive(t: Txn) {
    const x = t.pax;
    t.received = t.tender.reduce((a, b) => a + b, 0);
    x.tendered = t.received; x.changeDue = t.received - x.fare; x.paid = true;
    this.float.add(t.tender);
    this.ledger.faresCollected += x.fare;
    this.fly(x, true);
    this.say(t.received === x.fare ? 'exact_money' : 'pay', { amount: naira(t.received), fare: naira(x.fare) }, x.name, 'info');
    this.push(`Fare ${naira(x.fare)} · received ${naira(t.received)}${x.changeDue ? ` · change ${naira(x.changeDue)}` : ''}`, 'good', x.fare);
    t.stage = x.changeDue > 0 ? 'change' : 'done'; t.t = 0; t.given = x.changeDue > 0 ? null : 0;
    // occasional dispute (conductor mode: either kind; manual: only the passenger can be wrong)
    const roll = this.forceDispute && x.changeDue > 0 ? { kind: this.fareMode === 'manual' ? 'overclaim' as const : 'short_change' as const, amount: 100 } : rollDispute(this.rnd, this.paysSinceDispute, x.changeDue);
    if (roll) this.forceDispute = false;
    if (roll && (this.fareMode === 'conductor' || roll.kind === 'overclaim')) { t.dispute = roll.kind; t.short = roll.kind === 'short_change' ? roll.amount : 0; }
    else this.paysSinceDispute++;
    // money in the float may let us settle anyone we owe
    for (const y of this.aboard) if (y.state === 'WAITING_FOR_CHANGE' && y !== x) this.settleOwed(y, false);
  }

  private giveChange(t: Txn) {
    const x = t.pax;
    const want = x.changeDue - t.short;
    const notes = this.float.makeChange(want);
    if (!notes) {
      // no change available right now: owe it (never a dispute on top)
      x.owed = x.changeDue; x.state = 'WAITING_FOR_CHANGE';
      t.given = 0; t.stage = 'done'; t.t = 0; t.dispute = null; t.short = 0;
      this.say('owe_change', { change: naira(x.owed), dest: x.destName }, 'Conductor', 'info');
      this.paysSinceDispute++;
      return;
    }
    this.float.take(notes);
    t.given = want; x.changeGiven = want;
    this.ledger.changeReturned += want;
    this.fly(x, false);
    this.say('change_given', { change: naira(want) }, 'Conductor', 'info');
    t.stage = 'done'; t.t = 0;
  }

  private endTxn(t: Txn) {
    const x = t.pax;
    this.txn = null; this.manualNagT = 0;
    if (x.state === 'PAYING') { x.state = 'TRAVELLING'; this.say('thanks', {}, x.name, 'info'); }
    if (t.dispute) this.startDispute(x, t.dispute, t.short);
  }

  private startDispute(x: Pax, kind: DisputeKind, short: number) {
    this.paysSinceDispute = 0;
    this.ledger.disputes++;
    x.state = 'TALKING'; x.angry = true;
    const claim = kind === 'short_change' ? x.changeDue : x.tendered + 500;
    this.disputeNow = { pax: x, kind, short, claim, checked: false, t: 0 };
    const shownShort = kind === 'short_change' ? x.changeGiven : x.changeDue;
    const claimChange = kind === 'short_change' ? x.changeDue : x.changeDue + 500;
    this.say('dispute_claim', { claim: naira(claimChange), short: naira(shownShort), amount: naira(kind === 'short_change' ? x.tendered : x.tendered + 500) }, x.name, 'bad');
    this.say('dispute_reply', { amount: naira(x.tendered) }, 'Conductor', 'info');
    this.setLabel(x, '!');
  }

  private autoResolveDispute() {
    const d = this.disputeNow!; const x = d.pax;
    if (d.kind === 'short_change') {
      this.payOut(d.short); x.changeGiven += d.short; this.ledger.changeReturned += d.short;
      x.moodAdj -= 3;
      this.say('dispute_conductor_wrong', { short: naira(d.short) }, 'Conductor', 'info');
    } else {
      x.moodAdj -= 6; this.ledger.disputesWon++;
      this.say('dispute_pax_wrong', { amount: naira(x.tendered) }, 'Conductor', 'info');
    }
    this.endDispute();
  }

  private endDispute() {
    const x = this.disputeNow!.pax;
    x.angry = false;
    if (x.state === 'TALKING') x.state = 'TRAVELLING';
    x.label?.dispose(); x.label = undefined;
    this.disputeNow = null;
  }

  private settleOwed(x: Pax, leaving: boolean) {
    let notes = this.float.makeChange(x.owed);
    if (!notes && leaving) {
      const up = this.float.roundUpChange(x.owed);
      if (up) { notes = up.notes; this.ledger.changeLoss += up.paid - x.owed; }
    }
    if (!notes) {
      if (leaving) { x.moodAdj -= 30; this.ledger.owedOutstanding += x.owed; this.push(`${x.name} left without their ${naira(x.owed)} change. Angry!`, 'bad'); x.owed = 0; }
      return;
    }
    this.float.take(notes);
    this.ledger.changeReturned += x.owed;
    x.changeGiven += x.owed;
    this.say('owe_paid', { change: naira(x.owed) }, 'Conductor', 'info');
    x.owed = 0;
    if (x.state === 'WAITING_FOR_CHANGE') x.state = 'TRAVELLING';
  }

  /** Pay money out of the trip (from the float if possible). */
  private payOut(amount: number) {
    const n = this.float.makeChange(amount);
    if (n) this.float.take(n);
  }

  // ------------------------------------------------------------------ visuals
  /** A Naira note flying between a passenger's seat and the conductor's hand. */
  private fly(x: Pax, toConductor: boolean) {
    const L = this.player.layout; const s = L.seats[x.seat]; const c = L.conductorSeat;
    if (!s) return;
    const a = new Vector3(s.x, s.y + 0.45, s.z + 0.2), b = new Vector3(c.x - 0.1, c.y + 0.55, c.z - 0.3);
    const m = MeshBuilder.CreatePlane('note', { width: 0.15, height: 0.07 }, this.scene);
    m.material = this.noteMat; m.parent = this.player.mesh; m.metadata = { dynamic: true };
    m.setEnabled(this.player.interiorView);
    this.notes.push({ m, a: toConductor ? a : b, b: toConductor ? b : a, t: 0 });
  }

  private setLabel(x: Pax, text: string) {
    if (!x.seated) return;
    x.label?.dispose();
    const m = MeshBuilder.CreatePlane('paxLabel', { width: 0.5, height: 0.16 }, this.scene);
    const mat = new StandardMaterial('paxLabelMat', this.scene);
    mat.diffuseTexture = signTexture(this.scene, [text], { bg: text === '!' ? '#c62828' : '#1688ff', w: 256, h: 80 });
    mat.emissiveColor = new Color3(1, 1, 1); mat.disableLighting = true; mat.backFaceCulling = false;
    m.material = mat; m.parent = x.seated; m.position.set(0, 1.0, 0); m.billboardMode = Mesh.BILLBOARDMODE_ALL;
    m.metadata = { dynamic: true };
    x.label = m;
  }

  private animate(dt: number, p: PlayerVehicle) {
    const door = this.doorWorld(p);
    this.walks = this.walks.filter((w) => {
      w.t += dt;
      if (w.to === 'door') { w.tx = door.x; w.tz = door.z; }
      const pos = w.w.root.position;
      const dx = w.tx - pos.x, dz = w.tz - pos.z, dist = Math.hypot(dx, dz);
      const step = Math.min(dist, BOARD_SPEED * (w.pax.look.age === 'elder' ? 0.75 : 1) * dt);
      if (dist > 0.05) { pos.x += (dx / dist) * step; pos.z += (dz / dist) * step; w.w.root.rotation.y = Math.atan2(dx, dz); }
      pos.y = w.to === 'door' ? door.y : pos.y;
      w.w.animate(dt, dist > 0.05 ? BOARD_SPEED : 0);
      const arrived = dist < 0.25 || w.t > w.limit;
      if (arrived) {
        w.w.dispose();
        if (w.to === 'door') this.seat(w.pax); else this.left(w.pax);
        return false;
      }
      return true;
    });
    this.notes = this.notes.filter((n) => {
      n.t += dt / 0.55;
      const k = Math.min(1, n.t);
      Vector3.LerpToRef(n.a, n.b, k, n.m.position);
      n.m.position.y += Math.sin(k * Math.PI) * 0.12;
      n.m.rotation.y = k * 3; n.m.setEnabled(p.interiorView);
      if (n.t >= 1) { n.m.dispose(); return false; }
      return true;
    });
  }

  // ------------------------------------------------------------------ messages
  private say(intent: Intent, vars: Vars, who: string, tone: PaxMsg['tone']) {
    const text = this.dlg.say(intent, vars);
    if (text) this.out.push({ text: `${who}: "${text}"`, tone, who });
  }
  private push(text: string, tone: PaxMsg['tone'], money?: number) { this.out.push({ text, tone, money }); }

  dispose() {
    for (const list of this.waiting.values()) for (const p of list) p.stand?.dispose();
    for (const w of this.walks) w.w.dispose();
    for (const x of this.aboard) { x.seated?.dispose(); x.label?.dispose(); }
    for (const n of this.notes) n.m.dispose();
    this.conductor.dispose();
    this.noteMat.dispose();
  }
}
