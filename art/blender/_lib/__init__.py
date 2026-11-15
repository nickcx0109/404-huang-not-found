"""Shared helpers for the asset scripts in art/blender/.

An asset script is one file, art/blender/<id>.py, with one function:

    def build(asset):
        wood = asset.color("wood")
        asset.box("body", size=(1, 1, 1), at=(0, 0, 0), color=wood)

It is run by tools/art/build_assets.py, which creates the `asset` (an Asset from this
package), calls build(), then finishes and exports web/assets/models/<id>.glb.

Coordinates inside a script are Blender's: metres, Z up, X to the right, and the FRONT of
the asset faces -Y (what Blender's front view shows). Put the origin at the bottom centre:
the asset stands on z = 0, centred on x = y = 0. The exporter converts this to the game's
convention (+Y up, front toward -Z).

SHARED: every chapter's assets go through this package. Talk to the team lead before
changing it.
"""

from .asset import Asset, AssetError, reset_scene  # noqa: F401
from .palette import AssetPalette  # noqa: F401
