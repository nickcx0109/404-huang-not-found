"""test_crate: a 1 m wooden supply crate.

The pipeline's test asset: small, uses two palette colours and one glowing part, and is
placed in web/levels/test.json. Copy it as a starting point for a new asset.

Blender axes: metres, Z up, front toward -Y, origin at the bottom centre.
"""


def build(asset):
    wood = asset.color("wood")
    dark = asset.color("wood_dark")
    size = 1.0
    plank = 0.09   # width of the frame planks
    proud = 0.03   # how far the frame stands out from the panels
    inner = size - proud * 2

    # the box itself, slightly smaller than 1 m so that the frame defines the outside
    asset.box("panels", size=(inner, inner, inner), at=(0, 0, proud), color=wood)

    # frame: four posts and, on every side, a rail at the bottom and at the top
    edge = size / 2 - plank / 2
    for x in (-edge, edge):
        for y in (-edge, edge):
            asset.box("post", size=(plank, plank, size), at=(x, y, 0), color=dark)
    span = size - plank * 2
    for z in (0, size - plank):
        for side in (-edge, edge):
            asset.box("rail_x", size=(span, plank, plank), at=(0, side, z), color=dark)
            asset.box("rail_y", size=(plank, span, plank), at=(side, 0, z), color=dark)

    # a diagonal brace on the front, and a stencilled mark that glows in the accent colour
    asset.box("brace", size=(span * 1.32, 0.02, plank * 0.8), at=(0, -size / 2 + 0.02, size / 2),
              color=dark, rot=(0, -45, 0))
    asset.box("mark", size=(0.3, 0.012, 0.1), at=(0.2, -size / 2 + 0.012, 0.68), glow="accent")
