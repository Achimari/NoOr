#!/usr/bin/env python3.11
"""Build the Sacred Press image plates.

A plate is a printed photograph: monochrome, halftoned, and toned to the paper
it sits on, so it reads as ink on the sheet rather than as a photo pasted over
it. Two plates are produced here, and both are honest about where they come
from:

  gateway   the project's own sky photograph (`public/videos/ambient-sky.jpg`),
            transformed into a duotone halftone. Same picture, art-directed as
            a print plate. No new imagery is invented and nothing is scraped.

  terrain   an original engraving, generated here from value-noise contour
            bands. Nothing is traced, sampled or copied; it is drawn by this
            script from a seeded generator, so it is original work owned by the
            project and reproducible byte for byte.

Every plate is written at two widths as AVIF and WebP, with a JPEG fallback, so
`<picture>` can pick the smallest format the browser understands and the markup
can declare real intrinsic dimensions.

Run from `Node/app`:

    python3.11 -m pip install -r scripts/font-requirements.txt
    python3.11 scripts/build-press-plates.py
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image, ImageFilter

APP_ROOT = Path(__file__).resolve().parent.parent
PLATES_DIR = APP_ROOT / "public" / "images" / "plates"
SKY_SOURCE = APP_ROOT / "public" / "videos" / "ambient-sky.jpg"

# The paper and ink the plates are toned to, so a plate shares the sheet's
# colour instead of sitting on it as a grey rectangle. Kept in step with
# --paper / --ink in public/styles/variables.css.
#
# These were a mineral beige and a warm graphite until 2026-09-12. The press
# runs black on white now, and no amount of CSS can pull a warm tint back out of
# a baked pixel, so the tone is fixed here at the source and every plate is
# rebuilt from it. `test/plate-neutrality.test.js` decodes the shipped files and
# holds them to a measured neutrality tolerance.
PAPER = np.array([0xFF, 0xFF, 0xFF], dtype=np.float64)
INK = np.array([0x00, 0x00, 0x00], dtype=np.float64)

SEED = 20260911  # pinned, so the generated engraving is reproducible

# Ink coverage below this is dropped to bare paper: see `press()`.
MIN_DOT = 0.055


def halftone(gray: np.ndarray, cell: float, angle_degrees: float) -> np.ndarray:
    """A classic rotated-screen halftone, as a 0..1 coverage map.

    The screen is a rotated sine grid; where the image is dark the dot grows
    until neighbouring dots merge, which is exactly what an offset press does.
    """
    height, width = gray.shape
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float64)
    theta = np.radians(angle_degrees)
    u = (xs * np.cos(theta) - ys * np.sin(theta)) / cell
    v = (xs * np.sin(theta) + ys * np.cos(theta)) / cell

    # 0 at a cell centre, 1 at its corner: the distance the dot has to grow.
    screen = (np.cos(2 * np.pi * u) * np.cos(2 * np.pi * v) + 1) / 2
    return np.clip((1.0 - gray) - screen + 0.5, 0.0, 1.0)


def press(gray: np.ndarray, cell: float, blend: float, angle_degrees: float = 15.0) -> np.ndarray:
    """Blends continuous tone with a halftone screen into one ink coverage map.

    A pure halftone is the most faithful print simulation and the least
    compressible thing you can put on a page: the dot grid is high-frequency
    noise, and it cost roughly ten times the bytes for no visible gain at the
    sizes these plates are actually displayed at. Blending the screen back into
    the continuous tone keeps the printed texture where the eye looks for it —
    the mid-tones and the edges of the clouds — at a fraction of the weight.
    """
    continuous = 1.0 - gray
    coverage = np.clip(continuous * (1 - blend) + halftone(gray, cell, angle_degrees) * blend, 0.0, 1.0)

    # The smallest dot the press can hold. Below it the plate carries no ink at
    # all, which is what makes a plate's white the same white as the sheet it
    # sits on — a screen that keeps laying down 2% everywhere turns the whole
    # image into a faintly grey rectangle on a white page, and that is exactly
    # what it looked like before this clamp.
    return np.where(coverage < MIN_DOT, 0.0, coverage)


def tone(coverage: np.ndarray) -> Image.Image:
    """Lays an ink coverage map onto the paper colour."""
    rgb = PAPER[None, None, :] * (1 - coverage[..., None]) + INK[None, None, :] * coverage[..., None]
    return Image.fromarray(np.clip(rgb, 0, 255).astype(np.uint8), "RGB")


def value_noise(shape: tuple[int, int], octaves: int, rng: np.random.Generator) -> np.ndarray:
    """Seeded multi-octave value noise, normalised to 0..1."""
    height, width = shape
    total = np.zeros(shape, dtype=np.float64)
    amplitude = 1.0
    weight = 0.0
    for octave in range(octaves):
        cells = 2 ** (octave + 2)
        lattice = rng.random((cells + 1, cells + 1))
        layer = np.array(
            Image.fromarray((lattice * 255).astype(np.uint8)).resize((width, height), Image.BICUBIC),
            dtype=np.float64,
        ) / 255.0
        total += layer * amplitude
        weight += amplitude
        amplitude *= 0.5
    total /= weight
    return (total - total.min()) / (total.max() - total.min())



# ---------------------------------------------------------------------------
# A small software renderer, so the remaining plates can be modelled rather
# than drawn.
#
# The two plates above are a photograph and a noise field. The four below are
# objects — a book, two hands, a bust, an arena — and an object drawn as 2D
# noise looks like noise. So the geometry is built as signed distance fields,
# sphere-traced here, lit by one key light plus a bounced fill, and handed to
# the same `press()` screen every other plate goes through. Nothing is traced,
# sampled, photographed or downloaded: every surface below is an equation in
# this file, which is what makes these original project-owned work.
#
# Everything is vectorised over whole rays at once. `march` keeps an active
# mask so a ray that has converged or left the scene stops costing anything.
# ---------------------------------------------------------------------------


def _v(x: float, y: float, z: float) -> np.ndarray:
    return np.array([x, y, z], dtype=np.float32)


def sd_sphere(p: np.ndarray, centre: np.ndarray, radius: float) -> np.ndarray:
    return np.linalg.norm(p - centre, axis=-1) - radius


def sd_ellipsoid(p: np.ndarray, centre: np.ndarray, radii: np.ndarray) -> np.ndarray:
    """The usual bounded approximation: exact enough for a lit surface."""
    q = (p - centre) / radii
    k0 = np.linalg.norm(q, axis=-1)
    k1 = np.linalg.norm(q / radii, axis=-1)
    return np.where(k0 > 0, k0 * (k0 - 1.0) / np.maximum(k1, 1e-6), -radii.min())


def sd_capsule(p: np.ndarray, a: np.ndarray, b: np.ndarray, ra: float, rb: float | None = None) -> np.ndarray:
    """A round cone when the two radii differ — which is how a finger tapers."""
    rb = ra if rb is None else rb
    pa = p - a
    ba = b - a
    denom = float(np.dot(ba, ba)) or 1e-6
    h = np.clip((pa @ ba) / denom, 0.0, 1.0)
    return np.linalg.norm(pa - h[..., None] * ba, axis=-1) - (ra + (rb - ra) * h)


def sd_box(p: np.ndarray, centre: np.ndarray, half: np.ndarray, radius: float = 0.0) -> np.ndarray:
    q = np.abs(p - centre) - half
    outside = np.linalg.norm(np.maximum(q, 0.0), axis=-1)
    inside = np.minimum(q.max(axis=-1), 0.0)
    return outside + inside - radius


def smin(a: np.ndarray, b: np.ndarray, k: float) -> np.ndarray:
    """Polynomial smooth minimum: the joint between two masses."""
    h = np.clip(0.5 + 0.5 * (b - a) / k, 0.0, 1.0)
    return b * (1 - h) + a * h - k * h * (1 - h)


def rot_x(p: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    out = np.empty_like(p)
    out[..., 0] = p[..., 0]
    out[..., 1] = c * p[..., 1] + s * p[..., 2]
    out[..., 2] = -s * p[..., 1] + c * p[..., 2]
    return out


def rot_y(p: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    out = np.empty_like(p)
    out[..., 0] = c * p[..., 0] - s * p[..., 2]
    out[..., 1] = p[..., 1]
    out[..., 2] = s * p[..., 0] + c * p[..., 2]
    return out


def rot_z(p: np.ndarray, angle: float) -> np.ndarray:
    c, s = np.cos(angle), np.sin(angle)
    out = np.empty_like(p)
    out[..., 0] = c * p[..., 0] - s * p[..., 1]
    out[..., 1] = s * p[..., 0] + c * p[..., 1]
    out[..., 2] = p[..., 2]
    return out


def camera_rays(width: int, height: int, eye, target, fov_degrees: float, samples: int):
    """Primary rays for a supersampled frame, as flat (N, 3) arrays."""
    eye = np.asarray(eye, dtype=np.float32)
    target = np.asarray(target, dtype=np.float32)
    forward = target - eye
    forward /= np.linalg.norm(forward)
    right = np.cross(forward, _v(0, 1, 0))
    right /= np.linalg.norm(right)
    up = np.cross(right, forward)

    w, h = width * samples, height * samples
    # Pixel centres, so the supersampled grid is symmetric about the frame.
    xs = (np.arange(w, dtype=np.float32) + 0.5) / w * 2 - 1
    ys = 1 - (np.arange(h, dtype=np.float32) + 0.5) / h * 2
    gx, gy = np.meshgrid(xs, ys)
    scale = np.tan(np.radians(fov_degrees) * 0.5)
    aspect = w / h

    directions = (
        forward[None, None, :]
        + right[None, None, :] * (gx * scale * aspect)[..., None]
        + up[None, None, :] * (gy * scale)[..., None]
    ).astype(np.float32)
    directions /= np.linalg.norm(directions, axis=-1, keepdims=True)
    return eye, directions.reshape(-1, 3), (h, w)


def march(scene, eye, directions, bound_centre, bound_radius, steps=110, far=40.0):
    """Sphere-trace every ray at once; returns (hit, distance).

    Rays that miss the scene's bounding sphere are discarded before the first
    evaluation, which is what keeps a full-frame background from costing the
    same as the subject.
    """
    origin = np.asarray(eye, dtype=np.float32)
    centre = np.asarray(bound_centre, dtype=np.float32)

    oc = origin - centre
    b = directions @ oc
    c = float(oc @ oc) - bound_radius ** 2
    disc = b * b - c
    active = disc > 0

    t = np.zeros(len(directions), dtype=np.float32)
    t[active] = np.maximum(-b[active] - np.sqrt(disc[active]), 0.0)
    hit = np.zeros(len(directions), dtype=bool)

    for _ in range(steps):
        idx = np.flatnonzero(active)
        if idx.size == 0:
            break
        points = origin[None, :] + directions[idx] * t[idx][:, None]
        d = scene(points).astype(np.float32)
        t[idx] += np.maximum(d, 1e-4)
        landed = d < 1.2e-3
        hit[idx[landed]] = True
        active[idx[landed | (t[idx] > far)]] = False

    return hit, t


def normals(scene, points, epsilon=8e-4):
    """Central differences. Only ever evaluated on rays that actually hit."""
    out = np.empty_like(points)
    for axis in range(3):
        offset = np.zeros(3, dtype=np.float32)
        offset[axis] = epsilon
        out[:, axis] = scene(points + offset) - scene(points - offset)
    return out / np.maximum(np.linalg.norm(out, axis=-1, keepdims=True), 1e-6)


def occlusion(scene, points, normal, samples=5, span=0.22):
    """Cheap ambient occlusion: how much the surface blocks its own sky."""
    total = np.zeros(len(points), dtype=np.float32)
    weight = 0.0
    for i in range(1, samples + 1):
        step = span * i / samples
        d = scene(points + normal * step)
        total += (step - d) * (0.75 ** i)
        weight += (0.75 ** i) * step
    return np.clip(1.0 - total / max(weight, 1e-6) * 0.55, 0.0, 1.0)


def shade(scene, width, height, eye, target, fov, build_scene, key=(-0.52, 0.78, 0.35),
          samples=2, ambient=0.20, bound=(0, 0, 0), bound_radius=6.0, background=1.0,
          ground_fade=None):
    """Renders one lit greyscale frame, 1.0 = paper white, 0.0 = full ink."""
    eye, directions, (h, w) = camera_rays(width, height, eye, target, fov, samples)
    hit, t = march(scene, eye, directions, bound, bound_radius)

    image = np.full(len(directions), float(background), dtype=np.float32)
    idx = np.flatnonzero(hit)
    if idx.size:
        points = np.asarray(eye, dtype=np.float32)[None, :] + directions[idx] * t[idx][:, None]
        n = normals(scene, points)

        light = np.asarray(key, dtype=np.float32)
        light /= np.linalg.norm(light)
        lambert = np.clip(n @ light, 0.0, 1.0)

        # A bounced fill from below, so nothing in shadow goes to dead black:
        # a plate has to hold midtone structure to survive downsampling.
        fill = np.clip(n @ _v(0.35, -0.55, 0.6) / np.linalg.norm(_v(0.35, -0.55, 0.6)), 0.0, 1.0)

        ao = occlusion(scene, points, n)
        value = ambient * ao + 0.74 * lambert * ao + 0.22 * fill * ao
        image[idx] = np.clip(value, 0.0, 1.0)

        if ground_fade is not None:
            # Let the far ground dissolve into the paper instead of ending on a
            # hard rectangle: a plate has a horizon, not a crop.
            depth = t[idx]
            near, far_ = ground_fade
            k = np.clip((depth - near) / max(far_ - near, 1e-6), 0.0, 1.0)
            image[idx] = image[idx] * (1 - k) + background * k

    frame = image.reshape(h, w)
    if samples > 1:
        frame = frame.reshape(height, samples, width, samples).mean(axis=(1, 3))
    return frame.astype(np.float64)


def engrave(gray: np.ndarray, cell: float, blend: float, angle: float = 15.0,
            floor: float = 0.0, gamma: float = 1.0) -> np.ndarray:
    """Tone curve, then the shared press screen. One family for every plate."""
    toned = np.clip((gray - floor) / max(1.0 - floor, 1e-6), 0.0, 1.0) ** gamma
    return press(toned, cell=cell, blend=blend, angle_degrees=angle)


def build_gateway(width: int, height: int) -> Image.Image:
    """The project's own sky photograph, printed as a duotone halftone."""
    source = Image.open(SKY_SOURCE).convert("L")

    # Cover-crop to the plate's aspect before anything else, so the halftone
    # screen is never stretched — a stretched screen reads as a moire fault.
    scale = max(width / source.width, height / source.height)
    resized = source.resize((round(source.width * scale), round(source.height * scale)), Image.LANCZOS)
    left = (resized.width - width) // 2
    top = int((resized.height - height) * 0.42)
    gray = np.asarray(resized.crop((left, top, left + width, top + height)), dtype=np.float64) / 255.0

    # Press curve: crush the sky to a real black and hold the cloud highlights,
    # so the plate has weight beside the display type it sits next to.
    gray = np.clip((gray - 0.04) / 0.68, 0, 1) ** 2.0

    # A bottom vignette, so the plate gains weight where the page meets it.
    rows = np.linspace(0, 1, height)[:, None]
    gray = np.clip(gray * (1 - 0.30 * np.clip((rows - 0.45) / 0.55, 0, 1) ** 1.6), 0, 1)

    coverage = press(gray, cell=width / 218, blend=0.35)
    return tone(coverage).filter(ImageFilter.GaussianBlur(0.4))


