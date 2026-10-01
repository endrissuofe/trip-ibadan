"""
Hiace-style 14-seat intercity minibus for Trip_Ibadan, built from script in Blender (bpy).
Unbadged, original design. Exports GLB following docs/ASSET-CONTRACT.md.

Coordinates: everything is authored in GAME space (x = right, y = up, z = forward, metres,
origin on the ground at the vehicle centre) and converted to Blender space with G().
Blender → glTF → Babylon maps Blender (bx, by, bz) to game (-bx, bz, -by), so G is its inverse.
"""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'hiace.glb'
HERE = os.path.dirname(os.path.abspath(__file__))

L2 = 2.45      # half length (4.9 m)
W = 1.88       # body width
H = 2.15       # roof height
WHEEL_R = 0.345
TRACK = 0.80
AXLE_F, AXLE_R = 1.55, -1.45


def G(x, y, z):
    return Vector((-x, -z, y))


# ------------------------------------------------------------------ scene reset
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
coll = scene.collection


# ------------------------------------------------------------------ materials
def mat(name, color, metal=0.0, rough=0.5, alpha=1.0, emit=None, emit_strength=0.0, coat=0.0, image=None, cull=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    p = nt.nodes['Principled BSDF']
    p.inputs['Base Color'].default_value = (*color, 1)
    p.inputs['Metallic'].default_value = metal
    p.inputs['Roughness'].default_value = rough
    if coat:
        p.inputs['Coat Weight'].default_value = coat
        p.inputs['Coat Roughness'].default_value = 0.05
    if emit:
        p.inputs['Emission Color'].default_value = (*emit, 1)
        p.inputs['Emission Strength'].default_value = emit_strength
    if image:
        tex = nt.nodes.new('ShaderNodeTexImage')
        tex.image = bpy.data.images.load(os.path.join(HERE, image))
        nt.links.new(tex.outputs['Color'], p.inputs['Base Color'])
        if alpha < 1 or image.endswith('livery.png'):
            nt.links.new(tex.outputs['Alpha'], p.inputs['Alpha'])
    if alpha < 1:
        p.inputs['Alpha'].default_value = alpha
    if alpha < 1 or (image and image.endswith('livery.png')):
        m.blend_method = 'BLEND'
        try: m.surface_render_method = 'BLENDED'
        except Exception: pass
    m.use_backface_culling = cull
    return m


M = {
    'paint': mat('body_paint', (0.88, 0.89, 0.87), metal=0.05, rough=0.28, coat=0.6),
    'inner': mat('interior_trim', (0.42, 0.43, 0.44), rough=0.8),
    'glass': mat('glass', (0.04, 0.06, 0.07), rough=0.04, alpha=0.42),
    'black': mat('black_plastic', (0.025, 0.027, 0.03), rough=0.55),
    'rubber': mat('tyre_rubber', (0.018, 0.018, 0.018), rough=0.92),
    'steel': mat('wheel_steel', (0.62, 0.64, 0.66), metal=1.0, rough=0.32),
    'chrome': mat('chrome', (0.9, 0.9, 0.92), metal=1.0, rough=0.08),
    'head': mat('headlamp_lens', (0.85, 0.88, 0.9), rough=0.05, emit=(1, 0.97, 0.9), emit_strength=0.4),
    'red': mat('tail_red', (0.55, 0.02, 0.03), rough=0.15, emit=(0.6, 0.02, 0.02), emit_strength=0.3),
    'amber': mat('indicator_amber', (0.95, 0.5, 0.05), rough=0.15),
    'white_lens': mat('reverse_lens', (0.9, 0.9, 0.9), rough=0.1),
    'floor': mat('floor_mat', (0.09, 0.09, 0.1), rough=0.95),
    'fabric': mat('seat_fabric', (0.11, 0.15, 0.27), rough=0.95),
    'fabric2': mat('seat_fabric_side', (0.2, 0.2, 0.22), rough=0.9),
    'dash': mat('dashboard', (0.06, 0.065, 0.07), rough=0.7),
    'plate': mat('number_plate', (1, 1, 1), rough=0.5, image='plate.png'),
    'livery': mat('livery', (1, 1, 1), rough=0.3, image='livery.png'),
    'tarp': mat('luggage_tarp', (0.12, 0.33, 0.55), rough=0.85),
    'sack': mat('luggage_sack', (0.62, 0.55, 0.42), rough=0.95),
}


# ------------------------------------------------------------------ helpers
def link(obj, parent=None):
    coll.objects.link(obj)
    if parent: obj.parent = parent
    return obj


def mesh_obj(name, verts, faces, material, parent=None, uvs=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([G(*v) for v in verts], [], faces)
    if uvs:
        uv = me.uv_layers.new(name='UVMap')
        i = 0
        for poly in me.polygons:
            for li in poly.loop_indices:
                uv.data[li].uv = uvs[me.loops[li].vertex_index]
    me.update()
    o = bpy.data.objects.new(name, me)
    o.data.materials.append(material)
    return link(o, parent)


def prism(name, profile, x0, x1, material, parent=None):
    """Side profile [(z, y), ...] extruded from game x0 to x1."""
    n = len(profile)
    verts = [(x0, y, z) for z, y in profile] + [(x1, y, z) for z, y in profile]
    faces = [list(range(n))[::-1], list(range(n, 2 * n))]
    for i in range(n):
        j = (i + 1) % n
        faces.append([i, j, n + j, n + i])
    o = mesh_obj(name, verts, faces, material, parent)
    fix_normals(o)
    return o


def box(name, cx, cy, cz, sx, sy, sz, material, parent=None, bevel=0.0, seg=2):
    hx, hy, hz = sx / 2, sy / 2, sz / 2
    v = [(cx + a * hx, cy + b * hy, cz + c * hz) for a in (-1, 1) for b in (-1, 1) for c in (-1, 1)]
    f = [[0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]]
    o = mesh_obj(name, v, f, material, parent)
    fix_normals(o)
    if bevel:
        md = o.modifiers.new('bevel', 'BEVEL'); md.width = bevel; md.segments = seg; md.limit_method = 'NONE'
    return o


def fix_normals(o):
    bm = bmesh.new(); bm.from_mesh(o.data)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(o.data); bm.free()


def cylinder_x(name, cx, cy, cz, r, width, material, parent=None, verts=32, r2=None):
    """Cylinder along game x (wheels, arches)."""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=width, location=(0, 0, 0))
    o = bpy.context.active_object
    o.name = name
    o.rotation_euler = (0, math.pi / 2, 0)   # Blender Z → Blender X (= game −x)
    o.location = G(cx, cy, cz)
    bpy.ops.object.transform_apply(location=False, rotation=True, scale=False)
    o.data.materials.append(material)
    if parent:
        o.parent = parent
    return o


def empty(name, x, y, z, parent=None, size=0.1):
    e = bpy.data.objects.new(name, None)
    e.empty_display_size = size
    e.location = G(x, y, z)
    return link(e, parent)


def apply_mods(o):
    bpy.context.view_layer.objects.active = o
    for md in list(o.modifiers):
        bpy.ops.object.modifier_apply(modifier=md.name)


def boolean(target, cutter, op='DIFFERENCE'):
    md = target.modifiers.new('bool', 'BOOLEAN'); md.operation = op; md.object = cutter; md.solver = 'EXACT'
    bpy.context.view_layer.objects.active = target
    bpy.ops.object.modifier_apply(modifier=md.name)
    bpy.data.objects.remove(cutter, do_unlink=True)


def smooth(o, angle=35):
    bpy.context.view_layer.objects.active = o
    for ob in bpy.context.selected_objects: ob.select_set(False)
    o.select_set(True)
    bpy.ops.object.shade_auto_smooth(angle=math.radians(angle))


# ------------------------------------------------------------------ root
root = bpy.data.objects.new('hiace_root', None)
link(root)

# ------------------------------------------------------------------ body shell
# side profile (z forward, y up): high-roof commuter with short sloped nose
WS_TOP = (1.60, 2.11)   # windscreen top
WS_BOT = (2.17, 1.22)   # windscreen bottom (cowl)
profile = [
    (-L2 + 0.02, 0.36), (-L2, 0.62), (-L2 - 0.01, 1.95), (-L2 + 0.10, H - 0.02), (-L2 + 0.35, H),
    (1.35, H), WS_TOP, WS_BOT, (2.40, 1.06), (L2 + 0.02, 0.86), (L2 + 0.03, 0.45), (L2 - 0.03, 0.33),
]
body = prism('body', profile, -W / 2, W / 2, M['paint'], root)
md = body.modifiers.new('bevel', 'BEVEL'); md.width = 0.07; md.segments = 4; md.limit_method = 'ANGLE'; md.angle_limit = math.radians(25)
apply_mods(body)
body.data.materials.append(M['inner'])
md = body.modifiers.new('shell', 'SOLIDIFY'); md.thickness = 0.035; md.offset = -1; md.material_offset = 1; md.material_offset_rim = 1
apply_mods(body)

# wheel arches
for z in (AXLE_F, AXLE_R):
    c = cylinder_x('arch_cut', 0, WHEEL_R + 0.02, z, 0.45, W + 0.4, M['black'], verts=40)
    boolean(body, c)

# window openings
def window_cut(z0, z1, y0, y1, x_inset=0.0):
    c = box('win_cut', 0, (y0 + y1) / 2, (z0 + z1) / 2, W + 0.4 - x_inset, y1 - y0, z1 - z0, M['black'])
    boolean(body, c)

WIN_Y0, WIN_Y1 = 1.30, 1.93
SIDE_WINDOWS = [(1.03, 1.50), (0.05, 0.92), (-1.05, -0.05), (-2.20, -1.15)]
for z0, z1 in SIDE_WINDOWS:
    window_cut(z0, z1, WIN_Y0, WIN_Y1)

# windscreen: a slab following the screen line, inset from the edges
def along(a, b, t):
    return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
dz, dy = WS_BOT[0] - WS_TOP[0], WS_BOT[1] - WS_TOP[1]
ln = math.hypot(dz, dy); nz, ny = dy / ln, -dz / ln   # outward normal (forward/up)
if nz < 0: nz, ny = -nz, -ny
t0, t1 = 0.08, 0.93
p0, p1 = along(WS_TOP, WS_BOT, t0), along(WS_TOP, WS_BOT, t1)
ws_poly = [(p0[0] + nz * 0.2, p0[1] + ny * 0.2), (p1[0] + nz * 0.2, p1[1] + ny * 0.2), (p1[0] - nz * 0.2, p1[1] - ny * 0.2), (p0[0] - nz * 0.2, p0[1] - ny * 0.2)]
boolean(body, prism('ws_cut', ws_poly, -W / 2 + 0.11, W / 2 - 0.11, M['black']))
# rear window
boolean(body, box('rear_cut', 0, (WIN_Y0 + WIN_Y1) / 2, -L2, W - 0.34, WIN_Y1 - WIN_Y0, 0.4, M['black']))
smooth(body)

# ------------------------------------------------------------------ glass
def glass_panel(name, z0, z1, y0, y1, side):
    x = side * (W / 2 - 0.012)
    return box(name, x, (y0 + y1) / 2, (z0 + z1) / 2, 0.012, y1 - y0 + 0.02, z1 - z0 + 0.02, M['glass'], root)

for i, (z0, z1) in enumerate(SIDE_WINDOWS):
    for s in (-1, 1):
        glass_panel(f'glass_side_{i}_{"L" if s < 0 else "R"}', z0, z1, WIN_Y0, WIN_Y1, s)
ws_glass = [(p0[0] + nz * 0.01, p0[1] + ny * 0.01), (p1[0] + nz * 0.01, p1[1] + ny * 0.01), (p1[0] - nz * 0.004, p1[1] - ny * 0.004), (p0[0] - nz * 0.004, p0[1] - ny * 0.004)]
prism('glass_windscreen', ws_glass, -W / 2 + 0.1, W / 2 - 0.1, M['glass'], root)
box('glass_rear', 0, (WIN_Y0 + WIN_Y1) / 2, -L2 - 0.005, W - 0.32, WIN_Y1 - WIN_Y0 + 0.02, 0.012, M['glass'], root)
# rubber surrounds and black B/C pillars between side windows (typical van look)
for z0, z1 in zip([w[1] for w in SIDE_WINDOWS[1:]], [w[0] for w in SIDE_WINDOWS[:-1]]):
    for s in (-1, 1):
        box('pillar_trim', s * (W / 2 + 0.002), (WIN_Y0 + WIN_Y1) / 2, (z0 + z1) / 2, 0.01, WIN_Y1 - WIN_Y0, z1 - z0 + 0.02, M['black'], root)

# ------------------------------------------------------------------ panel lines, handles, livery
for s in (-1, 1):
    x = s * (W / 2 + 0.003)
    for z in (1.98, 0.98):   # front door edges
        box('seam', x, 0.83, z, 0.006, 0.94, 0.012, M['black'], root)
    box('handle', x + s * 0.01, 1.12, 1.05, 0.02, 0.04, 0.16, M['black'], root, bevel=0.008)
# sliding door on the right (kerb side): seam + rail + handle
xr = W / 2 + 0.003
for z in (0.95, -0.25):
    box('slide_seam', xr, 0.83, z, 0.006, 0.94, 0.012, M['black'], root)
box('slide_rail', xr + 0.004, 1.28, -0.9, 0.01, 0.03, 1.3, M['black'], root)
box('slide_handle', xr + 0.012, 1.1, 0.05, 0.02, 0.04, 0.2, M['black'], root, bevel=0.008)
# fuel flap (left rear)
box('fuel_flap', -(W / 2 + 0.003), 1.02, -1.75, 0.006, 0.12, 0.12, M['black'], root, bevel=0.003)

def livery(side):
    x = side * (W / 2 + 0.006)
    z0, z1, y0, y1 = -2.3, 0.9, 0.62, 1.22
    v = [(x, y0, z0), (x, y0, z1), (x, y1, z1), (x, y1, z0)]
    # left side reads front→back towards −z; right side reads front→back towards +z (see notes)
    if side < 0: uv = {0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (1, 1)}
    else: uv = {0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)}
    return mesh_obj('livery_' + ('L' if side < 0 else 'R'), v, [[0, 1, 2, 3]], M['livery'], root, uvs=uv)
