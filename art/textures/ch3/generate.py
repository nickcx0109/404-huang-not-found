"""Paints the chapter 3 surface textures from scratch (no downloaded images).

    python3 art/textures/ch3/generate.py            # writes web/assets/textures/ch3_*.jpg

Needs Pillow and numpy. Every texture is 1024 px, tiles without a seam, and is painted from a
fixed seed, so running it again gives the same files.

Each surface gets two files:
    ch3_<name>.jpg         colour; the palette (art/style/chapters/ch3.json, greybox.surfaces) says
                           which colour key uses it and how many metres one tile covers
    ch3_<name>_rough.jpg   roughness (white = dull, dark = shiny); web/js/props/Ch3Props.js adds it

Walls are painted for a tile as tall as the wall: the bottom of the image is the floor, so the
skirting board, the dirt near the floor and the drips from the ceiling end up where they belong.
"""
import os
import numpy as np
from PIL import Image, ImageDraw, ImageFilter

SIZE = 1024
OUT = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'web', 'assets', 'textures')


def fractal(rng, falloff=1.6, size=SIZE):
    """Noise in 0..1 that wraps around at the edges (filtered in the frequency domain)."""
    spectrum = np.fft.fft2(rng.standard_normal((size, size)))
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    radius = np.sqrt(fx * fx + fy * fy)
    radius[0, 0] = 1
    noise = np.real(np.fft.ifft2(spectrum / radius ** falloff))
    noise -= noise.min()
    return noise / noise.max()


def blur(array, radius):
    """Gaussian blur that wraps around, so painted marks stay seamless."""
    tiled = np.tile(array, (3, 3))
    image = Image.fromarray(np.clip(tiled * 255, 0, 255).astype(np.uint8)).filter(ImageFilter.GaussianBlur(radius))
    return np.asarray(image, dtype=np.float32)[SIZE:SIZE * 2, SIZE:SIZE * 2] / 255


def mask_layer():
    return Image.new('L', (SIZE, SIZE), 0)


def to_array(image):
    return np.asarray(image, dtype=np.float32) / 255


def wrap_draw(draw_fn):
    """Runs a drawing function three times, shifted by one tile, so marks crossing the left or right edge wrap."""
    layer = mask_layer()
    draw = ImageDraw.Draw(layer)
    for shift in (-SIZE, 0, SIZE):
        draw_fn(draw, shift)
    return to_array(layer)


def mix(base, colour, amount):
    """Blends an RGB colour over an RGB image; amount is an array 0..1."""
    return base * (1 - amount[..., None]) + np.array(colour, dtype=np.float32) * amount[..., None]


def save(name, colour, rough):
    os.makedirs(OUT, exist_ok=True)
    Image.fromarray(np.clip(colour, 0, 255).astype(np.uint8)).save(os.path.join(OUT, name + '.jpg'), quality=88)
    grey = np.clip(rough * 255, 0, 255).astype(np.uint8)
    Image.fromarray(grey).save(os.path.join(OUT, name + '_rough.jpg'), quality=85)
    print('wrote', name, colour.shape[:2])


# ---- carpet tiles: one image covers 4 x 4 m = 8 x 8 squares of 0.5 m ---------------------------

