"""
Wear and detail for the scripted vehicles: road dust and grime, faded paint and rust spots baked
into the body texture (Cycles), tyre tread, seat fabric weave and ribbed floor mats (generated maps).
Everything ends up as plain image textures, so it exports to glTF and works in the game.
"""
import math, os
import numpy as np
import bpy
from lib_vehicle import HERE, M

TEX = os.path.join(HERE, 'tex')
os.makedirs(TEX, exist_ok=True)


# ------------------------------------------------------------------ generated maps (numpy)
def _save(name, rgb, non_color=False):
    """rgb: float array (h, w, 3) in 0..1. Saves PNG and returns a Blender image."""
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    px = np.ones((h, w, 4), dtype=np.float32)
    px[..., :3] = np.clip(rgb, 0, 1)
    img.pixels.foreach_set(px[::-1].ravel())   # Blender images start bottom-left
    img.filepath_raw = os.path.join(TEX, name + '.png')
    img.file_format = 'PNG'
    img.save()
    if non_color:
        img.colorspace_settings.name = 'Non-Color'
    return img


def _normal_from_height(h, strength):
    gy, gx = np.gradient(h)
    n = np.dstack((-gx * strength, gy * strength, np.ones_like(h)))
    n /= np.linalg.norm(n, axis=2, keepdims=True)
    return n * 0.5 + 0.5


def _noise(shape, seed, octaves=4):
    rng = np.random.default_rng(seed)
    out = np.zeros(shape, dtype=np.float32)
    for o in range(octaves):
        f = 2 ** (o + 2)
        g = rng.random((f + 1, f + 1)).astype(np.float32)
        ys = np.linspace(0, f, shape[0], endpoint=False); xs = np.linspace(0, f, shape[1], endpoint=False)
        y0 = ys.astype(int); x0 = xs.astype(int); ty = (ys - y0)[:, None]; tx = (xs - x0)[None, :]
        ty = ty * ty * (3 - 2 * ty); tx = tx * tx * (3 - 2 * tx)
        a = g[y0][:, x0]; b = g[y0][:, x0 + 1]; c = g[y0 + 1][:, x0]; d = g[y0 + 1][:, x0 + 1]
        out += ((a * (1 - tx) + b * tx) * (1 - ty) + (c * (1 - tx) + d * tx) * ty) / (2 ** o)
    return out / out.max()


def tread_maps(n=512):
    """Block tread: circumferential grooves + angled sipes. Returns (normal, colour)."""
    v, u = np.mgrid[0:n, 0:n] / n
    grooves = (np.abs(((v * 4) % 1) - 0.5) < 0.07).astype(np.float32)
    sipes = (np.abs((((u * 24) + v * 2) % 1) - 0.5) < 0.09).astype(np.float32)
    h = 1 - np.clip(grooves + sipes * 0.8, 0, 1)
    h = h + _noise((n, n), 3) * 0.08
    normal = _normal_from_height(h, 6.0)
    dust = _noise((n, n), 4) * 0.05
    col = np.dstack([0.03 + dust * 1.4 + (1 - h) * -0.01, 0.03 + dust * 1.1, 0.03 + dust * 0.9])
    return _save('tyre_normal', normal, True), _save('tyre_base', col)


def fabric_maps(n=256, base=(0.11, 0.15, 0.27)):
    """Woven seat cloth: small basket weave + fibre noise."""
    v, u = np.mgrid[0:n, 0:n] / n
    k = 32
    warp = np.sin(u * k * 2 * math.pi) * 0.5 + 0.5
    weft = np.sin(v * k * 2 * math.pi) * 0.5 + 0.5
    checker = ((np.floor(u * k) + np.floor(v * k)) % 2)
    h = np.where(checker > 0, warp, weft) * 0.8 + _noise((n, n), 7, 3) * 0.2
    normal = _normal_from_height(h, 3.0)
    shade = 0.85 + h * 0.25
    col = np.dstack([base[0] * shade, base[1] * shade, base[2] * shade])
    return _save('fabric_normal', normal, True), _save('fabric_base', col)


