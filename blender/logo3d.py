"""Washguard logo in 3D: a shield cut into three diagonal glass bands (wash window magenta, orange, safe mint).
Same geometry as web/brand/mark.svg (viewBox 64, bands rotated -40 deg about the centre).
  D:/blender.exe -b -P logo3d.py -- still <out.png> [black|alpha] [size] [samples]
  D:/blender.exe -b -P logo3d.py -- spin <out_dir/> [size] [samples]      (turntable loop, 120 frames @30fps)
"""
import bpy, bmesh, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
MODE = argv[0]

def lin(h):
    h = h.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c) + (1,)

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------- shield outline (from the SVG path, y flipped, 10 svg units = 1 m) ----------------
def bez(p0, p1, p2, p3, n=24):
    return [tuple((1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d for a, b, c, d in zip(p0, p1, p2, p3)) for t in (i / n for i in range(1, n + 1))]
P = [(32, 3.5)]
P += bez((32, 3.5), (39, 6.5), (46.5, 8.6), (55, 9.6))
P += [(55, 29.5)]
P += bez((55, 29.5), (55, 44), (45.6, 54.6), (32, 60.5))
P += bez((32, 60.5), (18.4, 54.6), (9, 44), (9, 29.5))
P += [(9, 9.6)]
P += bez((9, 9.6), (17.5, 8.6), (25, 6.5), (32, 3.5))[:-1]
OUT = [((x - 32) / 10, (32 - y) / 10) for x, y in P]

DEPTH = 0.55
def shield_obj(name):
    me = bpy.data.meshes.new(name); bm = bmesh.new()
    vs = [bm.verts.new((x, y, -DEPTH / 2)) for x, y in OUT]
    f = bm.faces.new(vs)
    if f.normal.z < 0: f.normal_flip()
    r = bmesh.ops.extrude_face_region(bm, geom=[f])
    for v in [e for e in r["geom"] if isinstance(e, bmesh.types.BMVert)]: v.co.z += DEPTH
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me); bm.free()
    o = bpy.data.objects.new(name, me); sc.collection.objects.link(o)
    return o

# bands in the rotated frame: [y0, y1] in svg units (the SVG rects), gaps between them stay empty
BANDS = [(-6, 21, ("#7a4dff", "#ff33b8")), (24, 40, ("#ff855c", "#ffd447")), (43, 73, ("#22c99c", "#a6ffe4"))]
A = math.radians(40)
DIR = Vector((math.cos(A), math.sin(A), 0))            # along the band (up-right)
ACROSS = Vector((math.sin(A), -math.cos(A), 0))        # across the bands (down-right)

def band_material(name, c0, c1):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; N = nt.nodes; L = nt.links; N.clear()
    out = N.new("ShaderNodeOutputMaterial"); b = N.new("ShaderNodeBsdfPrincipled")
    geo = N.new("ShaderNodeTexCoord")          # object space: the gradient stays on the band when it turns
    dot = N.new("ShaderNodeVectorMath"); dot.operation = "DOT_PRODUCT"; dot.inputs[1].default_value = (DIR.x, DIR.y, 0)
    mr = N.new("ShaderNodeMapRange"); mr.inputs["From Min"].default_value = -1.6; mr.inputs["From Max"].default_value = 1.6
    ramp = N.new("ShaderNodeValToRGB"); ramp.color_ramp.elements[0].color = lin(c0); ramp.color_ramp.elements[1].color = lin(c1)
    L.new(geo.outputs["Object"], dot.inputs[0]); L.new(dot.outputs["Value"], mr.inputs["Value"]); L.new(mr.outputs["Result"], ramp.inputs["Fac"])
    L.new(ramp.outputs["Color"], b.inputs["Base Color"]); L.new(ramp.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.55
    b.inputs["Roughness"].default_value = 0.14
    b.inputs["Coat Weight"].default_value = 1.0; b.inputs["Coat Roughness"].default_value = 0.04
    b.inputs["Specular IOR Level"].default_value = 0.7
    L.new(b.outputs[0], out.inputs[0])
    return m

logo = bpy.data.objects.new("logo", None); sc.collection.objects.link(logo)
for i, (y0, y1, (c0, c1)) in enumerate(BANDS):
    o = shield_obj(f"band{i}")
    # cutter: a long box covering this band only
    bpy.ops.mesh.primitive_cube_add(size=1); cut = bpy.context.object
    yc = ((y0 + y1) / 2 - 32) / 10
    cut.location = ACROSS * yc; cut.rotation_euler = (0, 0, A); cut.scale = (20, (y1 - y0) / 10, 4)
    bo = o.modifiers.new("cut", "BOOLEAN"); bo.operation = "INTERSECT"; bo.object = cut; bo.solver = "EXACT"
    bpy.context.view_layer.objects.active = o; bpy.ops.object.modifier_apply(modifier="cut")
    bpy.data.objects.remove(cut, do_unlink=True)
    bv = o.modifiers.new("bevel", "BEVEL"); bv.width = 0.05; bv.segments = 4; bv.limit_method = "ANGLE"; bv.angle_limit = math.radians(40)
    o.data.materials.append(band_material(f"m{i}", c0, c1))
    bpy.context.view_layer.objects.active = o; bpy.ops.object.shade_smooth()
    o.parent = logo

# ---------------- world, lights, camera ----------------
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)
def area(loc, size, energy, color, target=(0, 0, 0)):
    d = bpy.data.lights.new("l", "AREA"); d.size = size; d.energy = energy; d.color = color
    o = bpy.data.objects.new("l", d); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area((0, -8, 5), 6, 110, (0.85, 0.88, 1.0))          # soft key from the front-top
