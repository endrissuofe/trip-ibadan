# Asset contract (real 3D models)

The game runs on procedural stand-ins today. Real models drop in without code changes: put the GLB in `public/models/` and list it in `public/models/manifest.json`.

```json
{
  "vehicles": { "sienna": { "file": "vehicles/sienna.glb" }, "hiace": { "file": "vehicles/hiace.glb", "scale": 1, "yaw": 0 } },
  "characters": []
}
```

A worked example is `tools/blender/build_bus.py`, which produces `vehicles/hiace.glb` with every node below.

The key is the vehicle id from `src/data/vehicles.ts` (`sienna`, `bus`, `hiace`, `coaster`, `luxury`). If a file is missing or fails to load, the procedural vehicle is used and a warning is logged.

## Vehicles: format

- **GLB (glTF 2.0)**, metres, **+Z forward, +Y up**, origin on the ground at the centre of the vehicle.
- PBR materials: base colour, normal, roughness/metallic, ambient occlusion. Glass as a separate transparent material.
- Until the game gets a reflection map, keep metalness low (≤ 0.3); fully metallic paint and chrome render dark.
- Target budget for mid-range laptops: **≤ 60k triangles** for the player vehicle, textures ≤ 2048². Provide a lower LOD (≤ 15k) if possible.
- Left-hand drive (driver on the left, as in Nigeria). Passenger door on the right side.

## Vehicles: named nodes

Empty nodes (or meshes) with these exact names. Items marked ✅ are already used by the game; the rest are for the next steps.

| Node | Used for | Status |
|---|---|---|
| `light_brake_L`, `light_brake_R` | Brake lamps snap here. Optional: node scale X/Y = lens width/height in metres, to size the glow | ✅ |
| `light_reverse_L`, `light_reverse_R` | Reverse lamps snap here | ✅ |
| `indicator_FL`, `indicator_FR`, `indicator_RL`, `indicator_RR` | Turn indicators snap here | ✅ |
| `headlight_L`, `headlight_R` | Night lighting | next |
| `driver_cam` | Driver's eye point | ✅ |
| `cabin_cam` | Passenger-compartment camera | ✅ |
| `reverse_cam` | Reversing camera: put it just outside the tailgate, above the number plate | ✅ |
| `mirror_rear` | Rear-view display | ✅ |
| `seat_01` … `seat_NN` | Passenger seats (hip point on the cushion, facing +Z). Count must equal the vehicle's capacity | ✅ |
| `conductor_seat` | Conductor's seat | ✅ |
| `door_passenger` | Where passengers get in/out | ✅ |
| `steering_wheel` | Turns with steering (spins about its local Y in glTF, i.e. Blender's local Z) | ✅ |
| `wheel_FL`, `wheel_FR`, `wheel_RL`, `wheel_RR` | Wheel spin/steer | next |
| `interior` | Everything only visible from inside (dashboard, seats, trim). With a model, the driver and cabin views use it instead of the stand-in | ✅ |

Until the "next" items are wired, seats and cameras come from `src/world/interior.ts` (`cabinLayout`). Keep model seat positions close to those, or send the model and we'll read them from the nodes.

## Characters

- **GLB, rigged humanoid** (Mixamo-compatible skeleton is fine), metres, +Z forward, origin at the feet.
- Animations in the file or retargetable: `idle`, `walk`, `sit_idle`, `sit_hand_over` (reach forward with the right hand), `stand_up`.
- Variety matters more than detail: several body types, skin tones, ages and clothing (ankara wrapper and blouse, gowns, kaftan, agbada, shirts and trousers, headwear such as gele and fila).
- Budget: ≤ 15k triangles per character (many are on screen at the park).

The swap point is `HumanFactory` in `src/world/people.ts`: a GLB-backed factory implements the same three calls (`standing`, `seated`, `walker`).

## Licences

Record every file in `docs/ASSET-INVENTORY.md` with source, author, licence and link. Prefer CC0 / CC-BY or paid licences that allow commercial games. Avoid "editorial use only" and "no games" licences. Real vehicle brand names and logos can need permission; unbadged models are safest.