def build_terrain(width: int, height: int) -> Image.Image:
    """An original contour engraving, drawn from seeded noise."""
    rng = np.random.default_rng(SEED)
    field = value_noise((height, width), octaves=6, rng=rng)

    # A radial bias turns the noise field into a landmass reading from a single
    # high ground, which is what makes it read as terrain rather than as static.
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float64)
    cx, cy = width * 0.46, height * 0.44
    radius = np.hypot((xs - cx) / (width * 0.62), (ys - cy) / (height * 0.62))
    elevation = np.clip(field * 0.72 + (1 - np.clip(radius, 0, 1)) * 0.52, 0, 1)

    # Contour lines: the fractional part of the elevation, banded. A line is
    # drawn where the elevation crosses a step, and thickens with the local
    # gradient so flat ground reads open and steep ground reads dense.
    steps = 26
    banded = elevation * steps
    distance = np.abs(banded - np.round(banded))
    gy, gx = np.gradient(elevation)
    slope = np.hypot(gx, gy)
    slope = slope / (slope.max() or 1)

    line = np.clip(1.0 - distance / (0.085 + slope * 0.5), 0, 1) ** 1.6

    # Every fifth contour is an index line, printed heavier, as on a real map.
    index = np.where(np.abs(np.round(banded) % 5) < 0.5, 1.0, 0.55)
    coverage = np.clip(line * index * 0.94, 0, 1)

    # A light stipple in the low ground, so the plate has a printed tooth.
    stipple = value_noise((height, width), octaves=7, rng=np.random.default_rng(SEED + 1))
    coverage = np.clip(coverage + (stipple > 0.82) * (1 - elevation) * 0.30, 0, 1)

    return tone(coverage)



