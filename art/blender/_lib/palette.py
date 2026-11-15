"""Colours and the shared grime treatment, read from art/style/palette.json ("_assets").

Asset scripts never write a colour themselves: they ask for one by name, so that every
asset draws from the same small set and the set can be retuned in one place.
"""

import json
import os

REPO_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
PALETTE_PATH = os.path.join(REPO_ROOT, "art", "style", "palette.json")
CHAPTER_DIR = os.path.join(REPO_ROOT, "art", "style", "chapters")


def srgb_to_linear(channel):
    """One sRGB channel (0..1) to linear light, as Blender and glTF vertex colours expect."""
    if channel <= 0.04045:
        return channel / 12.92
    return ((channel + 0.055) / 1.055) ** 2.4


def hex_to_linear(text):
    """'#rrggbb' -> (r, g, b) in linear light."""
    value = text.lstrip("#")
    if len(value) != 6:
        raise ValueError("colour must look like #rrggbb, got %r" % text)
    return tuple(srgb_to_linear(int(value[i:i + 2], 16) / 255.0) for i in (0, 2, 4))


def _read_json(path):
    with open(path, "r", encoding="utf-8") as handle:
        return json.load(handle)


class AssetPalette:
    """The "_assets" section of palette.json, plus the colours a chapter file adds to it."""

    def __init__(self, chapter=None):
        root = _read_json(PALETTE_PATH)
        shared = root.get("_assets", {})
        self.style = dict(shared.get("style", {}))
        self.colors = dict(shared.get("colors", {}))

        # Glowing parts get their real colour in the game, from the palette block of the level.
        # These are only what the preview renders show.
        default = root.get("default", {})
        accent = default.get("accent", {}).get("color", "#ffffff")
        self.glow = {
            "accent": accent,
            "accent_faulty": accent,
            "alarm": default.get("alarm", {}).get("color", "#ff0000"),
            "screen": default.get("greybox", {}).get("screen", {}).get("color", "#ffffff"),
        }

        chapter_file = os.path.join(CHAPTER_DIR, "%s.json" % chapter) if chapter else None
        if chapter_file and os.path.isfile(chapter_file):
            block = _read_json(chapter_file)
            self.colors.update(block.get("_assets", {}).get("colors", {}))
            chapter_accent = block.get("accent", {}).get("color")
            if chapter_accent:
                self.glow["accent"] = chapter_accent
                self.glow["accent_faulty"] = chapter_accent

    def color(self, name):
        """Linear (r, g, b) of a named surface colour."""
        if name not in self.colors:
            raise KeyError(
                "unknown asset colour %r. Known: %s. Add new ones to \"_assets\".\"colors\" in "
                "art/style/palette.json (shared) or in your chapter's file under art/style/chapters/."
                % (name, ", ".join(sorted(self.colors)))
            )
        return hex_to_linear(self.colors[name])

    def glow_color(self, name):
        """Linear (r, g, b) used to preview a glowing part."""
        if name not in self.glow:
            raise KeyError("unknown glow %r. Known: %s" % (name, ", ".join(sorted(self.glow))))
        return hex_to_linear(self.glow[name])