livery(-1); livery(1)

# ------------------------------------------------------------------ front end
box('bumper_front', 0, 0.42, L2 + 0.04, W + 0.02, 0.26, 0.16, M['black'], root, bevel=0.04, seg=3)
box('bumper_rear', 0, 0.42, -L2 - 0.04, W + 0.02, 0.24, 0.14, M['black'], root, bevel=0.04, seg=3)
box('step_rear', 0, 0.33, -L2 - 0.12, 1.0, 0.04, 0.14, M['black'], root)
box('grille', 0, 0.78, L2 + 0.035, 1.0, 0.22, 0.03, M['black'], root, bevel=0.01)
for y in (0.72, 0.84):
    box('grille_bar', 0, y, L2 + 0.052, 0.96, 0.025, 0.01, M['chrome'], root)
box('emblem_blank', 0, 0.78, L2 + 0.058, 0.16, 0.08, 0.01, M['chrome'], root, bevel=0.01)  # unbadged
for s in (-1, 1):
    box(f'headlamp_{s}', s * 0.66, 0.84, L2 + 0.03, 0.42, 0.2, 0.04, M['head'], root, bevel=0.02)
    box(f'headlamp_rim_{s}', s * 0.66, 0.84, L2 + 0.018, 0.45, 0.23, 0.03, M['black'], root, bevel=0.015)
    box(f'front_ind_{s}', s * 0.86, 0.72, L2 + 0.04, 0.12, 0.06, 0.03, M['amber'], root, bevel=0.01)
    box(f'foglamp_{s}', s * 0.62, 0.42, L2 + 0.125, 0.1, 0.06, 0.02, M['head'], root)
