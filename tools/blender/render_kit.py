import sys, math, bpy
from mathutils import Vector
bpy.ops.wm.open_mainfile(filepath=sys.argv[1])
scene = bpy.context.scene
protos = [o for o in bpy.data.objects if o.name.startswith('proto_')]
order = ['station', 'unfinished', 'billboard_network', 'billboard_rice', 'billboard_safety', 'kiosk', 'buka', 'vulcanizer', 'pos_stand', 'umbrella_stall', 'shelter', 'church_sign', 'water_tank', 'power_pole', 'drain', 'drain_covered', 'plantain', 'grass', 'jerrycans', 'tyre_pile', 'sand_pile']
x = 0.0
row = [('station', 0, 0), ('unfinished', 24, 0), ('billboard_network', 40, 0), ('billboard_rice', 49, 0), ('billboard_safety', 58, 0),
       ('kiosk', 2, 16), ('buka', 9, 16), ('vulcanizer', 16, 16), ('pos_stand', 22, 16), ('umbrella_stall', 27, 16), ('shelter', 33, 16), ('church_sign', 39, 16),
       ('water_tank', 44, 16), ('power_pole', 49, 16), ('drain', 53, 16), ('drain_covered', 55.5, 16), ('plantain', 60, 16), ('grass', 63.5, 16), ('jerrycans', 66, 17), ('tyre_pile', 68, 17), ('sand_pile', 71, 16)]
for name, gx, gz in row:
    o = bpy.data.objects.get('proto_' + name)
    if o: o.location = Vector((-gx, -gz, 0))
world = bpy.data.worlds.new('sky'); scene.world = world; world.use_nodes = True
sky = world.node_tree.nodes.new('ShaderNodeTexSky'); sky.sky_type = 'NISHITA'; sky.sun_elevation = math.radians(40); sky.sun_rotation = math.radians(200)
world.node_tree.links.new(sky.outputs['Color'], world.node_tree.nodes['Background'].inputs['Color'])
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.35
sun = bpy.data.lights.new('sun', 'SUN'); sun.energy = 3; so = bpy.data.objects.new('sun', sun); scene.collection.objects.link(so); so.rotation_euler = (math.radians(50), 0, math.radians(200))
bpy.ops.mesh.primitive_plane_add(size=300, location=(-35, -10, -0.01)); g = bpy.context.active_object
gm = bpy.data.materials.new('g'); gm.use_nodes = True; gm.node_tree.nodes['Principled BSDF'].inputs['Base Color'].default_value = (0.42, 0.33, 0.22, 1); g.data.materials.append(gm)
scene.render.engine = 'CYCLES'; scene.cycles.samples = 32; scene.cycles.use_denoising = True
scene.render.resolution_x, scene.render.resolution_y = 1600, 800; scene.view_settings.view_transform = 'AgX'
cd = bpy.data.cameras.new('c'); cd.lens = 24; cam = bpy.data.objects.new('c', cd); scene.collection.objects.link(cam); scene.camera = cam
for name, pos, look in (('a', (-14, -34, 9), (-14, -2, 2)), ('b', (-50, -36, 7), (-50, -14, 1.5)), ('c', (-62, -28, 4), (-63, -15, 1))):
    cam.location = Vector(pos); cam.rotation_euler = (Vector(look) - cam.location).to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'renders/kit-{name}.png'; bpy.ops.render.render(write_still=True)
