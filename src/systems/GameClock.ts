// Game time and pace (change spec §3, §4, §23).
//
//   REAL TIME ──clockScale──▶ GAME TIME       (trip timer, time of day, schedules)
//   real speed ──travelScale──▶ ground covered (the real road is never shortened)
//
// The map geometry is never changed. Instead the whole moving world (player, traffic,
// riders) covers the real road faster once the player is cruising. Parking, loading and
// reversing stay at real speed because the pace blends in with the player's speed.
//
// Animation playback, UI and dialogue timing stay in REAL time on purpose — a 3× walk
// cycle or 3× dialogue would look wrong.

export type Pace = 'relaxed' | 'normal' | 'fast' | 'arcade';

export const PACES: Record<Pace, { label: string; clockScale: number; travelScale: number }> = {
  relaxed: { label: 'Relaxed (1.5×)', clockScale: 1.5, travelScale: 1.5 },
  normal: { label: 'Normal (3×)', clockScale: 3, travelScale: 3 },
  fast: { label: 'Fast (4×)', clockScale: 4, travelScale: 4 },
  arcade: { label: 'Arcade (5×)', clockScale: 5, travelScale: 5 },
};

/** Below this speed (m/s) the world runs at real pace; above PACE_FULL_MPS it runs at full travelScale. */
export const PACE_START_MPS = 5;
export const PACE_FULL_MPS = 20;

/** Trip starts at this time of day (hours). */
export const START_HOUR = 6.5;

export class GameClock {
  gameSeconds = 0;
  realSeconds = 0;
  clockScale: number;
  travelScale: number;

  constructor(public pace: Pace = 'normal') {
    this.clockScale = PACES[pace].clockScale;
    this.travelScale = PACES[pace].travelScale;
  }

  setPace(p: Pace) { this.pace = p; this.clockScale = PACES[p].clockScale; this.travelScale = PACES[p].travelScale; }

  /** Advance by real seconds; returns game seconds elapsed. */
  tick(realDt: number): number {
    this.realSeconds += realDt;
    const g = realDt * this.clockScale;
    this.gameSeconds += g;
    return g;
  }

  /** Pace factor for the moving world right now, from the player's speed (m/s). */
  worldScale(playerSpeed: number): number {
    const t = Math.min(1, Math.max(0, (Math.abs(playerSpeed) - PACE_START_MPS) / (PACE_FULL_MPS - PACE_START_MPS)));
    return 1 + (this.travelScale - 1) * t * t * (3 - 2 * t);
  }

  get hourOfDay() { return (START_HOUR + this.gameSeconds / 3600) % 24; }

  timeOfDay(): string {
    const h = this.hourOfDay, hh = Math.floor(h), mm = Math.floor((h - hh) * 60);
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }
}

// ---------------------------------------------------------------- Trip Units (spec §4)

/** Real metres per Trip Unit. Tune for gameplay; real metres stay internal. */
export const METRES_PER_TU = 500;

export const toTU = (m: number) => m / METRES_PER_TU;

/** Player-facing distance, e.g. "18 TU" or "2.4 TU". */
export const fmtTU = (m: number) => {
  const tu = Math.max(0, toTU(m));
  return `${tu >= 10 ? Math.round(tu) : tu.toFixed(1)} TU`;
};
