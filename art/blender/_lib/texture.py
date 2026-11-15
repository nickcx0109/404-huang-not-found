"""Repainting low-resolution pack textures: larger, sharper, with painted-in wear.

Used by Asset.import_model (textures of imported models) and by tools/art/build_textures.py
(tiling surfaces for walls and the ground). Pure numpy, so it runs inside Blender.
"""

import numpy as np

# Textures are repainted this many times larger, up to TEXTURE_MAX pixels on a side.
TEXTURE_UPSCALE = 4
TEXTURE_MAX = 512  # keeps small props under their 300 KB file limit


def resize(a, h, w, wrap=False):
    """Bilinear resize of an (H, W, C) array to (h, w, C). wrap: the image tiles."""
    H, W = a.shape[:2]
    if wrap:
        y = np.arange(h) * (H / h)
        x = np.arange(w) * (W / w)
    else:
        y = np.linspace(0, H - 1, h)
        x = np.linspace(0, W - 1, w)
    y0 = np.floor(y).astype(int)
    x0 = np.floor(x).astype(int)
    y1 = (y0 + 1) % H if wrap else np.minimum(y0 + 1, H - 1)
    x1 = (x0 + 1) % W if wrap else np.minimum(x0 + 1, W - 1)
    wy = (y - y0)[:, None, None].astype(np.float32)
    wx = (x - x0)[None, :, None].astype(np.float32)
    top = a[y0][:, x0] * (1 - wx) + a[y0][:, x1] * wx
    bottom = a[y1][:, x0] * (1 - wx) + a[y1][:, x1] * wx
    return top * (1 - wy) + bottom * wy


def value_noise(rng, h, w, cells, wrap=False):
    """Smooth random field in [0, 1] with about `cells` blobs across the image."""
    shape = (cells, cells, 1) if wrap else (cells + 1, cells + 1, 1)
    return resize(rng.random(shape).astype(np.float32), h, w, wrap)[..., 0]


def repaint(src, seed, desaturate=0.0, darken=1.0, wrap=False, upscale=TEXTURE_UPSCALE,
            max_size=TEXTURE_MAX, wear=1.0):
    """src: (h, w, 4) float pixels. Returns the repainted (H, W, 4) array.

    Scales up (at most `upscale` times and `max_size` px), sharpens the edges back, paints
    grain, blotchy stains at several sizes and faint vertical rain streaks (all scaled by
    `wear`), then greys (desaturate) and darkens. wrap=True keeps a tiling texture seamless.
    """
    h, w = src.shape[:2]
    factor = max(1, min(upscale, max_size // max(w, h)))
    H, W = h * factor, w * factor
    img = resize(src, H, W, wrap)
    if factor > 1:
        blur = (img + np.roll(img, 1, 0) + np.roll(img, -1, 0) + np.roll(img, 1, 1) + np.roll(img, -1, 1)) / 5.0
        img = img + 0.8 * (img - blur)  # unsharp mask: undo the softness of scaling up

    rng = np.random.default_rng(seed)
    rgb = img[..., :3]
    stains = sum(value_noise(rng, H, W, cells, wrap) * weight
                 for cells, weight in ((5, 0.45), (13, 0.3), (37, 0.17), (90, 0.08)))
    rgb *= (1.0 - wear * 0.32 * np.clip((stains - 0.45) * 2.2, 0.0, 1.0))[..., None]
    streak_cells = max(4, W // 6)
    streaks = resize(rng.random((6, streak_cells, 1)).astype(np.float32), H, W, wrap)[..., 0]
    rgb *= (1.0 - wear * 0.12 * np.clip((streaks - 0.55) * 3.0, 0.0, 1.0))[..., None]
    rgb += (wear * (rng.random((H, W)) - 0.5) * 0.05).astype(np.float32)[..., None]

    luma = rgb @ np.array([0.2126, 0.7152, 0.0722], dtype=np.float32)
    rgb += (luma[..., None] - rgb) * desaturate
    rgb *= darken
    img[..., :3] = np.clip(rgb, 0.0, 1.0)
    img[..., 3] = np.clip(img[..., 3], 0.0, 1.0)
    return img