area((-7, 2, 1), 3, 700, (0.16, 0.52, 1.0))         # cyan rim left
area((7, 2, -1), 3, 700, (0.55, 0.20, 1.0))         # violet rim right
area((0, 6, 0), 6, 600, (0.45, 0.42, 1.0))           # halo behind
area((0, -3, -7), 4, 300, (1.0, 0.6, 0.85), (0, 0, 0))  # warm from below

cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 92
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -21, 0.4)
cam.rotation_euler = (Vector((0, 0, 0.05)) - cam.location).to_track_quat("-Z", "Y").to_euler()
logo.rotation_euler = (math.radians(90), 0, 0)         # stand the shield up facing the camera (-Y)

# ---------------- render ----------------
r = sc.render; r.engine = "CYCLES"
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU setup failed:", e)
sc.cycles.use_denoising = True
sc.view_settings.view_transform = "Standard"; sc.view_settings.look = "None"
sc.use_nodes = True; ct = sc.node_tree; ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers"); gl = ct.nodes.new("CompositorNodeGlare"); co = ct.nodes.new("CompositorNodeComposite")
gl.glare_type = "FOG_GLOW"; gl.threshold = 0.95; gl.size = 7
try: gl.mix = 0.0
except AttributeError: pass
ct.links.new(rl.outputs["Image"], gl.inputs["Image"]); ct.links.new(gl.outputs["Image"], co.inputs["Image"])
ct.links.new(rl.outputs["Alpha"], co.inputs["Alpha"])

def pose(t):   # t in [0,1): gentle three-quarter sway, never edge-on
    logo.rotation_euler = (math.radians(90), 0, math.radians(-24) * math.sin(t * math.tau) - math.radians(8))

if MODE == "still":
    outp = argv[1]; bg = argv[2] if len(argv) > 2 else "black"
    size = int(argv[3]) if len(argv) > 3 else 1024
    sc.cycles.samples = int(argv[4]) if len(argv) > 4 else 128
    r.resolution_x = r.resolution_y = size
    r.film_transparent = bg == "alpha"
    r.image_settings.file_format = "PNG"; r.image_settings.color_mode = "RGBA" if bg == "alpha" else "RGB"
    pose(0.12)
    r.filepath = outp; bpy.ops.render.render(write_still=True)
elif MODE == "spin":
    outd = argv[1]; size = int(argv[2]) if len(argv) > 2 else 1080
    sc.cycles.samples = int(argv[3]) if len(argv) > 3 else 64
    r.resolution_x = r.resolution_y = size; r.fps = 30
    sc.frame_start, sc.frame_end = 0, 119
    for f in range(0, 120):
        pose(f / 120); logo.keyframe_insert("rotation_euler", frame=f)
    r.image_settings.file_format = "JPEG"; r.image_settings.quality = 94
    r.filepath = outd + "s-"; bpy.ops.render.render(animation=True)
