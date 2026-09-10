#!/usr/bin/env python3.11
"""Build the screen-optimised Achimari Hand CFF/OpenType font.

The supplied brand specimen establishes the visual target: a thin, upright
handwritten line with tall ascenders and an unhurried rhythm. Handlee Regular is
the OFL-licensed construction source closest to that target. This build renames
it, adjusts its proportions for screen reading, supplies four specimen glyphs
the source lacks, converts its quadratic outlines to CFF cubic charstrings, and
supplies the CFF alignment zones and stem widths a rasteriser needs.

Wave-three change
-----------------
The first build squeezed the face horizontally (X 0.96), which narrowed counters
and thinned every stroke: measured median stroke fell from 69.7 units in the
source to 66.9, i.e. ~1.20px at 18px — under one device pixel at DPR 1, so the
browser rendered it as grey mush. The face is now built at its natural width
with a small, deterministic outline strengthening, and carries the alignment
zones and stem hints a CFF rasteriser needs.

Usage
-----
    python3.11 -m pip install -r scripts/font-requirements.txt

    # production build (writes public/fonts/achimari-hand/AchimariHand-Regular.otf)
    python3.11 scripts/build-achimari-font.py

    # evaluation candidates, written to a temporary directory
    python3.11 scripts/build-achimari-font.py --candidate A --out-dir /tmp/cand
    python3.11 scripts/build-achimari-font.py --all-candidates --out-dir /tmp/cand

Every build is deterministic: the same source file and the same candidate
parameters always produce byte-identical output.
"""

from __future__ import annotations

import argparse
import math
import subprocess
import sys
from copy import deepcopy
from dataclasses import dataclass
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.basePen import BasePen
from fontTools.pens.pointPen import SegmentToPointPen
from fontTools.pens.recordingPen import RecordingPen
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

APP_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = APP_ROOT / "scripts" / "font-source" / "Handlee-Regular.ttf"
OUTPUT_PATH = APP_ROOT / "public" / "fonts" / "achimari-hand" / "AchimariHand-Regular.otf"

FAMILY_NAME = "Achimari Hand"
POSTSCRIPT_NAME = "AchimariHand-Regular"
FONT_VERSION = "2.000"

# Fixed head.created / head.modified, in seconds since 1904-01-01, so repeated
# builds of the same source are byte-identical. 2026-09-11T00:00:00Z.
BUILD_TIMESTAMP = 3873657600


@dataclass(frozen=True)
class Candidate:
    """One evaluated set of outline parameters."""

    key: str
    label: str
    x_scale: float
    y_scale: float
    # Half the added stroke thickness, in font units. Each outline point moves
    # this far along its outward normal, so stroke width grows by twice this.
    outline_offset: float
    # Extra advance width per glyph, in units, split evenly either side.
    side_bearing_bonus: int


CANDIDATES: dict[str, Candidate] = {
    "A": Candidate("A", "Original control", 0.96, 1.04, 0.0, 0),
    "B": Candidate("B", "Natural width", 1.00, 1.04, 0.0, 0),
    "C": Candidate("C", "Screen width", 1.02, 1.05, 0.0, 12),
    # Selected. Candidate C's proportions plus a 4-unit dilation, i.e. +8 units
    # of stroke — the conservative end of the evaluated 8-12 unit band.
    "D": Candidate("D", "Screen strengthened", 1.02, 1.05, 4.0, 12),
    # Evaluated and rejected: +10 units reads no better at DPR 1 and pulls the
    # `e` counter (158.2) just below the shipping font's (159.9).
    "D5": Candidate("D5", "Screen strengthened, heavier", 1.02, 1.05, 5.0, 12),
}

# The candidate chosen by the Stage 5 visual comparison and shipped as production.
SELECTED = "D"


# --------------------------------------------------------------------------
# Outline strengthening
# --------------------------------------------------------------------------

