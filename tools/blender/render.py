"""Preview renders of a vehicle .blend (Cycles, CPU). Usage: python3 render.py file.blend outprefix"""
import sys, math
import bpy
from mathutils import Vector

blend, prefix = sys.argv[1], sys.argv[2]
bpy.ops.wm.open_mainfile(filepath=blend)
scene = bpy.context.scene
G = lambda x, y, z: Vector((-x, -z, y))

# world: sky
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
nt = world.node_tree
sky = nt.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(38); sky.sun_rotation = math.radians(140)
nt.links.new(sky.outputs['Color'], nt.nodes['Background'].inputs['Color'])
nt.nodes['Background'].inputs['Strength'].default_value = 0.35
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3.2; sun.angle = math.radians(2)
so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so)
so.rotation_euler = (math.radians(52), 0, math.radians(140))
# ground: laterite-grey asphalt
bpy.ops.mesh.primitive_plane_add(size=60)
g = bpy.context.active_object
gm = bpy.data.materials.new('ground'); gm.use_nodes = True
gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.13, 0.13, 0.135, 1)
gm.node_tree.nodes['Principled BSDF'].inputs['Roughness'].default_value = 0.9
g.data.materials.append(gm)

scene.render.engine = 'CYCLES'
scene.cycles.device = 'CPU'
scene.cycles.samples = 48
scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1280, 720
scene.view_settings.view_transform = 'AgX'

cam_data = bpy.data.cameras.new('cam'); cam_data.lens = 35
cam = bpy.data.objects.new('cam', cam_data); scene.collection.objects.link(cam); scene.camera = cam

def shoot(name, pos, look, lens=35):
    cam_data.lens = lens
    cam.location = G(*pos)
    d = G(*look) - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{prefix}-{name}.png'
    bpy.ops.render.render(write_still=True)

views = sys.argv[3].split(',') if len(sys.argv) > 3 else ['front', 'rear', 'side', 'interior']
if 'front' in views: shoot('front', (4.2, 1.7, 5.6), (0, 1.0, 0.3))
if 'rear' in views: shoot('rear', (-3.8, 2.0, -5.6), (0, 1.0, -0.4))
if 'side' in views: shoot('side', (7.5, 1.3, 0.2), (0, 1.05, 0.0), lens=40)
if 'wheel' in views: shoot('wheel', (1.9, 0.6, 2.6), (0.85, 0.35, 1.5), lens=50)
if 'seats' in views: shoot('seats', (0.6, 1.25, 0.9), (0.0, 0.55, -0.6), lens=28)
if 'interior' in views: shoot('interior', (0.0, 1.9, 1.75), (0, 0.7, -2.2), lens=18)
