# Renders a quick front/three-quarter preview of a character file.
# Usage: blender -b -P tools/blender/char_preview.py -- <in.gltf|glb> <out.png> [frame]
import bpy, sys, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
src, out = argv[0], argv[1]
frame = int(argv[2]) if len(argv) > 2 else None

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=src)
if frame is not None:
    bpy.context.scene.frame_set(frame)

meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
dg = bpy.context.evaluated_depsgraph_get()
for o in meshes:
    ev = o.evaluated_get(dg)
    for c in ev.bound_box:
        w = ev.matrix_world @ Vector(c)
        lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
ctr = (lo + hi) / 2; h = hi.z - lo.z
print("BOUNDS", tuple(round(v, 2) for v in lo), tuple(round(v, 2) for v in hi))

cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
bpy.context.scene.collection.objects.link(cam)
cam.data.lens = 60
cam.location = ctr + Vector((h * 1.1, -h * 2.2, h * 0.15))
cam.rotation_euler = (ctr - cam.location).to_track_quat("-Z", "Y").to_euler()
bpy.context.scene.camera = cam
sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.5
sun.rotation_euler = (math.radians(50), 0, math.radians(30)); bpy.context.scene.collection.objects.link(sun)
world = bpy.data.worlds.new("w"); bpy.context.scene.world = world
world.use_nodes = True; world.node_tree.nodes["Background"].inputs[0].default_value = (0.75, 0.8, 0.85, 1)
world.node_tree.nodes["Background"].inputs[1].default_value = 0.9
sc = bpy.context.scene
sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items] else "BLENDER_EEVEE_NEXT"
sc.render.resolution_x = 520; sc.render.resolution_y = 760
sc.render.filepath = out
bpy.ops.render.render(write_still=True)
