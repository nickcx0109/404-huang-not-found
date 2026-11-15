"""Asset: the object an asset script draws with.

Everything here works in Blender's axes (metres, Z up, front toward -Y, origin at the bottom
centre). Shapes are placed by their bottom centre, coloured per vertex from the shared
palette, and finish() gives them the common grime treatment, so that scripts stay short and
every asset looks like part of the same set.
"""

import math

import bmesh
import bpy
from mathutils import Euler, Matrix, Vector, noise

from .palette import AssetPalette

COLOR_LAYER = "Col"
BASE_MATERIAL = "vertex_color"
# Parts whose material is called glow_<name> are replaced in the game by the palette's
# glowing material of that name (accent, accent_faulty, alarm, screen).
GLOW_PREFIX = "glow_"
PIPELINE_NAME = "404-build_assets"
PIPELINE_VERSION = 1


class AssetError(Exception):
    """A mistake in an asset script, reported with the asset's id."""


class Asset:
    def __init__(self, asset_id, chapter=None):
        self.id = asset_id
        self.chapter = chapter
        self.palette = AssetPalette(chapter)
        self._parts = []
        self._finished = False

    # ---- colours ---------------------------------------------------------------------

    def color(self, name):
        """A named surface colour from the palette, e.g. asset.color("rust")."""
        return self.palette.color(name)

    # ---- shapes ------------------------------------------------------------------------

    def box(self, name, size, at=(0, 0, 0), color=None, glow=None, rot=(0, 0, 0), taper=1.0):
        """Box of size (x, y, z) standing on the point `at` (its bottom centre).

        rot: degrees around X, Y, Z, turning about `at`.
        taper: the top face is this fraction of the bottom face (1 = straight sides).
        """
        sx, sy, sz = size
        hx, hy = sx / 2.0, sy / 2.0
        tx, ty = hx * taper, hy * taper
        verts = [
            (-hx, -hy, 0), (hx, -hy, 0), (hx, hy, 0), (-hx, hy, 0),
            (-tx, -ty, sz), (tx, -ty, sz), (tx, ty, sz), (-tx, ty, sz),
        ]
        faces = [
            (0, 3, 2, 1), (4, 5, 6, 7),
            (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7),
        ]
        return self.mesh(name, verts, faces, at=at, color=color, glow=glow, rot=rot)

    def cylinder(self, name, radius, height, at=(0, 0, 0), color=None, glow=None,
                 segments=12, radius_top=None, rot=(0, 0, 0)):
        """Upright cylinder (or cone, with radius_top) standing on the point `at`."""
        top = radius if radius_top is None else radius_top
        ring = [2.0 * math.pi * i / segments for i in range(segments)]
        verts = [(radius * math.cos(a), radius * math.sin(a), 0) for a in ring]
        verts += [(top * math.cos(a), top * math.sin(a), height) for a in ring]
        faces = [tuple(reversed(range(segments))), tuple(range(segments, segments * 2))]
        for i in range(segments):
            j = (i + 1) % segments
            faces.append((i, j, segments + j, segments + i))
        return self.mesh(name, verts, faces, at=at, color=color, glow=glow, rot=rot)

    def mesh(self, name, verts, faces, at=(0, 0, 0), color=None, glow=None, rot=(0, 0, 0)):
        """Any shape: vertices around the origin, faces counter-clockwise seen from outside."""
        if self._finished:
            raise AssetError("%s: shapes cannot be added after finish()" % self.id)
        if (color is None) == (glow is None):
            raise AssetError(
                "%s: part %r needs either color=asset.color(...) or glow=\"accent\"" % (self.id, name)
            )
        turn = Euler([math.radians(a) for a in rot], "XYZ").to_matrix().to_4x4()
        matrix = Matrix.Translation(Vector(at)) @ turn

        data = bpy.data.meshes.new("%s.%s" % (self.id, name))
        data.from_pydata([tuple(matrix @ Vector(v)) for v in verts], [], [tuple(f) for f in faces])
        data.update()
        if glow is None:
            layer = data.color_attributes.new(COLOR_LAYER, "FLOAT_COLOR", "CORNER")
            rgba = (color[0], color[1], color[2], 1.0)
            for corner in layer.data:
                corner.color = rgba
            data.materials.append(self._base_material())
        else:
            data.materials.append(self._glow_material(glow))

        part = bpy.data.objects.new(data.name, data)
        bpy.context.scene.collection.objects.link(part)
        self._parts.append(part)
        return part

    def align_bottom_center(self):
        """Moves everything so that the asset stands on z = 0, centred on x = y = 0."""
        low, high = self._bounds(self._parts)
        shift = Matrix.Translation(Vector((-(low.x + high.x) / 2.0, -(low.y + high.y) / 2.0, -low.z)))
        for part in self._parts:
            part.data.transform(shift)

    # ---- used by the build tool ------------------------------------------------------------

    def finish(self):
        """Joins the parts, applies the grime treatment and turns the asset to game axes.

        Returns the numbers the tools report: triangles and the size in game axes
        (w along X, h up, d along Z).
        """
        if not self._parts:
            raise AssetError("%s: build() created no shapes" % self.id)
        self._finished = True

        groups = {}
        for part in self._parts:
            groups.setdefault(part.data.materials[0].name, []).append(part)

        joined = []
        for material_name, parts in sorted(groups.items()):
            suffix = "" if material_name == BASE_MATERIAL else "__" + material_name
            joined.append(self._join(self.id + suffix, parts))
        self._parts = joined

        for obj in joined:
            if obj.data.materials[0].name == BASE_MATERIAL:
                self._apply_grime(obj.data)
            # Blender's front is -Y; glTF export maps Blender +Y to the game's -Z (the front).
            obj.data.transform(Matrix.Rotation(math.pi, 4, "Z"))
            obj.data.update()

        low, high = self._bounds(joined)
        triangles = sum(len(p.vertices) - 2 for obj in joined for p in obj.data.polygons)
        stats = {
            "id": self.id,
            "triangles": triangles,
            "size": [round(high.x - low.x, 4), round(high.z - low.z, 4), round(high.y - low.y, 4)],
            "bottom": round(low.z, 4),
            "glow": sorted(n[len(GLOW_PREFIX):] for n in groups if n.startswith(GLOW_PREFIX)),
        }

        # Written into the GLB (scene extras), so check_assets can tell the file came through
        # this pipeline and therefore has the right axes and units.
        scene = bpy.context.scene
        scene["pipeline"] = PIPELINE_NAME
        scene["pipeline_version"] = PIPELINE_VERSION
        scene["asset_id"] = self.id
        scene["unit"] = "m"
        scene["up"] = "+Y"
        scene["front"] = "-Z"
        return stats

    def export_glb(self, path):
        """Writes the finished asset as a binary glTF: +Y up, vertex colours, no textures."""
        if not self._finished:
            raise AssetError("%s: call finish() before export_glb()" % self.id)
        bpy.ops.object.select_all(action="DESELECT")
        bpy.ops.export_scene.gltf(
            filepath=path,
            export_format="GLB",
            use_selection=False,
            export_apply=True,
            export_yup=True,
            export_normals=True,
            export_tangents=False,
            export_texcoords=False,
            export_materials="EXPORT",
            export_vertex_color="MATERIAL",
            export_cameras=False,
            export_lights=False,
            export_animations=False,
            export_extras=True,
        )

    # ---- internals --------------------------------------------------------------------------

    def _base_material(self):
        material = bpy.data.materials.get(BASE_MATERIAL)
        if material is None:
            material = bpy.data.materials.new(BASE_MATERIAL)
            material.use_backface_culling = True  # exported single-sided: cheaper to draw
            material.use_nodes = True
            nodes = material.node_tree.nodes
            shader = nodes["Principled BSDF"]
            colors = nodes.new("ShaderNodeVertexColor")
            colors.layer_name = COLOR_LAYER
            material.node_tree.links.new(colors.outputs["Color"], shader.inputs["Base Color"])
            shader.inputs["Roughness"].default_value = self.palette.style.get("roughness", 0.9)
            shader.inputs["Metallic"].default_value = 0.0
        return material

    def _glow_material(self, glow):
        name = GLOW_PREFIX + glow
        material = bpy.data.materials.get(name)
        if material is None:
            rgb = self.palette.glow_color(glow)
            material = bpy.data.materials.new(name)
            material.use_backface_culling = True
            material.use_nodes = True
            shader = material.node_tree.nodes["Principled BSDF"]
            shader.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1.0)
            shader.inputs["Emission Color"].default_value = (rgb[0], rgb[1], rgb[2], 1.0)
            shader.inputs["Emission Strength"].default_value = 1.0
        return material

    @staticmethod
    def _join(name, parts):
        merged = bmesh.new()
        for part in parts:
            merged.from_mesh(part.data)
        data = bpy.data.meshes.new(name)
        merged.to_mesh(data)
        merged.free()
        data.materials.append(parts[0].data.materials[0])
        for part in parts:
            old = part.data
            bpy.data.objects.remove(part)
            bpy.data.meshes.remove(old)
        obj = bpy.data.objects.new(name, data)
        bpy.context.scene.collection.objects.link(obj)
        return obj

    def _apply_grime(self, data):
        """Desaturates and dirties the vertex colours: blotchy, darker near the ground."""
        style = self.palette.style
        desaturate = style.get("desaturate", 0.0)
        grime = style.get("grime", 0.0)
        scale = max(style.get("grimeScale", 0.5), 1e-3)
        bottom_dirt = style.get("bottomDirt", 0.0)
        dirt_height = max(style.get("dirtHeight", 0.5), 1e-3)
        variation = style.get("faceVariation", 0.0)

        layer = data.color_attributes[COLOR_LAYER]
        for polygon in data.polygons:
            # every face a slightly different shade, so flat surfaces do not look printed
            face_noise = 0.5 + 0.5 * noise.noise(polygon.center * 7.31 + Vector((11.0, 5.0, 3.0)))
            face_factor = 1.0 - variation * face_noise
            for index in polygon.loop_indices:
                point = data.vertices[data.loops[index].vertex_index].co
                r, g, b, _ = layer.data[index].color
                luma = 0.2126 * r + 0.7152 * g + 0.0722 * b
                r += (luma - r) * desaturate
                g += (luma - g) * desaturate
                b += (luma - b) * desaturate
                blotch = 0.5 + 0.5 * noise.noise(point / scale)
                dirt = bottom_dirt * max(0.0, 1.0 - point.z / dirt_height)
                factor = (1.0 - grime * blotch) * (1.0 - dirt) * face_factor
                layer.data[index].color = (r * factor, g * factor, b * factor, 1.0)

    @staticmethod
    def _bounds(objects):
        low = Vector((math.inf, math.inf, math.inf))
        high = Vector((-math.inf, -math.inf, -math.inf))
        for obj in objects:
            for vertex in obj.data.vertices:
                for axis in range(3):
                    low[axis] = min(low[axis], vertex.co[axis])
                    high[axis] = max(high[axis], vertex.co[axis])
        return low, high


def reset_scene():
    """Empties Blender: no default cube, camera or light, nothing left from the last asset."""
    bpy.ops.wm.read_factory_settings(use_empty=True)
