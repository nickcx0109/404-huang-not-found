"""pistol: a semi-automatic service pistol of our own design (0.034 x 0.146 x 0.2 m).

Steel slide on a polymer frame, raked grip with dark panels, an accessory rail under the
muzzle. The slide, magazine, trigger and hammer are separate parts, so the game can rack the
slide, drop the magazine and pull the trigger.

Inside this script `u` is the distance forward along the barrel and z is up; side() turns
that into the script axes (the front of an asset faces -Y).
"""

RAKE = 0.30  # how far the grip leans back, as run / rise


def side(points):
    """(u forward, z up) outline -> the (y, z) points asset.extrude(axis="x") wants."""
    return [(-u, z) for u, z in points]


def build(asset):
    steel = asset.color("gun_steel")
    steel_dark = asset.color("gun_steel_dark")
    worn = asset.color("gun_steel_worn")
    polymer = asset.color("gun_polymer")
    grip = asset.color("gun_grip")
    bore = asset.color("gun_bore")
    brass = asset.color("gun_brass")
    sight = asset.color("gun_sight")

    def lean(z):
        """How far back the grip has moved at height z (it leans back toward the bottom)."""
        return (0.088 - z) * RAKE

    # ---- fixed body: frame, grip, trigger guard, barrel ------------------------------
    # frame under the slide, with the dust cover running forward to the muzzle
    asset.extrude("frame", side([(-0.094, 0.088), (0.086, 0.088), (0.090, 0.094), (0.090, 0.104),
                                 (-0.100, 0.104), (-0.104, 0.098)]), span=(-0.014, 0.014), color=polymer)
    # beavertail: the lip that sits over the web of the hand
    asset.extrude("beavertail", side([(-0.094, 0.088), (-0.100, 0.104), (-0.112, 0.099), (-0.108, 0.092)]),
                  span=(-0.011, 0.011), color=polymer)
    # accessory rail: three lugs under the dust cover
    for i in range(3):
        asset.box("rail_lug", size=(0.024, 0.007, 0.005), at=(0, -(0.052 + i * 0.012), 0.083), color=polymer)
    asset.box("rail_base", size=(0.018, 0.040, 0.004), at=(0, -0.064, 0.084), color=steel_dark)

    # grip: a leaning block, a little wider than the frame, with a flared bottom
    front_top, back_top = -0.022, -0.094
    asset.extrude("grip", side([
        (front_top, 0.090), (back_top, 0.090),
        (back_top - lean(0.050) - 0.007, 0.050),  # the swell that fills the palm
        (back_top - lean(0.006) - 0.002, 0.006), (front_top - lean(0.006), 0.006),
        (front_top - lean(0.048) + 0.004, 0.048),
    ]), span=(-0.0145, 0.0145), color=polymer)
    asset.extrude("grip_foot", side([
        (front_top - lean(0.006) + 0.002, 0.006), (back_top - lean(0.006) - 0.004, 0.006),
        (back_top - lean(0.0) - 0.004, 0.0), (front_top - lean(0.0) + 0.002, 0.0),
    ]), span=(-0.0155, 0.0155), color=polymer)
    # grip panels on both sides, with grooves across them
    for x in (-0.0158, 0.0158):
        asset.extrude("grip_panel", side([
            (front_top - 0.008 - lean(0.078), 0.078), (back_top + 0.007 - lean(0.078), 0.078),
            (back_top + 0.005 - lean(0.014), 0.014), (front_top - 0.008 - lean(0.014), 0.014),
        ]), span=(x - 0.0012, x + 0.0012), color=grip)
        for i in range(5):
            z = 0.022 + i * 0.012
            asset.extrude("grip_groove", side([
                (front_top - 0.014 - lean(z), z), (back_top + 0.013 - lean(z), z),
                (back_top + 0.013 - lean(z - 0.003), z - 0.003), (front_top - 0.014 - lean(z - 0.003), z - 0.003),
            ]), span=(x - 0.0018, x + 0.0018), color=steel_dark)

    # trigger guard: front post and bottom bar
    asset.extrude("guard_front", side([(0.040, 0.088), (0.050, 0.088), (0.046, 0.058), (0.038, 0.054)]),
                  span=(-0.006, 0.006), color=polymer)
    asset.extrude("guard_bottom", side([(0.046, 0.058), (0.038, 0.052), (-0.026, 0.052), (-0.028, 0.058)]),
                  span=(-0.006, 0.006), color=polymer)

    # controls on the left side: slide stop, takedown pin, magazine release
    asset.box("slide_stop", size=(0.003, 0.030, 0.005), at=(-0.0150, 0.020, 0.096), color=steel_dark)
    asset.box("slide_stop_pad", size=(0.004, 0.010, 0.007), at=(-0.0155, 0.032, 0.095), color=steel_dark)
    asset.cylinder("takedown_pin", radius=0.003, height=0.031, at=(-0.0155, -0.044, 0.096),
                   rot=(0, 90, 0), color=worn, segments=6)
    asset.cylinder("mag_release", radius=0.004, height=0.032, at=(-0.016, 0.024, 0.074),
                   rot=(0, 90, 0), color=steel_dark, segments=6)

    # barrel and recoil spring guide: they stay put when the slide runs back
    asset.cylinder("barrel", radius=0.0068, height=0.150, at=(0, 0.048, 0.122), rot=(90, 0, 0),
                   color=worn, segments=8)
    asset.cylinder("bore", radius=0.0042, height=0.004, at=(0, -0.0985, 0.122), rot=(90, 0, 0),
                   color=bore, segments=8)
    asset.cylinder("guide_rod", radius=0.0034, height=0.070, at=(0, -0.030, 0.109), rot=(90, 0, 0),
                   color=steel_dark, segments=6)

    # ---- slide ---------------------------------------------------------------------------
    with asset.part("slide", pivot=(0, 0, 0.104)):
        # a flat-sided block with chamfered top edges
        asset.extrude("slide", [(-0.0150, 0.104), (0.0150, 0.104), (0.0150, 0.130), (0.0105, 0.138),
                                (-0.0105, 0.138), (-0.0150, 0.130)], axis="y", span=(-0.098, 0.100), color=steel)
        asset.box("muzzle_face", size=(0.022, 0.001, 0.028), at=(0, -0.0985, 0.106), color=steel_dark)
        # ejection port on the right, showing the barrel hood
        asset.box("port", size=(0.012, 0.034, 0.002), at=(0.0055, -0.004, 0.1368), color=bore)
        asset.box("port_side", size=(0.002, 0.034, 0.010), at=(0.0142, -0.004, 0.126), color=bore)
        asset.box("barrel_hood", size=(0.010, 0.020, 0.0026), at=(0.0050, -0.008, 0.1366), color=worn)
        # grip serrations at the back, both sides
        for x in (-0.0150, 0.0150):
            for i in range(6):
                asset.box("serration", size=(0.0016, 0.0028, 0.022), at=(x, 0.058 + i * 0.0062, 0.107),
                          rot=(-12, 0, 0), color=steel_dark)
        # sights: one post in front, a notched block behind, pale dots to aim with
        asset.box("front_sight", size=(0.004, 0.008, 0.005), at=(0, -0.086, 0.138), color=steel_dark, taper=0.7)
        asset.box("front_dot", size=(0.0024, 0.0008, 0.0024), at=(0, -0.0818, 0.1396), color=sight)
        for x in (-0.0058, 0.0058):
            asset.box("rear_sight", size=(0.0056, 0.010, 0.0055), at=(x, 0.086, 0.138), color=steel_dark)
            asset.box("rear_dot", size=(0.0022, 0.0008, 0.0022), at=(x, 0.0914, 0.1400), color=sight)
        asset.box("rear_sight_base", size=(0.018, 0.010, 0.002), at=(0, 0.086, 0.138), color=steel_dark)

    # ---- hammer: turns back about its pin when the slide cocks it --------------------
    with asset.part("hammer", pivot=(0, 0.097, 0.106)):
        asset.extrude("hammer", side([(-0.096, 0.104), (-0.101, 0.104), (-0.109, 0.121), (-0.104, 0.124),
                                      (-0.0995, 0.118)]), span=(-0.0035, 0.0035), color=steel_dark)

    # ---- trigger: turns about its pin at the top ----------------------------------------
    with asset.part("trigger", pivot=(0, -0.016, 0.088)):
        asset.extrude("trigger", side([(0.020, 0.088), (0.012, 0.088), (0.010, 0.074), (0.014, 0.062),
                                       (0.018, 0.063), (0.016, 0.075)]), span=(-0.0035, 0.0035), color=steel_dark)

    # ---- magazine: slides out of the grip along its lean -----------------------------
    mid = (front_top + back_top) / 2.0 + 0.002
    with asset.part("magazine", pivot=(0, -(mid - lean(0.0)), 0.0)):
        asset.extrude("mag_body", side([
            (mid + 0.018, 0.086), (mid - 0.018, 0.086),
            (mid - 0.018 - lean(0.0), 0.0), (mid + 0.018 - lean(0.0), 0.0),
        ]), span=(-0.0105, 0.0105), color=steel_dark)
        asset.extrude("mag_plate", side([
            (mid + 0.024 - lean(0.0), 0.0), (mid - 0.023 - lean(0.0), 0.0),
            (mid - 0.023 - lean(-0.007), -0.007), (mid + 0.026 - lean(-0.007), -0.007),
        ]), span=(-0.0150, 0.0150), color=polymer)
        # the top round, seen when the magazine is out
        asset.cylinder("round", radius=0.0046, height=0.022, at=(0, -(mid - 0.012), 0.089),
                       rot=(90, 0, 0), color=brass, segments=6)
        asset.cylinder("round_tip", radius=0.0046, radius_top=0.0018, height=0.008,
                       at=(0, -(mid + 0.010), 0.089), rot=(90, 0, 0), color=worn, segments=6)

    # where the shot leaves: the muzzle flash is drawn here
    asset.marker("muzzle", at=(0, -0.104, 0.122))

    asset.align_bottom_center()
