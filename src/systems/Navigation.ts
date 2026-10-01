// Navigation system: progress, distance to destination and cues derived from the
// real route (interchange exits, jams with detour hints, closures, stops).
import { World } from '../world/World';
import type { PlayerVehicle } from './Driving';

export interface Cue { s0: number; s1: number; at: number; icon: string; text: string; sub?: string }
export interface NavState { icon: string; text: string; distM: number; sub: string; remainingM: number; progress: number; nextPlace: string }

export class Navigation {
  readonly cues: Cue[] = [];
  private lastSpoken = '';
  voice = true;

  constructor(private world: World, readonly destination: string) {
    const nb = world.route.nb, r = world.route;
    for (const ramp of r.file.ramps) {
      const [x, z] = ramp.line[0], [x2, z2] = ramp.line[ramp.line.length - 1];
      const a = nb.project(x, z), b = nb.project(x2, z2);
      const hw = nb.halfWidth(a.s);
      if (a.d > 0 && a.d < hw + 6 && Math.abs(b.d) > hw + 10 && a.s < r.tripEnd - 300 && a.s > r.tripStart) {
        this.cues.push({ s0: a.s - 450, s1: a.s + 40, at: a.s, icon: '↖', text: 'Keep left', sub: `stay on the expressway towards ${destination}` });
      }
    }
    for (const e of world.events.filter((x) => x.kind === 'jam')) {
      const s0 = r.startS + e.km * 1000;
      this.cues.push({ s0: s0 - 1300, s1: s0, at: s0, icon: '🚦', text: e.label, sub: 'beat it through the inner streets on your right →' });
    }
    for (const c of world.closures) {
      const police = /police/i.test(c.label);
      this.cues.push({ s0: c.s0 - 350, s1: c.s1, at: c.s0, icon: police ? '⚠' : '↖', text: c.label.split(':')[0], sub: police ? 'keep left, single lane, 30 km/h' : 'right lane closed, merge left' });
    }
    for (const o of world.obstacles) this.cues.push({ s0: o.s - 300, s1: o.s + 10, at: o.s, icon: '⚠', text: 'Broken-down vehicle', sub: 'on the right shoulder' });
    this.cues.sort((a, b) => a.s0 - b.s0);
  }

  state(p: PlayerVehicle, stopCue: { name: string; s: number; detail: string } | null): NavState {
    const r = this.world.route, s = p.s;
    const remainingM = Math.max(0, r.tripEnd - s);
    const progress = Math.min(1, Math.max(0, (s - r.tripStart) / r.tripLength));
    const nextPlace = r.stopsBetween(s + 30, r.tripEnd)[0]?.name ?? this.destination;
    const base = { remainingM, progress, nextPlace };
    if (!p.onExpressway) {
      const hw = r.nb.halfWidth(s);
      const back = Math.max(0, Math.abs(p.d) - hw - 2.8);
      const where = p.surface === 'dirt' ? 'Untarred road' : p.surface === 'street' ? 'Inner street' : 'Off road';
      return { ...base, icon: p.d > 0 ? '↰' : '↱', text: p.streetName || where, sub: `${where.toLowerCase()} · expressway ${Math.round(back)} m ${p.d > 0 ? 'to your left' : 'to your right'}`, distM: remainingM };
    }
    if (stopCue && stopCue.s - s < 600 && stopCue.s - s > -45) {
      return { ...base, icon: '🚏', text: `Stop at ${stopCue.name}`, sub: stopCue.detail, distM: Math.max(0, stopCue.s - s) };
    }
    const cue = this.cues.find((c) => s >= c.s0 && s <= c.s1);
    if (cue) return { ...base, icon: cue.icon, text: cue.text, sub: cue.sub ?? '', distM: cue.at > s ? cue.at - s : Math.max(0, cue.s1 - s) };
    return { ...base, icon: '↑', text: 'Continue straight', sub: `towards ${this.destination}`, distM: remainingM };
  }

  /** Speak cue changes (browser speech synthesis; free and offline on most phones). */
  speak(text: string) {
    if (!this.voice || text === this.lastSpoken || typeof speechSynthesis === 'undefined') return;
    this.lastSpoken = text;
    this.say(text, true);
  }

  /** Speak a passenger line after any current utterance; navigation can still interrupt it. */
  speakDialogue(text: string) {
    if (typeof speechSynthesis === 'undefined') return;
    // drop the line if something is already being said: queued lines pile up and play long after the moment
    if (speechSynthesis.speaking || speechSynthesis.pending) return;
    this.say(text, false);
  }

  stopSpeaking() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
  }

  private say(text: string, interrupt: boolean) {
    try {
      const u = new SpeechSynthesisUtterance(text);
      const v = speechSynthesis.getVoices().find((x) => /en-NG/i.test(x.lang)) ?? speechSynthesis.getVoices().find((x) => /^en/i.test(x.lang));
      if (v) u.voice = v;
      u.rate = 1.02; u.volume = 0.9;
      if (interrupt) speechSynthesis.cancel();
      speechSynthesis.speak(u);
    } catch { /* speech unavailable */ }
  }
}
