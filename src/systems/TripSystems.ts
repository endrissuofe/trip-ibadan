// Fuel, Damage, Events (speed zones / violations) and Scoring systems.
import { VehicleDef } from '../data/vehicles';
import { RouteEvent } from '../data/trips';
import { Impact } from './Driving';
import type { Ledger } from './Economy';

/** Fuel is scaled so a short slice still matters (see docs/KNOWN-LIMITATIONS). */
export const FUEL_GAME_SCALE = 10;

export class Fuel {
  level = 100; // %
  usedL = 0;
  constructor(private def: VehicleDef) {}
  update(dt: number, v: number, throttle: number) {
    const kmh = Math.abs(v) * 3.6;
    const perM = (this.def.fuelConsumption / 100000) * (0.75 + 0.55 * throttle + 0.4 * Math.pow(Math.max(0, kmh - 90) / 40, 2));
    const idleLph = this.def.type === 'minivan' ? 0.9 : 1.3;
    const litres = perM * Math.abs(v) * dt + (idleLph / 3600) * dt;
    this.usedL += litres;
    this.level = Math.max(0, this.level - (litres / this.def.fuelCapacity) * 100 * FUEL_GAME_SCALE);
  }
  get empty() { return this.level <= 0; }
  get usedPct() { return 100 - this.level; }
}

export class Damage {
  condition = 100;
  majorCollisions = 0;
  minorHits = 0;
  constructor(private def: VehicleDef) {}
  apply(i: Impact): number {
    const k = i.kind === 'offroad' ? 0.35 : i.kind === 'barrier' || i.kind === 'building' ? 0.55 : i.kind === 'rider' ? 0.3 : 0.8;
    const loss = Math.max(0, i.kmh - 4) * k / this.def.damageResistance;
    if (loss <= 0) return 0;
    this.condition = Math.max(0, this.condition - loss);
    if (i.kmh >= 25 && i.kind !== 'offroad') this.majorCollisions++; else this.minorHits++;
    return loss;
  }
  get disabled() { return this.condition <= 0; }
  get label() {
    const c = this.condition;
    return c > 87 ? 'Excellent' : c > 62 ? 'Minor damage' : c > 37 ? 'Significant damage' : c > 0 ? 'Severe damage' : 'Disabled';
  }
}

export interface Violation { reason: string; atKm: number }

export class RoadEvents {
  violations: Violation[] = [];
  private overTime = 0; private cooldown = 0; private wrongTime = 0;
  private announced = new Set<RouteEvent>();
  private checkpointFlag = new Set<RouteEvent>();

  constructor(private events: RouteEvent[], private originS: number) {}

  /** Returns a toast message when something new happens. */
  update(dt: number, s: number, kmh: number, limit: number, psi: number, onExpressway: boolean): string | null {
    const km = (s - this.originS) / 1000;
    let msg: string | null = null;
    for (const e of this.events) {
      if (!this.announced.has(e) && km >= e.km - 0.45 && km < e.km + e.lengthM / 1000 && e.kind !== 'jam') { this.announced.add(e); msg = e.label; }
      if (e.kind === 'checkpoint' && onExpressway && km >= e.km && km <= e.km + e.lengthM / 1000 && kmh > 40 && !this.checkpointFlag.has(e)) {
        this.checkpointFlag.add(e); this.add('Too fast through the police checkpoint', km); msg = 'Police: "Oga, slow down!" (violation)';
      }
    }
    this.cooldown -= dt;
    if (kmh > limit + 7) this.overTime += dt; else this.overTime = Math.max(0, this.overTime - dt * 2);
    if (this.overTime > 5 && this.cooldown <= 0) { this.add(`Speeding (${Math.round(kmh)} in a ${limit} zone)`, km); msg = `Speeding: limit ${limit} km/h (violation)`; this.overTime = 0; this.cooldown = 15; }
    if (onExpressway && Math.abs(psi) > 1.9 && kmh > 10) this.wrongTime += dt; else this.wrongTime = 0;
    if (this.wrongTime > 3) { this.add('Driving against traffic', km); msg = 'Wrong way! (violation)'; this.wrongTime = -20; }
    return msg;
  }

  add(reason: string, atKm: number) { this.violations.push({ reason, atKm }); }
}

export interface Mission { label: string; done: boolean }

