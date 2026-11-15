"""Renders 4 preview images of each built asset into art/previews/<id>/.

It loads web/assets/models/<id>.glb — the file the game uses — so the pictures show what was
really exported: front.jpg, back.jpg, side.jpg and three_quarter.jpg (640 x 640, JPEG 85).
The three-quarter view also shows a 1.75 m grey figure for scale.

    node tools/art/assets.mjs preview test_crate
    node tools/art/assets.mjs preview --chapter ch2
    blender --background --factory-startup --python-exit-code 1 \
        --python tools/art/preview.py -- --chapter ch2

SHARED: talk to the team lead before changing it.
"""

import math
import os
import sys
import traceback

import bpy
from mathutils import Vector

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import MODEL_DIR, PREVIEW_DIR, load_manifests, parse_selection, select_assets  # noqa: E402

IMAGE_SIZE = 640
JPEG_QUALITY = 85
FIGURE_SIZE = (0.45, 0.25, 1.75)  # a person, for scale
LENS_MM = 60.0
SENSOR_MM = 36.0

# name -> direction from the asset to the camera, in Blender axes. After import the asset's
# front (the game's -Z) faces +Y, so the front view looks from +Y.
VIEWS = {
    "front": (0.0, 1.0, 0.22),
    "back": (0.0, -1.0, 0.22),
    "side": (1.0, 0.0, 0.22),
    "three_quarter": (0.75, 0.85, 0.5),
}


def bounds(objects):
    low = Vector((math.inf, math.inf, math.inf))
    high = Vector((-math.inf, -math.inf, -math.inf))
    for obj in objects:
        for corner in obj.bound_box:
            point = obj.matrix_world @ Vector(corner)
            for axis in range(3):
                low[axis] = min(low[axis], point[axis])
                high[axis] = max(high[axis], point[axis])
    return low, high


def setup_scene():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    scene = bpy.context.scene
    try:
        scene.render.engine = "BLENDER_EEVEE_NEXT"
    except TypeError:
        scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x = IMAGE_SIZE
    scene.render.resolution_y = IMAGE_SIZE
    scene.render.resolution_percentage = 100
    scene.render.image_settings.file_format = "JPEG"
    scene.render.image_settings.quality = JPEG_QUALITY
    scene.view_settings.view_transform = "Standard"  # show the colours as stored, no film look

    world = bpy.data.worlds.new("preview")
    world.use_nodes = True
    background = world.node_tree.nodes["Background"]
    background.inputs["Color"].default_value = (0.22, 0.23, 0.24, 1.0)
    background.inputs["Strength"].default_value = 1.0
    scene.world = world

    sun_data = bpy.data.lights.new("key", "SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("key", sun_data)
    sun.rotation_euler = (math.radians(50), 0.0, math.radians(145))
    scene.collection.objects.link(sun)

    camera_data = bpy.data.cameras.new("preview")
    camera_data.lens = LENS_MM
    camera_data.sensor_width = SENSOR_MM
    camera = bpy.data.objects.new("preview", camera_data)
    scene.collection.objects.link(camera)
    scene.camera = camera
    return scene, camera


def add_figure(low, high):
    """A grey person-sized box standing beside the asset."""
    w, d, h = FIGURE_SIZE
    bpy.ops.mesh.primitive_cube_add(size=1.0)
    figure = bpy.context.active_object
    figure.name = "scale_figure"
    figure.scale = (w, d, h)
    figure.location = (low.x - 0.5 - w / 2.0, (low.y + high.y) / 2.0, h / 2.0)
    material = bpy.data.materials.new("scale_figure")
    material.use_nodes = True
    material.node_tree.nodes["Principled BSDF"].inputs["Base Color"].default_value = (0.06, 0.065, 0.07, 1.0)
    figure.data.materials.append(material)
    return figure


def aim(camera, low, high, direction):
    centre = (low + high) / 2.0
    radius = max((high - low).length / 2.0, 0.05)
    half_angle = math.atan(SENSOR_MM / 2.0 / LENS_MM)
    distance = radius / math.sin(half_angle) * 1.08
    offset = Vector(direction).normalized() * distance
    camera.location = centre + offset
    camera.rotation_euler = (-offset).to_track_quat("-Z", "Y").to_euler()
    camera.data.clip_start = max(0.01, distance - radius * 2.0)
    camera.data.clip_end = distance + radius * 4.0


def preview_one(asset_id):
    path = os.path.join(MODEL_DIR, asset_id + ".glb")
    if not os.path.isfile(path):
        raise FileNotFoundError("web/assets/models/%s.glb does not exist: build it first" % asset_id)

    scene, camera = setup_scene()
    bpy.ops.import_scene.gltf(filepath=path)
    parts = [obj for obj in scene.objects if obj.type == "MESH"]
    low, high = bounds(parts)
    figure = add_figure(low, high)
    bpy.context.view_layer.update()
    low_all, high_all = bounds(parts + [figure])

    out_dir = os.path.join(PREVIEW_DIR, asset_id)
    os.makedirs(out_dir, exist_ok=True)
    for name, direction in VIEWS.items():
        with_figure = name == "three_quarter"
        figure.hide_render = not with_figure
        if with_figure:
            aim(camera, low_all, high_all, direction)
        else:
            aim(camera, low, high, direction)
        scene.render.filepath = os.path.join(out_dir, name + ".jpg")
        bpy.ops.render.render(write_still=True)
    return out_dir


def main():
    args = parse_selection("preview.py", __doc__.splitlines()[0])
    entries = select_assets(args, load_manifests())
    failed = 0
    lines = []
    for entry in entries:
        try:
            out_dir = preview_one(entry["id"])
            lines.append("OK    %-24s %s" % (entry["id"], os.path.relpath(out_dir).replace("\\", "/")))
        except Exception as error:
            failed += 1
            lines.append("FAIL  %-24s %s" % (entry["id"], error))
            traceback.print_exc()
    print("\n== preview ==")
    print("\n".join(lines) if lines else "nothing to preview")
    print("Look at the pictures before marking an asset \"ready\".")
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
