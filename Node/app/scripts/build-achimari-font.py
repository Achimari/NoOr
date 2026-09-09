#!/usr/bin/env python3.11
"""Build the specimen-matched Achimari Hand CFF/OpenType font.

The supplied brand specimen establishes the visual target: a thin, narrow,
upright handwritten line with tall ascenders and an unhurried rhythm. Handlee
Regular is the OFL-licensed construction source closest to that target. This
build renames it, adjusts its proportions, supplies four specimen glyphs the
source lacks, and converts its quadratic outlines to CFF cubic charstrings.
"""

from copy import deepcopy
from pathlib import Path

from fontTools.fontBuilder import FontBuilder
from fontTools.pens.t2CharStringPen import T2CharStringPen
from fontTools.pens.transformPen import TransformPen
from fontTools.ttLib import TTFont

APP_ROOT = Path(__file__).resolve().parents[1]
SOURCE_PATH = APP_ROOT / "scripts" / "font-source" / "Handlee-Regular.ttf"
OUTPUT_PATH = APP_ROOT / "public" / "fonts" / "achimari-hand" / "AchimariHand-Regular.otf"

FAMILY_NAME = "Achimari Hand"
POSTSCRIPT_NAME = "AchimariHand-Regular"
X_SCALE = 0.96
Y_SCALE = 1.04

def draw_glyph(glyph_set, glyph_name, pen, transform):
    glyph_set[glyph_name].draw(TransformPen(pen, transform))

def build_charstring(glyph_set, width, parts):
    pen = T2CharStringPen(width, glyph_set)
    for glyph_name, transform in parts:
        draw_glyph(glyph_set, glyph_name, pen, transform)
    return pen.getCharString()

def scaled_transform(x_scale=X_SCALE, y_scale=Y_SCALE, x_offset=0, y_offset=0):
    return (x_scale, 0, 0, y_scale, x_offset, y_offset)

def main():
    if not SOURCE_PATH.exists():
        raise SystemExit(f"Missing font construction source: {SOURCE_PATH}")

    source = TTFont(SOURCE_PATH)
    glyph_set = source.getGlyphSet()
    glyph_order = source.getGlyphOrder()
    source_metrics = source["hmtx"].metrics

    metrics = {
        name: (round(advance * X_SCALE), round(side_bearing * X_SCALE))
        for name, (advance, side_bearing) in source_metrics.items()
    }
    charstrings = {
        name: build_charstring(glyph_set, metrics[name][0], [(name, scaled_transform())])
        for name in glyph_order
    }

    additions = {
        "multiply.achimari": {
            "codepoint": 0x00D7,
            "width": round(470 * X_SCALE),
            "parts": [("x", scaled_transform(1.02, 0.90, 8, 48))],
        },
        "Yacute.achimari": {
            "codepoint": 0x00DD,
            "width": metrics["Y"][0],
            "parts": [
                ("Y", scaled_transform()),
                ("acute", scaled_transform(x_offset=125 * X_SCALE, y_offset=52)),
            ],
        },
        "yacute.achimari": {
            "codepoint": 0x00FD,
            "width": metrics["y"][0],
            "parts": [
                ("y", scaled_transform()),
                ("acute", scaled_transform(x_offset=28 * X_SCALE, y_offset=36)),
            ],
        },
        "perthousand.achimari": {
            "codepoint": 0x2030,
            "width": round(910 * X_SCALE),
            "parts": [
                ("percent", scaled_transform()),
                ("o", scaled_transform(0.42 * X_SCALE, 0.42 * Y_SCALE, 650 * X_SCALE, -38)),
            ],
        },
    }

    cmap = dict(source.getBestCmap())
    for name, addition in additions.items():
        glyph_order.append(name)
        metrics[name] = (addition["width"], 0)
        charstrings[name] = build_charstring(glyph_set, addition["width"], addition["parts"])
        cmap[addition["codepoint"]] = name

    builder = FontBuilder(source["head"].unitsPerEm, isTTF=False)
    builder.setupGlyphOrder(glyph_order)
    builder.setupCharacterMap(cmap)
    builder.setupHorizontalMetrics(metrics)

    hhea = source["hhea"]
    builder.setupHorizontalHeader(
        ascent=round(hhea.ascent * Y_SCALE),
        descent=round(hhea.descent * Y_SCALE),
        lineGap=hhea.lineGap,
    )
    builder.setupNameTable(
        {
            "familyName": FAMILY_NAME,
            "styleName": "Regular",
            "fullName": f"{FAMILY_NAME} Regular",
            "uniqueFontIdentifier": f"{FAMILY_NAME} Regular 1.000",
            "psName": POSTSCRIPT_NAME,
            "version": "Version 1.000",
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
        sTypoAscender=round(os2.sTypoAscender * Y_SCALE),
        sTypoDescender=round(os2.sTypoDescender * Y_SCALE),
        sTypoLineGap=os2.sTypoLineGap,
        usWinAscent=round(os2.usWinAscent * Y_SCALE),
        usWinDescent=round(os2.usWinDescent * Y_SCALE),
        usWeightClass=400,
        usWidthClass=5,
        fsSelection=0x40,
        achVendID="ACHI",
    )
    builder.setupPost(
        keepGlyphNames=True,
        underlinePosition=source["post"].underlinePosition,
        underlineThickness=source["post"].underlineThickness,
    )
    builder.setupCFF(
        POSTSCRIPT_NAME,
        {
            "FullName": f"{FAMILY_NAME} Regular",
            "FamilyName": FAMILY_NAME,
            "Weight": "Regular",
            "version": "1.000",
            "Notice": "Modified from Handlee under the SIL Open Font License 1.1.",
            "Copyright": (
                "Copyright (c) 2011, Joe Prince, Vissol Ltd. "
                "Modified for Achimari, 2026."
            ),
        },
        charstrings,
        {},
    )
    builder.setupDummyDSIG()

    for table_tag in ("GDEF", "GPOS", "GSUB"):
        if table_tag in source:
            builder.font[table_tag] = deepcopy(source[table_tag])

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    builder.save(OUTPUT_PATH)

    built = TTFont(OUTPUT_PATH)
    if built.sfntVersion != "OTTO" or "CFF " not in built or "glyf" in built:
        raise SystemExit("Build did not produce a CFF/OpenType font")
    required = {addition["codepoint"] for addition in additions.values()}
    if not required.issubset(built.getBestCmap()):
        raise SystemExit("Build is missing specimen glyphs")

    print(
        f"Built {OUTPUT_PATH.relative_to(APP_ROOT)} "
        f"({len(built.getBestCmap())} Unicode characters)"
    )

if __name__ == "__main__":
    main()