export interface TripResult {
  completed: boolean;
  reason: string;
  distanceKm: number;
  timeS: number;
  delivered: number;
  missed: number;
  capacity: number;
  fares: number;
  tips: number;
  placeBonus: number;
  rating: number;
  placesFound: number;
  placesNew: number;
  damagePct: number;
  fuelUsedPct: number;
  violations: number;
  majorCollisions: number;
  ridersHit: number;
  score: number;
  breakdown: [string, number][];
  earnings: number;
  missions: Mission[];
  /** Trip money summary (change spec §18). */
  money: { served: number; faresCollected: number; changeReturned: number; disputes: number; disputesWon: number; unpaid: number; refunds: number; changeLoss: number; owedOutstanding: number };
  stars: number;
}

export function scoreTrip(p: {
  completed: boolean; reason: string; def: VehicleDef; distanceM: number; timeS: number; condition: number; fuelUsedPct: number;
  violations: number; majorCollisions: number; minorHits: number; tripLengthM: number;
  delivered: number; missed: number; fares: number; tips: number; rating: number; placeBonus: number; placesFound: number; placesNew: number; ridersHit: number;
  ledger?: Ledger;
}): TripResult {
  const b: [string, number][] = [];
  if (p.completed) b.push(['Destination reached', 3000]);
  b.push([`Passengers delivered ×${p.delivered}`, p.delivered * 300]);
  if (p.missed) b.push([`Missed stops ×${p.missed}`, -300 * p.missed]);
  const good = p.completed ? Math.max(0, 1000 - 120 * p.minorHits - 250 * p.majorCollisions) : 0;
  b.push(['Good driving', good]);
  b.push(['Low vehicle damage', Math.round((1000 * p.condition) / 100)]);
  const expectedFuel = (p.def.fuelConsumption / 100000) * p.tripLengthM / p.def.fuelCapacity * 100 * FUEL_GAME_SCALE;
  b.push(['Fuel efficiency', p.completed ? Math.round(500 * Math.max(0, Math.min(1, 1.5 - p.fuelUsedPct / Math.max(1, expectedFuel)))) : 0]);
  b.push([`Places discovered ×${p.placesFound}`, p.placesFound * 50]);
  if (p.violations) b.push([`Traffic violations ×${p.violations}`, -500 * p.violations]);
  if (p.majorCollisions) b.push([`Major collisions ×${p.majorCollisions}`, -1000 * p.majorCollisions]);
  if (p.ridersHit) b.push([`Delivery riders knocked ×${p.ridersHit}`, -1500 * p.ridersHit]);
  const score = Math.max(0, b.reduce((a, [, v]) => a + v, 0));
  const missions: Mission[] = [
    { label: 'Reach the destination', done: p.completed },
    { label: 'Drop every passenger at their stop', done: p.completed && p.missed === 0 && p.delivered > 0 },
    { label: 'Smooth ride: rating 4.0+ and no crashes', done: p.completed && p.delivered > 0 && p.rating >= 4 && p.majorCollisions === 0 && p.ridersHit === 0 },
  ];
  return {
    completed: p.completed, reason: p.reason, distanceKm: p.distanceM / 1000, timeS: p.timeS,
    delivered: p.delivered, missed: p.missed, capacity: p.def.passengerCapacity, fares: p.fares, tips: p.tips, placeBonus: p.placeBonus,
    rating: p.rating, placesFound: p.placesFound, placesNew: p.placesNew,
    damagePct: 100 - p.condition, fuelUsedPct: p.fuelUsedPct, violations: p.violations, majorCollisions: p.majorCollisions, ridersHit: p.ridersHit,
    score, breakdown: b, earnings: p.fares + p.tips + p.placeBonus, missions, stars: missions.filter((m) => m.done).length,
    money: {
      served: p.ledger?.served ?? p.delivered, faresCollected: p.ledger?.faresCollected ?? p.fares, changeReturned: p.ledger?.changeReturned ?? 0,
      disputes: p.ledger?.disputes ?? 0, disputesWon: p.ledger?.disputesWon ?? 0, unpaid: p.ledger?.unpaid ?? 0,
      refunds: p.ledger?.refunds ?? 0, changeLoss: p.ledger?.changeLoss ?? 0, owedOutstanding: p.ledger?.owedOutstanding ?? 0,
    },
  };
}
