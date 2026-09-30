# 09 — Developer Handoff Specification (MVP)

> **This document supersedes earlier files where they conflict** (vehicle choice, scoring, screens).
> Received 2026-09-30.

## Reconciliation notes (from real OpenStreetMap data)

The spec's own rule says route geometry must come from real map data. Three details below disagree with OSM, and the build follows OSM:

| Spec says | OSM says | Build uses |
|---|---|---|
| Berger → Mowe "~60 km" | **~17.8 km** along the northbound carriageway | 17.8 km (real). Lagos → Iwo Road is roughly 110–120 km in total. |
| Future route order: … Kara → Berger → Arepo → Mowe → **Ibafo** … | Northbound order is Ojota → **Berger → Kara bridge** → Magboro → Arepo → **Ibafo → Mowe** → Redemption Camp → Sagamu | Real order. Progression becomes Berger → Mowe, then Mowe → Sagamu, and so on. |
| Progression step "Mowe → Ibafo" | Ibafo is **before** Mowe | Dropped. Ibafo is inside the Berger → Mowe slice. |

---

**Product:** Trip_ibadan
**Prototype:** Berger → Mowe
**Future full route:** Lagos → Iwo Road, Ibadan
**Primary platform:** Mobile
**Game type:** 3D destination-based driving game

## 1. Product Vision
Trip_ibadan is a Nigerian driving game centred around realistic intercity travel. The player chooses a Nigerian intercity vehicle, receives a destination, drives along a real-world road route, encounters traffic and road conditions, and completes the journey. The game is **not an endless driving game**. The objective is to reach a defined destination successfully.

Core loop: Start → Choose Vehicle → Choose Trip → Review Route → Drive → Navigate Real Route → Handle Traffic / Road Events → Reach Destination → Trip Results → Rewards / Unlocks.

## 2. MVP
- Route: **Berger → Mowe** (development slice of Lagos → Ibadan).
- Vehicle: primary **Toyota Sienna**; secondary **Intercity Bus**. Vehicles should resemble vehicles actually used for Nigerian intercity transport. **Do not use a danfo/yellow Lagos commercial bus as the primary vehicle.**

## 3. Start Screen
`TRIP_IBADAN` · `Lagos → Ibadan` · **[START TRIP] [GARAGE] [SETTINGS]**. Background: 3D view of the Lagos–Ibadan Expressway with moving traffic, Nigerian road infrastructure, natural lighting. Avoid arcade/neon styling.

## 4. Vehicle Selection
"CHOOSE YOUR RIDE". Shows name, passengers, speed, handling, fuel efficiency, and **[SELECT]**.
Data model: `name, type, maxSpeed, acceleration, braking, handling, fuelCapacity, fuelConsumption, passengerCapacity, damageResistance`.
MVP vehicles: Toyota Sienna (available), Intercity Bus (available/secondary), Toyota Hiace / Coaster / Luxury Bus (future).

## 5. Trip Selection
"SELECT TRIP": Lagos ↓ Berger ↓ Mowe, distance, **[START TRIP]**. Must read as a real journey with a destination.

## 6. Future Route
Lagos → Iwo Road on real-world map geometry (order corrected above).

## 7. Pre-Trip Screen
"YOUR TRIP": Berger ↓ Mowe. Shows passengers, fuel %, vehicle condition %, estimated distance, and **[DRIVE]**.

## 8. Camera
Default third-person chase: behind the vehicle, slightly elevated, with the vehicle visible and the road ahead clear. Future: first person, dashboard, passenger view.

## 9. Controls
Steering via touch buttons (first implementation), virtual wheel or tilt. Accelerator and brake on the right side. Optional: horn, indicator, camera, handbrake.

## 10. Driving HUD
Required: destination, distance remaining, route progress, minimap, speed, vehicle condition, fuel. Optional: speed limit, navigation instruction, passenger status.

## 11. Navigation
Uses the actual route. Examples: "↑ Continue straight · 18 km · towards Mowe" and "↗ Keep right · towards Mowe".

## 12. Minimap
Shows player, route, destination, major turns, nearby road network. Rotates with heading or shows a north indicator.

