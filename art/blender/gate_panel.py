"""gate_panel: the access panel beside the gate, where the players start the unlock.

A steel housing with a rain hood, a glowing screen (accent), a keypad and a card slot.
"""


def build(asset):
    w, h, d = 0.5, 0.7, 0.12
    front = -d / 2
    dark = asset.color("metal_dark")
    asset.box("housing", size=(w, d, h), at=(0, 0, 0), surface="metal", metres=0.6)
    asset.box("hood", size=(w + 0.02, d + 0.03, 0.03), at=(0, -0.015, h - 0.03), color=dark)
    asset.box("bezel", size=(0.36, 0.015, 0.24), at=(0, front - 0.005, 0.38), color=dark)
    asset.box("screen", size=(0.3, 0.01, 0.18), at=(0, front - 0.012, 0.41), glow="accent")
    for row in range(4):
        for col in range(3):
            asset.box("key", size=(0.05, 0.015, 0.035), at=(-0.07 + col * 0.07, front - 0.006, 0.08 + row * 0.06),
                      color=asset.color("plastic_dark"))
    asset.box("slot", size=(0.1, 0.02, 0.02), at=(0.17, front - 0.008, 0.2), color=asset.color("rubber"))