def carpet():
    rng = np.random.default_rng(301)
    cells = 8
    cell = SIZE // cells
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    row, col = y // cell, x // cell
    # Each square is a little lighter or darker, and its pile runs along or across.
    shade = rng.uniform(0.9, 1.06, (cells, cells))[row, col]
    along = ((row + col) % 2 == 0)
    fibre_a = blur(rng.random((SIZE, SIZE)), 0.6)
    streak = np.where(along, np.roll(fibre_a, 3, axis=1), np.roll(fibre_a, 3, axis=0))
    fibre = 0.8 + 0.4 * (0.5 * fibre_a + 0.5 * streak)
    base = np.array([86, 97, 108], dtype=np.float32)  # grey blue
    colour = base[None, None, :] * (shade * fibre)[..., None]

    # Seams: a thin dark line with a slightly raised lighter lip next to it.
    seam = ((x % cell) < 2) | ((y % cell) < 2)
    lip = ((x % cell) == 3) | ((y % cell) == 3)
    colour[seam] *= 0.45
    colour[lip] *= 1.08

    # Dirt: broad darkening where people walked and things were spilled, plus a few real stains.
    grime = fractal(rng, 2.0)
    colour *= (0.62 + 0.38 * np.clip(grime * 1.5, 0, 1))[..., None]
    stains = np.clip((fractal(rng, 1.9) - 0.7) * 9, 0, 1)
    colour = mix(colour, (38, 34, 30), stains * 0.8)
    ring = np.clip(1 - np.abs(stains - 0.35) * 6, 0, 1) * (stains > 0.05)
    colour = mix(colour, (30, 27, 24), ring * 0.35)
    # A few squares soaked through.
    soaked = (rng.random((cells, cells)) < 0.08)[row, col]
    colour[soaked] *= 0.7
    # Dust and crumbs.
    specks = rng.random((SIZE, SIZE))
    colour[specks > 0.9975] *= 1.5
    colour[specks < 0.004] *= 0.5

    rough = 0.93 - 0.22 * stains - 0.1 * soaked
    save('ch3_carpet', colour, rough)


# ---- painted wall: one image covers 3.2 m across and the full 3.2 m height ----------------------

