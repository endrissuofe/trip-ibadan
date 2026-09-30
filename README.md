# Trip_Ibadan

A browser driving game on the **real Lagos–Ibadan Expressway**. Load passengers at **Ojota Motor Park**, drive the real road (mapped from OpenStreetMap with real elevation), drop each passenger at their real stop (Berger, Kara, Magboro, Arepo, Ibafo, Mowe), dodge gridlock through real inner streets and untarred roads, and discover the real places along the way.

> Trip_Ibadan is a journey, not an endless driving score game.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Open the printed URL (use the `Network` address on your phone, on the same Wi-Fi).

```bash
npm run build
```

`dist/` is a static site: host it anywhere (Vercel, Netlify, GitHub Pages, Cloudflare Pages). See [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md).

## Controls

| | Phone | Desktop |
|---|---|---|
| Steer | ◀ ▶ buttons (or tilt, in Settings) | A / D or ← → |
| Accelerate | ACCEL | W or ↑ |
| Brake / reverse | BRAKE (hold at a standstill to reverse) | S or ↓ |
| Horn | HORN | Space |
| Camera (chase / hood) | 🎥 | C |
| Pause | ❚❚ | Esc / P |

## What's in the game

- **Trips:** Ojota → Berger, Berger → Mowe, and Ojota → Mowe (unlocks at 3★), all on one 24 km real route
- **Passengers:** load at the park, drop each at their stop, pick up people waiting along the way. Fares plus tips depend on ride comfort; missed stops cost you
- **Detours:** 153 km of real OSM streets beside the expressway, 90 km of them untarred. Leave from the right shoulder to beat the Berger, Kara and Arepo gridlocks
- **Chowdeck and Glovo delivery riders:** lane-splitting on the Lagos stretch and riding the inner streets
- **Real landmarks** placed where they are: Gani Fawehinmi Park, Ketu Market, Kara (cattle) Market, Hi-Impact Planet, Mountain Top University, fuel stations, schools, estates and more (35). Collect them in **Places**
- **Progression:** 3-star missions per trip, a ₦ wallet, and vehicles to buy (Hiace, Luxury Bus)
- Toyota Sienna and Intercity Bus to start. Navigation with jam and detour hints, heading-up minimap with streets, road events (road works, breakdown, police checkpoint), fuel, damage, violations

## Project layout

```
spec/trip-ibadan/     product spec (09-HANDOFF-MVP.md is the build spec)
design/               wireframes and design archive
tools/osm/            map pipeline: Overpass fetch → route build (elevation, terrain)
data/osm/             raw OSM extracts used by the pipeline
public/data/          baked route file loaded by the game
src/map/              Route system (road-space geometry)
src/world/            3D world builder, procedural vehicles and textures
src/systems/          Driving, Traffic, Camera, Navigation, Fuel/Damage/Events/Scoring, Audio, Save
src/ui/               screens, HUD, minimap
docs/                 technical docs, asset inventory, deployment, known limitations
```

Map data © OpenStreetMap contributors (ODbL). Elevation: AWS Terrain Tiles (SRTM-derived).
