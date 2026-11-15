"""Builds the tiling surface textures listed in art/textures.json into web/assets/textures/.

Run it through Blender (4.2 LTS), in background mode (it uses Blender only to read and
write images, and its bundled numpy):

    node tools/art/assets.mjs textures            # the easy way
    blender --background --factory-startup --python-exit-code 1 \
        --python tools/art/build_textures.py -- [ids...]

Each texture is cropped (optional), repainted larger with wear and kept seamless, greyed and
darkened by the shared asset style (palette.json "_assets.style"), and saved as JPEG.

SHARED: talk to the team lead before changing it.
"""

import json
import os
import sys
import zlib

import bpy
import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import REPO_ROOT, SCRIPT_DIR, script_args  # noqa: E402

sys.path.insert(0, SCRIPT_DIR)
from _lib.asset import asset_drop_dir  # noqa: E402
from _lib.palette import AssetPalette  # noqa: E402
from _lib.texture import repaint  # noqa: E402

LIST = os.path.join(REPO_ROOT, "art", "textures.json")
OUT_DIR = os.path.join(REPO_ROOT, "web", "assets", "textures")


def sandbags(size=256, rows=2, per_row=2, seed=7):
    """Paints a tiling sandbag wall: staggered rows of plump khaki bags with dark seams."""
    rng = np.random.default_rng(seed)
    y, x = np.mgrid[0:size, 0:size].astype(np.float32) / size
    img = np.zeros((size, size, 4), dtype=np.float32)
    img[..., 3] = 1.0
    base = np.array([0.56, 0.51, 0.37], dtype=np.float32)
    shade = np.zeros((size, size), dtype=np.float32)
    row_h = 1.0 / rows
    bag_w = 1.0 / per_row
    for r in range(rows):
        v = (y - r * row_h) / row_h  # 0..1 inside the row
        in_row = (v >= 0) & (v < 1)
        offset = (bag_w / 2) * (r % 2)
        u = ((x - offset) % bag_w) / bag_w  # 0..1 inside the bag, wraps across the tile
        # rounded pillow: bright in the middle, falling off to the seams
        du = (u - 0.5) * 2
        dv = (v - 0.45) * 2
        pillow = np.clip(1.15 - (du ** 6 + dv ** 4) ** 0.5, 0.0, 1.0)
        shade = np.where(in_row, pillow ** 0.6, shade)
    tint = 1.0 + (rng.random((rows * per_row,)) - 0.5) * 0.2
    img[..., :3] = base * (0.35 + 0.75 * shade[..., None])
    img[..., :3] *= tint[(np.floor(y * rows).astype(int) * per_row) % len(tint)][..., None]
    # fabric weave: fine crossing lines
    weave = 0.04 * (np.sin(x * size * 1.6) * np.sin(y * size * 1.6))
    img[..., :3] += weave[..., None]
    return np.clip(img, 0, 1)


GENERATORS = {"sandbags": sandbags}


def build(entry, style):
    if "generator" in entry:
        src = GENERATORS[entry["generator"]]()
        seed = zlib.crc32(entry["id"].encode("utf-8"))
        img = repaint(src, seed, style.get("desaturate", 0.0), 1.0 - 0.5 * style.get("grime", 0.0),
                      wrap=True, wear=1.0, upscale=2)
        return save(entry, img)
    path = os.path.join(asset_drop_dir(), entry["source"])
    if not os.path.isfile(path):
        raise FileNotFoundError("no file %s (download the pack into %s)" % (path, asset_drop_dir()))
    image = bpy.data.images.load(path)
    w, h = image.size
    src = np.empty(w * h * 4, dtype=np.float32)
    image.pixels.foreach_get(src)
    src = src.reshape(h, w, 4)  # Blender rows run bottom to top
    if "crop" in entry:
        left, top, right, bottom = entry["crop"]
        src = src[int(round((1 - bottom) * h)):int(round((1 - top) * h)),
                  int(round(left * w)):int(round(right * w))]
    seed = zlib.crc32(entry["id"].encode("utf-8"))
    img = repaint(src, seed, style.get("desaturate", 0.0), 1.0 - 0.5 * style.get("grime", 0.0),
                  wrap=True, wear=0.8)
    return save(entry, img)


def save(entry, img):
    H, W = img.shape[:2]
    out = bpy.data.images.new(entry["id"], W, H)
    out.pixels.foreach_set(img.ravel())
    os.makedirs(OUT_DIR, exist_ok=True)
    target = os.path.join(OUT_DIR, entry["id"] + ".jpg")
    out.filepath_raw = target
    out.file_format = "JPEG"
    bpy.context.scene.render.image_settings.quality = 85
    out.save()
    return W, H, os.path.getsize(target) / 1024.0


def main():
    with open(LIST, "r", encoding="utf-8") as handle:
        entries = json.load(handle)["textures"]
    wanted = script_args()
    if wanted:
        entries = [e for e in entries if e["id"] in wanted]
    style = AssetPalette(None).style
    failed = 0
    print("\n== build_textures ==")
    for entry in entries:
        try:
            w, h, kb = build(entry, style)
            print("OK    %-12s %4d x %-4d %4.0f KB" % (entry["id"], w, h, kb))
        except Exception as error:
            failed += 1
            print("FAIL  %-12s %s" % (entry["id"], error))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
