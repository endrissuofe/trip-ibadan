"""
Roadside scenery kit for Trip_Ibadan: kiosks, buka, vulcanizer, POS stand, petrol station, bus shelter,
billboards, unfinished building, church sign, water tank, power pole, drains, elephant grass, plantain,
jerrycans, tyre pile, sand pile. Every prototype is one object named proto_<name>, built at the origin
with its front facing +Z (towards the road). All brands and names are fictional.
Run: python build_roadside.py --out ../../public/models/roadside.glb
"""
import sys, math
from lib_vehicle import *

OUT = sys.argv[sys.argv.index('--out') + 1] if '--out' in sys.argv else 'roadside.glb'


def tmat(name, image, rough=0.8, normal=None, alpha_clip=False, metal=0.0, color=None):
    m = bpy.data.materials.new(name); m.use_nodes = True; nt = m.node_tree; p = nt.nodes['Principled BSDF']
    p.inputs['Roughness'].default_value = rough; p.inputs['Metallic'].default_value = metal
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(HERE, 'kit_tex', image))
    nt.links.new(t.outputs['Color'], p.inputs['Base Color'])
    if normal:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = bpy.data.images.load(os.path.join(HERE, 'kit_tex', normal))
        n.image.colorspace_settings.name = 'Non-Color'
        nm = nt.nodes.new('ShaderNodeNormalMap'); nt.links.new(n.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if alpha_clip:
        g = nt.nodes.new('ShaderNodeMath'); g.operation = 'GREATER_THAN'; g.inputs[1].default_value = 0.5
        nt.links.new(t.outputs['Alpha'], g.inputs[0]); nt.links.new(g.outputs[0], p.inputs['Alpha'])
        m.blend_method = 'CLIP'
    m.use_backface_culling = False
    return m


K = {
    'concrete': tmat('kit_concrete', 'concrete.png', 0.9),
    'blocks': tmat('kit_blocks', 'blocks.png', 0.92),
    'roof': tmat('kit_roof', 'roof_rust.png', 0.6, normal='corrugated_normal.png', metal=0.2),
    'grass': tmat('kit_grass', 'grass.png', 0.85, alpha_clip=True),
    'sign_provisions': tmat('kit_sign_provisions', 'sign_provisions.png', 0.6),
    'sign_buka': tmat('kit_sign_buka', 'sign_buka.png', 0.6),
    'sign_vulcanizer': tmat('kit_sign_vulcanizer', 'sign_vulcanizer.png', 0.6),
    'sign_pos': tmat('kit_sign_pos', 'sign_pos.png', 0.6),
    'sign_church': tmat('kit_sign_church', 'sign_church.png', 0.6),
    'sign_station': tmat('kit_sign_station', 'sign_station.png', 0.4),
    'sign_prices': tmat('kit_sign_prices', 'sign_prices.png', 0.4),
    'bb_network': tmat('kit_bb_network', 'bb_network.png', 0.5),
    'bb_rice': tmat('kit_bb_rice', 'bb_rice.png', 0.5),
    'bb_safety': tmat('kit_bb_safety', 'bb_safety.png', 0.5),
    'kiosk_blue': mat('kit_kiosk_blue', (0.12, 0.32, 0.62), metal=0.2, rough=0.5),
    'kiosk_green': mat('kit_kiosk_green', (0.12, 0.45, 0.25), metal=0.2, rough=0.5),
    'steel': mat('kit_steel', (0.45, 0.46, 0.47), metal=0.3, rough=0.55),
    'wood': mat('kit_wood', (0.42, 0.29, 0.17), rough=0.85),
    'rebar': mat('kit_rebar', (0.3, 0.17, 0.1), metal=0.3, rough=0.7),
    'black': mat('kit_black', (0.03, 0.03, 0.03), rough=0.8),
    'tank': mat('kit_tank', (0.05, 0.05, 0.06), rough=0.5),
    'yellow': mat('kit_jerry_yellow', (0.95, 0.75, 0.08), rough=0.45),
    'red': mat('kit_red', (0.78, 0.1, 0.08), rough=0.5),
    'white': mat('kit_white', (0.92, 0.92, 0.9), rough=0.6),
    'green_crate': mat('kit_crate_green', (0.1, 0.5, 0.2), rough=0.5),
    'red_crate': mat('kit_crate_red', (0.75, 0.12, 0.1), rough=0.5),
    'chair_white': mat('kit_chair', (0.88, 0.88, 0.85), rough=0.5),
    'umbrella': mat('kit_umbrella', (0.12, 0.35, 0.7), rough=0.6),
    'umbrella2': mat('kit_umbrella2', (0.85, 0.2, 0.15), rough=0.6),
    'laterite': mat('kit_laterite', (0.55, 0.3, 0.17), rough=0.95),
    'sand': mat('kit_sand', (0.72, 0.62, 0.45), rough=0.95),
    'leaf': mat('kit_plantain_leaf', (0.13, 0.3, 0.07), rough=0.7),
    'leaf_dry': mat('kit_plantain_dry', (0.5, 0.45, 0.2), rough=0.8),
    'stem': mat('kit_plantain_stem', (0.35, 0.42, 0.18), rough=0.8),
    'pump': mat('kit_pump', (0.85, 0.85, 0.82), rough=0.4),
    'paint_cream': mat('kit_paint_cream', (0.86, 0.8, 0.66), rough=0.85),
    'ceramic': mat('kit_insulator', (0.6, 0.45, 0.3), rough=0.4),
    'pot': mat('kit_pot', (0.25, 0.25, 0.27), metal=0.3, rough=0.5),
    'glass': M['glass'],
    'murk': mat('kit_murk', (0.06, 0.07, 0.05), rough=0.25),
}
CUBE = {'kit_blocks': 1.8, 'kit_concrete': 2.0, 'kit_roof': 1.0}


def cyl(name, x, y, z, r, h, material, verts=12, r2=None):
    """Vertical cylinder (game y), centred at (x, y, z)."""
    bpy.ops.mesh.primitive_cone_add(vertices=verts, radius1=r, radius2=r if r2 is None else r2, depth=h, location=G(x, y, z))
    o = bpy.context.active_object; o.name = name; o.data.materials.append(material); return o


def torus(name, x, y, z, R, r, material, upright=False, yaw=0.0):
    bpy.ops.mesh.primitive_torus_add(major_radius=R, minor_radius=r, major_segments=14, minor_segments=6, location=G(x, y, z))
    o = bpy.context.active_object; o.name = name
    if upright: o.rotation_euler = (0, math.pi / 2, yaw)
    o.data.materials.append(material); return o


def plane(name, cx, cy, cz, w, h, material, facing='z', flip=False):
    """Textured rectangle facing +z (or ±x)."""
    hw, hh = w / 2, h / 2
    if facing == 'z':
        v = [(cx - hw, cy - hh, cz), (cx + hw, cy - hh, cz), (cx + hw, cy + hh, cz), (cx - hw, cy + hh, cz)]
        uv = {0: (1, 0), 1: (0, 0), 2: (0, 1), 3: (1, 1)} if not flip else {0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)}
    else:
        v = [(cx, cy - hh, cz - hw), (cx, cy - hh, cz + hw), (cx, cy + hh, cz + hw), (cx, cy + hh, cz - hw)]
        uv = {0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)}
    return mesh_obj(name, v, [[0, 1, 2, 3]], material, None, uvs=uv)