def wall():
    rng = np.random.default_rng(302)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    height = 1 - y / SIZE  # 0 at the floor, 1 at the ceiling
    metre = SIZE / 3.2

    paint = np.array([196, 197, 190], dtype=np.float32)  # tired white
    roller = 0.94 + 0.12 * blur(rng.random((SIZE, SIZE)), 1.2)
    patchy = 0.9 + 0.2 * fractal(rng, 2.2)
    colour = paint[None, None, :] * (roller * patchy)[..., None]
    rough = np.full((SIZE, SIZE), 0.78, dtype=np.float32)

    # Dirt gathers on the lower half and thickest just above the skirting board.
    low = np.clip(1 - height / 0.5, 0, 1) ** 1.6
    cloud = fractal(rng, 1.9)
    dirt = np.clip(low * (0.35 + 0.9 * cloud), 0, 1)
    colour = mix(colour, (52, 50, 44), dirt * 0.8)

    # Water running down from the ceiling: thin streaks of different length, some wide and yellowed.
    def drips(draw, shift):
        local = np.random.default_rng(3021)
        for _ in range(46):
            dx = local.integers(0, SIZE) + shift
            length = int(local.uniform(0.15, 0.95) ** 1.5 * SIZE)
            width = int(local.choice([1, 1, 2, 2, 3, 5, 9]))
            wobble = local.uniform(-6, 6)
            draw.line([(dx, 0), (dx + wobble, length)], fill=int(local.uniform(70, 200)), width=width)
    streaks = blur(wrap_draw(drips), 1.4) * np.clip(1.15 - (1 - height) * 0.7, 0, 1)
    colour = mix(colour, (96, 84, 60), np.clip(streaks * 1.1, 0, 1) * 0.7)
    rough += streaks * 0.1

    # Damp patches under the ceiling with a darker rim.
    damp = np.clip((fractal(rng, 2.5) - 0.6) * 6, 0, 1) * np.clip((height - 0.45) * 2.2, 0, 1)
    colour = mix(colour, (120, 104, 74), damp * 0.55)
    rim = np.clip(1 - np.abs(damp - 0.3) * 7, 0, 1) * (damp > 0.03)
    colour = mix(colour, (70, 58, 40), rim * 0.5)

    # Peeled paint: irregular bare patches of grey plaster, with a light curled edge.
    bare = np.clip((fractal(rng, 1.8) - 0.72) * 16, 0, 1)
    edge = np.clip(1 - np.abs(bare - 0.5) * 3.5, 0, 1) * (bare > 0.02) * (bare < 0.98)
    plaster = np.array([118, 114, 104], dtype=np.float32)[None, None, :] * (0.8 + 0.4 * fractal(rng, 1.2))[..., None]
    colour = colour * (1 - bare[..., None]) + plaster * bare[..., None]
    colour = mix(colour, (222, 222, 214), edge * 0.6)
    rough = rough * (1 - bare) + 0.97 * bare

    # Cracks: thin dark lines that wander and branch.
    def cracks(draw, shift):
        local = np.random.default_rng(3022)
        for _ in range(7):
            px, py = float(local.integers(0, SIZE)), float(local.integers(0, int(SIZE * 0.8)))
            angle = local.uniform(0.9, 2.2)
            for step in range(int(local.integers(25, 80))):
                angle += local.uniform(-0.45, 0.45)
                nx, ny = px + np.cos(angle) * 9, py + np.sin(angle) * 9
                draw.line([(px + shift, py), (nx + shift, ny)], fill=255, width=1 if step % 7 else 2)
                if local.random() < 0.06:
                    bx, by = nx + local.uniform(-40, 40), ny + local.uniform(10, 50)
                    draw.line([(nx + shift, ny), (bx + shift, by)], fill=200, width=1)
                px, py = nx, ny
    crack = wrap_draw(cracks)
    colour = mix(colour, (30, 29, 27), np.clip(crack + blur(crack, 1.5) * 0.6, 0, 1) * 0.85)

    # Scuffs from chairs and trolleys low down, greasy hand marks at shoulder height.
    def scuffs(draw, shift):
        local = np.random.default_rng(3023)
        for _ in range(60):
            sx = local.integers(0, SIZE) + shift
            sy = SIZE - int(local.uniform(0.12, 1.0) * metre)
            length = local.uniform(20, 150)
            draw.line([(sx, sy), (sx + length, sy + local.uniform(-7, 7))], fill=int(local.uniform(90, 230)), width=int(local.integers(1, 4)))
    scuff = blur(wrap_draw(scuffs), 0.8)
    colour = mix(colour, (26, 25, 24), scuff * 0.75)

    def hands(draw, shift):
        local = np.random.default_rng(3024)
        for _ in range(9):
            hx = local.integers(0, SIZE) + shift
            hy = SIZE - int(local.uniform(1.0, 1.5) * metre)
            for finger in range(5):
                fx = hx + finger * 9 - 18
                draw.ellipse([fx - 4, hy - 30 - (6 if finger in (1, 2) else 0), fx + 4, hy], fill=150)
            draw.ellipse([hx - 22, hy - 6, hx + 22, hy + 30], fill=150)
            draw.line([(hx, hy + 20), (hx + local.uniform(-10, 10), hy + local.uniform(60, 200))], fill=90, width=26)
    grease = blur(wrap_draw(hands), 9)
    colour = mix(colour, (70, 62, 50), grease * 0.32)
    rough -= grease * 0.3

    # Mould spots creeping up from the floor.
    mould = np.clip((fractal(rng, 1.5) - 0.63) * 8, 0, 1) * np.clip(1 - height / 0.22, 0, 1)
    colour = mix(colour, (24, 30, 24), mould * 0.85)

    # Skirting board along the floor: dark grey, a shadow line on top, scraped.
    board = height < (0.1 / 3.2)
    board_colour = np.array([58, 60, 62], dtype=np.float32)[None, None, :] * (0.75 + 0.5 * fractal(rng, 1.4))[..., None]
    colour[board] = board_colour[board]
    lip = (height >= 0.1 / 3.2) & (height < 0.115 / 3.2)
    colour[lip] *= 0.4
    rough[board] = 0.6
    save('ch3_wall', colour, rough)


# ---- suspended ceiling: one image covers 2.4 x 2.4 m = 4 x 4 tiles of 0.6 m ---------------------

