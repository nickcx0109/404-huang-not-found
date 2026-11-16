"""shop_terminal: the supply terminal players buy from (1.4 x 2.1 x 0.9 m).

A battered steel cabinet like a big vending machine: a dim screen (screen glow), a serving
hatch, a coin/card panel, side vents, a plinth and a hood over the front.
"""


def build(asset):
    w, h, d = 1.4, 2.1, 0.82
    front = -d / 2
    dark = asset.color("metal_dark")
    asset.box("plinth", size=(w - 0.06, d - 0.06, 0.1), at=(0, 0, 0), color=dark)
    asset.box("cabinet", size=(w, d, h - 0.2), at=(0, 0, 0.1), surface="metal", metres=1.0)
    asset.box("hood", size=(w + 0.06, d + 0.06, 0.1), at=(0, 0, h - 0.1), color=dark)
    asset.box("face", size=(w - 0.16, 0.03, h - 0.5), at=(0, front - 0.01, 0.3), color=asset.color("plastic_dark"))
    asset.box("screen", size=(0.8, 0.01, 0.5), at=(-0.1, front - 0.03, 1.15), glow="screen")
    asset.box("hatch", size=(0.7, 0.04, 0.22), at=(-0.1, front - 0.03, 0.42), color=dark)
    asset.box("pay", size=(0.18, 0.04, 0.32), at=(0.48, front - 0.03, 1.0), color=asset.color("metal"))
    asset.box("pay_light", size=(0.1, 0.01, 0.04), at=(0.48, front - 0.055, 1.24), glow="accent")
    for i in range(5):
        for side in (-1, 1):
            asset.box("vent", size=(0.02, 0.5, 0.03), at=(side * (w / 2 + 0.005), 0, 0.5 + i * 0.09), color=dark)
    asset.box("dent", size=(0.3, 0.02, 0.25), at=(0.35, front - 0.03, 0.6), color=asset.color("rust"))
    asset.align_bottom_center()