def cube_uvs(o, size):
    bpy.ops.object.select_all(action='DESELECT'); o.select_set(True); bpy.context.view_layer.objects.active = o
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.cube_project(cube_size=size); bpy.ops.object.mode_set(mode='OBJECT')


def proto(name, build):
    before = set(bpy.data.objects)
    build()
    objs = [o for o in bpy.data.objects if o not in before and o.type == 'MESH']
    for o in objs:
        apply_mods(o)
        if not o.data.uv_layers:
            cube_uvs(o, CUBE.get(o.data.materials[0].name, 1.0))
        bpy.context.view_layer.objects.active = o
        bpy.ops.object.select_all(action='DESELECT'); o.select_set(True)
        bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    bpy.ops.object.select_all(action='DESELECT')
    for o in objs: o.select_set(True)
    bpy.context.view_layer.objects.active = objs[0]
    bpy.ops.object.join()
    j = bpy.context.active_object; j.name = 'proto_' + name; j.data.name = 'proto_' + name
    tris = sum(len(p.vertices) - 2 for p in j.data.polygons)
    print(f'  {name}: {tris} tris')
    return j


# ------------------------------------------------------------------ shops and stalls
def chair(x, z, yaw=0.3):
    box('seat', x, 0.45, z, 0.45, 0.05, 0.45, K['chair_white'])
    box('back', x, 0.75, z - 0.22, 0.45, 0.55, 0.04, K['chair_white'])
    for dx in (-0.2, 0.2):
        for dz in (-0.2, 0.2):
            cyl('leg', x + dx, 0.22, z + dz, 0.02, 0.45, K['chair_white'], 6)