class OffsetPen(BasePen):
    """Thicken the real outline by `offset` units on every side.

    A deterministic dilation of the actual contours — not a CSS effect, not a
    duplicated contour, and not a synthesised weight. Point count, on/off-curve
    pattern and contour structure are all preserved, so the handwritten
    construction survives; only the pen gets wider.

    Direction is decided by *nesting*, not by winding. Handlee does not use a
    consistent outer/inner winding convention: deriving "outward" from each
    contour's signed area expanded the counters of `o`, `a` and `e` along with
    their outer walls, which left the bowls at their original weight while the
    stems thickened. Containment is unambiguous — a contour enclosed by an odd
    number of others is a hole and must contract so the stroke around it grows.
    """

    def __init__(self, glyph_set, other_pen, offset):
        super().__init__(glyph_set)
        self._pen = other_pen
        self._offset = offset
        self._contour: list[tuple[tuple[float, float], bool]] = []
        self._contours: list[tuple[list, bool]] = []

    def _moveTo(self, pt):
        self._flush()
        self._contour = [(pt, True)]

    def _lineTo(self, pt):
        self._contour.append((pt, True))

    def _curveToOne(self, p1, p2, p3):
        self._contour.append((p1, False))
        self._contour.append((p2, False))
        self._contour.append((p3, True))

    def _closePath(self):
        self._flush(close=True)

    def _endPath(self):
        self._flush(close=False)

    def _flush(self, close=True):
        if len(self._contour) >= 3:
            self._contours.append((self._contour, close))
        self._contour = []

    @staticmethod
    def _signed_area(points):
        area = 0.0
        n = len(points)
        for i in range(n):
            x0, y0 = points[i]
            x1, y1 = points[(i + 1) % n]
            area += x0 * y1 - x1 * y0
        return area / 2.0

    @staticmethod
    def _contains(outer, point):
        """Even-odd point-in-polygon."""
        x, y = point
        inside = False
        n = len(outer)
        for i in range(n):
            x0, y0 = outer[i]
            x1, y1 = outer[(i + 1) % n]
            if (y0 > y) != (y1 > y):
                xin = x0 + (y - y0) / (y1 - y0) * (x1 - x0)
                if x < xin:
                    inside = not inside
        return inside

    def draw_result(self):
        """Emit every buffered contour, dilated."""
        polys = [[p for p, _ in c] for c, _ in self._contours]

        for index, (contour, close) in enumerate(self._contours):
            pts = polys[index]
            # A contour inside an odd number of others is a hole.
            depth = sum(
                1
                for other_index, other in enumerate(polys)
                if other_index != index and self._contains(other, pts[0])
            )
            grow = -1.0 if depth % 2 else 1.0
            # Orient the normal so `grow` means "away from this contour's own
            # interior", independent of which way the contour happens to wind.
            winding = 1.0 if self._signed_area(pts) > 0 else -1.0
            scale = self._offset * grow * winding

            n = len(pts)
            moved = []
            for i, (pt, on_curve) in enumerate(contour):
                prev_pt = pts[(i - 1) % n]
                next_pt = pts[(i + 1) % n]
                dx = next_pt[0] - prev_pt[0]
                dy = next_pt[1] - prev_pt[1]
                length = math.hypot(dx, dy)
                if length < 1e-9:
                    moved.append((pt, on_curve))
                    continue
                nx = dy / length
                ny = -dx / length
                moved.append(((pt[0] + nx * scale, pt[1] + ny * scale), on_curve))

            self._pen.moveTo(moved[0][0])
            i = 1
            while i < len(moved):
                if moved[i][1]:
                    self._pen.lineTo(moved[i][0])
                    i += 1
                else:
                    self._pen.curveTo(moved[i][0], moved[i + 1][0], moved[i + 2][0])
                    i += 3
            if close:
                self._pen.closePath()
            else:
                self._pen.endPath()


# --------------------------------------------------------------------------
# Charstring construction
# --------------------------------------------------------------------------

def draw_glyph(glyph_set, glyph_name, pen, transform):
    glyph_set[glyph_name].draw(TransformPen(pen, transform))


def build_charstring(glyph_set, width, parts, offset=0.0):
    """Draw `parts` into one charstring, optionally strengthening the outline."""
    pen = T2CharStringPen(width, glyph_set)
    if offset:
        # Record first so the offset pen sees whole contours, then replay.
        recorder = RecordingPen()
        for glyph_name, transform in parts:
            draw_glyph(glyph_set, glyph_name, recorder, transform)
        offset_pen = OffsetPen(glyph_set, pen, offset)
        recorder.replay(offset_pen)
        offset_pen._flush()
        offset_pen.draw_result()
    else:
        for glyph_name, transform in parts:
            draw_glyph(glyph_set, glyph_name, pen, transform)
    return pen.getCharString()


def scaled_transform(cand, x_scale=None, y_scale=None, x_offset=0, y_offset=0):
    return (
        cand.x_scale if x_scale is None else x_scale,
        0,
        0,
        cand.y_scale if y_scale is None else y_scale,
        x_offset,
        y_offset,
    )


# --------------------------------------------------------------------------
# Metrics measured from real outlines
# --------------------------------------------------------------------------

