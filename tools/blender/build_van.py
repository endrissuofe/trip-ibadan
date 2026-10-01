"""
Sienna-style 8-seat minivan for Trip_Ibadan (driver + conductor + 6 passengers), built from script.
Unbadged, original design. Exports GLB following docs/ASSET-CONTRACT.md.
Run: python build_van.py --out ../../public/models/vehicles/sienna.glb
"""
import sys, math
from lib_vehicle import *
from wear import detail_materials, weather_body, ensure_uvs

OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'sienna.glb'

L2 = 2.55      # half length (5.1 m)
W = 1.96       # body width
H = 1.75       # roof height
WHEEL_R = 0.36
TRACK = 0.86
AXLE_F, AXLE_R = 1.55, -1.50

# low metalness on purpose: the game has no reflection map yet, and fully metallic paint renders dark
M['paint'] = mat('body_paint_silver', (0.7, 0.72, 0.74), metal=0.2, rough=0.3, coat=0.8)
M['inner'] = mat('interior_trim_beige', (0.55, 0.52, 0.47), rough=0.85)
M['fabric'] = mat('seat_fabric_grey', (0.16, 0.16, 0.17), rough=0.95)
detail_materials(fabric_color=(0.16, 0.16, 0.17))
M['alloy'] = mat('alloy_wheel', (0.72, 0.74, 0.76), metal=0.3, rough=0.25)

root = bpy.data.objects.new('sienna_root', None); link(root)

# ------------------------------------------------------------------ body shell
WS_TOP = (0.62, 1.73)   # windscreen top
WS_BOT = (1.58, 1.10)   # windscreen bottom (cowl)
profile = [
    (-L2 + 0.04, 0.40), (-L2 - 0.02, 0.62), (-L2 + 0.0, 1.05), (-L2 + 0.08, 1.56), (-L2 + 0.28, H - 0.01),
    (-1.9, H), (0.3, H), WS_TOP, WS_BOT, (2.30, 0.93), (L2 + 0.04, 0.78), (L2 + 0.07, 0.52), (L2 + 0.0, 0.36),
]
body = prism('body', profile, -W / 2, W / 2, M['paint'], root)
md = body.modifiers.new('bevel', 'BEVEL'); md.width = 0.09; md.segments = 5; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(20)
apply_mods(body)
body.data.materials.append(M['inner'])
md = body.modifiers.new('shell', 'SOLIDIFY'); md.thickness = 0.03; md.offset = -1; md.material_offset = 1; md.material_offset_rim = 1
apply_mods(body)

for z in (AXLE_F, AXLE_R):
    boolean(body, cylinder_x('arch_cut', 0, WHEEL_R + 0.03, z, 0.46, W + 0.4, M['black'], verts=40))

WIN_Y0, WIN_Y1 = 1.10, 1.58
SIDE_WINDOWS = [(0.08, 0.80), (-1.02, -0.04), (-2.28, -1.12)]
for z0, z1 in SIDE_WINDOWS:
    boolean(body, box('win_cut', 0, (WIN_Y0 + WIN_Y1) / 2, (z0 + z1) / 2, W + 0.4, WIN_Y1 - WIN_Y0, z1 - z0, M['black']))
# small front quarter glass in the A-pillar
boolean(body, prism('aq_cut', [(0.86, 1.12), (1.28, 1.12), (0.86, 1.56)], -W / 2 - 0.2, W / 2 + 0.2, M['black']))