def kiosk():
    box('body', 0, 1.25, 0, 2.4, 2.3, 1.8, K['kiosk_blue'], bevel=0.02)
    box('hatch_in', 0, 1.35, 0.86, 2.0, 1.0, 0.1, K['black'])          # dark interior through the hatch
    box('counter', 0, 0.86, 1.05, 2.3, 0.06, 0.45, K['wood'])
    box('flap', 0, 1.98, 1.25, 2.1, 0.04, 0.9, K['kiosk_blue'])         # propped-up hatch flap
    box('roof', 0, 2.47, 0.1, 2.7, 0.06, 2.3, K['roof'])
    plane('sign', 0, 2.95, 0.95, 2.6, 0.95, K['sign_provisions'])
    box('sign_back', 0, 2.95, 0.91, 2.62, 0.97, 0.03, K['wood'])
    for i in range(3):  # crates of soft drinks beside the kiosk
        for j in range(2):
            box('crate', 1.6 + j * 0.42, 0.15 + i * 0.3, 0.6, 0.4, 0.28, 0.3, K['green_crate'] if (i + j) % 2 else K['red_crate'])
    for i in range(4):  # bags of pure water on the counter
        box('sachets', -0.8 + i * 0.32, 1.0, 1.08, 0.28, 0.2, 0.3, K['white'], bevel=0.05, seg=2)
    chair(-1.7, 0.9)
proto('kiosk', kiosk)


def buka():
    for x in (-1.9, 1.9):
        for z in (-1.4, 1.4):
            cyl('post', x, 1.3, z, 0.06, 2.6, K['wood'], 6)
    prism('roof', [(-1.7, 2.75), (1.7, 2.45), (1.7, 2.5), (-1.7, 2.8)], -2.2, 2.2, K['roof'])
    box('table', 0, 0.8, 0.3, 2.6, 0.06, 0.8, K['wood'])
    for x in (-1.1, 1.1):
        box('table_leg', x, 0.4, 0.3, 0.06, 0.8, 0.6, K['wood'])
    for i, x in enumerate((-0.8, -0.1, 0.6)):
        cyl('pot', x, 1.0, 0.3, 0.25, 0.36, K['pot'], 14)
    box('bench', 0, 0.45, 1.3, 2.8, 0.06, 0.35, K['wood'])
    for x in (-1.2, 1.2):
        box('bench_leg', x, 0.22, 1.3, 0.06, 0.45, 0.3, K['wood'])
    box('back_wall', 0, 1.0, -1.45, 3.8, 2.0, 0.06, K['roof'])
    plane('sign', 0, 3.25, 1.5, 2.8, 1.05, K['sign_buka'])
    box('sign_back', 0, 3.25, 1.46, 2.82, 1.07, 0.03, K['wood'])
    for x in (-1.3, 1.3):
        cyl('sign_post', x, 2.75, 1.5, 0.04, 1.0, K['wood'], 6)
