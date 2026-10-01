# Known limitations (MVP)

What is simulated rather than physically or geographically accurate.

## Map / world
- **Road geometry is real** (OSM), but lightly smoothed (about 15 m window) and resampled every 5 m.
- **Lane counts** follow OSM `lanes=` (2 or 3 northbound). Lane widths are a standard 3.65 m; real widths vary.
- **Elevation** is SRTM-derived (roughly 30 m resolution, includes buildings and canopy). It is blurred and grade-limited to 4%, so small dips and cuttings are lost.
- **Bridges** are spanned in a straight line between their ends. Pier spacing (30 m), parapets and deck depth are generic. The water under the long bridge (km 7.3–8.0 from Ojota) is a flat plane at valley level. That bridge is *likely* the Ogun River crossing at Kara; this is not confirmed against imagery.
- **Interchange ramps** are visual only (you can't drive onto them). Where ramps meet the carriageway at grade they can overlap the road surface.
- **Trees are procedural.** There is no satellite imagery drape.
- **The southbound carriageway** is real geometry, but its oncoming traffic is visual only (no collisions across the median).
- **Mowe Park** is a representative bay at the point on the road nearest the Mowe place node, not the actual park layout.

## Streets, places, riders (v2)
- **Street surfaces:** OSM tags 90 km of the nearby streets. For the 77 km with no surface tag, the game **assumes** they are tarred in Lagos and untarred in Ogun (past the Ogun River bridge). These streets are marked `a: 1` in the route file.
- **Houses are procedural**, placed along the real streets (not real building footprints). Density is capped per kilometre.
- **Landmarks** come from OSM names and categories. Places closer than 20 m to the expressway are pushed back. Headline landmarks set back beyond 300 m (for example Hi-Impact Planet at 383 m) are pulled in to 290 m so you can see them. Buildings use generic category models, except the custom scenes for Gani Fawehinmi Park, Kara Market, Hi-Impact Planet, Mountain Top University and the BRT depot.
- **Ojota Motor Park** is represented at the Ojota Interchange, beside the expressway. Its exact real layout is not modelled.
- **Chowdeck and Glovo are real trademarks.** Get permission before a public release, or swap the names in `src/data/brands.ts`. Their colours are approximations.
- **Fares** are game values (`fareFor` in `src/data/trips.ts`), not real park prices.
- **Gridlocks** are fixed at Berger, Kara and Arepo. Their positions are real notorious spots, but the timing and length are game design.
- Streets are drivable only on the right-hand side of the northbound carriageway (the median barrier blocks the other side). There's no street traffic except riders.

## Change-spec pass (Oct 2026)
- **People are stylised (cartoon-like) rigged characters**, not photoreal. Clothing is a fitted copy of the body surface, so it doesn't drape: a blouse hem can stick out at the hips when seated, and a wrapper stretches between the knees. Agbada uses the kaftan, scarf and cap use the gele and fila shapes, and afro hair uses the bun. Bags and walking sticks aren't shown. Bystanders at other stops and checkpoint officers are still the old simple figures.
- **The route is still Ojota → Mowe (24 km).** Sagamu, Ogere and Ibadan (Iwo Road) need the map pipeline re-run with wider bounding boxes (see TECHNICAL.md, "Adding the next leg").
- **Pace:** at Normal (3×) cruising looks fast because the vehicle really covers the road 3× faster. Clock scale and travel scale are separate numbers in `src/systems/GameClock.ts` if they need different values.
- Seated passengers play idle and talking animations. The conductor's hand-over is a talking animation plus a flying note, not a hand-to-hand animation; he is hidden in the cabin view because he sits right against the camera.
- **Rear-view display** is a small camera view, not a mirrored image. It's off on Low graphics.
- **Passenger mood** reacts to ride comfort, long stops, missed stops and disputes. Music, weather and traffic don't affect it yet.
- **Dialogue is text only** (no voices). Yoruba lines should be checked by a native speaker.
- The Sienna now seats 6 passengers because the conductor takes the front seat.

## Roadside scenery
- **Roadside shops, stalls, billboards and poles are representative**, placed by rule from street density and stop positions, not from imagery of the real roadside. Names, brands and adverts are fictional.
- The open drain is drawn at ground level (the terrain isn't cut), so it reads as a dark channel between two concrete lips rather than a real trench.
- Under flyovers and around interchange ramps the roadside is left empty, because the ramps aren't solid; real traders often set up there.
- Shops have no people yet, and the petrol station forecourt is solid (you can't drive in to buy fuel).

## Rendering (showcase pass)
- **Scanned surfaces and sky lighting** are on the road, streets, verge and ground. Houses, trees, people and traffic still use flat colours, so they don't yet match the road's realism.
- **Sun shadows are off by default.** A first version with cascaded shadows crashed the graphics context on the test machine. A lighter single shadow map can be switched on with `?fx=shadow` in the address; it ran at about 20–24 fps in the preview and made the driver and cabin views too dark. `?fx=noenv` switches the sky lighting off.
- On Low quality the same photos are used without normal maps, sky lighting or shadows.
- The visible sky is still the procedural one; the scanned sky is used for lighting and reflections only.

## Driving / systems
- **Vehicle physics** is an arcade-leaning free-driving model (kinematic steering, no tyre slip or suspension). Gears are P/R/N/D (automatic); there is no manual gearbox. The map ends 318 m either side of the expressway, because terrain is only baked that far.
- **Fuel** consumption is scaled ×10 (`FUEL_GAME_SCALE`) per real metre driven, so the 24 km Ojota → Mowe run uses about 35–50% of a tank whatever the pace setting. Real consumption would be about 4%.
- **Damage** is a single condition value with no visual deformation.
- **Traffic AI** is simplified IDM/MOBIL: no indicators, no reversing, and it doesn't react to the player's lateral drift until overlap.
- **Road events** are fixed positions from `src/data/trips.ts`. The police checkpoint is a speed check only (no stop/talk interaction yet).
- **Speed limits** are 100 km/h for the Sienna and 90 km/h for the bus (FRSC-style), 50 in road works and 30 at the checkpoint.
- **Scoring values** follow spec 09 §19 and need tuning in playtests.

## Platform
- Tested in Chromium desktop and mobile emulation only. Not yet tested on a real mid-range Android phone or iOS Safari.
- Voice navigation depends on the device's speech-synthesis voices.
- The music slider is stored but there's no music or radio yet.
- The Android package has not been built (see DEPLOYMENT.md).
