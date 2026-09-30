# Changelog

## Change spec r1.0: MVP pass (1 Oct 2026)

Implements the P0 items of the *Developer Change Specification r1.0* on the existing game, plus several P1 items. See `docs/TEST-CHECKLIST.md` for how each acceptance criterion was checked.

### Driving
- **Reverse fixed.** Before, holding BRAKE at a standstill drove the vehicle backwards, so there was no way to brake while reversing. Reverse is now a real gear.
- **Gears P / R / N / D.** Changing between P, R and D needs the vehicle stopped; Neutral any time. Keys: E/Q step up/down, R reverse, N neutral; on touch, a P R N D selector. Leaving the park engages Drive for you.
- Reverse speed limited (about 16 km/h). Brake works in every gear. Steering behaves like a real car in reverse. Collisions stay active.
- **Reverse lamps, brighter brake lamps, turn indicators and hazards** (Z / X / H), with a relay tick. **Reverse beeper.**
- **Cameras:** chase (rises and looks behind when reversing), **driver view** (dashboard, turning steering wheel, rear-view display; switches to a reversing camera in R) and **cabin view** (passengers, conductor, payments). **Look back** with B or 👀. C cycles the views.

### Game pace
- **Independent game clock.** Settings → Game pace: Relaxed 1.5×, Normal 3× (default), Fast 4×, Arcade 5×. The trip timer and time of day run on game time.
- The road is never shortened. When cruising, the whole moving world (you, traffic, riders) covers the real road faster; parking, loading and reversing stay at real speed.
- **Trip Units (TU)** for all player-facing distances (1 TU = 500 m, set in `src/systems/GameClock.ts`).

### Passengers, conductor and money
- Each passenger has a **destination, a fare and a state** (waiting → boarding → seated → paying → travelling → requesting stop → getting down → left).
- Passengers **walk to the vehicle, get in through the passenger door, sit in their own seat**, say where they're going, and **walk away** at their stop. They leave the passenger list only after they've got out.
- A **conductor** sits in the front passenger seat, asks for the fare, takes the money and returns change from a **real float of Naira notes**. When there's no change he owes it and pays later ("I go give you your change").
- **Fare panel** (Received / Change). Settings → Fares: *Conductor collects* (default) or *I collect* (COLLECT / RETURN CHANGE buttons, only while stopped; F key).
- **Occasional change disputes** (about 1 in 12 payments, never back-to-back). Check the money, pay the passenger, or back the conductor; if you don't decide, he counts it himself.
- **Dialogue system** with Nigerian Pidgin, English and some Yoruba lines (`src/data/dialogue.ts`), varied with no back-to-back repeats.
- **Passenger list** (📋 / M) with seat, destination, payment status and mood; passengers who want to get down are highlighted, and a sign appears over their head in the cabin view.
- **Trip summary:** passengers served, fares collected, change returned, disputed fares, unpaid fares, refunds and change losses.
- Sienna now carries **6 passengers** (the conductor has the front seat).

### People
- New procedural people: faces, hair (low cut, afro, braids, bun), headwear (gele, fila, scarf, cap), everyday Nigerian clothing, skin-tone, age, build and gender-presentation variety; walking, seated and conductor figures with moving arms and legs. These are stand-ins for rigged photoreal characters (see `docs/ASSET-CONTRACT.md`).

### Models
- Optional real GLB vehicles via `public/models/manifest.json`, with lamps snapping to the model's named nodes. Nothing is downloaded unless a model is listed.

### Other
- A delivery rider riding into your parked vehicle no longer counts as you knocking them down.
- `npm test`: unit tests for fares, change-making, disputes and dialogue (Node 22.6+).