def floor_maps(n=256):
    """Ribbed rubber floor mat."""
    v, u = np.mgrid[0:n, 0:n] / n
    h = (np.sin(v * 40 * 2 * math.pi) * 0.5 + 0.5) ** 3 + _noise((n, n), 9, 3) * 0.1
    normal = _normal_from_height(h, 4.0)
    g = 0.07 + _noise((n, n), 11, 3) * 0.04
    return _save('floor_normal', normal, True), _save('floor_base', np.dstack([g, g, g * 1.05]))


def _textured(mat, base_img, normal_img, strength=1.0, rough=None):
    nt = mat.node_tree; p = nt.nodes['Principled BSDF']
    b = nt.nodes.new('ShaderNodeTexImage'); b.image = base_img
    nt.links.new(b.outputs['Color'], p.inputs['Base Color'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = normal_img
    nm = nt.nodes.new('ShaderNodeNormalMap'); nm.inputs['Strength'].default_value = strength
    nt.links.new(t.outputs['Color'], nm.inputs['Color']); nt.links.new(nm.outputs['Normal'], p.inputs['Normal'])
    if rough is not None: p.inputs['Roughness'].default_value = rough


def detail_materials(fabric_color=(0.11, 0.15, 0.27)):
    """Upgrade shared materials before the vehicle is built."""
    _textured(M['rubber'], *reversed(tread_maps()), strength=1.0, rough=0.9)
    _textured(M['fabric'], *reversed(fabric_maps(base=fabric_color)), strength=0.6, rough=0.95)
    _textured(M['floor'], *reversed(floor_maps()), strength=0.8, rough=0.9)


def ensure_uvs(objs, cube=0.35):
    """Cube-project UVs on meshes that have none, so tiled textures (fabric, floor) have a scale."""
    for o in objs:
        if o.type != 'MESH' or o.data.uv_layers:
            continue
        bpy.ops.object.select_all(action='DESELECT')
        o.select_set(True); bpy.context.view_layer.objects.active = o
        bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
        bpy.ops.uv.cube_project(cube_size=cube)
        bpy.ops.object.mode_set(mode='OBJECT')


# ------------------------------------------------------------------ baked dirt on the body
def _node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        if k in n.inputs: n.inputs[k].default_value = v
        else: setattr(n, k, v)
    return n


def weather_body(body, paint, rough=0.3, metal=0.05, coat=0.6, amount=1.0, rust=0.0, axles=(), wheel_r=0.35,
                 window_y=1.3, dust=(0.42, 0.28, 0.18), res=1024, name='body'):
    """
    Bake dust (laterite red-brown, heaviest low down and around the wheel arches), rain streaks under
    the windows, grime in creases, gentle sun fade and optional rust spots into the body paint.
    """
    scene = bpy.context.scene
    scene.render.engine = 'CYCLES'; scene.cycles.device = 'CPU'; scene.cycles.samples = 16
    # 1. split off the inner shell (material slot 1) — it stays plain
    bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
    bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='DESELECT')
    body.active_material_index = 1; bpy.ops.object.material_slot_select()
    bpy.ops.mesh.separate(type='SELECTED')
    bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006)
    bpy.ops.object.mode_set(mode='OBJECT')
    inner = [o for o in bpy.context.selected_objects if o is not body][0]
    inner.name = name + '_inner'
    body.data.materials.pop(index=1)

    # 2. bake material
    bm = bpy.data.materials.new(name + '_bake'); bm.use_nodes = True; nt = bm.node_tree
    p = nt.nodes['Principled BSDF']
    tc = _node(nt, 'ShaderNodeTexCoord')
    pos = tc.outputs['Object']
    sep = _node(nt, 'ShaderNodeSeparateXYZ'); nt.links.new(pos, sep.inputs[0])
    def mr(src, a, b, c=0.0, d=1.0, smooth=True):
        m = _node(nt, 'ShaderNodeMapRange', interpolation_type='SMOOTHSTEP' if smooth else 'LINEAR', clamp=True)
        m.inputs['From Min'].default_value = a; m.inputs['From Max'].default_value = b
        m.inputs['To Min'].default_value = c; m.inputs['To Max'].default_value = d
        nt.links.new(src, m.inputs['Value']); return m.outputs['Result']
    def noise(scale, detail=6, vec=pos, rough_=0.6):
        n = _node(nt, 'ShaderNodeTexNoise'); n.inputs['Scale'].default_value = scale
        n.inputs['Detail'].default_value = detail; n.inputs['Roughness'].default_value = rough_
        nt.links.new(vec, n.inputs['Vector']); return n.outputs['Fac']
    def math_(op, a, b=None, clamp=False):
        m = _node(nt, 'ShaderNodeMath', operation=op, use_clamp=clamp)
        for i, v in enumerate((a, b)):
            if v is None: continue
            if isinstance(v, (int, float)): m.inputs[i].default_value = v
            else: nt.links.new(v, m.inputs[i])
        return m.outputs[0]
    def scaled(vec_scale):
        vm = _node(nt, 'ShaderNodeVectorMath', operation='MULTIPLY'); vm.inputs[1].default_value = vec_scale
        nt.links.new(pos, vm.inputs[0]); return vm.outputs[0]

    low = mr(sep.outputs['Z'], 1.0, 0.25)                                  # 1 near the ground
    grime = math_('MULTIPLY', low, mr(noise(3.5), 0.38, 0.72))
    arch = None
    for z in axles:
        yz = _node(nt, 'ShaderNodeVectorMath', operation='MULTIPLY'); yz.inputs[1].default_value = (0, 1, 1)
        nt.links.new(pos, yz.inputs[0])
        dist = _node(nt, 'ShaderNodeVectorMath', operation='DISTANCE'); dist.inputs[1].default_value = (0, -z, wheel_r)
        nt.links.new(yz.outputs[0], dist.inputs[0])
        a = mr(dist.outputs['Value'], 0.95, 0.42)
        arch = a if arch is None else math_('MAXIMUM', arch, a)
    arch = math_('MULTIPLY', arch, mr(noise(14, 4), 0.3, 0.7)) if arch is not None else 0.0
    streak_noise = mr(noise(1.0, 3, scaled((26, 26, 1.2))), 0.56, 0.72)
    band = math_('MULTIPLY', mr(sep.outputs['Z'], window_y + 0.02, window_y - 0.05, 0, 1), mr(sep.outputs['Z'], 0.45, 0.8, 0, 1))
    streak = math_('MULTIPLY', streak_noise, band)
    ao = _node(nt, 'ShaderNodeAmbientOcclusion', samples=8); ao.inputs['Distance'].default_value = 0.25
    crease = math_('SUBTRACT', 1.0, ao.outputs['AO'])
    f = math_('MULTIPLY', grime, 0.85)
    f = math_('ADD', f, math_('MULTIPLY', arch, 0.75))
    f = math_('ADD', f, math_('MULTIPLY', streak, 0.22))
    f = math_('ADD', f, math_('MULTIPLY', crease, 0.45))
    f = math_('MULTIPLY', f, amount, clamp=True)
    # sun fade: ±4% brightness at large scale
    fade = mr(noise(0.8, 2), 0.3, 0.7, 0.95, 1.03, smooth=False)
    paint_c = _node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MULTIPLY')
    paint_c.inputs['Factor'].default_value = 1.0
    paint_c.inputs[6].default_value = (*paint, 1)
    comb = _node(nt, 'ShaderNodeCombineColor')
    for i in range(3): nt.links.new(fade, comb.inputs[i])
    nt.links.new(comb.outputs[0], paint_c.inputs[7])
    col = _node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MIX')
    nt.links.new(f, col.inputs['Factor']); nt.links.new(paint_c.outputs[2], col.inputs[6]); col.inputs[7].default_value = (*dust, 1)
    out_col = col.outputs[2]
    if rust > 0:
        vor = _node(nt, 'ShaderNodeTexVoronoi'); vor.inputs['Scale'].default_value = 9
        nt.links.new(pos, vor.inputs['Vector'])
        spot = mr(vor.outputs['Distance'], 0.07, 0.02)
        spot = math_('MULTIPLY', spot, math_('MULTIPLY', mr(sep.outputs['Z'], 0.9, 0.45), mr(noise(2.2), 0.55, 0.65)))
        spot = math_('MULTIPLY', spot, rust, clamp=True)
        rc = _node(nt, 'ShaderNodeMix', data_type='RGBA', blend_type='MIX')
        nt.links.new(spot, rc.inputs['Factor']); nt.links.new(out_col, rc.inputs[6]); rc.inputs[7].default_value = (0.24, 0.11, 0.05, 1)
        out_col = rc.outputs[2]
        f = math_('MAXIMUM', f, spot)
    nt.links.new(out_col, p.inputs['Base Color'])
    rgh = _node(nt, 'ShaderNodeMapRange', clamp=True); rgh.inputs['To Min'].default_value = rough; rgh.inputs['To Max'].default_value = 0.92
    nt.links.new(f, rgh.inputs['Value']); nt.links.new(rgh.outputs['Result'], p.inputs['Roughness'])
    body.data.materials[0] = bm

    def bake(kind, img):
        node = nt.nodes.new('ShaderNodeTexImage'); node.image = img
        nt.nodes.active = node
        bpy.ops.object.select_all(action='DESELECT'); body.select_set(True); bpy.context.view_layer.objects.active = body
        if kind == 'DIFFUSE':
            bpy.ops.object.bake(type='DIFFUSE', pass_filter={'COLOR'}, margin=8, use_clear=True)
        else:
            bpy.ops.object.bake(type=kind, margin=8, use_clear=True)
        nt.nodes.remove(node)

    base = bpy.data.images.new(name + '_basecolor', res, res)
    bake('DIFFUSE', base)
    rimg = bpy.data.images.new(name + '_rough_tmp', res, res, float_buffer=True); rimg.colorspace_settings.name = 'Non-Color'
    bake('ROUGHNESS', rimg)
    r = np.array(rimg.pixels[:], dtype=np.float32).reshape(res, res, 4)
    mrpx = np.zeros_like(r); mrpx[..., 0] = 1; mrpx[..., 1] = r[..., 0]; mrpx[..., 2] = metal; mrpx[..., 3] = 1
    mrimg = bpy.data.images.new(name + '_metal_rough', res, res); mrimg.colorspace_settings.name = 'Non-Color'
    mrimg.pixels.foreach_set(mrpx.ravel())
    for img in (base, mrimg):
        img.filepath_raw = os.path.join(TEX, img.name + '.png'); img.file_format = 'PNG'; img.save()

    # 3. final material
    fm = bpy.data.materials.new(name + '_paint'); fm.use_nodes = True; ft = fm.node_tree; fp = ft.nodes['Principled BSDF']
    bt = ft.nodes.new('ShaderNodeTexImage'); bt.image = base
    ft.links.new(bt.outputs['Color'], fp.inputs['Base Color'])
    mt = ft.nodes.new('ShaderNodeTexImage'); mt.image = mrimg
    sc = ft.nodes.new('ShaderNodeSeparateColor'); ft.links.new(mt.outputs['Color'], sc.inputs[0])
    ft.links.new(sc.outputs['Green'], fp.inputs['Roughness']); ft.links.new(sc.outputs['Blue'], fp.inputs['Metallic'])
    if coat:
        fp.inputs['Coat Weight'].default_value = coat * 0.6; fp.inputs['Coat Roughness'].default_value = 0.15
    fm.use_backface_culling = False
    body.data.materials[0] = fm
    return inner