class _Bounds(BasePen):
    def __init__(self, glyph_set):
        super().__init__(glyph_set)
        self.min_y = None
        self.max_y = None

    def _track(self, *points):
        for _, y in points:
            self.min_y = y if self.min_y is None else min(self.min_y, y)
            self.max_y = y if self.max_y is None else max(self.max_y, y)

    def _moveTo(self, pt):
        self._track(pt)

    def _lineTo(self, pt):
        self._track(pt)

    def _curveToOne(self, p1, p2, p3):
        self._track(p1, p2, p3)

    def _closePath(self):
        pass

    def _endPath(self):
        pass


def vertical_extent(glyph_set, names):
    """(min_y, max_y) across the named glyphs, or None when none are present."""
    lo = hi = None
    for name in names:
        if name not in glyph_set:
            continue
        pen = _Bounds(glyph_set)
        glyph_set[name].draw(pen)
        if pen.max_y is None:
            continue
        lo = pen.min_y if lo is None else min(lo, pen.min_y)
        hi = pen.max_y if hi is None else max(hi, pen.max_y)
    return None if hi is None else (lo, hi)


# --------------------------------------------------------------------------
# Build
# --------------------------------------------------------------------------

def build(cand: Candidate, out_path: Path, autohint: bool = False) -> Path:
    if not SOURCE_PATH.exists():
        raise SystemExit(f"Missing font construction source: {SOURCE_PATH}")

    source = TTFont(SOURCE_PATH)
    glyph_set = source.getGlyphSet()
    glyph_order = source.getGlyphOrder()
    source_metrics = source["hmtx"].metrics

    bonus = cand.side_bearing_bonus
    shift = bonus / 2.0

    metrics = {
        name: (
            round(advance * cand.x_scale) + bonus,
            round(side_bearing * cand.x_scale + shift),
        )
        for name, (advance, side_bearing) in source_metrics.items()
    }
    charstrings = {
        name: build_charstring(
            glyph_set,
            metrics[name][0],
            [(name, scaled_transform(cand, x_offset=shift))],
            cand.outline_offset,
        )
        for name in glyph_order
    }

    additions = {
        "multiply.achimari": {
            "codepoint": 0x00D7,
            "width": round(470 * cand.x_scale) + bonus,
            "parts": [("x", scaled_transform(cand, 1.02, 0.90, 8 + shift, 48))],
        },
        "Yacute.achimari": {
            "codepoint": 0x00DD,
            "width": metrics["Y"][0],
            "parts": [
                ("Y", scaled_transform(cand, x_offset=shift)),
                ("acute", scaled_transform(cand, x_offset=125 * cand.x_scale + shift, y_offset=52)),
            ],
        },
        "yacute.achimari": {
            "codepoint": 0x00FD,
            "width": metrics["y"][0],
            "parts": [
                ("y", scaled_transform(cand, x_offset=shift)),
                ("acute", scaled_transform(cand, x_offset=28 * cand.x_scale + shift, y_offset=36)),
            ],
        },
        "perthousand.achimari": {
            "codepoint": 0x2030,
            "width": round(910 * cand.x_scale) + bonus,
            "parts": [
                ("percent", scaled_transform(cand, x_offset=shift)),
                (
                    "o",
                    scaled_transform(
                        cand,
                        0.42 * cand.x_scale,
                        0.42 * cand.y_scale,
                        650 * cand.x_scale + shift,
                        -38,
                    ),
                ),
            ],
        },
    }

    cmap = dict(source.getBestCmap())
    for name, addition in additions.items():
        glyph_order.append(name)
        metrics[name] = (addition["width"], 0)
        charstrings[name] = build_charstring(
            glyph_set, addition["width"], addition["parts"], cand.outline_offset
        )
        cmap[addition["codepoint"]] = name

    upem = source["head"].unitsPerEm
    builder = FontBuilder(upem, isTTF=False)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupHorizontalMetrics(metrics)

    # Measure the built proportions from the source outlines, then scale, rather
    # than shipping the zeroes the previous build left in OS/2.
    x_extent = vertical_extent(glyph_set, ["x", "z", "v", "w"])
    cap_extent = vertical_extent(glyph_set, ["H", "E", "I", "T"])
    asc_extent = vertical_extent(glyph_set, ["l", "b", "d", "h", "k"])
    desc_extent = vertical_extent(glyph_set, ["p", "q", "y", "g"])

    grow = cand.y_scale
    strengthen = cand.outline_offset
    x_height = round(x_extent[1] * grow + strengthen) if x_extent else 0
    cap_height = round(cap_extent[1] * grow + strengthen) if cap_extent else 0
    ascender = round(asc_extent[1] * grow + strengthen) if asc_extent else 0
    descender = round(desc_extent[0] * grow - strengthen) if desc_extent else 0

    hhea = source["hhea"]
    win_ascent = round(hhea.ascent * grow + strengthen)
    win_descent = round(abs(hhea.descent) * grow + strengthen)

    builder.setupHorizontalHeader(
        ascent=win_ascent,
        descent=-win_descent,
        lineGap=hhea.lineGap,
    )
    builder.setupNameTable(
        {
            "familyName": FAMILY_NAME,
            "styleName": "Regular",
            "fullName": f"{FAMILY_NAME} Regular",
            "uniqueFontIdentifier": f"{FAMILY_NAME} Regular {FONT_VERSION}",
            "psName": POSTSCRIPT_NAME,
            "version": f"Version {FONT_VERSION}",
            "copyright": (
                "Achimari Hand is a modified version of Handlee, Copyright (c) "
                "2011, Joe Prince, Vissol Ltd. Licensed under SIL OFL 1.1."
            ),
            "licenseDescription": (
                "This Font Software is licensed under the SIL Open Font License, Version 1.1."
            ),
            "licenseInfoURL": "https://scripts.sil.org/OFL",
        }
    )

    os2 = source["OS/2"]
    builder.setupOS2(
        sTypoAscender=round(os2.sTypoAscender * grow),
        sTypoDescender=round(os2.sTypoDescender * grow),
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=win_ascent,
        usWinDescent=win_descent,
        sxHeight=x_height,
        sCapHeight=cap_height,
        usWeightClass=400,
        # 5 = normal. The face is built at natural width now, not condensed.
        usWidthClass=5,
        fsSelection=0x40,
        achVendID="ACHI",
    )
    builder.setupPost(
        keepGlyphNames=True,
        underlinePosition=source["post"].underlinePosition,
        underlineThickness=source["post"].underlineThickness,
    )

    # Alignment zones and stem widths. These Private values are what a CFF
    # rasteriser reads to snap the baseline, x-height and cap-height at small
    # ppem, and v1.000 shipped without any of them. `--autohint` can refine the
    # per-glyph charstrings on top; see run_autohint for why it is opt-in.
    overshoot = round(upem * 0.012)
    private = {
        "BlueValues": [
            -overshoot, 0,                                  # baseline
            x_height - overshoot, x_height,                 # x-height
            cap_height, cap_height + overshoot,             # cap height
            ascender, ascender + overshoot,                 # ascender
        ],
        "OtherBlues": [descender - overshoot, descender],
        "BlueScale": 0.039625,
        "BlueShift": 7,
        "BlueFuzz": 1,
        "StdHW": STROKE_H,
        "StdVW": STROKE_V,
        "StemSnapH": STEM_SNAP_H,
        "StemSnapV": STEM_SNAP_V,
        "ForceBold": False,
    }

    builder.setupCFF(
        POSTSCRIPT_NAME,
        {
            "FullName": f"{FAMILY_NAME} Regular",
            "FamilyName": FAMILY_NAME,
            "Weight": "Regular",
            "version": FONT_VERSION,
            "Notice": "Modified from Handlee under the SIL Open Font License 1.1.",
            "Copyright": (
                "Copyright (c) 2011, Joe Prince, Vissol Ltd. "
                "Modified for Achimari, 2026."
            ),
        },
        charstrings,
        private,
    )
    # Pin the head timestamps. FontBuilder defaults them to "now", which made
    # two runs of the same source produce different bytes — determinism has to
    # be real, not just claimed.
    builder.font["head"].created = BUILD_TIMESTAMP
    builder.font["head"].modified = BUILD_TIMESTAMP

    builder.setupDummyDSIG()

    for table_tag in ("GDEF", "GPOS", "GSUB"):
        if table_tag in source:
            builder.font[table_tag] = deepcopy(source[table_tag])

    out_path.parent.mkdir(parents=True, exist_ok=True)
    builder.save(out_path)

    if autohint:
        run_autohint(out_path)

    verify(out_path, additions)
    return out_path


