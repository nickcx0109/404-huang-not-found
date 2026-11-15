"""Builds assets: runs art/blender/<id>.py and writes web/assets/models/<id>.glb.

Run it through Blender (4.2 LTS), in background mode:

    node tools/art/assets.mjs build test_crate          # the easy way
    node tools/art/assets.mjs build --chapter ch2
    blender --background --factory-startup --python-exit-code 1 \
        --python tools/art/build_assets.py -- --chapter ch2

Say what to build: asset ids, --chapter <manifest name>, or --all. A chapter builds every
asset of its manifest that is not "planned". Exits with a non-zero code if any asset fails.

SHARED: talk to the team lead before changing it.
"""

import os
import runpy
import sys
import traceback

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from _common import (MODEL_DIR, SCRIPT_DIR, load_manifests, parse_selection,  # noqa: E402
                     select_assets, triangle_limit)

sys.path.insert(0, SCRIPT_DIR)
from _lib import Asset, reset_scene  # noqa: E402


def build_one(entry):
    """Builds one asset; returns (stats, list of warnings). Raises on failure."""
    asset_id = entry["id"]
    script = os.path.join(SCRIPT_DIR, asset_id + ".py")
    if not os.path.isfile(script):
        raise FileNotFoundError("no script art/blender/%s.py" % asset_id)

    reset_scene()
    asset = Asset(asset_id, chapter=entry["chapter"])
    namespace = runpy.run_path(script)
    if not callable(namespace.get("build")):
        raise RuntimeError("art/blender/%s.py must define build(asset)" % asset_id)
    namespace["build"](asset)

    stats = asset.finish()
    os.makedirs(MODEL_DIR, exist_ok=True)
    path = os.path.join(MODEL_DIR, asset_id + ".glb")
    asset.export_glb(path)
    stats["kb"] = os.path.getsize(path) / 1024.0

    warnings = []
    limit = triangle_limit(entry)
    if limit and stats["triangles"] > limit:
        warnings.append("%d triangles, limit is %d" % (stats["triangles"], limit))
    if abs(stats["bottom"]) > 0.02:
        warnings.append("does not stand on z = 0 (lowest point is %.3f)" % stats["bottom"])
    return stats, warnings


def main():
    args = parse_selection("build_assets.py", __doc__.splitlines()[0])
    entries = [e for e in select_assets(args, load_manifests()) if e.get("source", "blender") == "blender"]
    if not entries:
        print("build_assets: nothing to build (planned assets are skipped; name an id to force one)")
        return 0

    failed = 0
    lines = []
    for entry in entries:
        try:
            stats, warnings = build_one(entry)
            w, h, d = stats["size"]
            lines.append("OK    %-24s %5d tris  %.2f x %.2f x %.2f m  %.0f KB" %
                         (entry["id"], stats["triangles"], w, h, d, stats["kb"]))
            lines.extend("      warning: " + text for text in warnings)
        except Exception as error:  # one broken script must not stop the others
            failed += 1
            lines.append("FAIL  %-24s %s" % (entry["id"], error))
            traceback.print_exc()

    print("\n== build_assets ==")
    print("\n".join(lines))
    print("%d built, %d failed. Next: preview, then check_assets." % (len(entries) - failed, failed))
    return 1 if failed else 0


if __name__ == "__main__":
    sys.exit(main())