box('plate_front', 0, 0.45, L2 + 0.125, 0.5, 0.16, 0.012, M['black'], root)
mesh_obj('plate_front_face', [(-0.24, 0.38, L2 + 0.133), (0.24, 0.38, L2 + 0.133), (0.24, 0.53, L2 + 0.133), (-0.24, 0.53, L2 + 0.133)],
         [[0, 1, 2, 3]], M['plate'], root, uvs={0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (1, 1)})
# wipers
for s in (-0.35, 0.3):
    box('wiper', s, WS_BOT[1] + 0.05, WS_BOT[0] - 0.05, 0.55, 0.012, 0.02, M['black'], root)

# mirrors (big van mirrors on arms)
for s in (-1, 1):
    box('mirror_arm', s * (W / 2 + 0.12), 1.48, 1.72, 0.26, 0.025, 0.025, M['black'], root)
    box('mirror_head', s * (W / 2 + 0.25), 1.55, 1.70, 0.06, 0.3, 0.17, M['black'], root, bevel=0.02)
    box('mirror_glass', s * (W / 2 + 0.25), 1.55, 1.61, 0.05, 0.26, 0.01, M['chrome'], root)

# ------------------------------------------------------------------ rear end lamps
for s in (-1, 1):
    x = s * 0.82
    box(f'tail_red_{s}', x, 1.05, -L2 - 0.02, 0.16, 0.42, 0.04, M['red'], root, bevel=0.01)
    box(f'tail_amber_{s}', x, 0.78, -L2 - 0.02, 0.16, 0.1, 0.04, M['amber'], root, bevel=0.01)
    box(f'tail_white_{s}', x, 0.68, -L2 - 0.02, 0.16, 0.08, 0.04, M['white_lens'], root, bevel=0.01)
