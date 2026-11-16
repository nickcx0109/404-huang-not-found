"""warning_light: red warning beacon on a 2.4 m pole. The lens glows (alarm); the moving red
light itself is added by the game (registerExtras in web/js/props/Ch2Props.js)."""


def build(asset):
    pole = 2.4
    steel = asset.color("metal")
    dark = asset.color("metal_dark")
    asset.box("foot", size=(0.3, 0.3, 0.04), at=(0, 0, 0), color=dark)
    for x in (-0.11, 0.11):
        for y in (-0.11, 0.11):
            asset.cylinder("bolt", radius=0.015, height=0.03, at=(x, y, 0.04), color=steel, segments=6)
    asset.cylinder("pole", radius=0.04, height=pole, at=(0, 0, 0.04), color=steel, segments=10)
    asset.cylinder("base", radius=0.12, height=0.1, at=(0, 0, pole), color=dark, segments=12)
    asset.cylinder("lens", radius=0.09, height=0.18, at=(0, 0, pole + 0.1), glow="alarm", segments=12)
    asset.cylinder("cap", radius=0.1, height=0.03, at=(0, 0, pole + 0.28), color=dark, segments=12)
    for angle in (0, 90):
        asset.box("cage", size=(0.2, 0.012, 0.18), at=(0, 0, pole + 0.1), color=dark, rot=(0, 0, angle))
