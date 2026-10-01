# Builds the rigged, animated passengers from the CC0 Quaternius base characters and
# animation library (see docs/ASSET-INVENTORY.md).
#   blender -b -P tools/blender/build_passenger.py -- <man|woman> <out.glb> [preview_dir]
#
# Each file holds one body plus several garments as separate meshes. The game switches
# garments on and off and recolours them per person, so two files give many passengers.
#
# Fitted clothes are made from the body itself: the faces under a garment are copied,
# welded, pushed out a little and smoothed, so they follow the rig in every animation.
# Loose clothes (tunic skirts, gowns, wrappers) are rings around both legs, weighted to
# the pelvis, thighs and calves.
import bpy, bmesh, sys, os, math
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
WHO, OUT = argv[0], argv[1]
PREVIEW = argv[2] if len(argv) > 2 else None
HERE = os.path.dirname(os.path.abspath(__file__))
RAW = os.path.join(HERE, "..", "assets", "raw", "quaternius")
CHARS = os.path.join(RAW, "Universal_Base_Characters", "Universal Base Characters[Standard]")
ANIMS = os.path.join(RAW, "Universal_Animation_Library", "Universal Animation Library[Standard]", "Unreal-Godot", "UAL1_Standard.glb")
HAIRDIR = os.path.join(CHARS, "Hairstyles", "Rigged to Head Bone", "glTF (Godot -Unreal)")
BODY = "Superhero_Male_FullBody.gltf" if WHO == "man" else "Superhero_Female_FullBody.gltf"
HAIRS = {"man": {"hair_low": "Hair_Buzzed.gltf"}, "woman": {"hair_low": "Hair_BuzzedFemale.gltf", "hair_bun": "Hair_Buns.gltf", "hair_long": "Hair_Long.gltf"}}[WHO]
KEEP = ["Idle_Loop", "Idle_Talking_Loop", "Walk_Loop", "Sitting_Idle_Loop", "Sitting_Talking_Loop", "Interact"]

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(CHARS, "Base Characters", "Godot - UE", BODY))
arm = next(o for o in bpy.context.scene.objects if o.type == "ARMATURE")
body = max((o for o in bpy.context.scene.objects if o.type == "MESH"), key=lambda o: len(o.data.vertices))
face_bits = [o for o in bpy.context.scene.objects if o.type == "MESH" and o is not body]
body.name = "body"
WORLD = body.matrix_world.copy()

def flat_material(name, col=(1, 1, 1), rough=0.85):
    m = bpy.data.materials.new(name); m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*col, 1); b.inputs["Roughness"].default_value = rough
    return m

def strip_extra_maps(m):
    """Stylised look and small files: keep base colour only."""
    if not m or not m.use_nodes: return
    b = m.node_tree.nodes.get("Principled BSDF")
    if not b: return
    for inp in ("Normal", "Roughness", "Metallic"):
        for l in list(b.inputs[inp].links): m.node_tree.links.remove(l)
    b.inputs["Roughness"].default_value = 0.8

names = {g.index: g.name for g in body.vertex_groups}
DOM = {v.index: (names[max(v.groups, key=lambda g: g.weight).group] if v.groups else "") for v in body.data.vertices}
P = [WORLD @ v.co for v in body.data.vertices]
H = max(p.z for p in P)
REACH = max(abs(p.x) for p in P)
neck_z, hip_z, knee_z, ankle_z = 0.845 * H, 0.5 * H, 0.275 * H, 0.055 * H
SHOULDER_X = 0.11 * H
sleeve = lambda k: SHOULDER_X + (REACH - SHOULDER_X) * k
CLOTH = flat_material("cloth")  # placeholder; the game gives each garment its own colour

def finish(ob, name, material):
    ob.name = name; ob.data.name = name
    ob.data.materials.clear(); ob.data.materials.append(material)
    for p in ob.data.polygons: p.use_smooth = True
    d = ob.modifiers.new("dec", "DECIMATE"); d.ratio = 0.55
    return ob