box('plate_rear', 0, 0.62, -L2 - 0.03, 0.5, 0.16, 0.012, M['black'], root)
mesh_obj('plate_rear_face', [(-0.24, 0.55, -L2 - 0.038), (0.24, 0.55, -L2 - 0.038), (0.24, 0.70, -L2 - 0.038), (-0.24, 0.70, -L2 - 0.038)],
         [[0, 1, 2, 3]], M['plate'], root, uvs={0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)})
box('rear_handle', 0, 1.18, -L2 - 0.025, 0.3, 0.04, 0.03, M['black'], root, bevel=0.01)

# ------------------------------------------------------------------ roof rack with luggage (Lagos–Ibadan staple)
for s in (-1, 1):
    box('rack_rail', s * 0.78, H + 0.1, -0.5, 0.04, 0.04, 3.4, M['black'], root)
    for z in (-2.1, 1.1):
        box('rack_foot', s * 0.78, H + 0.04, z, 0.05, 0.08, 0.05, M['black'], root)
for z in (-2.0, -1.2, -0.4, 0.4, 1.1):
    box('rack_bar', 0, H + 0.1, z, 1.6, 0.03, 0.03, M['black'], root)
box('luggage_tarp', 0.15, H + 0.27, -1.1, 1.1, 0.32, 1.25, M['tarp'], root, bevel=0.08, seg=3)
box('luggage_sack', -0.45, H + 0.22, 0.1, 0.55, 0.24, 0.7, M['sack'], root, bevel=0.09, seg=3)