proto('buka', buka)


def vulcanizer():
    for x in (-1.3, 1.3):
        for z in (-1.0, 1.0):
            cyl('post', x, 1.2, z, 0.05, 2.4, K['wood'], 6)
    prism('roof', [(-1.3, 2.55), (1.3, 2.3), (1.3, 2.35), (-1.3, 2.6)], -1.6, 1.6, K['roof'])
    box('compressor', -0.7, 0.45, -0.3, 0.9, 0.7, 0.5, K['red'], bevel=0.04)
    cyl('tank', -0.7, 0.95, -0.3, 0.22, 0.6, K['red'], 12)
    for i in range(5):
        torus('tyre', 0.6, 0.12 + i * 0.22, 0.2, 0.3, 0.11, K['black'])
    for i in range(3):
        torus('tyre_lean', -1.4 + i * 0.12, 0.33, 1.2, 0.3, 0.1, K['black'], upright=True, yaw=0.0)
    cyl('sign_post', 1.7, 1.3, 1.4, 0.05, 2.6, K['steel'], 6)
    plane('sign', 1.7, 2.6, 1.43, 1.6, 0.6, K['sign_vulcanizer'])
    box('sign_back', 1.7, 2.6, 1.39, 1.62, 0.62, 0.03, K['steel'])
proto('vulcanizer', vulcanizer)


def pos_stand():
    cyl('pole', 0, 1.2, 0, 0.03, 2.4, K['steel'], 6)
    cyl('umbrella', 0, 2.35, 0, 1.4, 0.45, K['umbrella'], 10, r2=0.05)
    box('table', 0, 0.75, 0.5, 1.2, 0.05, 0.6, K['wood'])
    for x in (-0.5, 0.5):
        box('table_leg', x, 0.37, 0.5, 0.05, 0.75, 0.5, K['wood'])
    box('pos_device', 0.2, 0.82, 0.5, 0.12, 0.08, 0.2, K['black'])
    plane('sign', 0, 0.55, 0.81, 1.15, 0.45, K['sign_pos'])
    chair(0.0, -0.5)
proto('pos_stand', pos_stand)


def umbrella_stall():
    cyl('pole', 0, 1.2, 0, 0.03, 2.4, K['steel'], 6)
    cyl('umbrella', 0, 2.3, 0, 1.3, 0.4, K['umbrella2'], 10, r2=0.05)
    box('table', 0, 0.75, 0.3, 1.4, 0.05, 0.7, K['wood'])
    for x in (-0.6, 0.6):
        box('table_leg', x, 0.37, 0.3, 0.05, 0.75, 0.6, K['wood'])
    for i in range(5):  # trays of fruit / bread
        box('goods', -0.55 + i * 0.27, 0.83, 0.3, 0.24, 0.1, 0.5, [K['yellow'], K['red'], K['sand'], K['leaf'], K['white']][i], bevel=0.04)
    cyl('cooler', 0.9, 0.3, -0.3, 0.25, 0.6, K['umbrella'], 12)
proto('umbrella_stall', umbrella_stall)