def along(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
dz, dy = WS_BOT[0] - WS_TOP[0], WS_BOT[1] - WS_TOP[1]
ln = math.hypot(dz, dy); nz, ny = dy / ln, -dz / ln
if nz < 0: nz, ny = -nz, -ny
p0, p1 = along(WS_TOP, WS_BOT, 0.07), along(WS_TOP, WS_BOT, 0.93)
ws_poly = [(p0[0] + nz * 0.2, p0[1] + ny * 0.2), (p1[0] + nz * 0.2, p1[1] + ny * 0.2), (p1[0] - nz * 0.2, p1[1] - ny * 0.2), (p0[0] - nz * 0.2, p0[1] - ny * 0.2)]
boolean(body, prism('ws_cut', ws_poly, -W / 2 + 0.12, W / 2 - 0.12, M['black']))
# tailgate window (tailgate leans in slightly)
boolean(body, prism('rear_cut', [(-L2 - 0.3, 1.12), (-L2 + 0.25, 1.12), (-L2 + 0.35, 1.55), (-L2 - 0.2, 1.55)], -W / 2 + 0.2, W / 2 - 0.2, M['black']))
smooth(body)

# ------------------------------------------------------------------ glass, pillars
for i, (z0, z1) in enumerate(SIDE_WINDOWS):
    for s in (-1, 1):
        box(f'glass_side_{i}', s * (W / 2 - 0.012), (WIN_Y0 + WIN_Y1) / 2, (z0 + z1) / 2, 0.012, WIN_Y1 - WIN_Y0 + 0.02, z1 - z0 + 0.02, M['glass'], root)
for s in (-1, 1):
    x0, x1 = (s * (W / 2 - 0.02), s * (W / 2 - 0.005))
    prism('glass_aq', [(0.85, 1.11), (1.29, 1.11), (0.85, 1.57)], min(x0, x1), max(x0, x1), M['glass'], root)
ws_glass = [(p0[0] + nz * 0.01, p0[1] + ny * 0.01), (p1[0] + nz * 0.01, p1[1] + ny * 0.01), (p1[0] - nz * 0.004, p1[1] - ny * 0.004), (p0[0] - nz * 0.004, p0[1] - ny * 0.004)]
prism('glass_windscreen', ws_glass, -W / 2 + 0.11, W / 2 - 0.11, M['windscreen'], root)
prism('glass_rear', [(-L2 - 0.005, 1.11), (-L2 + 0.012, 1.11), (-L2 + 0.09, 1.56), (-L2 + 0.073, 1.56)], -W / 2 + 0.19, W / 2 - 0.19, M['glass'], root)
# black B and C pillars, and black window surround strip
for zc, wdt in ((0.02, 0.1), (-1.08, 0.1)):
    for s in (-1, 1):
        box('pillar_black', s * (W / 2 + 0.002), (WIN_Y0 + WIN_Y1) / 2, zc, 0.01, WIN_Y1 - WIN_Y0, wdt, M['black'], root)
for s in (-1, 1):
    box('belt_trim', s * (W / 2 + 0.003), WIN_Y0 - 0.01, -0.75, 0.01, 0.02, 3.1, M['chrome'], root)

# ------------------------------------------------------------------ doors, handles, body side
for s in (-1, 1):
    x = s * (W / 2 + 0.003)
    for z in (1.32, 0.05):  # front door seams
        box('seam', x, 0.76, z, 0.006, 0.66, 0.012, M['black'], root)
    box('handle_front', x + s * 0.008, 0.98, 0.18, 0.02, 0.035, 0.14, M['chrome'], root, bevel=0.008)
    box('side_moulding', x + s * 0.004, 0.62, 0.0, 0.012, 0.06, 1.95, M['black'], root, bevel=0.005)
    # sliding door on BOTH sides (minivan), rail along the rear quarter
    box('slide_seam_rear', x, 0.8, -1.05, 0.006, 0.6, 0.012, M['black'], root)
    box('slide_rail', x + s * 0.004, WIN_Y0 - 0.04, -1.65, 0.008, 0.025, 1.1, M['black'], root)
    box('handle_slide', x + s * 0.008, 0.98, -0.85, 0.02, 0.035, 0.14, M['chrome'], root, bevel=0.008)
    box('skirt', s * (W / 2 - 0.02), 0.4, -0.0, 0.05, 0.12, 2.3, M['black'], root, bevel=0.02)
box('fuel_flap', -(W / 2 + 0.003), 1.0, -1.85, 0.006, 0.12, 0.16, M['black'], root, bevel=0.003)

# ------------------------------------------------------------------ front end
box('bumper_front', 0, 0.48, L2 + 0.03, W + 0.01, 0.3, 0.18, M['paint'], root, bevel=0.06, seg=4)
box('lower_grille', 0, 0.42, L2 + 0.12, 1.2, 0.14, 0.03, M['black'], root, bevel=0.02)
box('upper_grille', 0, 0.74, L2 + 0.075, 0.9, 0.1, 0.03, M['black'], root, bevel=0.02)
box('grille_chrome', 0, 0.8, L2 + 0.09, 0.92, 0.025, 0.012, M['chrome'], root)
box('emblem_blank', 0, 0.74, L2 + 0.095, 0.14, 0.07, 0.01, M['chrome'], root, bevel=0.01)
for s in (-1, 1):
    # swept-back headlamps
    prism(f'headlamp_{s}', [(2.27, 0.945), (L2 + 0.055, 0.795), (L2 + 0.065, 0.70), (2.33, 0.845)],
          min(s * 0.42, s * 0.92), max(s * 0.42, s * 0.92), M['head'], root)
    box(f'front_ind_{s}', s * 0.88, 0.8, L2 + 0.03, 0.12, 0.04, 0.05, M['amber'], root)
    box(f'foglamp_{s}', s * 0.7, 0.4, L2 + 0.11, 0.12, 0.05, 0.02, M['head'], root, bevel=0.01)
box('plate_front', 0, 0.56, L2 + 0.125, 0.5, 0.16, 0.012, M['black'], root)
mesh_obj('plate_front_face', [(-0.24, 0.49, L2 + 0.133), (0.24, 0.49, L2 + 0.133), (0.24, 0.64, L2 + 0.133), (-0.24, 0.64, L2 + 0.133)],
         [[0, 1, 2, 3]], M['plate'], root, uvs={0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (1, 1)})
for s in (-0.38, 0.32):
    box('wiper', s, WS_BOT[1] + 0.04, WS_BOT[0] - 0.06, 0.62, 0.012, 0.02, M['black'], root)
for s in (-1, 1):  # door mirrors
    box('mirror_base', s * (W / 2 + 0.05), 1.14, 0.95, 0.1, 0.06, 0.12, M['black'], root)
    box('mirror_head', s * (W / 2 + 0.15), 1.2, 0.92, 0.2, 0.14, 0.1, M['paint'], root, bevel=0.03, seg=3)
    box('mirror_glass', s * (W / 2 + 0.15), 1.2, 0.865, 0.17, 0.11, 0.01, M['chrome'], root)

# ------------------------------------------------------------------ rear end
box('bumper_rear', 0, 0.5, -L2 - 0.02, W + 0.01, 0.26, 0.16, M['paint'], root, bevel=0.06, seg=4)
box('rear_diffuser', 0, 0.38, -L2 - 0.08, 1.4, 0.06, 0.06, M['black'], root)
for s in (-1, 1):
    x = s * 0.8
    box(f'tail_red_{s}', x, 1.12, -L2 + 0.01, 0.3, 0.3, 0.05, M['red'], root, bevel=0.015)
    box(f'tail_amber_{s}', x, 0.94, -L2 + 0.0, 0.24, 0.06, 0.05, M['amber'], root, bevel=0.01)
    box(f'tail_white_{s}', x, 0.86, -L2 - 0.005, 0.24, 0.07, 0.05, M['white_lens'], root, bevel=0.01)
box('tailgate_chrome', 0, 0.98, -L2 - 0.012, 0.7, 0.05, 0.02, M['chrome'], root)
box('plate_rear', 0, 0.82, -L2 - 0.04, 0.5, 0.16, 0.012, M['black'], root)
mesh_obj('plate_rear_face', [(-0.24, 0.75, -L2 - 0.048), (0.24, 0.75, -L2 - 0.048), (0.24, 0.9, -L2 - 0.048), (-0.24, 0.9, -L2 - 0.048)],
         [[0, 1, 2, 3]], M['plate'], root, uvs={0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)})