# ---------------------------------------------------------------------------
# The four modelled plates.
# ---------------------------------------------------------------------------


def _leaf(p, side, dihedral, reach, thickness, curl, span=1.0):
    """One leaf of an open book.

    The spine runs along Z at the origin. A leaf is a thin slab rotated up out
    of the horizontal about that spine by `dihedral`, then bowed: pages do not
    lie flat, they fall away toward the fore-edge, and that curve is most of
    what makes a book read as open rather than as a folded card.
    """
    # rot_z rotates the sampling point, so the sign is inverted to lift the
    # fore-edge and leave the spine as the low gutter it is on a real book.
    q = rot_z(p, -side * dihedral)
    x = q[..., 0] * side
    u = np.clip(x / reach, 0.0, 1.0)
    # The bow. Flat at the spine, falling and then dropping at the fore-edge.
    q = q.copy()
    q[..., 1] = q[..., 1] + curl * u ** 1.9 + 0.30 * curl * np.clip(u - 0.80, 0, 1) ** 2 * 12.0
    centre = _v(side * reach * 0.5, 0.0, 0.0)
    half = _v(reach * 0.5, thickness, span)
    return sd_box(q, centre, half, radius=0.010)


def build_book(width: int, height: int) -> Image.Image:
    """An open book seen obliquely: two bowed leaves over a stack of edges.

    Modelled, not photographed. The block of pages under each leaf is a set of
    progressively shorter, progressively flatter slabs, which is what gives a
    real book its stepped fore-edge — the only place this plate carries fine
    detail, and the reason it survives being printed small.
    """
    leaves = 16
    top_dihedral = np.radians(13.0)

    def scene(p):
        q = rot_y(p, np.radians(-24.0))
        q = rot_x(q, np.radians(-4.0))

        d = None
        for i in range(leaves + 1):
            k = i / leaves
            # Each sheet down the block sits lower, opens a little flatter and
            # reaches a little less far than the one above it.
            drop = 0.026 * i
            dihedral = top_dihedral * (1.0 - 0.72 * k)
            reach = 1.50 - 0.085 * k
            curl = -0.150 * (1.0 - 0.80 * k)
            thickness = 0.009 if i else 0.013
            sheet = np.minimum(
                _leaf(q + _v(0, drop, 0), +1.0, dihedral, reach, thickness, curl),
                _leaf(q + _v(0, drop, 0), -1.0, dihedral, reach, thickness, curl),
            )
            d = sheet if d is None else np.minimum(d, sheet)

        # The covers: one step wider than the block, and squared off.
        base = 0.026 * leaves + 0.034
        cover = np.minimum(
            _leaf(q + _v(0, base, 0), +1.0, top_dihedral * 0.22, 1.62, 0.030, -0.03, span=1.08),
            _leaf(q + _v(0, base, 0), -1.0, top_dihedral * 0.22, 1.62, 0.030, -0.03, span=1.08),
        )
        d = np.minimum(d, cover)

        # The gutter: a shallow well carved along the spine so the two halves
        # meet in a valley instead of in a seam.
        return np.maximum(d, -sd_capsule(q, _v(0, 0.10, -1.10), _v(0, 0.10, 1.10), 0.075))

    gray = shade(
        scene, width, height,
        eye=(1.25, 1.72, 4.05), target=(0.02, -0.06, 0.0), fov=32.0,
        build_scene=None, key=(-0.56, 0.72, 0.46),
        samples=2, ambient=0.22, bound=(0, -0.18, 0), bound_radius=2.7, background=1.0,
    )

    # Calm light and generous white space: the open leaves hold the top of the
    # range and the gutter is the only real black on the plate.
    coverage = engrave(gray, cell=width / 300.0, blend=0.30, angle=21.0, floor=0.010, gamma=1.12)
    return tone(coverage).filter(ImageFilter.GaussianBlur(0.35))