# ------------------------------------------------------------------ petrol station (fictional KOLA OIL)
def station():
    for x in (-5.5, 5.5):
        for z in (-2.5, 2.5):
            box('column', x, 2.6, z, 0.4, 5.2, 0.4, K['white'])
    box('canopy', 0, 5.4, 0, 14, 0.5, 8, K['white'])
    box('fascia', 0, 5.4, 0, 14.2, 0.7, 8.2, K['red'])
    for z, flip in ((4.16, False), (-4.16, True)):
        plane('brand', 0, 5.4, z, 4.5, 0.65, K['sign_station'], flip=flip)
    for x in (-3.0, 3.0):
        box('island', x, 0.1, 0, 1.0, 0.2, 5.0, K['concrete'])
        for z in (-1.4, 1.4):
            box('pump', x, 0.95, z, 0.6, 1.5, 0.5, K['pump'], bevel=0.04)
            box('pump_band', x, 1.55, z, 0.62, 0.15, 0.52, K['red'])
            box('pump_screen', x, 1.25, z + 0.26, 0.4, 0.25, 0.02, K['black'])
    box('forecourt', 0, 0.02, 0, 18, 0.04, 12, K['concrete'])
    box('shop', 0, 1.7, -8.5, 9, 3.4, 4.5, K['blocks'])
    box('shop_roof', 0, 3.5, -8.5, 9.4, 0.2, 4.9, K['white'])
    box('shop_window', 0, 1.6, -6.24, 5, 1.6, 0.04, K['glass'])
    box('shop_door', 3.3, 1.1, -6.24, 1.1, 2.2, 0.05, K['glass'])
    cyl('price_post', 7.5, 2.5, 5.0, 0.12, 5.0, K['steel'], 8)
    plane('prices', 7.5, 4.0, 5.18, 1.4, 2.1, K['sign_prices'])
    box('prices_back', 7.5, 4.0, 5.11, 1.45, 2.15, 0.06, K['steel'])
proto('station', station)


# ------------------------------------------------------------------ street furniture
def shelter():
    for x in (-1.4, 1.4):
        cyl('post', x, 1.2, -0.5, 0.05, 2.4, K['steel'], 8)
    box('roof', 0, 2.45, -0.1, 3.4, 0.08, 1.7, K['roof'])
    box('back', 0, 1.3, -0.65, 3.0, 1.4, 0.04, K['steel'])
    box('bench', 0, 0.48, -0.35, 2.6, 0.06, 0.4, K['wood'])
    for x in (-1.0, 1.0):
        box('bench_leg', x, 0.24, -0.35, 0.06, 0.48, 0.35, K['steel'])
proto('shelter', shelter)


def billboard(name, material):
    def build():
        for x in (-1.8, 1.8):
            box('post', x, 3.0, 0, 0.3, 6.0, 0.3, K['steel'])
        box('frame', 0, 7.2, -0.08, 6.4, 2.8, 0.15, K['steel'])
        plane('ad', 0, 7.2, 0.08, 6.0, 2.5, material)   # well clear of the frame so it never z-fights at distance
        box('walkway', 0, 5.85, 0.35, 6.2, 0.06, 0.6, K['steel'])
        for x in (-2.4, 0, 2.4):
            box('lamp_arm', x, 8.75, 0.35, 0.05, 0.05, 0.7, K['steel'])
    proto(name, build)
billboard('billboard_network', K['bb_network'])
billboard('billboard_rice', K['bb_rice'])
billboard('billboard_safety', K['bb_safety'])


def church_sign():
    for x in (-1.1, 1.1):
        cyl('post', x, 1.3, 0, 0.05, 2.6, K['steel'], 6)
    plane('sign', 0, 2.2, 0.06, 2.6, 1.0, K['sign_church'])
    box('back', 0, 2.2, 0.0, 2.65, 1.05, 0.04, K['steel'])
proto('church_sign', church_sign)


def water_tank():
    for x in (-0.7, 0.7):
        for z in (-0.7, 0.7):
            box('leg', x, 1.6, z, 0.08, 3.2, 0.08, K['steel'])
    box('platform', 0, 3.2, 0, 1.6, 0.08, 1.6, K['steel'])
    for y in (1.0, 2.2):
        box('brace', 0, y, 0.7, 1.4, 0.05, 0.05, K['steel'])
        box('brace', 0, y, -0.7, 1.4, 0.05, 0.05, K['steel'])
    cyl('tank', 0, 3.95, 0, 0.65, 1.4, K['tank'], 20)
    cyl('lid', 0, 4.7, 0, 0.2, 0.1, K['tank'], 12)
proto('water_tank', water_tank)


