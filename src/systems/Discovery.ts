// Discovery: every real place you drive past is added to your Places collection.
import type { Route, Poi } from '../map/Route';
import { HERO, PLACE_BONUS } from '../data/places';

export interface Found { poi: Poi; isNew: boolean; bonus: number; hero: boolean }

export class Discovery {
  private seenThisTrip = new Set<string>();
  found: Found[] = [];

  constructor(private route: Route, private known: Set<string>) {}

  static key(p: Poi) { return `${p.name}@${Math.round(p.s / 100)}`; }

  /** Call every frame with the player's road-space position. */
  update(s: number, d: number): Found | null {
    for (const poi of this.route.file.pois) {
      if (poi.s < this.route.tripStart - 200 || poi.s > this.route.tripEnd + 200) continue;
      if (Math.abs(poi.s - s) > 70 || Math.abs(poi.d - d) > 480) continue;
      const k = Discovery.key(poi);
      if (this.seenThisTrip.has(k)) continue;
      this.seenThisTrip.add(k);
      const isNew = !this.known.has(k);
      const hero = poi.name in HERO;
      const f: Found = { poi, isNew, hero, bonus: isNew ? (HERO[poi.name]?.bonus ?? PLACE_BONUS) : 0 };
      if (isNew) this.known.add(k);
      this.found.push(f);
      return f;
    }
    return null;
  }

  get bonus() { return this.found.reduce((a, f) => a + f.bonus, 0); }
  /** Places that lie on the current trip. */
  totalOnTrip() { return this.route.file.pois.filter((p) => p.s >= this.route.tripStart - 200 && p.s <= this.route.tripEnd + 200).length; }
}
