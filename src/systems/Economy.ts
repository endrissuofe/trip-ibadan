// Trip money (change spec §11, §13, §18): cash tendered, the conductor's change float,
// change-making with real Naira notes, occasional disputes and the trip ledger.
// Pure logic with no Babylon imports, so it can be unit-tested (tests/economy.test.ts).

/** Naira notes a conductor handles, largest first. */
export const NOTES = [1000, 500, 200, 100, 50] as const;

export type Rng = () => number;

/** Conductor's starting change float (note → count). */
export const START_FLOAT: Record<number, number> = { 1000: 0, 500: 2, 200: 5, 100: 8, 50: 6 };

export interface Tender { amount: number; notes: number[] }

/** Break an amount into notes, largest first (assumes a multiple of 50). */
export function notesFor(amount: number): number[] {
  const out: number[] = [];
  let left = amount;
  for (const n of NOTES) while (left >= n) { out.push(n); left -= n; }
  return out;
}

/**
 * What a passenger hands over for a fare: exact money sometimes, otherwise the next round
 * amount (₦500 / ₦1,000), occasionally a big note or two on a small fare.
 */
export function tenderFor(fare: number, r: Rng): Tender {
  const x = r();
  let amount: number;
  if (x < 0.25) amount = fare;
  else if (x < 0.55) amount = Math.ceil(fare / 500) * 500;
  else if (x < 0.9) amount = Math.ceil(fare / 1000) * 1000;
  else amount = Math.ceil(fare / 1000) * 1000 + 1000;
  if (amount < fare) amount = fare;
  return { amount, notes: notesFor(amount) };
}

export class Float {
  readonly notes: Record<number, number>;
  constructor(start: Record<number, number> = START_FLOAT) { this.notes = { ...start }; for (const n of NOTES) this.notes[n] ??= 0; }

  get total() { return NOTES.reduce((a, n) => a + n * this.notes[n], 0); }

  add(notes: number[]) { for (const n of notes) this.notes[n] = (this.notes[n] ?? 0) + 1; }

  /**
   * Exact change from the notes available, or null if it can't be made.
   * Greedy with backtracking over the small set of note types.
   */
  makeChange(amount: number): number[] | null {
    if (amount === 0) return [];
    const avail = NOTES.map((n) => this.notes[n] ?? 0);
    const pick = new Array(NOTES.length).fill(0);
    const solve = (i: number, left: number): boolean => {
      if (left === 0) return true;
      if (i >= NOTES.length) return false;
      const n = NOTES[i];
      for (let k = Math.min(avail[i], Math.floor(left / n)); k >= 0; k--) {
        pick[i] = k;
        if (solve(i + 1, left - k * n)) return true;
      }
      pick[i] = 0;
      return false;
    };
    if (!solve(0, amount)) return null;
    const out: number[] = [];
    NOTES.forEach((n, i) => { for (let k = 0; k < pick[i]; k++) out.push(n); });
    return out;
  }

  /** Remove notes (must be available). */
  take(notes: number[]) {
    for (const n of notes) {
      if (!this.notes[n]) throw new Error(`no ₦${n} note in float`);
      this.notes[n]--;
    }
  }

  /**
   * Smallest amount ≥ `amount` that can be paid from the float (when exact change is impossible,
   * the conductor rounds up and the trip loses the difference). Null if the float can't cover it.
   */
  roundUpChange(amount: number): { notes: number[]; paid: number } | null {
    for (let a = amount; a <= amount + 1000; a += 50) {
      const n = this.makeChange(a);
      if (n) return { notes: n, paid: a };
    }
    return null;
  }
}

export type DisputeKind = 'short_change' | 'overclaim';
export interface DisputeRoll { kind: DisputeKind; amount: number }

export const DISPUTE_CHANCE = 0.08;
export const DISPUTE_MIN_GAP = 3;

/**
 * Decide whether this payment turns into a dispute (occasional, never back-to-back).
 *  - short_change: the conductor hands back too little by mistake.
 *  - overclaim: the passenger insists they handed over more than they did.
 * Only payments that involve change can be disputed.
 */
export function rollDispute(r: Rng, paymentsSinceLast: number, changeDue: number, chance = DISPUTE_CHANCE): DisputeRoll | null {
  if (changeDue <= 0 || paymentsSinceLast < DISPUTE_MIN_GAP) return null;
  if (r() >= chance) return null;
  if (r() < 0.65) {
    const amount = [100, 200, 300][Math.floor(r() * 3)];
    return amount < changeDue ? { kind: 'short_change', amount } : { kind: 'short_change', amount: 100 };
  }
  return { kind: 'overclaim', amount: 500 };
}

/** End-of-trip money summary (spec §18). */
export class Ledger {
  served = 0;          // passengers who reached their stop (or were set down after a missed stop)
  faresCollected = 0;  // fares received
  changeReturned = 0;  // change handed back to passengers
  disputes = 0;        // payments that turned into an argument
  disputesWon = 0;     // resolved in the trip's favour without paying out
  unpaid = 0;          // fares never collected (manual mode: passenger left before paying)
  refunds = 0;         // money handed back (missed stops, disputes the player paid out)
  changeLoss = 0;      // extra paid when exact change wasn't possible
  owedOutstanding = 0; // change still owed at the end
  /** Net takings from fares. */
  get net() { return this.faresCollected - this.refunds - this.changeLoss; }
}