def power_pole():
    cyl('pole', 0, 4.5, 0, 0.13, 9.0, K['concrete'], 8, r2=0.09)
    box('arm', 0, 8.4, 0, 1.8, 0.1, 0.1, K['steel'])
    for x in (-0.75, 0, 0.75):
        cyl('insulator', x, 8.55, 0, 0.04, 0.18, K['ceramic'], 8)
    box('transformer', 0, 6.2, 0.35, 0.5, 0.8, 0.4, K['steel'], bevel=0.03)
proto('power_pole', power_pole)


def drain(covered=False):
    def build():
        L = 4.0
        box('wall_l', -0.5, -0.3, 0, 0.12, 0.6, L, K['concrete'])
        box('wall_r', 0.5, -0.3, 0, 0.12, 0.6, L, K['concrete'])
        box('base', 0, -0.62, 0, 1.12, 0.08, L, K['concrete'])
        box('murk', 0, -0.5, 0, 0.88, 0.02, L, K['black'])
        if not covered:   # dark channel surface just above ground: the terrain isn't cut, so this is what reads as the open drain
            box('channel', 0, 0.035, 0, 0.88, 0.01, L, K['murk'])
        box('lip_l', -0.5, 0.05, 0, 0.16, 0.04, L, K['concrete'])
        box('lip_r', 0.5, 0.05, 0, 0.16, 0.04, L, K['concrete'])
        if covered:
            for i in range(4):
                box('slab', 0, 0.05, -1.5 + i * 1.0, 1.1, 0.1, 0.95, K['concrete'], bevel=0.01)
    proto('drain_covered' if covered else 'drain', build)
drain(False); drain(True)


# ------------------------------------------------------------------ unfinished building (very common)
def unfinished():
    W, D = 9.0, 7.0
    for x in (-W / 2, 0, W / 2):
        for z in (-D / 2, D / 2):
            box('col', x, 3.2, z, 0.3, 6.4, 0.3, K['concrete'])
            for dx in (-0.08, 0.08):
                for dz in (-0.08, 0.08):
                    cyl('rebar', x + dx, 7.0, z + dz, 0.012, 1.2, K['rebar'], 4)
    box('slab', 0, 3.25, 0, W + 0.3, 0.2, D + 0.3, K['concrete'])
    box('plinth', 0, 0.15, 0, W + 0.3, 0.3, D + 0.3, K['concrete'])
    # ground-floor sandcrete walls with openings
    box('wall_back', 0, 1.65, -D / 2, W, 3.0, 0.2, K['blocks'])
    box('wall_left', -W / 2, 1.65, 0, 0.2, 3.0, D, K['blocks'])
    box('wall_front_a', -3.2, 1.65, D / 2, 2.6, 3.0, 0.2, K['blocks'])
    box('wall_front_b', 3.2, 1.65, D / 2, 2.6, 3.0, 0.2, K['blocks'])
    box('wall_front_top', 0, 2.75, D / 2, 3.8, 0.8, 0.2, K['blocks'])
    box('wall_right_low', W / 2, 0.9, 1.0, 0.2, 1.5, 4.5, K['blocks'])   # still going up
    # first floor: partial block courses
    box('ff_wall', -2.5, 3.9, -D / 2, 4.0, 1.1, 0.2, K['blocks'])
    # block stack and sand heap in front
    for i in range(3):
        for j in range(4):
            box('block', 2.0 + j * 0.47, 0.12 + i * 0.23, 5.4, 0.45, 0.22, 0.22, K['blocks'])
    cyl('sand', -2.5, 0.4, 5.6, 1.4, 0.8, K['sand'], 14, r2=0.1)
proto('unfinished', unfinished)


# ------------------------------------------------------------------ vegetation
def grass_tuft():
    for k in range(3):
        a = k * math.pi / 3
        dx, dz = math.cos(a) * 1.1, math.sin(a) * 1.1
        v = [(-dx, 0, -dz), (dx, 0, dz), (dx, 2.0, dz), (-dx, 2.0, -dz)]
        mesh_obj('card', v, [[0, 1, 2, 3]], K['grass'], None, uvs={0: (0, 0), 1: (1, 0), 2: (1, 1), 3: (0, 1)})
