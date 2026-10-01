"""Shared helpers for the scripted Trip_Ibadan vehicles (see build_bus.py for the first use).
Everything is authored in GAME space (x right, y up, z forward, metres) and converted with G()."""
import math, os, sys
import bpy, bmesh
from mathutils import Vector, Matrix

HERE = os.path.dirname(os.path.abspath(__file__))
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
    'steel': mat('wheel_steel', (0.66, 0.68, 0.7), metal=0.3, rough=0.35),
    'chrome': mat('chrome', (0.85, 0.86, 0.88), metal=0.3, rough=0.15),
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



def merge(parent, keep):
    """Join child meshes that share a material (fewer draw calls in the game)."""
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


def export(out):
    tris = 0
    dg = bpy.context.evaluated_depsgraph_get()
    for o in bpy.data.objects:
        if o.type == 'MESH':
            me = o.evaluated_get(dg).to_mesh()
            me.calc_loop_triangles(); tris += len(me.loop_triangles)
            o.evaluated_get(dg).to_mesh_clear()
    print(f'TRIANGLES {tris}')
    bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', export_apply=True, export_yup=True,
                              export_texcoords=True, export_normals=True, export_materials='EXPORT', export_extras=False)
    bpy.ops.wm.save_as_mainfile(filepath=os.path.splitext(out)[0] + '.blend')
    print('EXPORTED', out)