# ------------------------------------------------------------------ wheels (separate objects, origin at hub)
def wheel(name, side, z):
    x = side * TRACK
    hub = empty(name, x, WHEEL_R, z, root)
    t = cylinder_x(name + '_tyre', 0, 0, 0, WHEEL_R, 0.215, M['rubber'], verts=36)
    t.parent = hub; t.location = (0, 0, 0)
    md = t.modifiers.new('bevel', 'BEVEL'); md.width = 0.05; md.segments = 4; md.limit_method = 'ANGLE'
    apply_mods(t); smooth(t, 50)
    r = cylinder_x(name + '_rim', 0, 0, 0, 0.215, 0.225, M['steel'], verts=24)
    r.parent = hub; r.location = (0, 0, 0)
    c = cylinder_x(name + '_cap', 0, 0, 0, 0.09, 0.24, M['chrome'], verts=16, r2=0.06)
    c.parent = hub; c.location = (0, 0, 0)
    # arch liner: upper half of a cylinder just inside the arch
    lin = cylinder_x(name + '_liner', side * (W / 4), WHEEL_R + 0.02, z, 0.445, W / 2 - 0.04, M['black'], verts=32)
    cut = box('liner_cut', side * (W / 4), WHEEL_R - 0.3, z, W, 0.64, 1.2, M['black'])
    boolean(lin, cut)
    for f in lin.data.polygons: f.use_smooth = True
    lin.parent = root
    # mud flap behind the wheel
    box(name + '_flap', side * (TRACK + 0.02), 0.22, z - 0.47, 0.22, 0.3, 0.012, M['black'], root)
    return hub
for nm, s, z in (('wheel_FL', -1, AXLE_F), ('wheel_FR', 1, AXLE_F), ('wheel_RL', -1, AXLE_R), ('wheel_RR', 1, AXLE_R)):
    wheel(nm, s, z)
box('underbody', 0, 0.3, -0.2, W - 0.3, 0.06, 3.9, M['black'], root)

# ------------------------------------------------------------------ interior (parented to 'interior')
interior = bpy.data.objects.new('interior', None); link(interior, root)
FLOOR = 0.42
box('floor', 0, FLOOR, -0.2, W - 0.08, 0.04, 4.5, M['floor'], interior)
box('dashboard', 0, 1.05, 1.95, W - 0.1, 0.3, 0.42, M['dash'], interior, bevel=0.04, seg=3)
box('instrument_hood', -0.41, 1.24, 1.82, 0.42, 0.1, 0.2, M['dash'], interior, bevel=0.03)
box('engine_cover', 0, 0.62, 1.25, 0.5, 0.4, 0.7, M['dash'], interior, bevel=0.05, seg=3)