def garment(name, keep, offset, smooth=3):
    """Copy the body faces whose every vertex passes keep(position, bone); weld, smooth, push out."""
    ob = body.copy(); ob.data = body.data.copy()
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new(); bm.from_mesh(ob.data); bm.verts.ensure_lookup_table()
    ok = {v.index for v in bm.verts if keep(P[v.index], DOM[v.index])}
    bmesh.ops.delete(bm, geom=[f for f in bm.faces if not all(v.index in ok for v in f.verts)], context="FACES")
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.0006)  # the import splits vertices along UV seams
    bm.normal_update()
    for _ in range(smooth):
        bmesh.ops.smooth_vert(bm, verts=[v for v in bm.verts if not v.is_boundary], factor=0.5, use_axis_x=True, use_axis_y=True, use_axis_z=True)
    bm.normal_update()
    for v in bm.verts: v.co += v.normal * offset
    bm.to_mesh(ob.data); bm.free()
    return ob

def leg_ring_profile(z):
    """(centre y, half-width x, half-depth y) of both legs together at height z."""
    pts = [p for p in P if abs(p.z - z) < 0.03 and abs(p.x) < 0.33 * H / 1.8]
    if not pts: return None
    xs = [abs(p.x) for p in pts]; ys = [p.y for p in pts]
    return ((min(ys) + max(ys)) / 2, max(xs), (max(ys) - min(ys)) / 2)

def skirt(name, top_z, hem_z, flare=0.05, margin=0.03, rows=9, segs=22):
    """A loose tube round both legs from top_z down to hem_z, skinned to pelvis, thighs and calves."""
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    verts, weights = [], []
    for r in range(rows + 1):
        t = r / rows; z = top_z + (hem_z - top_z) * t
        prof = leg_ring_profile(max(z, ankle_z + 0.03)) or (0, 0.16, 0.12)
        cy, rx, ry = prof
        rx += margin + flare * t; ry += margin + flare * t * 0.8
        for s in range(segs):
            a = 2 * math.pi * s / segs
            x, y = math.cos(a) * rx, cy + math.sin(a) * ry
            verts.append((x, y, z))
            side = max(-1.0, min(1.0, x / (0.55 * rx)))  # -1 right leg … +1 left leg
            wl, wr = (side + 1) / 2, 1 - (side + 1) / 2
            pel = max(0.0, 1 - t * 3.2)                                    # waistband follows the pelvis
            low = max(0.0, min(1.0, (knee_z - z) / (0.08 * H) + 0.5)) if z < knee_z + 0.04 * H else 0.0  # below the knee: calves
            weights.append({"pelvis": pel, "thigh_l": wl * (1 - pel) * (1 - low), "thigh_r": wr * (1 - pel) * (1 - low),
                            "calf_l": wl * (1 - pel) * low, "calf_r": wr * (1 - pel) * low})
    faces = [(r * segs + s, r * segs + (s + 1) % segs, (r + 1) * segs + (s + 1) % segs, (r + 1) * segs + s) for r in range(rows) for s in range(segs)]
    me.from_pydata(verts, [], faces); me.update()
    for bone in ("pelvis", "thigh_l", "thigh_r", "calf_l", "calf_r"):
        g = ob.vertex_groups.new(name=bone)
        for i, w in enumerate(weights):
            if w[bone] > 0.001: g.add([i], w[bone], "REPLACE")
    ob.parent = arm
    m = ob.modifiers.new("Armature", "ARMATURE"); m.object = arm
    return ob

def join(a, b):
    """Join b into a (same armature, vertex groups merge by name)."""
    with bpy.context.temp_override(active_object=a, selected_editable_objects=[a, b], selected_objects=[a, b], object=a):
        bpy.ops.object.join()
    return a

