# 07 — Tech

## Engine

**Default: Babylon.js** — suitable for WebGL/WebGPU, 3D cameras, glTF assets, physics, and mobile web deployment.

Three.js is acceptable if it materially simplifies implementation.

## Map pipeline

1. Obtain real route geometry for the Lagos → Ibadan corridor.
2. Validate the start and destination coordinates.
3. Build road/lane geometry from the mapped data.
4. Obtain elevation data.
5. Build terrain around the route.
6. Divide the route into streamed chunks.
7. Place traffic, signs, landmarks and destination markers.
8. Add the player vehicle and driving physics.

## Route model

The route must be represented as actual geographic coordinates rather than a procedurally repeated straight road.

The implementation should preserve enough geographic information to support:

- Distance to destination.
- Route progress.
- Major location names.
- Destination arrival.
- Future route branches / alternate destinations.

## Assets

Initial vehicle assets:

- Toyota Sienna or equivalent realistic passenger vehicle.
- Intercity bus/minibus.

Do not build the first vehicle around a danfo model.

Use glTF/GLB and optimise textures for mobile.

## Terrain

Use open elevation data to create a lightweight terrain surface around the route.

Do not attempt a full photogrammetry reconstruction of the corridor for v1.

## Backend

Not required for the first playable prototype.

Static hosting can be used first. A backend can later support:

- Accounts.
- Trip history.
- Leaderboards.
- Vehicle progression.

## Performance constraints

Target mid-range Android devices.

Priorities:

1. Stable frame rate.
2. Fast first load.
3. Low memory use.
4. Small asset downloads.
5. Stream route chunks rather than loading the whole corridor.

## Build sequence

1. Basic 3D scene.
2. Real route geometry.
3. Lightweight terrain.
4. One vehicle.
5. Lagos start point.
6. Iwo Road destination marker.
7. Driving physics.
8. Arrival detection.
9. Traffic.
10. Trip results.
11. Second vehicle.
12. Weather and advanced events.