def _digit(p, base, direction, lengths, radii, bends, plane_normal=(0.0, 1.0, 0.0)):
    """A finger: three tapering round cones, each hinged on the one before it.

    The joints all turn about one axis — a finger is a hinge, not a ball — and
    that axis is the normal of the plane the finger swings in. Getting this
    right is most of what separates a hand from a bunch of sausages: real
    fingers fold toward the palm along a single plane, and each joint folds
    further than the one before it.
    """
    axis = np.asarray(direction, dtype=np.float32)
    axis = axis / np.linalg.norm(axis)
    hinge = np.asarray(plane_normal, dtype=np.float32)
    hinge = hinge / np.linalg.norm(hinge)

    a = np.asarray(base, dtype=np.float32)
    d = None
    angle = 0.0
    for i, (length, radius) in enumerate(zip(lengths, radii)):
        angle += bends[i]
        # Rodrigues about the hinge axis.
        c, s_ = np.cos(angle), np.sin(angle)
        bend = axis * c + np.cross(hinge, axis) * s_ + hinge * float(hinge @ axis) * (1 - c)
        bend = bend / np.linalg.norm(bend)
        b = a + bend * length
        seg = sd_capsule(p, a, b, radius, radius * 0.88)
        d = seg if d is None else smin(d, seg, 0.012)
        a = b
    return d