def head_piece(name, kind):
    """Gele (headwrap) or fila (cap), rigid on the head bone."""
    top = H; r = 0.105 * H / 1.8
    me = bpy.data.meshes.new(name); ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    bm = bmesh.new()
    hp = [p for p in P if p.z > 0.92 * H]
    head_y = sum(p.y for p in hp) / max(1, len(hp))
    if kind == "gele":
        bmesh.ops.create_uvsphere(bm, u_segments=14, v_segments=8, radius=1)
        for v in bm.verts:
            fan = max(0.0, v.co.z) * (1.0 + 0.55 * max(0.0, -v.co.y))  # sweeps up, wider at the front
            v.co = Vector((v.co.x * r * 1.28, head_y + v.co.y * r * 1.25, top - r * 0.55 + v.co.z * r * 0.75 + fan * r * 0.45))
    else:
        bmesh.ops.create_cone(bm, cap_ends=True, segments=14, radius1=r * 1.04, radius2=r * 0.98, depth=r * 0.95)
        for v in bm.verts: v.co = Vector((v.co.x, head_y + v.co.y * 1.08, top - r * 0.28 + v.co.z))
    bm.to_mesh(me); bm.free()
    g = ob.vertex_groups.new(name="Head"); g.add(list(range(len(me.vertices))), 1.0, "REPLACE")
    ob.parent = arm
    m = ob.modifiers.new("Armature", "ARMATURE"); m.object = arm
    ob.data.materials.append(CLOTH)
    for p in ob.data.polygons: p.use_smooth = True
    return ob

# ---------------------------------------------------------------- garments
# shoulders rise above the collar line away from the neck, so allow a little more height there
torso = lambda p, b, s: hip_z - 0.06 < p.z and (p.z < neck_z or (abs(p.x) > 0.045 * H and p.z < neck_z + 0.05 * H)) and abs(p.x) < sleeve(s) and b != "Head"
made = []
if WHO == "man":
    made.append(finish(garment("g", lambda p, b: torso(p, b, 0.42), 0.02), "top_short", CLOTH))
    made.append(finish(garment("g", lambda p, b: torso(p, b, 0.93), 0.02), "top_long", CLOTH))
    kaftan = garment("g", lambda p, b: torso(p, b, 0.93), 0.024)
    made.append(finish(join(kaftan, skirt("s", hip_z + 0.07, knee_z - 0.02, flare=0.03)), "kaftan", CLOTH))
    made.append(head_piece("fila", "fila"))
else:
    made.append(finish(garment("g", lambda p, b: torso(p, b, 0.38), 0.02), "top_short", CLOTH))
    gown = garment("g", lambda p, b: torso(p, b, 0.38), 0.022)
    made.append(finish(join(gown, skirt("s", hip_z + 0.1, 0.17 * H, flare=0.07)), "gown", CLOTH))
    made.append(finish(skirt("wrapper", hip_z + 0.12, ankle_z + 0.05, flare=0.0, margin=0.055), "wrapper", CLOTH))
    made.append(head_piece("gele", "gele"))
made.append(finish(garment("g", lambda p, b: ankle_z < p.z < hip_z + 0.09 and abs(p.x) < 0.36, 0.016), "trousers", CLOTH))
made.append(finish(garment("g", lambda p, b: p.z < ankle_z + 0.05 and abs(p.x) < 0.4, 0.014, smooth=2), "shoes", CLOTH))

# The body keeps everything the lightest outfit shows (arms, neck, lower legs for skirts); only
# the parts every outfit covers are removed.
M = 0.04
def always_hidden(p):
    return (hip_z - 0.06 + M < p.z < neck_z - M and abs(p.x) < sleeve(0.3) - M) or p.z < ankle_z + 0.05 - M or (knee_z + 0.12 < p.z < hip_z and abs(p.x) < 0.36)
