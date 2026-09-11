#!/usr/bin/env python3.11
"""Generate the seamless paper-fibre texture used by the shared material layer.

The texture is decorative: it gives the white paper a faint fibre so Achimari Hand
reads as ink on a surface rather than ink on a flat fill. It must be felt, not
seen — visible when you deliberately stare at a blank margin, invisible while
reading, and never strong enough to break the edge of a thin handwritten stroke.

Seamlessness
------------
The noise is built in the frequency domain: a real image synthesised from a
random-phase spectrum is inherently periodic, so the tile wraps exactly with no
edge blending and no visible seam at any zoom. Blur-then-crop approaches leave a
seam; this cannot.

Output
------
RGBA WebP. The fibre lives in the *alpha* channel over a constant neutral grey,
so the layer only ever darkens the paper very slightly — which is what paper
fibre does. Peak alpha is deliberately tiny (see PEAK_ALPHA).

    python3.11 scripts/build-paper-texture.py

Deterministic: the seed is fixed, so the same command always writes the same file.
"""

from __future__ import annotations

import subprocess
import sys
from pathlib import Path

import numpy as np
from PIL import Image

APP_ROOT = Path(__file__).resolve().parents[1]
OUTPUT_PATH = APP_ROOT / "public" / "textures" / "paper-fiber.webp"

SIZE = 320
SEED = 20260911

# Neutral grey for the fibre. On white paper any warmth at all reads as age, and
# pure black reads as dirt; an even mid-grey just makes the white feel physical.
FIBRE_RGB = (112, 112, 112)

# Peak alpha out of 255. 6 was calibrated to keep the swing near 3%, but on
# screen that made the fibre disappear entirely: the page read as flat #fff. 9
# is the point where the surface is felt on inspection without the white ever
# reading as grey or dirty. Keeping the range this narrow also keeps the
# lossless WebP small — the alpha plane holds only a handful of values.
PEAK_ALPHA = 9

# How much of the field is broad mottling versus fine grain. Mostly grain: broad
# blotches at any real strength start to look like staining.
GRAIN_SHARE = 0.72
MOTTLE_SHARE = 0.28


def spectral_noise(size: int, exponent: float, rng: np.random.Generator) -> np.ndarray:
    """A tileable noise field whose power falls off as 1/f**exponent.

    Built by shaping a random-phase spectrum and taking the inverse FFT, so the
    result is exactly periodic in both axes.
    """
    fy = np.fft.fftfreq(size)[:, None]
    fx = np.fft.fftfreq(size)[None, :]
    radius = np.sqrt(fy**2 + fx**2)
    radius[0, 0] = 1.0  # leave DC alone; it is removed below anyway

    amplitude = radius ** (-exponent)
    amplitude[0, 0] = 0.0

    phase = rng.uniform(0.0, 2.0 * np.pi, (size, size))
    spectrum = amplitude * np.exp(1j * phase)

    field = np.fft.ifft2(spectrum).real
    field -= field.mean()
    peak = np.abs(field).max()
    return field / peak if peak else field


def build_field() -> np.ndarray:
    rng = np.random.default_rng(SEED)

    # exponent 0.4: nearly flat spectrum, so the grain stays fine and
    # non-directional rather than clumping into visible specks.
    grain = spectral_noise(SIZE, 0.4, rng)
    # exponent 2.4: slow, broad variation across the tile.
    mottle = spectral_noise(SIZE, 2.4, rng)

    field = GRAIN_SHARE * grain + MOTTLE_SHARE * mottle

    # Clip the tail before normalising. Without this, a handful of extreme
    # pixels survive as isolated dark dots that read as punctuation.
    limit = 2.6 * field.std()
    field = np.clip(field, -limit, limit)

    field -= field.min()
    span = field.max()
    return field / span if span else field


def build_report(alpha_peak: int) -> str:
    """Composite the extremes over the real paper token and report the swing.

    Reported in 8-bit levels as well as percent: the percent figure alone
    overstates what a reader sees, because a blank region rarely contains both
    extremes inside one glance.
    """
    paper = np.array([255, 255, 255], dtype=float)  # --paper #ffffff
    ink = np.array(FIBRE_RGB, dtype=float)

    def luminance(rgb: np.ndarray) -> float:
        channel = rgb / 255.0
        channel = np.where(channel <= 0.04045, channel / 12.92, ((channel + 0.055) / 1.055) ** 2.4)
        return float(0.2126 * channel[0] + 0.7152 * channel[1] + 0.0722 * channel[2])

    darkest = paper + (ink - paper) * (alpha_peak / 255.0)
    light, dark = luminance(paper), luminance(darkest)
    swing = (light - dark) / light * 100.0
    levels = float(paper[0] - darkest[0])
    return (
        f"    lightest {tuple(paper.astype(int))}  darkest {tuple(np.round(darkest).astype(int))}  "
        f"range {levels:.1f}/255 levels, luminance swing {swing:.2f}%"
    )


def main() -> None:
    field = build_field()
    alpha = np.round(field * PEAK_ALPHA).astype(np.uint8)

    rgba = np.zeros((SIZE, SIZE, 4), dtype=np.uint8)
    rgba[..., 0] = FIBRE_RGB[0]
    rgba[..., 1] = FIBRE_RGB[1]
    rgba[..., 2] = FIBRE_RGB[2]
    rgba[..., 3] = alpha

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    png_path = OUTPUT_PATH.with_suffix(".png")
    Image.fromarray(rgba, mode="RGBA").save(png_path, optimize=True)

    # Lossless WebP: a lossy pass would invent blocking artefacts in a field
    # whose whole amplitude is a handful of alpha levels. `-exact` keeps the RGB
    # under fully transparent pixels, which cwebp otherwise zeroes — that zeroing
    # shows up as dark fringing once the tile is interpolated at 200% zoom.
    result = subprocess.run(
        ["cwebp", "-lossless", "-exact", "-alpha_q", "100", "-q", "100", "-quiet",
         str(png_path), "-o", str(OUTPUT_PATH)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        png_path.replace(OUTPUT_PATH.with_suffix(".png"))
        raise SystemExit(f"cwebp failed:\n{result.stdout}\n{result.stderr}")
    png_path.unlink()

    size_kb = OUTPUT_PATH.stat().st_size / 1024
    print(f"Built {OUTPUT_PATH.relative_to(APP_ROOT)} ({SIZE}x{SIZE}, {size_kb:.1f} KB)")
    print(build_report(int(alpha.max())))
    if size_kb > 40:
        print(f"    warning: {size_kb:.1f} KB is above the 40 KB budget", file=sys.stderr)


if __name__ == "__main__":
    main()