def _hand(p, origin, yaw, pitch, roll, curl, mirror=False, scale=1.0):
    """One hand, built to real proportion.

    The measurements that matter, as fractions of hand length: the palm is
    about 55% and the middle finger about 45%; index and ring are a little
    shorter than middle and the little finger shorter again; the thumb leaves
    the palm low and across rather than in the plane of the fingers, and the
    pad at its base — the thenar — is the single mass that most makes a hand
    read as a hand rather than as a mitten.
    """
    q = p - np.asarray(origin, dtype=np.float32)
    q = rot_y(q, yaw)
    q = rot_x(q, pitch)
    q = rot_z(q, roll)
    if mirror:
        q = q.copy()
        q[..., 2] = -q[..., 2]
    q = q / scale

    # The metacarpal block: wide, shallow, and tapering toward the wrist.
    palm = sd_box(q, _v(-0.010, 0.0, 0.0), _v(0.126, 0.014, 0.146), radius=0.030)
    # The heel of the hand only — the wrist is cropped a little past it, because
    # a plate about hands that runs on into forearms stops being about hands.
    heel = sd_capsule(q, _v(-0.132, -0.006, -0.02), _v(-0.188, -0.010, -0.012), 0.060, 0.044)
    d = smin(palm, heel, 0.045)

    # The thenar pad, on the thumb side, and the hypothenar on the other.
    d = smin(d, sd_capsule(q, _v(-0.112, -0.010, -0.104), _v(0.030, -0.005, -0.126), 0.056, 0.041), 0.048)
    d = smin(d, sd_capsule(q, _v(-0.116, -0.005, 0.118), _v(0.050, -0.003, 0.128), 0.040, 0.032), 0.040)

    # Four fingers. Knuckles sit on an arc, not a straight line, and the fold
    # deepens from index to little finger.
    fingers = [
        (_v(0.130, 0.004, -0.104), _v(0.985, 0.10, -0.150), (0.168, 0.104, 0.070), (0.0330, 0.0288, 0.0244), 0.96),
        (_v(0.146, 0.005, -0.035), _v(0.998, 0.08, -0.048), (0.186, 0.114, 0.075), (0.0342, 0.0299, 0.0252), 1.00),
        (_v(0.140, 0.004, 0.035), _v(0.995, 0.07, 0.058), (0.174, 0.108, 0.072), (0.0330, 0.0287, 0.0242), 1.06),
        (_v(0.116, 0.002, 0.102), _v(0.972, 0.05, 0.185), (0.136, 0.084, 0.061), (0.0289, 0.0249, 0.0212), 1.14),
    ]
    for base, direction, lengths, radii, weight in fingers:
        bend = curl * weight
        d = smin(d, _digit(q, base, direction, lengths, radii,
                           bends=(-0.14 - bend * 0.62, -bend * 1.05, -bend * 0.92),
                           plane_normal=(0.0, 0.0, 1.0)), 0.026)

    # The thumb: out of the palm's plane, and folding across it rather than
    # alongside the fingers.
    d = smin(d, _digit(q, _v(-0.062, -0.006, -0.132), _v(0.60, 0.34, -0.72),
                       (0.158, 0.114), (0.0436, 0.0354),
                       bends=(-0.10 - curl * 0.26, -0.30 - curl * 0.40),
                       plane_normal=(0.22, 0.82, 0.52)), 0.038)
    return d * scale


