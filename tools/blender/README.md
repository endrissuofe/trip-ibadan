# Blender build scripts

The 3D vehicles are built from script, so they can be changed and rebuilt rather than hand-edited.

| File | What it makes |
|---|---|
| `build_bus.py` | Hiace-style 14-seat minibus → `public/models/vehicles/hiace.glb` (unbadged original design, ~12.8k triangles, follows `docs/ASSET-CONTRACT.md`) |
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
```

`textures.py` uses the DejaVu fonts at `/usr/share/fonts/truetype/dejavu/`; on Windows change the two font paths at the top (for example to `C:/Windows/Fonts/arialbd.ttf`). The ready-made `plate.png` and `livery.png` are included, so you only need to run it to change the text.

Everything in `build_bus.py` is written in game coordinates (x right, y up, z forward, metres) and converted with `G()`. To change the livery, edit the colours in `textures.py`; to change the shape, edit `profile`, window positions or dimensions at the top of `build_bus.py`.
