# Trip_Ibadan — Design Pack v0.2

Status: **DRAFT, not frozen yet.** Covers the nine deliverables in `spec/trip-ibadan/05-DESIGN-PROCESS.md`.
Visual wireframes are in [`wireframes.html`](wireframes.html). Open it in a browser.

**What changed in v0.2**
- The bus is now a **white intercity park bus** (mixed fleet), not a yellow danfo.
- The brand accent is **Ibadan Rust** orange, not yellow.
- The route now uses **real OpenStreetMap measurements** (§2).
- New §10 sets the "real road" rules: 1:1 geometry, bridges and interchanges.
- Engine decision: **Babylon.js** (§11).

---

## 1. Player fantasy board

**Who you are:** a park driver on the Lagos–Ibadan line. You load at Berger, fill your seats, hit the expressway, drop people along the way, and pick more from the roadside. You want the money, you want the bus to stay whole, and you don't want wahala at the checkpoint.

**Joke vs sim:** about **70% fun / 30% sim**.
- Sim: the bus has weight, braking distance, body roll, and fuel/heat. Stops need a real pull-in.
- Joke: the park caller, passenger shouts, checkpoint dialogue, result-card brag text.
- Rule: the jokes live in **text and audio**. Physics is never a joke.

**Three screenshot moments for X:**
1. **"Berger to Mowe, I did it."** The result card: white Hummer bus with red-earth dust on the skirts, the real route line, ₦ total, passengers, and "Bribes: ₦0 😤".
2. **The long bridge.** Chase cam low over the Ogun River bridge at Isheri/Kara, the white bus in harsh sun, with river and bush below.
3. **Loading at Berger.** The park caller shouting "IBADAN! IBADAN! ONE CHANCE!" and the seat counter at 17/18.

---

## 2. Route: real OSM data (v1 slice)

Source: OpenStreetMap via Overpass (`data/osm/`, produced by `tools/osm/analyze.mjs`). The road is tagged `highway=motorway`, "Lagos-Ibadan Expressway", with the northbound carriageway fully connected.

**Order confirmed: Berger → Magboro → Ibafo → Mowe.** The OSM centroids sit at 6.642°N, 6.715°N, 6.742°N and 6.778°N.

Distances below are **along the northbound carriageway**, with game km 0 set at the Ojodu Berger interchange:

| Game km | Real feature (from OSM) | Game role |
|---|---|---|
| 0.0 – 0.6 | **Ojodu Berger Interchange**: 3 junction nodes, several ramps, 3 footbridges | Start: Berger park |
| **1.1 – 1.85** | **731 m bridge** (layer 1), next to Isheri; likely the Ogun River crossing at Kara (confirm on imagery) | First "wow" beat |
| 2.9 | Ramp leaves northbound | Visual only |
| **9.0 – 9.2** | 208 m bridge | Scenery |
| **10.4 – 10.9** | Ramp + **317 m bridge**: the Magboro interchange | **Stop 1: Magboro** |
| 13.0 | **Arepo Bus Stop** (mapped `bus_stop` node) | Roadside pickup point |
| **13.8** | Ibafo (town centroid 35 m from the road) | **Stop 2: Ibafo** |
| **17.8** | Mowe (town centroid 324 m from the road) | **Stop 3: Mowe**, end of trip |

**Length: about 17.8 km, played at 1:1 geometry. The road is not compressed.**
At game speeds of 80–100 km/h plus stops, a run takes about **12–14 minutes**. Later, a short "Berger → Magboro" quick trip (about 10 km) can serve phone sessions.

Still to do in Phase 1: find exact bay positions on satellite imagery, name the 9 km bridge, and confirm the 731 m bridge is the Ogun River crossing.

**Sagamu Interchange:** deferred. It sits roughly 30+ km beyond Mowe. It becomes the first extension chunk after v1.

---

## 3. Storyboard (v1)

