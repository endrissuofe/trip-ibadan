# 04 — World and Real Map Terrain

## Truth

The game should use **real-world road geography** rather than an invented endless road.

The goal is not to reproduce every building in Lagos and Ibadan. The important parts are:

1. Real road shape.
2. Real route direction.
3. Real place names.
4. Realistic terrain/elevation.
5. Recognisable landmarks where practical.

## World model

The Lagos → Ibadan corridor is represented as a streamed route world.

It is not a full open-world city.

- Road geometry comes from OpenStreetMap or another legally usable map dataset.
- Elevation comes from an open terrain/elevation source.
- The ground follows the real route terrain where data permits.
- The route is divided into streamed chunks.
- Only nearby chunks need to be active.
- Roadside scenery is simplified for mobile performance.

## Route

Primary journey:

**Lagos → Ibadan**

Primary destination:

**Iwo Road, Ibadan**

Development sections:

- Berger
- OPIC / Magboro
- Mowe
- Ibafo
- Sagamu area
- Ibadan approach
- Iwo Road

The exact route data must be validated before implementation rather than manually inventing junctions.

## Terrain

Terrain should provide enough visual variation to make the route feel like a real journey:

- Road elevation changes.
- Slopes and embankments.
- Vegetation.
- Drainage / shoulders.
- Open roadside areas.
- Built-up sections near towns.

The terrain does not need photorealistic individual buildings.

## Map data

Preferred sources for v1:

- **OpenStreetMap** for roads, place names, and geographic features.
- **Open elevation data** such as SRTM-derived terrain.
- A legally usable imagery/terrain source where imagery is required.

Before shipping, confirm the licensing and attribution requirements of every map/imagery source.

## What must feel true

- The player is travelling toward Ibadan, not looping on a track.
- The road has the correct general orientation and geometry.
- Major locations appear in the correct sequence.
- The destination is a real place.
- The route distance is approximately believable, even if gameplay speed/time is compressed.

## Compression

Gameplay may compress:

- Travel time.
- Traffic density.
- Number of roadside objects.
- Minor road segments.

It must not create a fake endless loop and call it the Lagos–Ibadan route.

## Streaming

Use route chunks so the complete journey can eventually be represented without loading the entire corridor at once.

Recommended initial chunk size:

**2–5 km**, adjusted according to device performance and terrain complexity.

## Lighting

Initial world:

- Daytime.

Later:

- Evening.
- Night.
- Rain / wet roads.

Do not build all lighting modes before the basic real-route experience works.
