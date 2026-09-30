// Dialogue system (change spec §14): picks a line for a situation, avoids repeating recent
// lines, and fills in the details. Conversations are built from intents, not hard-coded.
import type { Intent, Line } from '../data/dialogue';

export type Vars = Partial<Record<'dest' | 'fare' | 'amount' | 'change' | 'short' | 'claim' | 'name' | 'stop' | 'from', string>>;

export const naira = (n: number) => `₦${Math.round(n).toLocaleString('en-NG')}`;

export class Dialogue {
  private recent = new Map<Intent, number[]>();
  private lines: Record<Intent, Line[]>;
  private rnd: () => number;
  private memory: number;
  constructor(lines: Record<Intent, Line[]>, rnd: () => number = Math.random, memory = 3) {
    this.lines = lines; this.rnd = rnd; this.memory = memory;
  }

  say(intent: Intent, vars: Vars = {}): string {
    const pool = this.lines[intent];
    if (!pool?.length) return '';
    const recent = this.recent.get(intent) ?? [];
    const choices = pool.map((l, i) => ({ l, i })).filter(({ i }) => !recent.includes(i) || pool.length <= recent.length);
    const total = choices.reduce((a, c) => a + (c.l.w ?? 1), 0);
    let r = this.rnd() * total, pick = choices[0];
    for (const c of choices) { r -= c.l.w ?? 1; if (r <= 0) { pick = c; break; } }
    recent.push(pick.i);
    while (recent.length > Math.min(this.memory, pool.length - 1)) recent.shift();
    this.recent.set(intent, recent);
    return pick.l.text.replace(/\{(\w+)\}/g, (_, k: keyof Vars) => vars[k] ?? '');
  }
}