def build_hands(width: int, height: int) -> Image.Image:
    """Two hands in a restrained gesture of support.

    The lower hand is open and offered, palm up and relaxed. The second comes
    across from the other side and settles on it, fingers softly folded. That
    is the whole image: no clasping, no praying, no interlaced fingers, no
    faces, no props and no staging — the two forms and the space around them.
    """

    def scene(p):
        q = rot_y(p, np.radians(4.0))
        # Lower: open, palm up, offered. Upper: palm down, folded, resting on it.
        lower = _hand(q, (-0.285, -0.165, 0.07),
                      yaw=np.radians(-7.0), pitch=np.radians(196.0), roll=np.radians(-9.0),
                      curl=0.20, scale=1.08)
        upper = _hand(q, (0.245, 0.085, -0.075),
                      yaw=np.radians(173.0), pitch=np.radians(-19.0), roll=np.radians(-8.0),
                      curl=0.32, mirror=True, scale=1.00)
        return np.minimum(lower, upper)

    gray = shade(
        scene, width, height,
        eye=(0.14, 0.50, 1.92), target=(-0.01, -0.05, 0.0), fov=32.0,
        build_scene=None, key=(-0.50, 0.72, 0.46),
        samples=2, ambient=0.17, bound=(0, -0.05, 0), bound_radius=1.35, background=1.0,
    )

    coverage = engrave(gray, cell=width / 300.0, blend=0.34, angle=38.0, floor=0.02, gamma=1.10)
    return tone(coverage).filter(ImageFilter.GaussianBlur(0.35))


