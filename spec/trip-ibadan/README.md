# Trip_ibadan

**Trip_ibadan** is a browser-based driving game built around a real Lagos → Ibadan road trip.

The player chooses a realistic intercity vehicle, starts in Lagos, follows real mapped roads and terrain, and reaches a real destination in Ibadan.

**Platform:** Web first (mobile + desktop)  
**Core fantasy:** Complete a real-feeling Lagos → Ibadan trip.  
**Primary destination:** Iwo Road, Ibadan.  
**Vehicle direction:** Intercity bus / Toyota Sienna-style vehicles.  
**Map direction:** Real road geometry + lightweight real-world terrain.  

## Core rule

This is **not an endless driving game**.

Every trip has:

**Start → Route → Destination → Arrival → Result**

## Documents

| File | Use it for |
|---|---|
| [01-VISION.md](01-VISION.md) | Product vision and player fantasy |
| [02-SCOPE.md](02-SCOPE.md) | Scope, route, vehicles and phases |
| [03-GAMEPLAY.md](03-GAMEPLAY.md) | Trip loop, controls, scoring and progression |
| [04-WORLD.md](04-WORLD.md) | Real map, route and terrain approach |
| [05-DESIGN-PROCESS.md](05-DESIGN-PROCESS.md) | Design process before full implementation |
| [06-ART-DIRECTION.md](06-ART-DIRECTION.md) | Vehicles, world, UI and visual direction |
| [07-TECH.md](07-TECH.md) | Technical architecture and build sequence |
| [08-AI-BRIEF.md](08-AI-BRIEF.md) | Brief for AI-assisted development |

## First playable target

Build:

> **Lagos start → real mapped route section → one realistic vehicle → Iwo Road destination → arrival result**

The first development slice may expose only part of the route, but the architecture must support the complete Lagos → Iwo Road journey.
