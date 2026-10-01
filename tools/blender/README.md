# Blender build scripts

The 3D vehicles are built from script, so they can be changed and rebuilt rather than hand-edited.

| File | What it makes |
|---|---|
| `lib_vehicle.py` | Shared helpers: game-space coordinates, materials, shapes, merging, export |
| `build_van.py` | Sienna-style 8-seater (driver + conductor + 6) → `public/models/vehicles/sienna.glb` (unbadged, silver, roof rails with luggage, sliding doors, ~14.2k triangles) |
| `build_bus.py` | Hiace-style 14-seat minibus → `public/models/vehicles/hiace.glb` (unbadged original design, ~12.8k triangles, follows `docs/ASSET-CONTRACT.md`) |
| `wear.py` | Wear and detail: dust, road grime, rain streaks, sun fade and rust spots baked into the body paint (Cycles), plus generated tyre-tread, seat-fabric and floor-mat textures |
| `build_roadside.py` | Roadside kit → `public/models/scenery/roadside.glb`: 21 pieces (shops, stalls, petrol station, billboards, poles, drains, unfinished building, grass, plantain, clutter), one `proto_<name>` object each, front facing +Z |
| `kit_textures.py` | Textures for the kit (`kit_tex/`): concrete, sandcrete blocks, corrugated roofing, grass card, and the made-up shop signs, price board and billboards |
| `render_kit.py` | Overview renders of `roadside.blend` |
| `textures.py` | Number plate and side livery images (`plate.png`, `livery.png`) |
| `render.py` | Preview renders of a `.blend` file (Cycles) |

## Rebuild

Needs Python 3.11 and Blender as a Python module:

```bash
pip install "bpy==4.5.*" pillow
```

```bash
cd tools/blender
python textures.py
python build_bus.py --out ../../public/models/vehicles/hiace.glb
python build_van.py --out ../../public/models/vehicles/sienna.glb
python kit_textures.py
python build_roadside.py --out ../../public/models/scenery/roadside.glb
```

Building now bakes the weathering, so each vehicle takes about a minute. Change how dirty a vehicle is with `amount` (and `rust`) in the `weather_body(...)` call near the end of its build script.

Note: paint, chrome and wheels use low metalness on purpose. The game has no reflection map yet, and fully metallic surfaces render dark in it. Lamp lens sizes are stored in the lamp nodes' scale so the game can size the glow to fit.

`textures.py` uses the DejaVu fonts at `/usr/share/fonts/truetype/dejavu/`; on Windows change the two font paths at the top (for example to `C:/Windows/Fonts/arialbd.ttf`). The ready-made `plate.png` and `livery.png` are included, so you only need to run it to change the text.

Everything in `build_bus.py` is written in game coordinates (x right, y up, z forward, metres) and converted with `G()`. To change the livery, edit the colours in `textures.py`; to change the shape, edit `profile`, window positions or dimensions at the top of `build_bus.py`.