| # | Beat | Camera | Player does | What can go wrong |
|---|---|---|---|---|
| 1 | **Garage** | Static orbit around the bus | Picks a bus. v1: Hummer unlocked; older HiAce and Sienna show as locked silhouettes. | Nothing. This screen sells the bus. |
| 2 | **Loading at Berger park** | Chase, parked in the loading lane | The park caller shouts and passengers board over time. Seat counter fills. **Choice:** leave now with fewer passengers, or wait for a full bus and lose time. | Waiting too long adds a time penalty. |
| 3 | **Leave Berger** | Chase | Pulls out of the park onto the northbound expressway under the interchange ramps and footbridges. Town banner: **BERGER**. | Clipping the kerb causes damage. This teaches that the bus has weight. |
| 4 | **The long bridge** (km 1.1) | Chase | Crosses the 731 m bridge. Parapets, river below, and the road rises and falls with the real elevation. | Potholes on the approach slab. |
| 5 | **Magboro stop** (km 10.4) | Chase | Indicates into the bay under 20 km/h and presses **PARK**. Drops passengers and picks up roadside passengers waiting for Ibadan. | Too fast: overshoots the bay ("You don pass am!"). |
| 6 | **Arepo roadside wave** (km 13) | Chase | A passenger waves from the shoulder; slow down and flash to pick them up. This beat is optional. | Stopping in the lane gives a **"Blocking road"** warning. |
| 7 | **Ibafo stop** (km 13.8) | Chase | Same loop as Magboro. | Same as Magboro. |
| 8 | **Mowe + result card** (km 17.8) | Chase, then freeze-frame | Parks in the Mowe bay to end the trip. | Wreck mid-route shows the **"TRIP SCATTER"** card. |

Hawkers, okada and the checkpoint stay in v2.

---

## 4. Cameras

| Camera | Where | Default on | UI allowed |
|---|---|---|---|
| **Chase** | 10 m back, 4 m up (the Hummer is taller), spring lag | Mobile | Full thumb HUD |
| **Hood** | Above the short nose, with the bonnet edge visible | Desktop | Minimal HUD |
| **Cabin** | Driver's seat on the **left** (Nigeria drives on the right with LHD vehicles) | Desktop only | Almost none: diegetic phone on the dash plus the speedo |

**Forbidden in cabin view:** mini-map, big buttons, any overlay inside the windscreen area.
**Mobile safe area:** nothing interactive in the top 44 px or bottom 34 px; thumbs sit ≥ 16 px from the edges.

---

## 5. HUD and menus

