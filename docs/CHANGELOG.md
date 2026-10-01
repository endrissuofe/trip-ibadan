# Changelog

## Showcase pass, part 1: photographic surfaces and sky lighting (1 Oct 2026)

- **Scanned materials (Poly Haven, CC0)** replace the programmer-drawn textures: real tarmac on the expressway and ramps, cracked asphalt on inner streets, red laterite on untarred roads, scruffy grass on the ground.
- **Red-earth verge** along the outer shoulder of both carriageways (not on bridges), with an uneven edge.
- **High quality:** PBR materials (colour, normal, AO and roughness maps) lit by a real clear-sky HDR, which also gives the vehicles reflections. **Low quality:** the same photos as plain textures.
- Sun shadows exist but are opt-in (`?fx=shadow`) until they are stable and fast enough.
- `tools/assets/fetch-polyhaven.mjs` re-downloads and re-compresses the assets (about 4 MB shipped).

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
- **Occasional change disputes** (roughly 1 in 15 payments, never back-to-back). Check the money, pay the passenger, or back the conductor; if you don't decide, he counts it himself.
- **Dialogue system** with Nigerian Pidgin, English and some Yoruba lines (`src/data/dialogue.ts`), varied with no back-to-back repeats.
- **Passenger list** (📋 / M) with seat, destination, payment status and mood; passengers who want to get down are highlighted, and a sign appears over their head in the cabin view.
- **Trip summary:** passengers served, fares collected, change returned, disputed fares, unpaid fares, refunds and change losses.
- Sienna now carries **6 passengers** (the conductor has the front seat).

### People
- New procedural people: faces, hair (low cut, afro, braids, bun), headwear (gele, fila, scarf, cap), everyday Nigerian clothing, skin-tone, age, build and gender-presentation variety; walking, seated and conductor figures with moving arms and legs. These are stand-ins for rigged photoreal characters (see `docs/ASSET-CONTRACT.md`).

### Models
- **First real 3D vehicle:** a Hiace-style 14-seat minibus built in Blender from script (`tools/blender/`), loaded automatically for the Toyota Hiace, and a **Sienna-style minivan** for the Toyota Sienna (the starting vehicle). Brake, reverse and indicator lights line up with each model's lamp lenses and are sized to fit them.
- **Driver and cabin views use the real vehicle interiors:** its own dashboard, steering wheel (turns as you steer), seats and windows. Passengers and the conductor sit in the model's seats, walk to its door, and the reversing camera and rear-view display use the model's camera points.
- **Worn-in look:** both vehicles carry red-brown laterite dust (heaviest low down and around the wheel arches), rain streaks under the windows, grime in creases and slight sun fade; the bus also has a few rust spots. Tyres have tread, seats have woven fabric, floors have ribbed rubber mats, and the bus wheels have wheel nuts.
- Optional real GLB vehicles via `public/models/manifest.json`, with lamps snapping to the model's named nodes. Nothing is downloaded unless a model is listed.

### Roadside scenery
- **New roadside kit built in Blender** (`tools/blender/build_roadside.py`, loaded from `public/models/scenery/roadside.glb`): kiosks with soft-drink crates and pure water, bukas with pots and benches, vulcanizers with compressor and tyres, POS stands, umbrella stalls, bus shelters, a petrol station, billboards, church signs, water tanks on stands, power poles with sagging wires, open and slab-covered drains, unfinished block buildings with rebar, sand piles, jerrycans, tyre piles, elephant grass and plantain. All shop names, brands and adverts are made up (MAMA TOLU, IYA BASIRAT, KOLA OIL, NaijaNet 5G, Ofada Gold).
- **Placed from real data:** how built-up each stretch is comes from the real street density beside the road and the distance to the real stops. Shops crowd the kerb around Berger, Kara, Magboro, Arepo, Ibafo and Mowe and wherever people live; open stretches get tall grass, plantain and half-built houses (more of them in Ogun). Open drains and power lines follow the town kerb, with gaps where streets join. Extra petrol stations only go on long stretches with no real one nearby.
- Nothing is placed on bridges, interchange ramps, footbridges, streets, bus-stop bays or the far carriageway. Buildings, stalls, poles and billboards are solid; grass and plantain are not.
- Everything is batched per 1.5 km, so it adds roughly 100 draw calls in the busiest views and about 1.5 s to loading.

### Other
- A delivery rider riding into your parked vehicle no longer counts as you knocking them down.
- Traffic no longer rear-ends the vehicle while it's parked at the park loading passengers (this could cost up to 40% condition before the trip started).
- `npm test`: unit tests for fares, change-making, disputes and dialogue (Node 22.6+).

### Rigged people and getting out of the drain
- **Passengers, the conductor and people at the park are now rigged, animated characters** (`src/world/rigged.ts`): they stand and talk in the queue, walk to the door, and sit and talk in the cabin. Each one is dressed from the same look data as before (shirt, polo, kaftan and fila, blouse and wrapper, gown, gele) in their own colours. People further than 160 m from the camera are paused. If the character files fail to load the game uses the old procedural people.
- **Getting stuck (fixed at the root):** bouncing off the median barrier, a bridge parapet or a road-works barrier used to put the vehicle 2 cm on the wrong side of the wall, so it hit the wall again on every step, lost speed each time and had its nose pulled back parallel. It sat glued to the barrier at walking pace and could not steer or reverse away. The bounce now lands on the correct side and works when reversing too. A scrape along a barrier counts as one knock per second, not one per frame.
- **Roadside objects:** the strip beside the road (14 m) is firm ground instead of deep bush. Stalls, poles and buildings cost speed once when hit; a vehicle pressed against one swings its nose away and slips past. Long coaches use a narrower collision circle. Repeat knocks within 0.8 s don't add damage.
- **Back-out assist:** stopped in Drive just after hitting something (a wall, a stall or another vehicle), hold the brake for half a second and the vehicle reverses away; press the accelerator to drive forward again. A hint appears when you're blocked. Reverse gear can also be selected while the vehicle is held still.
- **Last resort:** if the vehicle makes no real progress for 2 seconds with the engine pulling (judged on net distance, so being wedged between two objects counts), it is put back in the nearest lane. This never triggers in a traffic queue.
- Clothing colours that looked like bare skin (khaki, brown) were replaced.
