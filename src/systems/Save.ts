// Save / progression system (per-device, localStorage). Every access is guarded:
// storage can be missing or blocked (private mode, previews).
import type { Pace } from './GameClock';

export interface Settings {
  quality: 'low' | 'high';
  sound: number; // 0..1
  music: number; // 0..1 (radio arrives later)
  controls: 'buttons' | 'tilt';
  language: 'en';
  voice: boolean;
  /** Game pace (change spec §3): how fast game time runs and the road goes by. */
  pace: Pace;
  /** Who handles fares: the conductor automatically, or the player (only while stopped). */
  fareMode: 'conductor' | 'manual';
}
export interface SaveData {
  settings: Settings;
  selectedVehicle: string;
  best: Record<string, number>; // `${trip}:${vehicle}` → score
  tripsCompleted: number;
  wallet: number; // ₦ earned
  owned: string[]; // bought vehicles
  stars: Record<string, number>; // best stars per trip
  discovered: string[]; // Discovery keys of real places seen
  selectedTrip: string;
}

const KEY = 'trip-ibadan:v1';
const isMobile = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;
const DEFAULTS: SaveData = {
  settings: { quality: isMobile ? 'low' : 'high', sound: 0.8, music: 0.6, controls: 'buttons', language: 'en', voice: true, pace: 'normal', fareMode: 'conductor' },
  selectedVehicle: 'sienna', best: {}, tripsCompleted: 0, wallet: 0, owned: [], stars: {}, discovered: [], selectedTrip: 'ojota-berger',
};

export function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return structuredClone(DEFAULTS);
    const d = JSON.parse(raw);
    return { ...structuredClone(DEFAULTS), ...d, settings: { ...DEFAULTS.settings, ...(d.settings ?? {}) } };
  } catch { return structuredClone(DEFAULTS); }
}

export function writeSave(d: SaveData) { try { localStorage.setItem(KEY, JSON.stringify(d)); } catch { /* storage unavailable */ } }
