"""mvidia_gate: the locked double gate of the MVIDIA headquarters (8 x 5 m, 1 m deep).

Concrete posts and lintel; two steel leaves with ribs, a seam, scuffed hazard stripes at the
bottom and narrow wired-glass slits. Front toward -Y.
"""


def build(asset):
    w, h, d = 8.0, 5.0, 1.0
    post, lintel = 0.6, 0.5
    front = -d / 2
    steel = asset.color("metal_dark")
    rust = asset.color("rust")

    for side in (-1, 1):
        x = side * (w / 2 - post / 2)
        asset.box("post", size=(post, d, h), at=(x, 0, 0), surface="concrete", metres=1.5)
        asset.box("post_cap", size=(post + 0.08, d + 0.08, 0.12), at=(x, 0, h - 0.12), surface="concrete", metres=1.5)
    asset.box("lintel", size=(w, d, lintel), at=(0, 0, h - lintel), surface="concrete", metres=1.5)

    opening = w - post * 2
    leaf_h = h - lintel
    leaf_w = opening / 2 - 0.02
    leaf_d = 0.18
    for side in (-1, 1):
        cx = side * (leaf_w / 2 + 0.01)
        asset.box("leaf", size=(leaf_w, leaf_d, leaf_h), at=(cx, front + 0.35, 0), surface="metal", metres=1.2)
        # horizontal ribs
        for z in (0.55, 1.6, 2.65, 3.7):
            asset.box("rib", size=(leaf_w - 0.1, 0.06, 0.14), at=(cx, front + 0.24, z), color=steel)
        # hazard stripes at the bottom: alternating yellow and dark, angled
        asset.box("kick", size=(leaf_w - 0.1, 0.03, 0.42), at=(cx, front + 0.245, 0.06), color=asset.color("paint_yellow"))
        for i in range(7):
            sx = cx - leaf_w / 2 + 0.25 + i * (leaf_w - 0.4) / 6
            asset.box("stripe", size=(0.12, 0.02, 0.5), at=(sx, front + 0.225, 0.02), color=steel, rot=(0, 35, 0))
        # wired-glass slit
        asset.box("slit", size=(0.18, 0.03, 0.9), at=(cx + side * -0.6, front + 0.245, 2.95), color=asset.color("glass"))
        # rust running down from the ribs
        asset.box("rust", size=(0.25, 0.02, 1.2), at=(cx + side * 0.9, front + 0.24, 2.0), color=rust)
    # centre seam and a heavy bolt bar across both leaves
    asset.box("seam", size=(0.05, 0.05, leaf_h), at=(0, front + 0.25, 0), color=steel)
    asset.box("bar", size=(1.4, 0.12, 0.2), at=(0, front + 0.2, 1.9), color=steel)
    # floor track
    asset.box("track", size=(opening, d * 0.6, 0.04), at=(0, 0, 0), color=steel)