def ceiling():
    rng = np.random.default_rng(303)
    cells = 4
    cell = SIZE // cells
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    row, col = y // cell, x // cell
    tile = np.array([176, 176, 168], dtype=np.float32)
    shade = rng.uniform(0.86, 1.05, (cells, cells))[row, col]
    colour = tile[None, None, :] * (shade * (0.92 + 0.16 * blur(rng.random((SIZE, SIZE)), 0.8)))[..., None]
    # Pinholes of the mineral-fibre board.
    holes = rng.random((SIZE, SIZE)) > 0.985
    colour[holes] *= 0.45
    fissures = np.clip((blur(rng.random((SIZE, SIZE)), 1.0) - 0.56) * 30, 0, 1)
    colour *= (1 - 0.3 * fissures)[..., None]

    # Water stains: brown patches with a darker rim, on a few tiles more than on others.
    wet_tiles = (rng.random((cells, cells)) < 0.4)[row, col]
    stain = np.clip((fractal(rng, 2.4) - 0.55) * 5, 0, 1) * (0.25 + 0.75 * wet_tiles)
    colour = mix(colour, (112, 88, 52), stain * 0.75)
    rim = np.clip(1 - np.abs(stain - 0.35) * 6, 0, 1) * (stain > 0.04)
    colour = mix(colour, (60, 44, 26), rim * 0.6)
    # General soot and dust.
    colour *= (0.72 + 0.28 * fractal(rng, 1.8))[..., None]

    # The metal grid between the tiles: light rail with a dark gap on each side.
    px, py = x % cell, y % cell
    rail = (px < 10) | (py < 10)
    gap = ((px >= 10) & (px < 13)) | ((py >= 10) & (py < 13)) | (px > cell - 3) | (py > cell - 3)
    colour[gap] *= 0.35
    rail_colour = np.array([150, 152, 150], dtype=np.float32)[None, None, :] * (0.8 + 0.3 * fractal(rng, 1.3))[..., None]
    colour[rail] = rail_colour[rail]

    rough = np.full((SIZE, SIZE), 0.96, dtype=np.float32) - 0.12 * stain
    rough[rail] = 0.5
    save('ch3_ceiling', colour, rough)


# ---- furniture surfaces ---------------------------------------------------------------------

def fabric():
    """Partition and chair cloth: a fine weave, faded, with stains and a few tears. Covers 1.2 m."""
    rng = np.random.default_rng(304)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    weave = 0.5 + 0.25 * np.sin(x * np.pi / 2) * np.sin(y * np.pi / 2) + 0.25 * rng.random((SIZE, SIZE))
    base = np.array([92, 104, 118], dtype=np.float32)
    colour = base[None, None, :] * (0.7 + 0.5 * weave)[..., None] * (0.82 + 0.3 * fractal(rng, 2.0))[..., None]
    stain = np.clip((fractal(rng, 1.7) - 0.68) * 8, 0, 1)
    colour = mix(colour, (44, 40, 34), stain * 0.75)
    tear = np.clip((fractal(rng, 1.3) - 0.8) * 30, 0, 1)
    colour = mix(colour, (150, 140, 110), tear * 0.9)  # yellowed foam showing through
    low = np.clip(1 - (1 - y / SIZE) / 0.3, 0, 1)
    colour = mix(colour, (30, 28, 26), low * 0.5 * fractal(rng, 1.7))
    save('ch3_fabric', colour, 0.95 - 0.25 * stain)