def seat(name, x, z, width, cushion_y=0.62):
    s = box(name, x, cushion_y - 0.05, z, width, 0.1, 0.46, M['fabric'], interior, bevel=0.035, seg=3)
    box(name + '_back', x, cushion_y + 0.3, z - 0.24, width, 0.62, 0.09, M['fabric'], interior, bevel=0.035, seg=3)
    box(name + '_frame', x, (FLOOR + cushion_y - 0.1) / 2, z, width - 0.1, cushion_y - 0.1 - FLOOR, 0.36, M['fabric2'], interior)
    return s

DRIVER = (-0.406, 1.2); COND = (0.406, 1.2)
seat('seat_driver', DRIVER[0], DRIVER[1], 0.5)
seat('seat_conductor', COND[0], COND[1], 0.5)
ROWS = [0.4, -0.4, -1.2, -2.0]
SEAT_X = [-0.65, -0.217, 0.217, 0.65]
for i, z in enumerate(ROWS):
    seat(f'bench_{i + 1}', 0, z, 1.72)

# steering wheel + column
bpy.ops.mesh.primitive_torus_add(major_radius=0.19, minor_radius=0.018, major_segments=32, minor_segments=8)
sw = bpy.context.active_object; sw.name = 'steering_wheel'
sw.rotation_euler = (-1.1, 0, 0); sw.location = G(-0.406, 1.22, 1.55)
sw.data.materials.append(M['black']); sw.parent = interior
box('steering_column', -0.406, 1.12, 1.72, 0.06, 0.06, 0.35, M['black'], interior)

# ------------------------------------------------------------------ contract nodes (docs/ASSET-CONTRACT.md)
for s, side in ((-1, 'L'), (1, 'R')):
    empty(f'light_brake_{side}', s * 0.82, 1.05, -L2 - 0.045, root)
    empty(f'light_reverse_{side}', s * 0.82, 0.68, -L2 - 0.045, root)
    empty(f'indicator_R{side}', s * 0.82, 0.78, -L2 - 0.045, root)
    empty(f'indicator_F{side}', s * 0.86, 0.72, L2 + 0.06, root)
    empty(f'headlight_{side}', s * 0.66, 0.84, L2 + 0.06, root)
empty('driver_cam', DRIVER[0], 1.62, DRIVER[1] - 0.05, root)
empty('cabin_cam', 0, 1.95, 1.55, root)
empty('reverse_cam', 0, 1.95, -L2 + 0.1, root)
empty('mirror_rear', 0, 1.9, -L2 + 0.3, root)
empty('door_passenger', W / 2 + 0.35, 0, 0.55, root)
empty('conductor_seat', COND[0], 0.62, COND[1], root)
k = 0
for z in ROWS:
    for x in SEAT_X:
        k += 1
        if k > 14: break
        empty(f'seat_{k:02d}', x, 0.62, z, root)

# ------------------------------------------------------------------ merge parts by material (fewer draw calls)
def merge(parent, keep):
    groups = {}
    for o in list(parent.children):
        if o.type != 'MESH' or o.name in keep: continue
        apply_mods(o)
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for mname, objs in groups.items():
        if len(objs) < 2: continue
        bpy.ops.object.select_all(action='DESELECT')
        for o in objs: o.select_set(True)
        bpy.context.view_layer.objects.active = objs[0]
        bpy.ops.object.join()
        objs[0].name = f'{parent.name}_{mname}'
merge(root, keep={'body'})
merge(interior, keep={'steering_wheel'})

# ------------------------------------------------------------------ report + export
tris = 0
dg = bpy.context.evaluated_depsgraph_get()
for o in bpy.data.objects:
    if o.type == 'MESH':
        me = o.evaluated_get(dg).to_mesh()
        me.calc_loop_triangles(); tris += len(me.loop_triangles)
        o.evaluated_get(dg).to_mesh_clear()
print(f'TRIANGLES {tris}')

bpy.ops.export_scene.gltf(filepath=OUT, export_format='GLB', export_apply=True, export_yup=True,
                          export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False)
bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(OUT)[0] + '.blend')
print('EXPORTED', OUT)
