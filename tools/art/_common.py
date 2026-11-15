"""Shared by the Blender-side tools (build_assets.py, preview.py): paths, manifests, selection.

SHARED: talk to the team lead before changing it.
"""

import argparse
import json
import os
import sys

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
MANIFEST_DIR = os.path.join(REPO_ROOT, "art", "manifest")
SCRIPT_DIR = os.path.join(REPO_ROOT, "art", "blender")
MODEL_DIR = os.path.join(REPO_ROOT, "web", "assets", "models")
PREVIEW_DIR = os.path.join(REPO_ROOT, "art", "previews")

# Triangle limits per asset class (docs/art/SCENE_PIPELINE.md, section 5 step 1).
CLASS_LIMITS = {
    "small_prop": 1500,
    "large_prop": 6000,
    "module": 3000,
    "landmark": 20000,
}


def script_args():
    """Arguments after "--" on Blender's command line (or all of them under plain Python)."""
    argv = sys.argv
    return argv[argv.index("--") + 1:] if "--" in argv else argv[1:]


def parse_selection(prog, description):
    parser = argparse.ArgumentParser(prog=prog, description=description)
    parser.add_argument("ids", nargs="*", help="asset ids to process")
    parser.add_argument("--chapter", action="append", default=[],
                        help="process one manifest (common, ch1, ch2, ch3, test); may be repeated")
    parser.add_argument("--all", action="store_true", help="process every manifest")
    args = parser.parse_args(script_args())
    if not (args.ids or args.chapter or args.all):
        parser.error("say what to process: asset ids, --chapter <name>, or --all "
                     "(so that nobody rebuilds another chapter's models by accident)")
    return args


def load_manifests():
    """Every art/manifest/<chapter>.json -> list of asset dicts, each with its "chapter"."""
    assets = []
    for name in sorted(os.listdir(MANIFEST_DIR)):
        if not name.endswith(".json"):
            continue
        chapter = name[:-5]
        with open(os.path.join(MANIFEST_DIR, name), "r", encoding="utf-8") as handle:
            data = json.load(handle)
        for entry in data.get("assets", []):
            asset = dict(entry)
            asset["chapter"] = chapter
            assets.append(asset)
    return assets


def select_assets(args, assets):
    """The assets named by the command line. Chapters skip what is still only planned."""
    by_id = {a["id"]: a for a in assets}
    chapters = {a["chapter"] for a in assets}
    chosen = []
    for asset_id in args.ids:
        if asset_id not in by_id:
            raise SystemExit("unknown asset id %r: add it to a manifest in art/manifest/ first" % asset_id)
        chosen.append(by_id[asset_id])
    for chapter in args.chapter:
        if chapter not in chapters and not os.path.isfile(os.path.join(MANIFEST_DIR, chapter + ".json")):
            raise SystemExit("no manifest art/manifest/%s.json" % chapter)
    for asset in assets:
        wanted = args.all or asset["chapter"] in args.chapter
        if wanted and asset.get("status") != "planned" and asset not in chosen:
            chosen.append(asset)
    return chosen


def triangle_limit(asset):
    limit = CLASS_LIMITS.get(asset.get("class"), 0)
    return min(limit, asset["maxTriangles"]) if "maxTriangles" in asset else limit
