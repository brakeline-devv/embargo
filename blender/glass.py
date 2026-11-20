"""Washguard 3D band (dark glass, Botpit-style lighting): the 61-day wash-sale window as a 3D calendar.
7 x 9 rounded day tiles on a paper slab. Day 0 (SELL) sits in the exact centre. A red wave spreads from it to
day -30 and +30 (the window), then the +31 tile turns green and a share cube hops from SELL onto it.
Headless:
  D:/blender.exe -b -P hero.py -- preview <frame> <out.png> [res_pct] [samples]
  D:/blender.exe -b -P hero.py -- render <out_dir/> [samples]
  D:/blender.exe -b -P hero.py -- save <file.blend>
Loop: 180 frames at 30 fps, seamless (everything is back in its frame-0 state at frame 180).
"""
import bpy, math, sys
from mathutils import Vector

argv = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["save", "//hero.blend"]
MODE = argv[0]
FPS, LOOP = 30, 180
W, H = 1920, 1080
FONT = "C:/Windows/Fonts/consolab.ttf"
FONT_BOLD = "C:/Windows/Fonts/seguisb.ttf"

def lin(hexs):
    h = hexs.lstrip("#"); c = [int(h[i:i + 2], 16) / 255 for i in (0, 2, 4)]
    return tuple(x / 12.92 if x <= 0.04045 else ((x + 0.055) / 1.055) ** 2.4 for x in c)

SLAB, TILE = lin("#0a0a10"), lin("#1a1a26")
GREEN, INK, BLUE, WHITE = lin("#4de6bf"), lin("#0b0b0f"), lin("#3d6bff"), lin("#ffffff")
# wash colour per day, from the spike palette: magenta next to the sale -> orange -> yellow at day 30
HOT = [lin("#ff3db8"), lin("#ff5c8a"), lin("#ff855c"), lin("#ffcc42")]
def wash(d):
    x = (abs(d) - 1) / 29 * (len(HOT) - 1); i = min(int(x), len(HOT) - 2); f = x - i
    return tuple(HOT[i][k] + (HOT[i + 1][k] - HOT[i][k]) * f for k in range(3))

bpy.ops.wm.read_factory_settings(use_empty=True)
sc = bpy.context.scene
sc.render.fps = FPS
sc.frame_start, sc.frame_end = 0, LOOP - 1

# ---------------- materials ----------------
def node_mat(name):
    m = bpy.data.materials.new(name); m.use_nodes = True
    nt = m.node_tree; nt.nodes.clear()
    return m, nt, nt.nodes.new("ShaderNodeOutputMaterial")

def flat(name, color, rough=0.55, sss=0.0, coat=0.0):
    m, nt, out = node_mat(name)
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Base Color"].default_value = (*color, 1); b.inputs["Roughness"].default_value = rough
    b.inputs["Coat Weight"].default_value = coat
    if sss:
        b.inputs["Subsurface Weight"].default_value = sss
        b.inputs["Subsurface Radius"].default_value = (0.5, 0.4, 0.3); b.inputs["Subsurface Scale"].default_value = 0.08
    nt.links.new(b.outputs[0], out.inputs[0])
    return m

