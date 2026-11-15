"""warning_beacon: the red warning beacon without a pole, for roofs. The lens glows (alarm);
the moving red light is added by the game (registerExtras in web/js/props/Ch2Props.js)."""


def build(asset):
    dark = asset.color("metal_dark")
    asset.cylinder("base", radius=0.12, height=0.1, at=(0, 0, 0), color=dark, segments=12)
    asset.cylinder("lens", radius=0.09, height=0.18, at=(0, 0, 0.1), glow="alarm", segments=12)
    asset.cylinder("cap", radius=0.1, height=0.03, at=(0, 0, 0.28), color=dark, segments=12)
    for angle in (0, 90):
        asset.box("cage", size=(0.2, 0.012, 0.18), at=(0, 0, 0.1), color=dark, rot=(0, 0, angle))