## 13. Real-World Map
OpenStreetMap → Road Network → Route Processing → Game Engine → 3D Road/Terrain. The roads must be drivable 3D geometry, not a flat map.

## 14. Terrain
Elevation, road alignment, landforms, vegetation, built-up areas. **Road accuracy > environmental detail.**

## 15. Traffic
Cars, SUVs, buses, trucks, minibuses. They follow lanes; keep, brake, accelerate, follow, change lanes, and react to obstacles. The MVP may simplify.

## 16. Nigerian Road Events
Congestion, broken-down vehicle, road construction, police checkpoint, heavy truck, rain. Events are tied to route sections, not endless.

## 17. Vehicle Damage
Condition: 100% Excellent · 75% Minor · 50% Significant · 25% Severe · 0% Disabled. Collisions reduce it.

## 18. Fuel
Consumption depends on distance, speed, vehicle type, acceleration and conditions. Simplified for the MVP; stations come later.

## 19. Trip Scoring
Destination reached +3000 · Passengers delivered +2000 · Good driving +1000 · Low vehicle damage +1000 · Fuel efficiency +500 · Traffic violations −500 · Major collision −1000 (tunable).

## 20. Trip Completion
"TRIP COMPLETE": route, distance, time, passengers, vehicle damage, fuel used, **TRIP SCORE**, and **[CONTINUE] [GARAGE]**.

## 21. Garage
Long-term progression: unlock, upgrade, appearance, handling, fuel efficiency, capacity. The MVP needs the basic selection structure only.

## 22. Game Progression
Route segments chain into one continuous Lagos → Ibadan journey. More Nigerian routes can be added without rebuilding the core systems.

## 23. Audio
MVP: engine, acceleration, braking, collision, road noise, UI sounds, navigation instructions. Future: radio, passengers, horns, rain, checkpoint, market ambience.

## 24. Art Direction
Realistic but performance-conscious. Avoid cartoon vehicles, generic fantasy roads, neon, arcade floating objects, futuristic UI. Prioritise real Nigerian vehicles, road markings, barriers, streetlights, signage, vegetation, buildings, traffic, terrain.

## 25. Architecture
Independent systems: Vehicle, Driving, Camera, Map, Route, Navigation, Traffic AI, Event, Damage, Fuel, Scoring, UI, Save/Progression. Future routes must not require rewriting vehicle or gameplay systems.

## 26. MVP Acceptance Criteria
- **Start:** launches to the start screen; the player can start a trip.
- **Vehicle:** Sienna selectable and appears in the world.
- **Route:** Berger → Mowe loads, geometry matches the real route, destination visible.
- **Driving:** accelerate, brake, steer, camera follows.
- **Navigation:** minimap, route shown, distance updates.
- **Traffic:** AI vehicles appear and move along the road; basic collisions work.
- **Trip:** reaching Mowe is detected; the results screen appears.
- **Results:** distance, time, damage, fuel recorded; score calculated.

## 27. Not Required for MVP
Multiplayer, accounts, advanced economy, character customisation, passenger conversations, full Lagos/Ibadan cities, photoreal buildings, weather variety, radio, multiple routes, complex police AI, advanced physics.

## 28. Developer Deliverables
Playable build, source, asset inventory, technical documentation (engine, map source, routing, terrain, traffic, build), deployment instructions (Android, dev, prod), known limitations.

## 29. Milestones
1. Driving prototype (Sienna, road, camera, steer/accelerate/brake)
2. Real route (Berger → Mowe geometry, terrain, navigation)
3. Traffic (AI, lanes, collisions)
4. Game systems (fuel, damage, scoring, completion)
5. Environment (roadside assets, signs, lights, buildings, vegetation)
6. Polish (audio, UI, effects, performance, mobile controls)
7. Full route (Berger → Mowe → Sagamu → Ibadan → Iwo Road)

## 30. Product Principle
> **Trip_ibadan is a journey, not an endless driving score game.**

The player always knows: Where am I? Where am I going? How far is the destination? What is happening on the road? Can I complete the trip?