bm = bmesh.new(); bm.from_mesh(body.data)
bmesh.ops.delete(bm, geom=[f for f in bm.faces if all(always_hidden(WORLD @ v.co) for v in f.verts)], context="FACES")
bm.to_mesh(body.data); bm.free()
body.modifiers.new("dec", "DECIMATE").ratio = 0.6

# hair pieces (grey-scale; the game tints them)
for name, fn in HAIRS.items():
    before = set(bpy.context.scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(HAIRDIR, fn))
    for o in set(bpy.context.scene.objects) - before:
        if o.type == "MESH":
            o.name = name; o.data.name = name; o.parent = arm
            for m in o.modifiers:
                if m.type == "ARMATURE": m.object = arm
        elif o.type == "ARMATURE":
            bpy.data.objects.remove(o, do_unlink=True)
for o in bpy.context.scene.objects:
    if o.type == "MESH":
        for m in o.data.materials: strip_extra_maps(m)

import numpy as np
def grade(match, fn):
    for img in bpy.data.images:
        if match in img.name and "Normal" not in img.name and "Roughness" not in img.name and img.size[0] > 0:
            if img.size[0] > 512: img.scale(512, 512)
            px = np.array(img.pixels[:], dtype=np.float32).reshape(-1, 4)
            px[:, :3] = fn(px[:, :3])
            img.pixels = px.ravel().tolist(); img.update()
            try: img.pack()
            except Exception: pass
grade("Superhero", lambda c: c * np.array([0.62, 0.5, 0.45], dtype=np.float32))            # deep brown skin; the game varies it
grade("Hair", lambda c: np.repeat(c.mean(axis=1, keepdims=True), 3, axis=1) * 0.9 + 0.1)   # grey-scale hair, tinted in game
for img in list(bpy.data.images):
    if ("Normal" in img.name or "Roughness" in img.name) and img.users == 0: bpy.data.images.remove(img)

# ---------------------------------------------------------------- animations (same skeleton)
before = set(bpy.context.scene.objects)
bpy.ops.import_scene.gltf(filepath=ANIMS)
for o in set(bpy.context.scene.objects) - before: bpy.data.objects.remove(o, do_unlink=True)
acts = {a.name: a for a in bpy.data.actions}
if not arm.animation_data: arm.animation_data_create()
def use_action(a):
    arm.animation_data.action = a
    if hasattr(arm.animation_data, "action_slot") and getattr(a, "slots", None): arm.animation_data.action_slot = a.slots[0]
for name in KEEP:
    a = acts[name]
    tr = arm.animation_data.nla_tracks.new(); tr.name = name
    st = tr.strips.new(name, int(a.frame_range[0]), a)
    if hasattr(st, "action_slot") and getattr(a, "slots", None): st.action_slot = a.slots[0]
    tr.mute = True
for a in list(bpy.data.actions):
    if a.name not in KEEP: bpy.data.actions.remove(a)

# where the hips are when seated, so the game can put the character on a seat
use_action(acts["Sitting_Idle_Loop"]); bpy.context.scene.frame_set(10); bpy.context.view_layer.update()
pel = arm.matrix_world @ arm.pose.bones["pelvis"].head
print("SIT_PELVIS", round(pel.x, 3), round(pel.y, 3), round(pel.z, 3), "HEIGHT", round(H, 3))

def show(names):
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o not in face_bits and o is not body: o.hide_render = o.name.split(".")[0] not in names