def laminate():
    """Desk top: pale wood-grain laminate with dust, scratches and rings left by mugs. Covers 1.2 x 0.6 m."""
    rng = np.random.default_rng(305)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    grain = fractal(rng, 2.2)
    lines = 0.5 + 0.5 * np.sin((y / SIZE) * 2 * np.pi * 24 + grain * 14)
    base = np.array([170, 152, 124], dtype=np.float32)
    colour = base[None, None, :] * (0.8 + 0.22 * lines)[..., None] * (0.85 + 0.25 * fractal(rng, 1.8))[..., None]
    dust = fractal(rng, 1.6)
    colour = mix(colour, (120, 118, 110), np.clip(dust * 1.2 - 0.3, 0, 1) * 0.5)
    rough = 0.45 + 0.45 * np.clip(dust * 1.2 - 0.2, 0, 1)

    def rings(draw, shift):
        local = np.random.default_rng(3051)
        for _ in range(11):
            cx, cy, r = local.integers(0, SIZE) + shift, local.integers(40, SIZE - 40), local.integers(26, 40)
            draw.ellipse([cx - r, cy - r * 2, cx + r, cy + r * 2], outline=int(local.uniform(110, 230)), width=3)
    ring = blur(wrap_draw(rings), 1.0)
    colour = mix(colour, (70, 54, 36), ring * 0.7)

    def scratches(draw, shift):
        local = np.random.default_rng(3052)
        for _ in range(70):
            sx, sy = local.integers(0, SIZE) + shift, local.integers(0, SIZE)
            draw.line([(sx, sy), (sx + local.uniform(-120, 120), sy + local.uniform(-30, 30))], fill=int(local.uniform(80, 220)), width=1)
    scratch = wrap_draw(scratches)
    colour = mix(colour, (214, 206, 190), scratch * 0.55)
    spill = np.clip((fractal(rng, 1.8) - 0.75) * 12, 0, 1)
    colour = mix(colour, (52, 42, 30), spill * 0.7)
    save('ch3_laminate', colour, np.clip(rough - 0.3 * spill, 0.1, 1))


def metal():
    """Painted sheet metal (cabinets, lift doors, racks): scratches, dents and rust creeping in. Covers 1 m."""
    rng = np.random.default_rng(306)
    base = np.array([112, 118, 122], dtype=np.float32)
    colour = base[None, None, :] * (0.82 + 0.3 * fractal(rng, 2.1))[..., None]
    brushed = blur(rng.random((SIZE, SIZE)), 0.5)
    colour *= (0.92 + 0.16 * np.roll(brushed, 5, axis=1))[..., None]
    rough = np.full((SIZE, SIZE), 0.42, dtype=np.float32)

    def scratches(draw, shift):
        local = np.random.default_rng(3061)
        for _ in range(120):
            sx, sy = local.integers(0, SIZE) + shift, local.integers(0, SIZE)
            draw.line([(sx, sy), (sx + local.uniform(-160, 160), sy + local.uniform(-50, 50))], fill=int(local.uniform(90, 255)), width=int(local.choice([1, 1, 1, 2])))
    scratch = wrap_draw(scratches)
    colour = mix(colour, (190, 194, 196), scratch * 0.6)
    rough -= scratch * 0.2
    dent = fractal(rng, 2.6)
    colour *= (0.8 + 0.4 * np.clip(dent, 0, 1))[..., None]
    rust = np.clip((fractal(rng, 1.7) - 0.6) * 7, 0, 1)
    speck = (rng.random((SIZE, SIZE)) > 0.6) * rust
    colour = mix(colour, (74, 50, 36), np.clip(rust * 0.8 + speck * 0.3, 0, 1))
    y = np.mgrid[0:SIZE, 0:SIZE][0]
    runs = blur(np.clip(rust - 0.3, 0, 1) * (rng.random((SIZE, SIZE)) > 0.5), 0.5)
    runs = np.maximum.reduce([np.roll(runs, k, axis=0) * (1 - k / 90) for k in range(0, 90, 6)])
    colour = mix(colour, (66, 46, 34), np.clip(runs, 0, 1) * 0.5)
    rough = np.clip(rough + 0.5 * rust, 0.15, 1)
    save('ch3_metal', colour, rough)