# Measured from the built outlines of this construction (see SOURCE.md). Handlee
# is monoline, so horizontal and vertical strokes are within a unit of each
# other and the snap lists are short by nature.
STROKE_H = 70
STROKE_V = 74
STEM_SNAP_H = [62, 70, 78]
STEM_SNAP_V = [66, 74, 82]


def run_autohint(path: Path) -> None:
    """Autohint in place with the pinned afdko otfautohint.

    Invoked as a module through the current interpreter, so the stage depends on
    scripts/font-requirements.txt rather than on a globally installed binary.

    Off by default. otfautohint's path analysis is pathologically slow on this
    face once the outlines are dilated: candidate A (undilated) hints in ~13
    minutes, while the shipped dilated outlines did not finish five glyphs in
    ten. The build therefore ships the explicit Private-dict alignment zones and
    stem widths below — which is what a CFF rasteriser reads to snap the
    baseline, x-height and cap-height — and leaves per-glyph charstring hints as
    an opt-in stage pending an overlap-removal pass on the dilated contours.
    """
    result = subprocess.run(
        [sys.executable, "-m", "afdko.otfautohint", "--no-flex", "--all", str(path)],
        capture_output=True,
        text=True,
    )
    if result.returncode != 0:
        raise SystemExit(
            "otfautohint failed. Install the pinned build dependencies:\n"
            "  python3.11 -m pip install -r scripts/font-requirements.txt\n\n"
            f"{result.stdout}\n{result.stderr}"
        )


