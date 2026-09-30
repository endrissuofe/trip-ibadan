# Asset inventory

Every asset is procedural or open data. There are **no third-party model, texture or audio files** yet, which keeps the download small and avoids licensing risk. Real models go in `public/models/` (see ASSET-CONTRACT.md); record each one's source and licence here.

## Vehicles (`src/world/models.ts`)
| Asset | Use | Notes |
|---|---|---|
| Toyota Sienna-style minivan | Player (primary) | Silver, 6 passenger seats + conductor. Inspired by the real vehicle, no badges |
| Intercity minibus (high-roof) | Player (secondary), traffic, parked at Mowe | White with operator pinstripe |
| Sedan, SUV | Traffic | 7 and 4 colourways |
| Danfo (yellow minibus) | Traffic only | Real expressway mix; never the player vehicle (spec) |
| Container truck, fuel tanker | Traffic, broken-down truck event | Cab-over rigs |
| Coach | Traffic | White intercity coach |
| Police SUV | Checkpoint event | |

## People (`src/world/people.ts`)
Procedural passengers, conductor and bystanders built from a random `Look`: seven skin tones, men and women, young/adult/elder, build and height variety; faces (eyes, brows, nose, mouth, ears); hair (low cut, afro, braids, bun, bald); headwear (gele, fila, scarf, cap); clothing (ankara wrapper and blouse with bands, gowns, skirts, kaftan with embroidered placket, agbada, shirts, polos, trousers); bags and walking canes. Standing, seated, walking (swinging limbs) and conductor (reaching arm) versions.

## Interiors (`src/world/interior.ts`)
Cockpit and cabin shells: floor, trim, pillars, roof lining, seats with headrests, dashboard with gauges, steering column and wheel.

## Buildings / roadside
Bungalow and two-storey house variants with rust/grey roofs (6), Mowe motor park blocks, palm, broadleaf tree, bush, median street light, cone, road-works boards, hazard triangle, police officers (simple figures).

## Road assets
Asphalt surfaces (both carriageways, ramps), lane and edge markings, New Jersey median barrier, bridge parapets, deck slabs, piers, footbridges with stair towers, water plane, green direction signs, overhead Mowe gantry, road-works and checkpoint signs, blue destination bay.

## Textures (`src/world/textures.ts`)
Procedural canvas textures: asphalt, ground, blob shadow, sign faces (rendered text).

## UI assets
Inter and Bebas Neue (Google Fonts, OFL). SVG vehicle silhouettes (`src/ui/icons.ts`), CSS-only HUD.

## Audio (`src/systems/Audio.ts`)
Synthesised with WebAudio: engine (gear-simulated revs), tyre/road noise, off-road rumble, brake hiss, collision, horn, reverse beeper, indicator tick, UI click, event chime. Navigation voice uses the browser's built-in speech synthesis (prefers an `en-NG` voice when the device has one).

## Map data
`data/osm/road.json`, `data/osm/places.json` (OSM, ODbL); DEM tiles cached in `data/dem/` (AWS Terrain Tiles); baked `public/data/berger-mowe.json`.