def build_bust(width: int, height: int) -> Image.Image:
    """An anonymous carved bust: a strong vertical silhouette and no face.

    Deliberately featureless. The brief is an anonymous sculptural character,
    and a generated face is both a likeness risk and the fastest way to make a
    plate look synthetic — so this is a cranium, a brow, a jaw, a neck, a chest
    and a plinth, cut back by flat planes and lit hard from one side. The
    planes are the point: a smooth blend of primitives reads as a mannequin,
    and a carved head reads as sculpture, and the difference is entirely in how
    sharply the masses are taken off.
    """

    def plane(q, point, normal):
        """A half-space, used to chisel a flat off a mass."""
        n = np.asarray(normal, dtype=np.float32)
        n = n / np.linalg.norm(n)
        return (q - np.asarray(point, dtype=np.float32)) @ n

    def scene(p):
        q = rot_y(p, np.radians(-23.0))

        # --- head -----------------------------------------------------------
        cranium = sd_ellipsoid(q, _v(0.0, 1.00, -0.02), _v(0.285, 0.345, 0.315))
        muzzle = sd_ellipsoid(q, _v(0.02, 0.855, 0.135), _v(0.215, 0.225, 0.245))
        jaw = sd_ellipsoid(q, _v(0.015, 0.745, 0.075), _v(0.215, 0.150, 0.230))
        head = smin(smin(cranium, muzzle, 0.055), jaw, 0.055)

        # The brow and the crown, taken off flat. Two cuts do more for "carved"
        # than any amount of extra geometry.
        head = np.maximum(head, -plane(q, _v(0, 1.30, 0), _v(0, -1, 0.18)))
        head = np.maximum(head, plane(q, _v(0, 0, 0.30), _v(0.10, 0.24, 1.0)))
        head = np.maximum(head, plane(q, _v(-0.255, 0, 0), _v(-1.0, 0.06, -0.30)))
        head = np.maximum(head, plane(q, _v(0.265, 0, 0), _v(1.0, 0.04, -0.34)))

        # --- neck and chest --------------------------------------------------
        neck = sd_capsule(q, _v(0.0, 0.76, -0.02), _v(-0.01, 0.36, -0.04), 0.125, 0.175)
        trapezius = sd_capsule(q, _v(-0.24, 0.34, -0.06), _v(0.24, 0.34, -0.06), 0.180)
        chest = sd_ellipsoid(q, _v(0.0, -0.06, 0.0), _v(0.455, 0.335, 0.245))
        shoulders = sd_capsule(q, _v(-0.445, 0.14, -0.03), _v(0.445, 0.14, -0.03), 0.175)
        body = smin(smin(smin(neck, trapezius, 0.09), shoulders, 0.085), chest, 0.11)

        # The same two side cuts carry down the torso, so the bust is one block
        # of stone rather than a head sitting on a barrel.
        body = np.maximum(body, plane(q, _v(0, 0, 0.27), _v(0.06, 0.10, 1.0)))
        body = np.maximum(body, plane(q, _v(-0.50, 0, 0), _v(-1.0, 0.10, -0.26)))
        body = np.maximum(body, plane(q, _v(0.52, 0, 0), _v(1.0, 0.08, -0.30)))

        d = smin(head, body, 0.045)

        # --- the cut and the plinth ------------------------------------------
        d = np.maximum(d, -(q[..., 1] + 0.30))
        socle = sd_box(q, _v(0.0, -0.375, -0.02), _v(0.295, 0.080, 0.215), radius=0.006)
        plinth = sd_box(q, _v(0.0, -0.530, -0.02), _v(0.360, 0.080, 0.260), radius=0.006)
        return np.minimum(d, np.minimum(socle, plinth))

    gray = shade(
        scene, width, height,
        eye=(1.32, 1.12, 4.05), target=(-0.02, 0.25, 0.0), fov=31.0,
        build_scene=None, key=(-0.68, 0.54, 0.50),
        samples=2, ambient=0.12, bound=(0, 0.22, 0), bound_radius=1.9, background=1.0,
    )

    # A portrait plate carries the deepest blacks in the set: it is the one
    # image in the family with a figure on it, and it has to hold its own
    # beside the reader's name set at display scale.
    coverage = engrave(gray, cell=width / 230.0, blend=0.36, angle=52.0, floor=0.02, gamma=1.16)
    return tone(coverage).filter(ImageFilter.GaussianBlur(0.32))


def build_arena(width: int, height: int) -> Image.Image:
    """A sparse etched arena: a swept floor, a low rim, nothing in the middle.

    This one is scenery and only scenery. Two live combatants stand in front of
    it and the HUD sits over its upper band, so the composition is built around
    what has to stay empty: the middle of the floor, where the fighters are,
    and the whole top of the frame, where the meters are. Everything drawn here
    is drawn at the edges and toward the viewer.

    No figure, bar, label, effect or frame is baked in. The live battle owns all
    five of those, and a stage that drew its own would double them.
    """
    rng = np.random.default_rng(SEED + 7)
    ys, xs = np.mgrid[0:height, 0:width].astype(np.float64)
    u = xs / width
    v = ys / height

    horizon = 0.34
    # Ground depth from the horizon down, so the etch compresses toward the back
    # the way a real floor does.
    depth = np.clip((v - horizon) / (1 - horizon), 0.0, 1.0)
    z = 1.0 / np.maximum(depth, 1e-3)
    world_x = (u - 0.5) * z * 2.0
    world_z = z * 0.5

    # Concentric sweep lines about the arena centre, etched into the floor and
    # opening out before they reach the middle.
    radius = np.hypot(world_x, world_z - 1.25)
    rings = np.abs(np.sin(radius * 2.15)) ** 46
    rings *= np.clip((radius - 1.30) / 1.10, 0.0, 1.0)
    rings *= np.clip(depth * 2.4, 0.0, 1.0)

    # A few long spokes, kept to the outer ground for the same reason.
    angle = np.arctan2(world_x, np.maximum(world_z - 1.25, 1e-3))
    spokes = np.abs(np.sin(angle * 3.0)) ** 70
    spokes *= np.clip((radius - 2.10) / 1.60, 0.0, 1.0)
    spokes *= np.clip(depth * 2.0, 0.0, 1.0)

    # Printed tooth is per-dot, not per-region. `value_noise` is amplitude-
    # weighted toward its low octaves, so at this size it lays down blotches
    # that read as staining; the floor grain is white noise instead, which is
    # what a stipple actually is.
    tooth = rng.random((height, width))
    # Densest in the middle distance and thinning again at the front edge, so
    # the floor recedes instead of ending on a band of sandpaper.
    grit = (tooth > 0.86) * np.clip((depth - 0.10) * 1.8, 0, 1) * (1 - 0.55 * depth ** 2) * 0.38

    coverage = np.clip(rings * 0.92 + spokes * 0.62 + grit, 0.0, 1.0)

    # The back wall: a soft tonal band above the horizon rather than a rule, so
    # the arena has depth without a line drawn across the plate.
    wall = np.clip((horizon - v) / horizon, 0.0, 1.0) ** 1.7 * 0.13
    coverage = np.clip(coverage + wall, 0.0, 1.0)

    # Standing stones. They rise from the floor at the horizon and are kept to
    # the left and right margins by index, never at random, so the ground the
    # two live figures stand on is clear in every build.
    erosion = value_noise((height, width), octaves=8, rng=np.random.default_rng(SEED + 11))
    for cx, half, rise, taper in ((0.038, 0.019, 0.190, 0.55), (0.108, 0.013, 0.122, 0.70),
                                  (0.895, 0.013, 0.132, 0.70), (0.963, 0.020, 0.198, 0.55)):
        top = horizon - rise
        # A stone tapers toward its top, so the sides are not parallel rules.
        t = np.clip((v - top) / max(rise, 1e-6), 0.0, 1.0)
        halfw = half * (taper + (1 - taper) * t)
        stone = (np.abs(u - cx) < halfw) & (v > top) & (v < horizon + 0.012)
        # Eroded, so the silhouette is cut stone rather than a printed bar.
        stone = stone & (erosion > 0.26 - 0.32 * (1 - t))
        coverage = np.where(stone, np.clip(coverage + 0.82, 0, 1), coverage)

    # The top band belongs to the HUD and the centre belongs to the fighters.
    # Both are held open here rather than covered up in CSS later.
    coverage *= np.clip((v - 0.03) / 0.14, 0.0, 1.0)
    coverage *= 1.0 - 0.58 * np.exp(-(((u - 0.5) / 0.24) ** 2 + ((v - 0.80) / 0.30) ** 2))

    # The floor stipple is the whole cost of this plate: uncorrelated dots are
    # the least compressible thing an encoder can be handed. It is kept sparse
    # deliberately, and the plate is measured against the shared weight cap in
    # `test/ambient-media-scope.test.js`.
    coverage = press(1.0 - coverage, cell=width / 320.0, blend=0.20, angle_degrees=9.0)
    return tone(coverage).filter(ImageFilter.GaussianBlur(0.42))


