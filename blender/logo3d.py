"""Embargo logo in 3D: the EB mark (web/brand/mark.svg) extruded, bevelled, glossy white with cyan / violet rims.
  D:/blender.exe -b -P logo3d.py -- still <out.png> [black|alpha] [size] [samples] [wide]
  D:/blender.exe -b -P logo3d.py -- spin <out_dir/> [size] [samples]        (sway loop, 120 frames @30fps)
"""
import bpy, math, sys, os
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:]
MODE = argv[0]
SVG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "web", "brand", "mark.svg")

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene

# ---------------- import the mark and give it depth ----------------
try: bpy.ops.preferences.addon_enable(module="io_curve_svg")
except Exception: pass
before = set(bpy.data.objects)
bpy.ops.import_curve.svg(filepath=os.path.abspath(SVG))
curves = [o for o in bpy.data.objects if o not in before and o.type == "CURVE"]
for o in curves:
    o.data.dimensions = "2D"; o.data.fill_mode = "BOTH"
    o.data.extrude = 0.0016            # svg import units are tiny (1 px = 1/90 in); scaled up below
    o.data.bevel_depth = 0.00028; o.data.bevel_resolution = 4
bpy.ops.object.select_all(action="DESELECT")
for o in curves: o.select_set(True)
bpy.context.view_layer.objects.active = curves[0]
bpy.ops.object.convert(target="MESH")
if len(curves) > 1: bpy.ops.object.join()
logo = bpy.context.view_layer.objects.active; logo.name = "EB"
bpy.ops.object.origin_set(type="ORIGIN_GEOMETRY", center="BOUNDS")
logo.location = (0, 0, 0)
k = 6.0 / logo.dimensions.x            # 6 m wide
logo.scale = (k, k, k); bpy.ops.object.transform_apply(location=False, rotation=False, scale=True)
bpy.ops.object.shade_smooth()

def mat():
    m = bpy.data.materials.new("chrome"); m.use_nodes = True
    b = next(n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED")
    b.inputs["Base Color"].default_value = (0.92, 0.93, 0.98, 1)
    b.inputs["Metallic"].default_value = 0.12
    b.inputs["Roughness"].default_value = 0.16
    b.inputs["Coat Weight"].default_value = 1.0; b.inputs["Coat Roughness"].default_value = 0.03
    return m
logo.data.materials.clear(); logo.data.materials.append(mat())

# ---------------- world, lights, camera ----------------
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
wn = world.node_tree.nodes; wl = world.node_tree.links
bgn = wn["Background"]; bgn.inputs[0].default_value = (0, 0, 0, 1)
# a dim environment so the metal has something to reflect, black for camera rays
lp = wn.new("ShaderNodeLightPath"); mix = wn.new("ShaderNodeMixShader"); env = wn.new("ShaderNodeBackground")
env.inputs[0].default_value = (0.05, 0.05, 0.09, 1)
wl.new(lp.outputs["Is Camera Ray"], mix.inputs[0]); wl.new(env.outputs[0], mix.inputs[1]); wl.new(bgn.outputs[0], mix.inputs[2])
wl.new(mix.outputs[0], wn["World Output"].inputs[0])

def area(loc, size, energy, color, target=(0, 0, 0), sy=None):
    d = bpy.data.lights.new("l", "AREA"); d.size = size; d.energy = energy; d.color = color
    if sy: d.shape = "RECTANGLE"; d.size_y = sy
    o = bpy.data.objects.new("l", d); sc.collection.objects.link(o); o.location = loc
    o.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
area((0, -12, 3), 10, 1150, (0.97, 0.98, 1.0), sy=2.0)       # long softbox on top: bright stripe across the faces
area((-9, 1.5, 0.5), 4, 900, (0.16, 0.52, 1.0))            # cyan rim left
area((9, 1.5, -0.5), 4, 900, (0.62, 0.22, 1.0))            # violet rim right
area((0, 2.5, -6), 5, 420, (1.0, 0.35, 0.75))               # magenta from below
area((0, 7, 1), 8, 500, (0.45, 0.42, 1.0))                 # halo behind

cam_d = bpy.data.cameras.new("cam"); cam_d.lens = 70
cam = bpy.data.objects.new("cam", cam_d); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (0, -18, 0.6)
cam.rotation_euler = (Vector((0, 0, 0)) - cam.location).to_track_quat("-Z", "Y").to_euler()
pivot = bpy.data.objects.new("pivot", None); sc.collection.objects.link(pivot)
logo.parent = pivot
logo.rotation_euler = (math.radians(90), 0, 0)      # stand it up facing the camera

def pose(t):
    pivot.rotation_euler = (math.radians(4) * math.sin(t * math.tau * 2), 0, math.radians(-22) * math.sin(t * math.tau) - math.radians(10))

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
gl.glare_type = "FOG_GLOW"; gl.threshold = 1.0; gl.size = 7
try: gl.mix = 0.0
except AttributeError: pass
ct.links.new(rl.outputs["Image"], gl.inputs["Image"]); ct.links.new(gl.outputs["Image"], co.inputs["Image"])
ct.links.new(rl.outputs["Alpha"], co.inputs["Alpha"])

if MODE == "still":
    outp = argv[1]; bg = argv[2] if len(argv) > 2 else "black"
    size = int(argv[3]) if len(argv) > 3 else 1024
    sc.cycles.samples = int(argv[4]) if len(argv) > 4 else 128
    wide = len(argv) > 5 and argv[5] == "wide"
    r.resolution_x, r.resolution_y = (int(size * 1.6), size) if wide else (size, size)
    if not wide: cam_d.lens = 80
    r.film_transparent = bg == "alpha"
    r.image_settings.file_format = "PNG"; r.image_settings.color_mode = "RGBA" if bg == "alpha" else "RGB"
    pose(0.1)
    r.filepath = outp; bpy.ops.render.render(write_still=True)
elif MODE == "spin":
    outd = argv[1]; size = int(argv[2]) if len(argv) > 2 else 1080
    sc.cycles.samples = int(argv[3]) if len(argv) > 3 else 64
    r.resolution_x = r.resolution_y = size; r.fps = 30; cam_d.lens = 80
    sc.frame_start, sc.frame_end = 0, 119
    for f in range(120):
        pose(f / 120); pivot.keyframe_insert("rotation_euler", frame=f)
    r.image_settings.file_format = "JPEG"; r.image_settings.quality = 94
    r.filepath = outd + "s-"; bpy.ops.render.render(animation=True)
