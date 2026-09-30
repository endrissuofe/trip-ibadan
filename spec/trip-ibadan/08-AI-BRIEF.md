# 08 — AI Brief

You are helping build **Trip_ibadan**, a browser-based Nigerian road-trip driving game.

## What we want

The player chooses a realistic Nigerian intercity vehicle and drives from Lagos to a real destination in Ibadan using real mapped road geometry and terrain.

The player is completing a **trip**, not driving forever for distance points.

Primary fantasy:

> **Lagos → Ibadan**

Initial destination:

> **Iwo Road, Ibadan**

## Vehicles

The game should use realistic intercity/private passenger vehicles such as:

- Toyota Sienna.
- Intercity passenger bus / minibus.

Do not use a Lagos danfo as the hero vehicle. Avoid the classic yellow-and-black danfo appearance.

## Hard constraints

- Web first.
- Mobile performance is important.
- Real mapped road geometry is required.
- Terrain should follow real-world elevation where practical.
- OpenStreetMap/open geographic data is preferred.
- Do not make an endless fake road and call it the Lagos–Ibadan route.
- Do not expand into an open-world recreation of Lagos or Ibadan.
- Do not make paid map services a hard dependency for v1.

## Core gameplay

1. Choose vehicle.
2. Choose/receive destination.
3. Start in Lagos.
4. Follow the real route.
5. Handle traffic and road conditions.
6. Reach the destination.
7. Receive a trip result.
8. Unlock vehicles/destinations through successful trips.

## Design priorities

When choosing between visual detail and route authenticity, prioritise:

1. Correct route.
2. Correct destination.
3. Good driving feel.
4. Recognisable terrain/landmarks.
5. Detailed scenery.

## Implementation rule

Build the smallest playable version of the real trip first:

**one vehicle + real route section + destination + driving + arrival result.**

Only then add advanced traffic, weather, economy, progression and additional vehicles.
