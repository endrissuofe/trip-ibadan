# 05 — Design Process

Design the actual trip before building the full game.

## Goal

The design pack must make the following unambiguous:

- Where the player starts.
- Where the player is going.
- What vehicle the player is driving.
- What the real route looks like.
- What happens during the trip.
- What happens when the player arrives.

## Deliverables — Design Pack v1

### 1. Player fantasy board

Define:

- Driver personality.
- Serious driving vs playful Nigerian travel humour.
- Three moments that should make players want to share screenshots.

Recommended moments:

1. Starting the trip in Lagos.
2. Recognising a real location while driving.
3. Reaching the Ibadan destination.

### 2. Route storyboard

First full-trip storyboard:

1. Title screen.
2. Vehicle selection.
3. Destination selection.
4. Route preview.
5. Leave Lagos.
6. Join the Lagos–Ibadan Expressway.
7. Traffic / road event.
8. Pass major route locations.
9. Enter the Ibadan area.
10. Arrive at Iwo Road.
11. Trip result.

Each beat should define:

- Camera.
- Player action.
- Important world elements.
- Possible failure.

### 3. Vehicle design sheet

Initial vehicles:

- Toyota Sienna.
- Realistic intercity passenger bus / minibus.

For each vehicle define:

- Front.
- Rear.
- Side.
- 3/4 view.
- Interior silhouette.
- Dashboard.
- Passenger capacity.
- Handling characteristics.

**Do not use danfo yellow/black styling.**

Use believable Nigerian intercity/private-vehicle colours and fictional operator markings where necessary.

### 4. Route map board

Create a simplified route map showing:

**Lagos → Berger → Mowe/Ibafo → Sagamu area → Ibadan → Iwo Road**

The map should be based on real geographic data.

Mark:

- Start.
- Destination.
- Major route sections.
- Optional stops.
- Major landmarks.

### 5. HUD and menus

Screens:

- Boot / title.
- Vehicle selection.
- Destination selection.
- Route preview.
- In-trip HUD.
- Pause.
- Trip completed.
- Trip failed.
- Garage / progression.

The in-trip HUD should prioritise:

- Destination.
- Remaining distance.
- Speed.
- Vehicle condition.
- Optional fuel.

### 6. World kit

Design one representative route section containing:

- Real road lanes.
- Median.
- Shoulder.
- Terrain.
- Roadside vegetation.
- Traffic.
- Signs.
- Simple buildings/landmarks.

Define which elements are detailed and which are intentionally simplified.

### 7. Audio list

Must-have first:

- Engine.
- Horn.
- Road noise.
- Traffic.
- Brake / tyre sounds.
- Collision.
- Destination arrival.
- UI feedback.

Later:

- Radio.
- Passenger voices.
- Rain.
- Nigerian roadside ambience.

### 8. Scope freeze

Create one mockup showing the complete first playable experience:

> Vehicle selected → Lagos start → real route → Ibadan destination → arrival result.

That mockup becomes the reference for Phase 1.

## Design order

1. Player fantasy.
2. Vehicle selection.
3. Destination flow.
4. Route storyboard.
5. Route map.
6. HUD.
7. Vehicle sheet.
8. World kit.
9. Scope freeze.

## Approval rule

A feature that does not support the destination-based Lagos → Ibadan trip should not enter v1 without explicitly updating the scope.

## Handoff to build

Once the design is frozen, implementation starts with:

1. Real route data.
2. Terrain.
3. One vehicle.
4. Start and destination points.
5. Driving controls.
6. Arrival detection.
7. Trip result.

Only after this works should we add traffic, hazards, economy, weather, and progression.
