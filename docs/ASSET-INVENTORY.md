# Asset inventory

Models are built for this project; surface textures and the sky are CC0 scans from Poly Haven (listed below). There are no third-party model or audio files. Real models go in `public/models/` (see ASSET-CONTRACT.md); record each one's source and licence here.

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

## 3D models (`public/models/`)
| File | What | Source | Licence |
|---|---|---|---|
| `vehicles/hiace.glb` | Hiace-style 14-seat minibus: unbadged, white with Lagos–Ibadan livery, roof rack with luggage, sliding door, interior with seats, named lamp/seat/camera nodes | Built for this project from script (`tools/blender/build_bus.py`) | Project-owned |
| `scenery/roadside.glb` | Roadside kit, 21 pieces (~10k triangles in total): kiosk, buka, vulcanizer, POS stand, umbrella stall, bus shelter, petrol station, 3 billboards, church sign, water tank, power pole, open and covered drain, unfinished building, elephant grass, plantain, jerrycans, tyre pile, sand pile. Fictional names and adverts only | Built for this project from script (`tools/blender/build_roadside.py`, textures from `kit_textures.py`) | Project-owned |
| `vehicles/sienna.glb` | Sienna-style 8-seat minivan: unbadged, silver, sliding doors both sides, roof rails with a bag, alloy wheels, interior with front seats and two benches, named lamp/seat/camera nodes | Built for this project from script (`tools/blender/build_van.py`) | Project-owned |

## People (`src/world/people.ts`)
Procedural passengers, conductor and bystanders built from a random `Look`: seven skin tones, men and women, young/adult/elder, build and height variety; faces (eyes, brows, nose, mouth, ears); hair (low cut, afro, braids, bun, bald); headwear (gele, fila, scarf, cap); clothing (ankara wrapper and blouse with bands, gowns, skirts, kaftan with embroidered placket, agbada, shirts, polos, trousers); bags and walking canes. Standing, seated, walking (swinging limbs) and conductor (reaching arm) versions.

## Interiors (`src/world/interior.ts`)
Cockpit and cabin shells: floor, trim, pillars, roof lining, seats with headrests, dashboard with gauges, steering column and wheel.

## Buildings / roadside
Roadside kit from `scenery/roadside.glb`, placed by `src/world/Roadside.ts` (see above). Procedural: bungalow and two-storey house variants with rust/grey roofs (6), Mowe motor park blocks, palm, broadleaf tree, bush, median street light, cone, road-works boards, hazard triangle, police officers (simple figures).

## Road assets
Asphalt surfaces (both carriageways, ramps), lane and edge markings, New Jersey median barrier, bridge parapets, deck slabs, piers, footbridges with stair towers, water plane, green direction signs, overhead Mowe gantry, road-works and checkpoint signs, blue destination bay.

## Scanned surfaces and sky (Poly Haven, CC0)
Fetched and shrunk for phones by `tools/assets/fetch-polyhaven.mjs` (raw 1k files are cached in `tools/assets/raw/`, not committed). About 4 MB in total. Used through `src/world/Surfaces.ts`.

| File (in `public/`) | Used for | Source | Licence |
|---|---|---|---|
| `textures/aerial_asphalt_01_*` | Expressway and ramps | polyhaven.com/a/aerial_asphalt_01 | CC0 |
| `textures/asphalt_02_*` | Tarred inner streets | polyhaven.com/a/asphalt_02 | CC0 |
| `textures/red_laterite_soil_stones_*` | Untarred roads, road verge | polyhaven.com/a/red_laterite_soil_stones | CC0 |
| `textures/leafy_grass_*` | Ground | polyhaven.com/a/leafy_grass | CC0 |
| `textures/brown_mud_dry_*`, `concrete_block_wall_*`, `painted_plaster_wall_*`, `rusty_corrugated_iron_*`, `concrete_pavement_*` | Downloaded for the roadside kit and buildings; not wired in yet | polyhaven.com | CC0 |
| `env/kloofendal_43d_clear_puresky_1k.hdr` | Sky lighting and reflections (High quality) | polyhaven.com/a/kloofendal_43d_clear_puresky | CC0 |

Each texture set is colour (`_diff`), normal (`_nor`) and AO/roughness/metal (`_arm`).

## Textures (`src/world/textures.ts`)
Procedural canvas textures: blob shadow and sign faces (rendered text). The old procedural asphalt, ground and dirt textures are no longer used.

## UI assets
Inter and Bebas Neue (Google Fonts, OFL). SVG vehicle silhouettes (`src/ui/icons.ts`), CSS-only HUD.

## Audio (`src/systems/Audio.ts`)
Synthesised with WebAudio: engine (gear-simulated revs), tyre/road noise, off-road rumble, brake hiss, collision, horn, reverse beeper, indicator tick, UI click, event chime. Navigation voice uses the browser's built-in speech synthesis (prefers an `en-NG` voice when the device has one).

## Map data
`data/osm/road.json`, `data/osm/places.json` (OSM, ODbL); DEM tiles cached in `data/dem/` (AWS Terrain Tiles); baked `public/data/berger-mowe.json`.

## Characters (test, not yet used in the game)
| File | What | Source | Licence |
|---|---|---|---|
| `public/models/characters/man.glb`, `woman.glb` | Rigged man and woman, each with several garments (shirts, kaftan and fila; blouse, gown, wrapper and gele), hair pieces, and idle, talking, walk, sitting and interact animations. About 1.4 MB and 1.8 MB. The game switches garments on per person and colours them | Built by `tools/blender/build_passenger.py` from Quaternius *Universal Base Characters* and *Universal Animation Library* (free Standard versions), fetched with `tools/assets/fetch-quaternius.mjs` | CC0 |

The raw packs (138 MB) are cached in `tools/assets/raw/quaternius/` and are not committed. The free versions contain two base bodies (male, female), eight hair pieces and 43 animations.