def encode(image: Image.Image, stem: str) -> list[tuple[str, int]]:
    """Writes AVIF, WebP and a JPEG fallback; returns (path, bytes) records."""
    PLATES_DIR.mkdir(parents=True, exist_ok=True)
    png_path = PLATES_DIR / f"{stem}.png"
    image.save(png_path, "PNG")

    jpeg_path = PLATES_DIR / f"{stem}.jpg"
    image.save(jpeg_path, "JPEG", quality=80, optimize=True, progressive=True)

    # A textured plate hides compression artefacts the way printed paper hides
    # them, so it is encoded harder than a photograph would be.
    webp_path = PLATES_DIR / f"{stem}.webp"
    subprocess.run(["cwebp", "-quiet", "-q", "62", "-m", "6", str(jpeg_path), "-o", str(webp_path)], check=True)

    avif_path = PLATES_DIR / f"{stem}.avif"
    subprocess.run(
        ["avifenc", "--speed", "4", "--min", "26", "--max", "38", "--jobs", "4", str(png_path), str(avif_path)],
        check=True,
        capture_output=True,
    )
    png_path.unlink()

    records = []
    for path in (avif_path, webp_path, jpeg_path):
        payload = path.read_bytes()
        digest = hashlib.sha256(payload).hexdigest()
        records.append((str(path.relative_to(APP_ROOT)), len(payload)))
        print(f"  {path.relative_to(APP_ROOT)}  {len(payload):>7,} bytes  sha256:{digest[:16]}…")
    return records


# Each plate ships at two widths so `srcset` can hand a phone the small one.
# The source width is the large variant and is never below the minimum the
# brief sets for that placement.
PLATES = [
    ("gateway", 1200, 1500, build_gateway),
    ("gateway-small", 640, 800, build_gateway),
    ("terrain", 1400, 875, build_terrain),
    ("terrain-small", 700, 438, build_terrain),
    ("book", 1400, 600, build_book),
    ("book-small", 700, 300, build_book),
    ("hands", 1400, 700, build_hands),
    ("hands-small", 700, 350, build_hands),
    ("bust", 800, 1000, build_bust),
    ("bust-small", 400, 500, build_bust),
    ("arena", 1600, 900, build_arena),
    ("arena-small", 800, 450, build_arena),
]


def main() -> int:
    if not SKY_SOURCE.exists():
        raise SystemExit(f"missing source photograph: {SKY_SOURCE}")

    only = set(sys.argv[1:])
    for stem, width, height, build in PLATES:
        if only and stem not in only:
            continue
        print(f"{stem} — {width}x{height}")
        encode(build(width, height), stem)
    return 0


if __name__ == "__main__":
    sys.exit(main())