def tile_mat():
    """colour and glow come from the object colour (RGB = colour, alpha = glow), so every tile animates on its own"""
    m, nt, out = node_mat("tile")
    oi = nt.nodes.new("ShaderNodeObjectInfo")
    b = nt.nodes.new("ShaderNodeBsdfPrincipled")
    b.inputs["Roughness"].default_value = 0.16; b.inputs["Coat Weight"].default_value = 1.0; b.inputs["Coat Roughness"].default_value = 0.05
    b.inputs["Specular IOR Level"].default_value = 0.6
    mul = nt.nodes.new("ShaderNodeMath"); mul.operation = "MULTIPLY"; mul.inputs[1].default_value = 0.75
    nt.links.new(oi.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(oi.outputs["Color"], b.inputs["Emission Color"])
    nt.links.new(oi.outputs["Alpha"], mul.inputs[0]); nt.links.new(mul.outputs[0], b.inputs["Emission Strength"])
    nt.links.new(b.outputs[0], out.inputs[0])
    return m

M_TILE = tile_mat()
M_SLAB = flat("slab", SLAB, 0.22, coat=1.0)
M_INK = flat("ink", INK, 0.35, coat=0.6)
M_LABEL = flat("label", lin("#6c6c80"), 0.5)
M_WHITE = flat("white", WHITE, 0.5)
M_SHARE = tile_mat()

# ---------------- helpers ----------------
def rounded_box(name, size, bevel, segs=5, mat=None):
    bpy.ops.mesh.primitive_cube_add(size=1)
    o = bpy.context.object; o.name = name; o.scale = size
    bpy.ops.object.transform_apply(scale=True)
    bv = o.modifiers.new("bevel", "BEVEL"); bv.width = bevel; bv.segments = segs; bv.limit_method = "NONE"; bv.harden_normals = False
    bpy.ops.object.shade_smooth()
    if mat: o.data.materials.append(mat)
    return o

def text(body, size, font, mat, parent=None, loc=(0, 0, 0), extrude=0.008):
    cu = bpy.data.curves.new("t_" + body, "FONT"); cu.body = body; cu.size = size; cu.extrude = extrude
    cu.align_x = "CENTER"; cu.align_y = "CENTER"; cu.font = bpy.data.fonts.load(font, check_existing=True)
    o = bpy.data.objects.new("t_" + body, cu); sc.collection.objects.link(o)
    o.data.materials.append(mat); o.location = loc
    if parent: o.parent = parent
    return o

# ---------------- the calendar ----------------
COLS, ROWS, CELL, GAP, TH = 7, 9, 1.0, 0.16, 0.34
PITCH = CELL + GAP
gw, gh = COLS * PITCH - GAP, ROWS * PITCH - GAP
slab = rounded_box("slab", (gw + 0.9, gh + 0.9, 0.5), 0.35, 8, M_SLAB)
slab.location = (0, 0, -0.25)

def cell_xy(i):
    c, r = i % COLS, i // COLS
    return Vector(((c - (COLS - 1) / 2) * PITCH, ((ROWS - 1) / 2 - r) * PITCH, 0))     # row 0 at the back

tiles = []
for i in range(COLS * ROWS):
    day = i - 31                                   # -31 .. +31, day 0 in the centre cell
    t = rounded_box(f"tile{i}", (CELL, CELL, TH), 0.13, 5, M_TILE)
    t.location = cell_xy(i) + Vector((0, 0, TH / 2))
    t.color = (*TILE, 0)
    if day == 0:
        t.color = (*WHITE, 0.55)
        text("SELL", 0.3, FONT_BOLD, M_INK, t, (0, -0.02, TH / 2 + 0.001))
    elif day == 31:
        text("+31", 0.36, FONT_BOLD, M_INK, t, (0, -0.02, TH / 2 + 0.001))
    else:
        lbl = f"{day:+d}" if day else "0"
        text(lbl, 0.24, FONT, M_LABEL, t, (0.16, -0.24, TH / 2 + 0.001), 0.004)
    tiles.append((t, day))

# share: a small ink cube with a white $ on top, sitting on SELL at frame 0
share = rounded_box("share", (0.46, 0.46, 0.46), 0.1, 5, M_SHARE); share.color = (*BLUE, 1.1)
text("$", 0.36, FONT_BOLD, M_WHITE, share, (0, 0, 0.231))
SELL_TOP = cell_xy(31) + Vector((0, 0, TH + 0.23 + 0.12))
SAFE_TOP = cell_xy(62) + Vector((0, 0, TH + 0.23))

# ---------------- animation ----------------
def key_color(o, f, rgba):
    o.color = rgba; o.keyframe_insert("color", frame=f)

def key_z(o, f, z):
    o.location.z = z; o.keyframe_insert("location", index=2, frame=f)

WAVE0, STEP = 12, 1.9            # day d lights at WAVE0 + d*STEP
for t, d in tiles:
    z0 = TH / 2
    if 1 <= abs(d) <= 30:
        f = round(WAVE0 + abs(d) * STEP)
        key_color(t, 0, (*TILE, 0)); key_color(t, f, (*TILE, 0)); key_color(t, f + 6, (*wash(d), 1.0)); key_color(t, 158, (*wash(d), 1.0)); key_color(t, 176, (*TILE, 0))
        key_z(t, 0, z0); key_z(t, f, z0); key_z(t, f + 4, z0 + 0.2); key_z(t, f + 9, z0 + 0.12); key_z(t, 158, z0 + 0.12); key_z(t, 176, z0)
    elif d == 31:
        key_color(t, 0, (*TILE, 0)); key_color(t, 84, (*TILE, 0)); key_color(t, 92, (*GREEN, 1.3)); key_color(t, 160, (*GREEN, 1.3)); key_color(t, 178, (*TILE, 0))
        key_z(t, 0, z0); key_z(t, 84, z0); key_z(t, 89, z0 + 0.26); key_z(t, 95, z0 + 0.16); key_z(t, 160, z0 + 0.16); key_z(t, 178, z0)
    elif d == 0:
        key_z(t, 0, z0); key_z(t, 8, z0 - 0.05); key_z(t, 14, z0)

# share: hop from SELL to +31 (frames 98-134), squash on landing, then shrink there and regrow on SELL
start, end = SELL_TOP.copy(), SAFE_TOP + Vector((0, 0, 0.16))
share.location = start; share.keyframe_insert("location", frame=0); share.keyframe_insert("location", frame=98)
for k in range(1, 13):
    u = k / 12; p = start.lerp(end, u); p.z += math.sin(math.pi * u) * 3.2
    share.location = p; share.keyframe_insert("location", frame=98 + round(36 * u))
share.location = end; share.keyframe_insert("location", frame=160)
share.location = start; share.keyframe_insert("location", frame=168); share.keyframe_insert("location", frame=LOOP)
def key_scale(f, s):
    share.scale = s; share.keyframe_insert("scale", frame=f)
key_scale(0, (1, 1, 1)); key_scale(96, (1, 1, 1)); key_scale(99, (1.12, 1.12, 0.8)); key_scale(104, (0.92, 0.92, 1.12)); key_scale(130, (1, 1, 1))
key_scale(134, (1.18, 1.18, 0.72)); key_scale(140, (0.96, 0.96, 1.05)); key_scale(146, (1, 1, 1))
key_scale(154, (1, 1, 1)); key_scale(164, (0.001, 0.001, 0.001)); key_scale(166, (0.001, 0.001, 0.001)); key_scale(178, (1, 1, 1)); key_scale(LOOP, (1, 1, 1))
share.rotation_euler = (0, 0, 0); share.keyframe_insert("rotation_euler", frame=98)
share.rotation_euler = (0, 0, math.radians(-180)); share.keyframe_insert("rotation_euler", frame=134)
share.rotation_euler = (0, 0, math.radians(-180)); share.keyframe_insert("rotation_euler", frame=163)
share.rotation_euler = (0, 0, 0); share.keyframe_insert("rotation_euler", frame=165)

for o in bpy.data.objects:
    if o.animation_data and o.animation_data.action:
        for fc in o.animation_data.action.fcurves:
            for kp in fc.keyframe_points: kp.interpolation = "BEZIER"; kp.easing = "AUTO"
# the hop path keys are linear in time (the arc is in the positions); keep them smooth but not overshooting
for fc in share.animation_data.action.fcurves:
    if fc.data_path == "location":
        for kp in fc.keyframe_points:
            if 98 < kp.co.x < 134: kp.interpolation = "LINEAR"

# ---------------- world, lights, camera ----------------
world = bpy.data.worlds.new("w"); sc.world = world; world.use_nodes = True
world.node_tree.nodes["Background"].inputs[0].default_value = (0, 0, 0, 1)

def area(loc, size, energy, color=(1, 1, 1), target=(0, 0, 0)):
    bpy.ops.object.light_add(type="AREA", location=loc)
    l = bpy.context.object; l.data.size = size; l.data.energy = energy; l.data.color = color
    l.rotation_euler = (Vector(target) - Vector(loc)).to_track_quat("-Z", "Y").to_euler()
    return l
area((0, -6, 16), 10, 420, (0.62, 0.66, 1.0))          # soft cool top light
area((-13, -2, 4), 5, 2600, (0.16, 0.52, 1.0))         # cyan rim from the left
area((13, 2, 4), 5, 2300, (0.45, 0.18, 1.0))           # violet rim from the right
area((0, 16, 6), 10, 1400, (0.40, 0.42, 1.0))          # halo behind

cam_data = bpy.data.cameras.new("cam"); cam_data.lens = 50; cam_data.sensor_width = 36
cam_data.shift_x = 0.0
cam = bpy.data.objects.new("cam", cam_data); sc.collection.objects.link(cam); sc.camera = cam
cam.location = (6.7, -19.6, 16.3)
target = Vector((0.0, -0.4, 0))
cam.rotation_euler = (target - cam.location).to_track_quat("-Z", "Y").to_euler()

# ---------------- render settings ----------------
r = sc.render
r.resolution_x, r.resolution_y = W, H
r.engine = "CYCLES"
r.film_transparent = False
sc.cycles.samples = 48
sc.cycles.use_denoising = True
try:
    prefs = bpy.context.preferences.addons["cycles"].preferences
    prefs.compute_device_type = "OPTIX"; prefs.get_devices()
    for d in prefs.devices: d.use = True
    sc.cycles.device = "GPU"
except Exception as e: print("GPU setup failed, CPU:", e)
sc.view_settings.view_transform = "Standard"
sc.view_settings.look = "None"

sc.use_nodes = True
ct = sc.node_tree; ct.nodes.clear()
rl = ct.nodes.new("CompositorNodeRLayers"); gl = ct.nodes.new("CompositorNodeGlare"); co = ct.nodes.new("CompositorNodeComposite")
gl.glare_type = "FOG_GLOW"; gl.threshold = 1.0; gl.size = 8; gl.mix = 0.0
ct.links.new(rl.outputs["Image"], gl.inputs["Image"]); ct.links.new(gl.outputs["Image"], co.inputs["Image"])

if MODE == "preview":
    frame = int(argv[1]); outp = argv[2]
    r.resolution_percentage = int(argv[3]) if len(argv) > 3 else 50
    if len(argv) > 4: sc.cycles.samples = int(argv[4])
    sc.frame_set(frame)
    r.filepath = outp; r.image_settings.file_format = "PNG"
    bpy.ops.render.render(write_still=True)
elif MODE == "render":
    outd = argv[1]
    if len(argv) > 2: sc.cycles.samples = int(argv[2])
    r.image_settings.file_format = "JPEG"; r.image_settings.quality = 92
    r.filepath = outd + "f-"
    bpy.ops.render.render(animation=True)
else:
    bpy.ops.wm.save_as_mainfile(filepath=bpy.path.abspath(argv[1]))