box('spoiler', 0, H - 0.02, -L2 + 0.22, W - 0.3, 0.05, 0.22, M['paint'], root, bevel=0.02)
box('wiper_rear', 0.1, 1.17, -L2 + 0.0, 0.4, 0.012, 0.02, M['black'], root)

# ------------------------------------------------------------------ roof rails + luggage (intercity Sienna)
for s in (-1, 1):
    box('roof_rail', s * 0.7, H + 0.06, -0.8, 0.05, 0.04, 2.6, M['black'], root, bevel=0.015)
    for z in (-2.05, 0.45):
        box('rail_foot', s * 0.7, H + 0.025, z, 0.06, 0.06, 0.1, M['black'], root)
for z in (-1.6, -0.6, 0.2):
    box('cross_bar', 0, H + 0.09, z, 1.45, 0.03, 0.04, M['black'], root)
box('luggage_bag', 0.1, H + 0.22, -0.9, 1.0, 0.24, 0.85, M['tarp'], root, bevel=0.08, seg=3)
box('luggage_strap', 0.1, H + 0.22, -0.9, 1.02, 0.26, 0.04, M['black'], root)

# ------------------------------------------------------------------ wheels (alloys)
def wheel(name, side, z):
    x = side * TRACK
    hub = empty(name, x, WHEEL_R, z, root)
    t = cylinder_x(name + '_tyre', 0, 0, 0, WHEEL_R, 0.225, M['rubber'], verts=36)
    t.parent = hub; t.location = (0, 0, 0)
    md = t.modifiers.new('bevel', 'BEVEL'); md.width = 0.05; md.segments = 4; md.limit_method = 'ANGLE'
    apply_mods(t); smooth(t, 50)
    r = cylinder_x(name + '_rim', 0, 0, 0, 0.235, 0.235, M['alloy'], verts=30)
    r.parent = hub; r.location = (0, 0, 0)
    d = cylinder_x(name + '_dish', 0, 0, 0, 0.16, 0.25, M['dash'], verts=24)
    d.parent = hub; d.location = (0, 0, 0)
    c = cylinder_x(name + '_cap', 0, 0, 0, 0.05, 0.26, M['chrome'], verts=16)
    c.parent = hub; c.location = (0, 0, 0)
    lin = cylinder_x(name + '_liner', side * (TRACK - 0.13) / 2, WHEEL_R + 0.03, z, 0.455, TRACK - 0.17, M['black'], verts=32)
    boolean(lin, box('liner_cut', side * (W / 4), WHEEL_R - 0.3, z, W, 0.64, 1.2, M['black']))
    for f in lin.data.polygons: f.use_smooth = True
    lin.parent = root
    return hub