def verify(path: Path, additions: dict) -> None:
    built = TTFont(path)
    if built.sfntVersion != "OTTO" or "CFF " not in built or "glyf" in built:
        raise SystemExit("Build did not produce a CFF/OpenType font")
    required = {addition["codepoint"] for addition in additions.values()}
    if not required.issubset(built.getBestCmap()):
        raise SystemExit("Build is missing specimen glyphs")

    os2 = built["OS/2"]
    if not os2.sxHeight or not os2.sCapHeight:
        raise SystemExit("Build did not record x-height and cap-height")
    if os2.usWeightClass != 400:
        raise SystemExit("Achimari Hand ships one regular face")

    cff = built["CFF "].cff
    private = cff[cff.fontNames[0]].Private
    for attr in ("BlueValues", "StdHW", "StdVW", "StemSnapH", "StemSnapV"):
        if not getattr(private, attr, None):
            raise SystemExit(f"Build is missing CFF hinting data: {attr}")


def describe(path: Path) -> str:
    built = TTFont(path)
    os2, head = built["OS/2"], built["head"]
    cff = built["CFF "].cff
    private = cff[cff.fontNames[0]].Private
    hinted = sum(
        1
        for name in built.getGlyphOrder()[:400]
        if "hintmask" in cff[cff.fontNames[0]].CharStrings[name].program
        or "hstem" in cff[cff.fontNames[0]].CharStrings[name].program
        or "vstem" in cff[cff.fontNames[0]].CharStrings[name].program
    )
    return (
        f"    upem={head.unitsPerEm} xHeight={os2.sxHeight} capHeight={os2.sCapHeight} "
        f"win={os2.usWinAscent}/{os2.usWinDescent} weight={os2.usWeightClass} "
        f"width={os2.usWidthClass}\n"
        f"    BlueValues={getattr(private, 'BlueValues', None)} "
        f"StdVW={getattr(private, 'StdVW', None)} hinted charstrings={hinted}/400 "
        f"size={path.stat().st_size:,}B"
    )


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--candidate", choices=sorted(CANDIDATES), help="build one evaluation candidate")
    parser.add_argument("--all-candidates", action="store_true", help="build every evaluation candidate")
    parser.add_argument("--out-dir", type=Path, help="directory for candidate output")
    parser.add_argument("--autohint", action="store_true",
                        help="run the otfautohint stage (slow on the dilated outlines; see run_autohint)")
    args = parser.parse_args()

    autohint = args.autohint

    if args.all_candidates or args.candidate:
        out_dir = args.out_dir or (APP_ROOT / "build" / "font-candidates")
        keys = sorted(CANDIDATES) if args.all_candidates else [args.candidate]
        for key in keys:
            cand = CANDIDATES[key]
            suffix = "-hinted" if autohint else ""
            out = out_dir / f"AchimariHand-{key}{suffix}.otf"
            build(cand, out, autohint=autohint)
            print(f"[{key}] {cand.label}  x={cand.x_scale} y={cand.y_scale} "
                  f"offset={cand.outline_offset} sb+={cand.side_bearing_bonus} -> {out}")
            print(describe(out))
        return

    cand = CANDIDATES[SELECTED]
    build(cand, OUTPUT_PATH, autohint=autohint)
    built = TTFont(OUTPUT_PATH)
    print(
        f"Built {OUTPUT_PATH.relative_to(APP_ROOT)} from candidate {SELECTED} "
        f"({cand.label}) v{FONT_VERSION} "
        f"({len(built.getBestCmap())} Unicode characters)"
    )
    print(describe(OUTPUT_PATH))


if __name__ == "__main__":
    main()