def tile():
    """Floor tiles for the lift lobby: 0.6 m squares with dirty grout, cracks and dried puddles. Covers 2.4 m."""
    rng = np.random.default_rng(307)
    cells = 4
    cell = SIZE // cells
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    row, col = y // cell, x // cell
    base = np.array([150, 152, 146], dtype=np.float32)
    shade = rng.uniform(0.9, 1.05, (cells, cells))[row, col]
    colour = base[None, None, :] * (shade * (0.88 + 0.2 * fractal(rng, 1.5)))[..., None]
    grime = fractal(rng, 2.0)
    colour = mix(colour, (48, 46, 40), np.clip(grime * 1.4 - 0.45, 0, 1) * 0.8)
    puddle = np.clip((fractal(rng, 2.4) - 0.62) * 8, 0, 1)
    rim = np.clip(1 - np.abs(puddle - 0.3) * 6, 0, 1) * (puddle > 0.03)
    colour = mix(colour, (60, 52, 40), rim * 0.6)
    px, py = x % cell, y % cell
    grout = (px < 5) | (py < 5)
    colour[grout] = np.array([40, 38, 34], dtype=np.float32)

    def cracks(draw, shift):
        local = np.random.default_rng(3071)
        for _ in range(5):
            cx, cy = float(local.integers(0, SIZE)), float(local.integers(0, SIZE))
            angle = local.uniform(0, 6.28)
            for _ in range(int(local.integers(12, 40))):
                angle += local.uniform(-0.5, 0.5)
                nx, ny = cx + np.cos(angle) * 10, cy + np.sin(angle) * 10
                draw.line([(cx + shift, cy), (nx + shift, ny)], fill=255, width=1)
                cx, cy = nx, ny
    crack = wrap_draw(cracks)
    colour = mix(colour, (24, 23, 22), crack * 0.9)
    rough = 0.25 + 0.6 * np.clip(grime * 1.4 - 0.3, 0, 1)
    rough[grout] = 0.95
    save('ch3_tile', colour, np.clip(rough - 0.1 * puddle, 0.1, 1))


def cardboard():
    """Cardboard for boxes: corrugation lines, tape, damp corners. Covers 1 m."""
    rng = np.random.default_rng(308)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    base = np.array([150, 118, 78], dtype=np.float32)
    flute = 0.94 + 0.06 * np.sin(x * np.pi / 3)
    colour = base[None, None, :] * (flute * (0.8 + 0.35 * fractal(rng, 1.9)))[..., None]
    damp = np.clip((fractal(rng, 2.2) - 0.55) * 5, 0, 1)
    colour = mix(colour, (62, 46, 30), damp * 0.8)
    tape = (np.abs((y % 512) - 256) < 22)
    colour[tape] = colour[tape] * 0.5 + np.array([150, 136, 100], dtype=np.float32) * 0.5
    save('ch3_cardboard', colour, 0.9 - 0.2 * damp)


def board():
    """Rough planks for boarded-up openings: 6 planks across 1.2 m, nail holes, splits."""
    rng = np.random.default_rng(309)
    y, x = np.mgrid[0:SIZE, 0:SIZE]
    planks = 6
    width = SIZE // planks + 1
    index = y // width
    tone = rng.uniform(0.75, 1.1, planks + 1)[index]
    grain = fractal(rng, 2.0)
    lines = 0.5 + 0.5 * np.sin((y / SIZE) * 2 * np.pi * 60 + grain * 18 + index * 2.1)
    base = np.array([124, 96, 64], dtype=np.float32)
    colour = base[None, None, :] * (tone * (0.72 + 0.3 * lines))[..., None]
    gap = (y % width) < 4
    colour[gap] *= 0.25
    knots = np.clip((fractal(rng, 1.4) - 0.8) * 25, 0, 1)
    colour = mix(colour, (48, 34, 22), knots * 0.8)
    colour *= (0.75 + 0.3 * fractal(rng, 1.7))[..., None]
    save('ch3_board', colour, np.full((SIZE, SIZE), 0.9, dtype=np.float32) - 0.1 * knots)


if __name__ == '__main__':
    fabric()
    laminate()
    metal()
    tile()
    cardboard()
    board()
    carpet()
    wall()
    ceiling()