def render(action, frame, path, outfit, colours):
    use_action(acts[action]); bpy.context.scene.frame_set(frame); show(outfit)
    for o in bpy.context.scene.objects:
        if o.type == "MESH" and o.name in colours:
            m = flat_material("pv_" + o.name, colours[o.name]); o.data.materials.clear(); o.data.materials.append(m)
    sc = bpy.context.scene
    if not sc.camera:
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam")); sc.collection.objects.link(cam); cam.data.lens = 55
        cam.location = Vector((1.9, -3.6, 1.15)); cam.rotation_euler = (Vector((0, 0, 0.9)) - cam.location).to_track_quat("-Z", "Y").to_euler(); sc.camera = cam
        sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN")); sun.data.energy = 3.2
        sun.rotation_euler = (math.radians(48), 0, math.radians(35)); sc.collection.objects.link(sun)
        w = bpy.data.worlds.new("w"); sc.world = w; w.use_nodes = True
        w.node_tree.nodes["Background"].inputs[0].default_value = (0.78, 0.82, 0.86, 1)
        engines = [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties["engine"].enum_items]
        sc.render.engine = "BLENDER_EEVEE" if "BLENDER_EEVEE" in engines else "BLENDER_EEVEE_NEXT"
        sc.render.resolution_x = 380; sc.render.resolution_y = 520; sc.view_settings.view_transform = "Standard"
    sc.render.filepath = path; bpy.ops.render.render(write_still=True)

if PREVIEW:
    dk = (0.01, 0.01, 0.012)
    if WHO == "man":
        shots = [("a", "Idle_Loop", 10, ["top_short", "trousers", "shoes", "hair_low"], {"top_short": (0.6, 0.08, 0.05), "trousers": (0.03, 0.05, 0.1), "shoes": dk}),
                 ("b", "Walk_Loop", 8, ["kaftan", "trousers", "shoes", "fila"], {"kaftan": (0.75, 0.72, 0.6), "trousers": (0.75, 0.72, 0.6), "shoes": (0.1, 0.05, 0.02), "fila": (0.25, 0.02, 0.04)}),
                 ("c", "Sitting_Idle_Loop", 10, ["top_long", "trousers", "shoes", "hair_low"], {"top_long": (0.8, 0.8, 0.82), "trousers": (0.02, 0.02, 0.03), "shoes": dk})]
    else:
        shots = [("a", "Idle_Loop", 10, ["top_short", "wrapper", "shoes", "gele"], {"top_short": (0.7, 0.25, 0.02), "wrapper": (0.05, 0.2, 0.45), "shoes": dk, "gele": (0.7, 0.25, 0.02)}),
                 ("b", "Walk_Loop", 8, ["gown", "shoes", "hair_bun"], {"gown": (0.02, 0.3, 0.2), "shoes": dk}),
                 ("c", "Sitting_Idle_Loop", 10, ["top_short", "trousers", "shoes", "hair_long"], {"top_short": (0.8, 0.75, 0.2), "trousers": (0.03, 0.05, 0.1), "shoes": dk})]
    for tag, action, frame, outfit, colours in shots:
        render(action, frame, os.path.join(PREVIEW, f"{WHO}_{tag}.png"), outfit, colours)
    for o in [o for o in bpy.context.scene.objects if o.type in ("CAMERA", "LIGHT")]: bpy.data.objects.remove(o, do_unlink=True)
    for o in bpy.context.scene.objects:
        if o.type == "MESH":
            o.hide_render = False
            if o in made: o.data.materials.clear(); o.data.materials.append(CLOTH)

# helper meshes the importers leave behind (bone display shapes)
keep_names = {"body", "Eyes", "Eyebrows"} | {o.name for o in made} | set(HAIRS)
for o in [o for o in bpy.context.scene.objects if o.type == "MESH" and o.name.split(".")[0] not in keep_names]:
    bpy.data.objects.remove(o, do_unlink=True)
arm.animation_data.action = None
for tr in arm.animation_data.nla_tracks: tr.mute = False
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_animations=True, export_animation_mode="NLA_TRACKS",
                          export_image_format="JPEG", export_jpeg_quality=78, export_yup=True, export_skins=True, export_apply=True,
                          export_optimize_animation_size=True, export_force_sampling=True, export_frame_step=2)
print("EXPORTED", OUT, os.path.getsize(OUT) // 1024, "KB", "meshes:", ",".join(sorted(o.name for o in bpy.context.scene.objects if o.type == "MESH")))
