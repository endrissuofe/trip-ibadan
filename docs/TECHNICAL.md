# Technical documentation

## Engine

**Babylon.js 8** (Apache-2.0) with WebGL2, TypeScript and Vite. Babylon is imported with deep module paths, so only the parts the game uses ship. The main bundle is about 230 KB gzipped, and shaders load as separate chunks.

## Map provider / data source

| Data | Source | Licence |
|---|---|---|
| Road centrelines, lanes, bridges, ramps, footbridges, bus stop | OpenStreetMap via Overpass API | ODbL: attribution is shown on the start screen and trip map |
| Place names (Berger, Magboro, Ibafo, Mowe…) | OpenStreetMap `place=*` nodes | ODbL |
| Elevation | AWS Terrain Tiles (Terrarium PNG, zoom 13, SRTM-derived) | Open data |

There are no paid APIs and no runtime map dependency: all data is baked into `public/data/berger-mowe.json` (384 KB).

## Routing / map pipeline

```bash
npm run data:fetch
```

This runs `tools/osm/overpass.mjs` with `road.overpassql` and `places.overpassql` and writes `data/osm/*.json`.

```bash
npm run data:build
```

This runs `tools/osm/analyze.mjs` (report) and `tools/osm/build-route.mjs`, which:

1. Chains the `highway=motorway` ways into the northbound and southbound carriageways (following the connected node order).
2. Projects them to local metres, with the origin at the Ojodu Berger Interchange (x = east, z = north).
3. Resamples every 5 m and lightly smooths the line.
4. Samples elevation, smooths it over about 300 m, spans bridges linearly between their ground ends, and limits grade to 4%.
5. Bakes terrain cross-sections every 20 m, out to ±500 m.
6. Snaps landmarks (Berger, Magboro, Arepo bus stop, Ibafo, Mowe) onto the road.

Real results: trip length 17.2 km; bridges at km −0.2, 0.63–1.35, 8.43–8.63, 10.06–10.37; 13 ramps; 5 footbridges; road height −0.6 to 40 m.

**Adding the next leg (Mowe → Sagamu → Iwo Road):**
1. Widen the bounding boxes in the `.overpassql` files.
2. Add a trip in `src/data/trips.ts` with a new `routeId`.
3. Parameterise `ORIGIN` / `TRIP_LEN` in `build-route.mjs`.

No vehicle or gameplay code changes are needed.

## Road space

`src/map/Route.ts` exposes each carriageway as a `Line` with arc length `s`, lateral offset `d` (positive = right of travel), heading, curvature and smoothed lane count. The player, traffic, events and navigation all work in `(s, d)`. That keeps vehicles on the real geometry cheaply and makes route-tied events simple ("km 7.2, right lane").

## Terrain pipeline

`World.groundAt(s, d)` produces the ground:

- SRTM terrain, blurred about 100 m to strip buildings and canopy.
- Blended into embankments towards whichever carriageway is nearer, over 55 m.
- Clamped so it never pokes through a road surface.
- Dropped into a valley under bridges, with water under the long river bridge.

Ground is meshed as 1 km chunks, with columns from −320 to +320 m (denser near the road) and rows every 20 m. The procedural texture is tinted by vertex colours: bush patches, laterite dust at road edges, and dustier ground near towns.

## Traffic system

`src/systems/Traffic.ts` runs a pool of vehicles on each carriageway (24 northbound and 16 southbound at high quality). They are recycled around the player.

- **Car-following:** Intelligent Driver Model with per-type acceleration and desired speeds.
- **Lane changes:** a light MOBIL-style check (safe gaps, including the player) when blocked or slow. Vehicles merge at lane drops, closures and breakdowns, and move over when you use the horn.
- **Events:** zone speed caps create the Berger go-slow, the construction zone and the checkpoint queue. A route-tied heavy-truck platoon waits at km 3.
- **Collisions with the player:** axis-aligned in road space, with nose-to-tail vs side-swipe response and damage scaled by the closing speed.
- **Rendering:** vehicles are single vertex-coloured meshes drawn as instances (about one draw call per model/colour).

## Driving model

`src/systems/Driving.ts` models the vehicle in road space:

- Kinematic bicycle steering with speed-sensitive lock.
- Engine force falls off towards top speed.
- Aerodynamic and rolling drag, and grade resistance from real elevation.
- Off-road drag.
- Barrier, parapet, closure and obstacle collisions.
- Visual body roll, pitch and road shake.

## Build process

```bash
npm run build
```

This runs `tsc --noEmit` followed by `vite build` and produces a static site in `dist/`.

## Change-spec systems (Oct 2026)

| Module | What it does |
|---|---|
| `src/systems/GameClock.ts` | Game clock (`clockScale`) and pace (`travelScale`, blended in with speed), presets, Trip Units |
| `src/systems/Driving.ts` | Gear state P/R/N/D, signed speed, brake/reverse/indicator lamps, interior view switch, optional GLB body |
| `src/systems/CameraRig.ts` | Chase, driver, cabin and orbit cameras; reversing and look-back views; rear-view display |
| `src/world/interior.ts` | Seat layout per vehicle, cockpit and cabin shell, steering wheel |
| `src/world/people.ts` | Procedural people (`Look`), standing/seated/walking/conductor figures, `HumanFactory` swap point |
| `src/systems/Passengers.ts` | Passenger state machine, boarding and alighting, conductor, fare transactions, disputes, passenger list |
| `src/systems/Economy.ts` | Naira notes, tenders, change float, change-making, dispute rolls, trip ledger (no Babylon imports) |
| `src/systems/Dialogue.ts`, `src/data/dialogue.ts` | Line pools by situation with no-repeat memory |
| `src/world/assets.ts` | Optional GLB loading from `public/models/manifest.json` |

**Pace.** Each frame the game computes `f = GameClock.worldScale(player speed)`: 1 below 5 m/s, rising smoothly to `travelScale` at 20 m/s. The player's ground displacement, traffic and riders all use `dt × f`, so relative motion stays consistent. The player's yaw rate stays real-time, so steering feels the same and turning radius grows with the pace. Physics sub-steps increase with `f` to keep collisions reliable. Animation, dialogue and UI timing use real time.

**Money.** Fares are collected when a passenger sits down, not when they get off. `Ledger.net` = fares collected − refunds − change losses. Tips are still paid at drop-off from mood.

**Testing.** `npm test` runs the pure-logic tests. In dev builds, `window.game.debugStep(frames, keys)` steps the simulation deterministically without rendering, and `debugPax()` returns the passenger/ledger state; these are what the headless checks in `docs/TEST-CHECKLIST.md` use.
