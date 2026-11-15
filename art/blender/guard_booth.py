"""guard_booth: security booth beside the gate (2.6 x 2.7 x 2.6 m).

Plastered lower walls, a band of dark windows on all sides with metal frames, a steel door on
the right side, an overhanging roof slab and an air-conditioning box at the back.
"""


def build(asset):
    body, height = 2.4, 2.45
    sill, head = 1.0, 2.15
    steel = asset.color("metal")
    dark = asset.color("metal_dark")
    glass = asset.color("glass")
    half = body / 2

    asset.box("plinth", size=(body + 0.1, body + 0.1, 0.12), at=(0, 0, 0), surface="concrete", metres=1.5)
    asset.box("lower", size=(body, body, sill), at=(0, 0, 0.12), surface="stucco", metres=1.5)
    asset.box("upper", size=(body, body, height - head), at=(0, 0, head), surface="stucco", metres=1.5)
    # window band: dark glass box inset a little, with corner posts and mullions
    asset.box("glass", size=(body - 0.06, body - 0.06, head - sill - 0.12), at=(0, 0, sill + 0.12), color=glass)
    for x in (-half, half):
        for y in (-half, half):
            asset.box("corner", size=(0.1, 0.1, head - sill), at=(x - (0.05 if x > 0 else -0.05), y - (0.05 if y > 0 else -0.05), sill + 0.12), color=steel)
    for t in (-0.4, 0.4):
        asset.box("mullion_f", size=(0.06, 0.08, head - sill), at=(t, -half, sill + 0.12), color=steel)
        asset.box("mullion_b", size=(0.06, 0.08, head - sill), at=(t, half, sill + 0.12), color=steel)
        asset.box("mullion_l", size=(0.08, 0.06, head - sill), at=(-half, t, sill + 0.12), color=steel)
    asset.box("sill", size=(body + 0.06, body + 0.06, 0.06), at=(0, 0, sill + 0.06), color=dark)
    # steel door on the right side, through the window band
    asset.box("door", size=(0.05, 0.9, 2.0), at=(half + 0.02, 0.4, 0.12), surface="metal", metres=1.0)
    asset.box("handle", size=(0.06, 0.12, 0.04), at=(half + 0.06, 0.05, 1.1), color=dark)
    # roof slab, overhanging
    asset.box("roof", size=(2.6, 2.6, 0.25), at=(0, 0, height), surface="concrete", metres=1.5)
    # air conditioner at the back
    asset.box("ac", size=(0.7, 0.22, 0.45), at=(0.3, half + 0.11, 1.55), color=asset.color("paint_white"))
    asset.box("ac_grille", size=(0.5, 0.02, 0.3), at=(0.3, half + 0.23, 1.62), color=dark)
    # a scorched, broken-in front window pane
    asset.box("crack", size=(0.5, 0.02, 0.6), at=(-0.75, -half - 0.01, 1.3), color=asset.color("rubber"))