for nm, s, z in (('wheel_FL', -1, AXLE_F), ('wheel_FR', 1, AXLE_F), ('wheel_RL', -1, AXLE_R), ('wheel_RR', 1, AXLE_R)):
    wheel(nm, s, z)
box('underbody', 0, 0.32, -0.1, W - 0.3, 0.06, 4.2, M['black'], root)

# ------------------------------------------------------------------ interior
interior = bpy.data.objects.new('interior', None); link(interior, root)
FLOOR = 0.46
box('floor', 0, FLOOR, -0.6, W - 0.08, 0.04, 3.7, M['floor'], interior)
box('dashboard', 0, 0.95, 1.12, W - 0.1, 0.26, 0.5, M['dash'], interior, bevel=0.06, seg=3)
box('instrument_hood', -0.42, 1.1, 1.0, 0.4, 0.08, 0.2, M['dash'], interior, bevel=0.03)
box('centre_console', 0, 0.72, 0.85, 0.3, 0.45, 0.45, M['dash'], interior, bevel=0.04)

def seat(name, x, z, width, cushion_y=0.62):
    box(name, x, cushion_y - 0.05, z, width, 0.11, 0.48, M['fabric'], interior, bevel=0.04, seg=3)
    box(name + '_back', x, cushion_y + 0.32, z - 0.25, width, 0.66, 0.1, M['fabric'], interior, bevel=0.04, seg=3)
    box(name + '_head', x, cushion_y + 0.73, z - 0.25, min(width, 0.26), 0.14, 0.09, M['fabric'], interior, bevel=0.03)
    box(name + '_frame', x, (FLOOR + cushion_y - 0.1) / 2, z, width - 0.12, cushion_y - 0.1 - FLOOR, 0.36, M['fabric2'], interior)

DRIVER = (-0.42, 0.25); COND = (0.42, 0.25)
seat('seat_driver', *DRIVER, 0.52)
seat('seat_conductor', *COND, 0.52)
ROWS = [-0.75, -1.8]
SEAT_X = [-0.68, 0.0, 0.68]
seat('bench_2', 0, ROWS[0], 1.8)
seat('bench_3', 0, ROWS[1], 1.8)

bpy.ops.mesh.primitive_torus_add(major_radius=0.18, minor_radius=0.018, major_segments=32, minor_segments=8)
sw = bpy.context.active_object; sw.name = 'steering_wheel'
sw.rotation_euler = (-1.15, 0, 0); sw.location = G(-0.42, 1.0, 0.72)
sw.data.materials.append(M['black']); sw.parent = interior
box('steering_column', -0.42, 0.93, 0.88, 0.06, 0.06, 0.32, M['black'], interior)

# ------------------------------------------------------------------ contract nodes
def lamp(e, w, h):
    """Lamp lens size travels in the node's scale (width, height) so the game can size the glow."""
    e.scale = (w, 1, h)
    return e

for s, side in ((-1, 'L'), (1, 'R')):
    lamp(empty(f'light_brake_{side}', s * 0.8, 1.12, -L2 - 0.03, root), 0.28, 0.28)
    lamp(empty(f'light_reverse_{side}', s * 0.8, 0.86, -L2 - 0.04, root), 0.22, 0.06)
    empty(f'indicator_R{side}', s * 0.8, 0.94, -L2 - 0.035, root)
    empty(f'indicator_F{side}', s * 0.88, 0.8, L2 + 0.07, root)
    empty(f'headlight_{side}', s * 0.67, 0.87, L2 + 0.07, root)
empty('driver_cam', DRIVER[0], 1.33, DRIVER[1] - 0.05, root)
empty('cabin_cam', 0, 1.6, 0.9, root)
empty('reverse_cam', 0, 1.18, -L2 - 0.03, root)
empty('mirror_rear', 0, 1.55, 0.6, root)
empty('door_passenger', W / 2 + 0.35, 0, -0.6, root)
empty('conductor_seat', COND[0], 0.62, COND[1], root)
k = 0
for z in ROWS:
    for x in SEAT_X:
        k += 1
        empty(f'seat_{k:02d}', x, 0.62, z, root)

ensure_uvs(list(bpy.data.objects))
weather_body(body, paint=(0.7, 0.72, 0.74), rough=0.3, metal=0.2, coat=0.8, amount=0.5, rust=0.0, axles=(AXLE_F, AXLE_R), wheel_r=WHEEL_R, window_y=WIN_Y0, name='sienna_body')
merge(root, keep={'body', 'sienna_body_inner'})
merge(interior, keep={'steering_wheel'})
export(OUT)