| Screen | Copy |
|---|---|
| **Boot** | "TRIP IBADAN" · "Lagos → Ibadan. Real road." · **[ OYA, LET'S GO ]** |
| **Garage** | "Choose your motor" · Hummer "Correct. Ready." · Old HiAce "Locked" · Sienna "Locked" · **[ ENTER MOTOR ]** |
| **Loading (park)** | "IBADAN! IBADAN! ONE CHANCE!" · "Seats 11/18" · **[ WAIT ]** **[ MOVE NOW ]** |
| **In-trip HUD** | "IBAFO · 4.0 km to Mowe" · "₦ 21,000" · seat pips · damage bar · STEER / DRIVE / BRAKE / horn |
| **Stop prompt** | "MAGBORO!" · "3 dey drop · 2 dey wait" · **[ PARK ]** · "+₦1,500" |
| **Checkpoint (v2)** | "Oga, particulars?" · **[ PAY ]** **[ TALK AM ]** **[ ZOOM OFF ]** |
| **Pause** | "Hold on…" · **[ CONTINUE ]** **[ CHANGE VIEW ]** **[ COMOT ]** |
| **Result card** | "BERGER → MOWE" · ₦ total · passengers · damage · bribes · time · brag line · **[ SHARE ]** **[ RUN AM AGAIN ]** |

**Fares are placeholders and need tuning:** a full Lagos → Ibadan seat is paid at the park; drop-offs at Magboro/Ibafo/Mowe pay less. Tune the numbers in playtest. Don't hard-code "real" prices.

**Brag lines:** "Agbero dey hail you." · "Correct driver. No shaking." · "You reach. That one na something." · "Passengers don report you to God." · Wreck: "TRIP SCATTER. The motor don cast."

---

## 6. Fleet and bus sheet

White intercity park buses. The designs are **inspired by** real models; no manufacturer badges or logos, and all park names are invented.

### v1 hero: "Hummer" (Toyota HiAce high-roof style)
- **Size:** about 5.4 m long, 1.9 m wide, 2.3 m tall. Long wheelbase, high roof, short sloped nose.
- **Seats:** 18 passengers in 4 rear rows plus the front bench. LHD driver.
- **Body:** off-white `#F4F3EE` gloss.
- **Livery:** thin rust + navy pinstripe along the waist line, a small invented park emblem, and "ALAKOWE MOTOR PARK · LAGOS ⇄ IBADAN" in navy on the rear quarter. The fleet number "HB 07" sits by the sliding door.
- **Windscreen banner:** a tinted strip across the top of the windscreen reading **"GOD DEY"** in white. It's the signature look.
- **Plate:** fictional Lagos-format plate on a yellow-white background, for example "LSD 418 TB".
- **Glass:** dark-tinted side windows, with one window curtain pulled.
- **Wear ("readable real"):** **red laterite dust** fading up the lower third, heaviest behind the wheels. White shows dirt, and that's the realism cue. Also bug spots on the nose, one taped mirror, and 2 stickers ("No Condition Is Permanent", "Jesus is Lord"). No dents everywhere; the white must stay white at chase distance.
- **Interior (low-poly v1):** bench rows, a fold-down aisle seat, a flat dash, a phone mount (diegetic HUD), and a rosary on the mirror.
- **Budget:** ≤ 15k tris exterior, ≤ 5k interior, one 1024² atlas + decals, KTX2.

### Garage unlocks (silhouettes in v1)
| Bus | Feel | Trade-off |
|---|---|---|
| **Old HiAce** (low roof, square body, ~14 seats) | Old-school park bus, rattly, cheaper | Fewer seats, weaker brakes |
| **Sienna** (white minivan, 7 passengers) | "Express" trip, fast and smooth | Few seats, but a higher fare per head |
| Later: **Coaster / luxury coach** | Big-company intercity | Heavy handling, more seats |

BRT is removed from the fleet because it doesn't run Lagos–Ibadan.

---

## 7. World kit

**Real-road cross-section** (confirm lane count per section from OSM `lanes=` and imagery): shoulder 2.5 m, 3 lanes × 3.65 m, inner verge, median barrier. Southbound is mirrored and visual only in v1.

**Stop bay:** 60 m lay-by with 20 m tapers. It has painted edge lines (real white/yellow road paint), a hand-painted stop board, and waiting passengers. The trigger zone is the bay box.

**Potholes:** small (cosmetic), medium (damage + complaint), and crater (big damage). Each has a raised broken-tar rim so it pops against the road.

**Prop budget (v1):** 13 instanced meshes: bush card, palm, lamp post, median segment, green sign, stop board, kiosk, parked car, parked keke, passenger ×3 colourways, pothole rim, blank billboard, **bridge pier**.

**Landmarks v1:** Berger interchange + footbridges, the long Ogun River bridge, the Magboro interchange bridge, Arepo bus stop, and the Mowe junction.

---

## 8. Colour and type

| Token | Hex | Use |
|---|---|---|
| **Ibadan Rust** (brand) | `#E0592A` | Logo, primary buttons, route line |
| Night navy (ink) | `#0F1B2D` | Dark UI surfaces, livery pinstripe |
| Bus white | `#F4F3EE` | Hero bus body |
| Laterite dust | `#A4522C` | Bus grime, road shoulder |
| HUD pill | `rgba(15,27,45,0.78)` + white text | All HUD text sits on navy pills |
| Naira green | `#19C37D` | +₦, success |
| Danger | `#FF2D55` | Damage, fines, crash. It's pink-red so it can't be confused with the rust brand. |
| Info cyan | `#2EC5FF` | Next-stop marker |
| Night sodium | `#FF9A2E` | Old lamps |
| Night LED | `#DDEBFF` | New lamps near Berger |

**Type:** Inter (UI) and Bebas Neue (logo, stop boards, banners).

**Lighting looks:** harsh day (v1), rain (v2), night (v2).

---

## 9. Audio

| Sound | Notes |
|---|---|
| **Horn "POOOON"** | Brand sound, and still the Hummer's voice: a nasal two-tone, "po" (~400 Hz) sliding to "OOON" (~350 Hz). Tap = short "pon!", hold = long. |
| Park caller | "Ibadan! Ibadan! One chance!", "Oya enter, e don remain two!", "Magboro! Ibafo! Mowe!" |
| Engine | Diesel HiAce drone, smoother than a danfo, with a slight turbo whistle on the Hummer |
| Fare, crash, pothole, radio, rain | As before |

---

## 10. Real-road rules (non-negotiable)

These rules exist so the road never becomes "a long road".

1. **1:1 OSM geometry.** Curves, gradients and junction positions come from data. There are no generated straights and no compression of the road shape.
2. **Bridges are real structures.** Every OSM `bridge=yes` segment gets a deck, parapets, expansion joints, and piers down to the terrain. The ground, river or valley is visible underneath.
3. **Interchanges are visible.** Berger and Magboro ramps and flyovers are modelled from `motorway_link` ways. In v1 they are visual only; the player stays on the mainline.
4. **Footbridges** are modelled where OSM has them (3 at Berger).
5. **Elevation** comes from SRTM/Terrarium tiles, so the road rises onto bridges and dips into valleys.
6. **Real signage:** green overhead or side signs at real junctions, using only real place names.
7. **Satellite drape** on the ground either side, so the corridor looks like the real one from above.

---

## 11. Engine decision: Babylon.js

"Feels real" comes mostly from **the data (road, bridges, elevation), the bus model, and the lighting**. Babylon.js gives the most of that out of the box:
- PBR materials + image-based lighting, so white paint, glass and chrome look right
- A built-in rendering pipeline: tone mapping, bloom, SSAO, and optional screen-space reflections for wet roads in v2
- Havok physics for bus weight, suspension and body roll
- glTF loading, instancing for props, hardware scaling for mid-range Android
- An in-browser inspector for tuning lights and materials

Three.js could reach the same look, but it needs more assembly (post-processing, physics, loaders). Babylon also matches the spec's default.

---

## 12. Scope freeze frame

> Chase camera. **White Hummer bus** crossing the long bridge after Berger, harsh day light, parapets and river below, satellite-draped ground either side. HUD shows "BERGER · 16.5 km to Mowe", ₦ total, seats, DRIVE/BRAKE/horn in Ibadan Rust.

Phase 1 may only chase this: the real road from Berger to Mowe (with bridges and elevation), one bus, and three cameras. No passengers, fare, traffic or weather yet.

---

## Decisions log

| # | Decision | Answer |
|---|---|---|
| 1 | Route order | **Confirmed from OSM:** Berger → Magboro → Ibafo → Mowe |
| 2 | Name | **Trip_Ibadan** |
| 3 | Start | **Berger** |
| 4 | Sagamu | **Deferred** to the first extension chunk |
| 5 | Engine | **Babylon.js** (§11) |
| 6 | Bus | **White park buses, mixed fleet.** Hummer is the v1 hero. |
| 7 | Brand colour | **Ibadan Rust `#E0592A`** |

## Freeze checklist

- [ ] Fantasy board approved
- [x] Route order + stops confirmed (OSM)
- [ ] Storyboard approved (incl. new park-loading beat)
- [ ] Camera frames approved
- [ ] HUD / menu copy approved
- [ ] Bus sheet approved (Hummer livery, "GOD DEY" banner, dust level)
- [ ] World kit + real-road rules approved
- [ ] Colour + type approved (Ibadan Rust)
- [ ] Horn approved
- [ ] Freeze frame approved → **Phase 1 unlocked**
