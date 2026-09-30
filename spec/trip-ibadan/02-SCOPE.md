# 02 — Scope

## Locked decisions

| Decision | Choice |
|---|---|
| Game name | **Trip_ibadan** |
| Goal | Destination-based Lagos → Ibadan driving game |
| Map | Real mapped roads and terrain where practical |
| Route | Lagos → Ibadan |
| Primary destination | Iwo Road, Ibadan |
| Gameplay | Complete a trip, not endless driving |
| Vehicles | Realistic intercity bus and Toyota Sienna-style passenger vehicle |
| Vehicle style | Normal intercity/private colours; **no danfo yellow/black scheme** |
| Platform | Web first |
| Controls | Arcade-friendly mobile controls; optional sim-leaning desktop controls |
| World | Real road geometry + terrain + selected landmarks |
| Budget | Free/open data and assets where possible for v1 |

## Geographic scope

### Full fantasy

**Lagos → Iwo Road, Ibadan**, following the real Lagos–Ibadan corridor.

### Development route

The first implementation should be developed in streamed sections so the full route does not need to exist in memory at once.

Recommended build order:

1. Berger / Lagos starting area
2. OPIC / Magboro
3. Mowe
4. Ibafo
5. Sagamu area
6. Ibadan approach
7. Iwo Road destination

The player-facing destination can remain **Iwo Road** even while early development initially exposes only the first route section.

## In scope — v1

- One complete destination-based trip flow.
- One realistic intercity passenger vehicle.
- Toyota Sienna as a second vehicle if performance permits.
- Real road geometry for the implemented route section.
- Terrain/elevation representation.
- Start point in Lagos.
- Destination marker and route guidance.
- At least one recognisable route location.
- Traffic using simple AI vehicles.
- Basic collisions and vehicle damage.
- Trip completion screen.
- Mobile touch controls.
- Desktop keyboard controls.

## v1 route target

The architecture must support **Lagos → Iwo Road** from the beginning.

For the first playable build, it is acceptable to expose only a shorter real section such as **Berger → Mowe** while the remaining route is streamed/added later. This is a development limitation, not the final gameplay concept.

## In scope — v2

- Full Lagos → Iwo Road route.
- Toyota Sienna and additional intercity buses.
- Multiple Ibadan destinations.
- Fuel management.
- Passenger satisfaction.
- Traffic incidents.
- Rain and night.
- Trip history and leaderboard.
- Better roadside landmarks.

## Later product scope

- More Nigerian intercity routes.
- Vehicle upgrades.
- Vehicle skins.
- Radio/audio channels.
- Operator/company modes.
- Sponsored vehicle wraps.

## Out of scope unless deliberately rescoped

- Full open-world Lagos.
- Full open-world Ibadan.
- Multiplayer traffic with real players.
- Paid map APIs as a hard dependency.
- Photogrammetry of the entire Lagos–Ibadan corridor.
- Endless-runner scoring as the primary game loop.
- Danfo as a hero vehicle.

## Phases

0. Design and route specification.
1. Real mapped route prototype + one vehicle + destination marker.
2. Full trip loop + arrival state.
3. Traffic + road hazards + vehicle damage.
4. Second vehicle + trip economy.
5. Stream the complete route to Iwo Road.
6. Additional Ibadan destinations and replay systems.

## Scope rule for any AI

If a request changes the destination-based trip concept, replaces the real mapped route with an endless road, introduces danfo as the hero vehicle, or expands the game into an open-world city, update this file before implementation.