proto('grass', grass_tuft)


def plantain_leaf(x, h, z, a, L, material, droop=1.0, segs=8):
    """Long arching leaf blade: rises from the crown, then droops; folded along the midrib; ragged tip."""
    ca, sa = math.cos(a), math.sin(a); px, pz = -sa, ca
    verts, faces, uvs = [], [], {}
    for i in range(segs + 1):
        t = i / segs
        r = L * t
        y = h + L * (0.55 * t - 0.95 * droop * t * t)
        w = 0.34 * math.sin(math.pi * min(1, t * 1.08)) ** 0.55 + 0.02
        cx, cz = x + ca * r, z + sa * r
        fold = 0.07 * w / 0.34
        verts += [(cx + px * w, y - fold, cz + pz * w), (cx, y, cz), (cx - px * w, y - fold, cz - pz * w)]
        for k in range(3): uvs[i * 3 + k] = (k / 2, t)
    for i in range(segs):
        b = i * 3
        faces += [(b, b + 1, b + 4, b + 3), (b + 1, b + 2, b + 5, b + 4)]
    mesh_obj('leaf', verts, faces, material, uvs=uvs)


def plantain():
    for i, (x, z, h) in enumerate(((0, 0, 2.7), (0.6, 0.35, 1.9), (-0.45, 0.45, 1.3))):
        cyl('stem', x, h / 2, z, 0.13 if i == 0 else 0.09, h, K['stem'], 8, r2=0.07)
        n = 7 if i == 0 else 5
        for k in range(n):
            a = k * 2 * math.pi / n + i * 0.9 + (k % 2) * 0.25
            L = (2.4 if i == 0 else 1.7) * (0.85 + 0.15 * ((k * 7) % 3))
            droop = 0.7 + 0.35 * ((k * 5) % 3) / 2
            dry = (i == 0 and k in (2, 5))
            if dry:   # old leaves hang down the trunk, dry and brown
                plantain_leaf(x, h - 0.4, z, a, 1.3, K['leaf_dry'], droop=2.2, segs=6)
            else:
                plantain_leaf(x, h, z, a, L, K['leaf'], droop=droop)
    # a bunch of green plantains hanging from the main stem
    cyl('stalk', 0.25, 2.2, 0.1, 0.03, 0.8, K['stem'], 6)
    cyl('bunch', 0.25, 1.7, 0.1, 0.22, 0.6, K['stem'], 10, r2=0.12)
proto('plantain', plantain)


# ------------------------------------------------------------------ clutter
def jerrycans():
    for i, (x, z, yaw) in enumerate(((0, 0, 0), (0.42, 0.05, 0.1), (0.2, -0.38, 1.6), (-0.4, -0.1, 0.3))):
        box('can', x, 0.28, z, 0.3, 0.5, 0.18, K['yellow'], bevel=0.03)
        box('handle', x, 0.57, z, 0.12, 0.08, 0.05, K['yellow'])
        cyl('cap', x + 0.1, 0.56, z, 0.035, 0.05, K['black'], 8)
proto('jerrycans', jerrycans)


def tyre_pile():
    for i, (x, z) in enumerate(((0, 0), (0.65, 0.1), (0.3, 0.55))):
        for j in range(3 - i % 2):
            torus('tyre', x, 0.12 + j * 0.22, z, 0.32, 0.11, K['black'])
proto('tyre_pile', tyre_pile)


def sand_pile():
    cyl('heap', 0, 0.5, 0, 1.8, 1.0, K['laterite'], 16, r2=0.15)
    cyl('heap2', 1.6, 0.35, 0.8, 1.2, 0.7, K['sand'], 14, r2=0.1)
proto('sand_pile', sand_pile)


export(OUT)
