# Roadmap: Developer Change Specification r1.0, step by step

Status as of 1 Oct 2026. "Done" means implemented and committed; see `CHANGELOG.md` for details and `TEST-CHECKLIST.md` for how each item was checked.

## Already done

| Spec | Item | Where |
|---|---|---|
| §3 | Independent game clock, pace presets (1.5× / 3× / 4× / 5×) | `src/systems/GameClock.ts` |
| §4 | Trip Units for player-facing distances (1 TU = 500 m) | `GameClock.ts` |
| §5 | Gears P/R/N/D, correct reversing, reverse lamps, beeper, reversing camera, look-back | `Driving.ts`, `CameraRig.ts` |
| §7–9, §17 | Passenger states, boarding through the door, own seat, destination, drop-off | `Passengers.ts` |
| §10–13, §18 | Conductor, fare collection, real change float, owed change, occasional disputes, trip money summary | `Passengers.ts`, `src/data/dialogue.ts` |
| §14 | Dialogue system (Pidgin, English, some Yoruba), no back-to-back repeats | `src/data/dialogue.ts` |
| §15–16 | Driver, third-person and cabin views; passenger list; stop requests shown in the cabin | `CameraRig.ts`, `UI.ts` |
| §19 (part) | Mood from comfort, long stops, missed stops and disputes | `Passengers.ts` |
| §20 (part) | Hiace and Sienna as real 3D models with interiors; roadside kit (shops, stalls, drains, poles, billboards) | `public/models/`, `tools/blender/` |

## Still to do, in order

Each step is one piece of work that can be built, tested and pushed on its own.

### Step 1: Test on real phones and tune the pace
- Play Ojota → Berger on a mid-range Android phone and on an iPhone.
- Record frame rate, load time, and whether Normal (3×) feels right.
- Fix whatever the phone test finds before adding heavier graphics.

### Step 2: Finish the vehicles (§20, P0)
- Intercity Bus and Luxury Bus as real 3D models with interiors (they are still simple shapes).
- Traffic vehicles as real models: cars, SUVs, trucks, tankers, danfos.
- Working indicators and brake lights on traffic.

### Step 3: Rigged human characters (§6, P0)
- Replace the procedural people with properly rigged characters: walk, stand, sit, reach and hand over money.
- Needs character and animation assets with a licence we can ship. This is a decision for you: which asset source, or commission them.
- Variety rules stay: no group of identical passengers.

### Step 4: Lighting and rendering (§21)
- PBR materials on vehicles and roads, HDR environment lighting, sun shadows, ambient occlusion, bloom.
- Two quality tiers so Low stays smooth on mid-range phones.

### Step 5: Traffic realism (§2 P1)
- Traffic that signals, brakes visibly and reacts to you drifting into its lane.
- Okada and keke in the towns; some vehicles on the inner streets.

### Step 6: Roadside realism (§20 environment, P1)
- People at the shops and stops; a petrol station you can drive into.
- Real building footprints near the stops; drains cut into the ground.

### Step 7: Performance: detail zones and streaming (§22)
- High, medium and low detail by distance from the player.
- Load and unload road sections as you drive, so the route can grow.
- Write down the performance targets (frame rate and load time per device class).

### Step 8: Extend the route to Ibadan (§8)
- Re-run the map pipeline for Mowe → Sagamu → Ibadan (Iwo Road).
- New stops and destinations: Sagamu, Ogere, Ibadan, Iwo Road.
- Depends on Step 7.

### Step 9: Polish (§2 P2, §24 Version 3)
- Day and night, rain, radio and music, spoken dialogue.
- Mood affected by music, weather and traffic; vehicle upgrades.

## Decisions needed from you
1. **Characters (Step 3):** which licensed character and animation assets to use, or whether to commission them.
2. **Chowdeck and Glovo:** permission, or swap to fictional brands before a public release.
3. **Pace:** confirm 3× after the phone test, or pick another default.
