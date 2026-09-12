#!/usr/bin/env python3.11
"""Vendor the Sacred Press typefaces from their official upstream sources.

Three families carry the product (see `public/fonts/README.md`):

  display   Unbounded Variable      google/fonts, OFL 1.1
  UI        IBM Plex Sans Condensed IBM/plex, OFL 1.1
  body      IBM Plex Sans           IBM/plex, OFL 1.1
  data      IBM Plex Mono           IBM/plex, OFL 1.1

IBM publishes built WOFF2 upstream, so those files are vendored byte for byte
and pinned by SHA-256. Google publishes Unbounded as a variable TTF only, so it
is converted here with fontTools, subset to the two scripts the product is
written in (Latin and Cyrillic, plus the punctuation both need), and clamped to
the 400-900 weight band the display role actually uses. It stays a variable
font: every weight the CSS names is a real interpolated instance, so nothing is
ever synthesised.

The build is deterministic: same inputs, same bytes out. Run it from `Node/app`:

    python3.11 -m pip install -r scripts/font-requirements.txt
    python3.11 scripts/vendor-sacred-press-fonts.py

Then run `npm test` and `npm run build:assets`.
"""

from __future__ import annotations

import hashlib
import io
import sys
import urllib.request
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

APP_ROOT = Path(__file__).resolve().parent.parent
FONTS_DIR = APP_ROOT / "public" / "fonts"

PLEX_RAW = "https://raw.githubusercontent.com/IBM/plex/master"
GOOGLE_RAW = "https://raw.githubusercontent.com/google/fonts/main"

# Every IBM Plex face the product declares, with the upstream path it comes
# from. Weights are limited to the two the type roles actually use: 400 for
# running text and controls, 600 for the one emphasis step above it.
PLEX_FACES = [
    ("ibm-plex-sans-condensed", "IBMPlexSansCondensed-Regular.woff2", "plex-sans-condensed"),
    ("ibm-plex-sans-condensed", "IBMPlexSansCondensed-SemiBold.woff2", "plex-sans-condensed"),
    ("ibm-plex-sans", "IBMPlexSans-Regular.woff2", "plex-sans"),
    ("ibm-plex-sans", "IBMPlexSans-SemiBold.woff2", "plex-sans"),
    ("ibm-plex-mono", "IBMPlexMono-Regular.woff2", "plex-mono"),
    ("ibm-plex-mono", "IBMPlexMono-SemiBold.woff2", "plex-mono"),
]

# Latin + Cyrillic, the two scripts the interface is written in. Expressed as
# ranges rather than a glyph list so the subset stays legible and auditable.
UNICODES = ",".join(
    [
        "U+0020-007E",  # Basic Latin
        "U+00A0",  # no-break space
        "U+00A9,U+00AB,U+00BB",  # copyright, guillemets (Russian quotation marks)
        "U+00C0-00FF",  # Latin-1 accented letters
        "U+0400-045F",  # Cyrillic
        "U+0490-0491",  # Ukrainian ghe with upturn
        "U+2010-2015",  # hyphens and dashes
        "U+2018-201A,U+201C-201E",  # quotation marks
        "U+2026",  # ellipsis
        "U+2116",  # numero sign
        "U+2212",  # minus
    ]
)

# The display face is set at one heavy step and one lighter companion; the
# axis is clamped to the band those live in so the file does not carry delta
# data for weights the product never asks for. It stays a real variable axis:
# every weight the CSS names is an interpolated instance, never a synthesised
# one.
DISPLAY_AXIS = {"wght": (400, 700, 900)}

# fontTools stamps head.created/modified with the wall clock, which would make
# two builds of the same source differ byte for byte and defeat the SHA-256
# manifest in public/fonts/README.md. Pinned to the same constant the Achimari
# Hand build uses, in the font epoch (seconds since 1904-01-01).
BUILD_TIMESTAMP = 3873657600


def fetch(url: str) -> bytes:
    request = urllib.request.Request(url, headers={"User-Agent": "achimari-font-vendor"})
    with urllib.request.urlopen(request, timeout=120) as response:  # noqa: S310
        return response.read()


def write(path: Path, payload: bytes) -> str:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(payload)
    digest = hashlib.sha256(payload).hexdigest()
    print(f"  {path.relative_to(APP_ROOT)}  {len(payload):>7,} bytes  sha256:{digest[:16]}…")
    return digest


def vendor_plex() -> list[tuple[str, str, int]]:
    print("IBM Plex — official upstream WOFF2, vendored byte for byte")
    records = []
    for directory, filename, package in PLEX_FACES:
        url = f"{PLEX_RAW}/packages/{package}/fonts/complete/woff2/{filename}"
        payload = fetch(url)
        if payload[:4] != b"wOF2":
            raise SystemExit(f"{filename}: upstream file is not WOFF2")
        digest = write(FONTS_DIR / directory / filename, payload)
        records.append((f"{directory}/{filename}", digest, len(payload)))
    return records


def vendor_unbounded() -> list[tuple[str, str, int]]:
    print("Unbounded — official upstream variable TTF, subset and converted here")
    source = fetch(f"{GOOGLE_RAW}/ofl/unbounded/Unbounded%5Bwght%5D.ttf")
    source_digest = hashlib.sha256(source).hexdigest()
    print(f"  upstream Unbounded[wght].ttf  {len(source):>7,} bytes  sha256:{source_digest[:16]}…")

    font = TTFont(io.BytesIO(source), recalcTimestamp=False)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["ccmp", "locl", "kern", "mark", "mkmk"]
    options.name_IDs = [0, 1, 2, 3, 4, 5, 6, 13, 14, 16, 17]
    options.name_legacy = False
    options.notdef_outline = True
    options.drop_tables = ["DSIG"]
    subsetter = subset.Subsetter(options=options)
    subsetter.populate(unicodes=subset.parse_unicodes(UNICODES))
    subsetter.subset(font)
    font = instancer.instantiateVariableFont(font, DISPLAY_AXIS, updateFontNames=False)

    # instantiateVariableFont returns a fresh TTFont, so the subsetter's flavor
    # does not travel with it. Set it explicitly or the file saves as raw TTF.
    font.flavor = "woff2"
    font.recalcTimestamp = False
    font["head"].created = BUILD_TIMESTAMP
    font["head"].modified = BUILD_TIMESTAMP

    buffer = io.BytesIO()
    font.save(buffer)
    payload = buffer.getvalue()
    digest = write(FONTS_DIR / "unbounded" / "Unbounded-Variable.woff2", payload)
    return [
        ("unbounded/Unbounded-Variable.woff2", digest, len(payload)),
        ("(source) ofl/unbounded/Unbounded[wght].ttf", source_digest, len(source)),
    ]


def vendor_licences() -> None:
    print("Licences — SIL Open Font License 1.1, retained beside the faces")
    for path, url in [
        (FONTS_DIR / "unbounded" / "OFL.txt", f"{GOOGLE_RAW}/ofl/unbounded/OFL.txt"),
        (FONTS_DIR / "ibm-plex-sans" / "LICENSE.txt", f"{PLEX_RAW}/LICENSE.txt"),
        (FONTS_DIR / "ibm-plex-sans-condensed" / "LICENSE.txt", f"{PLEX_RAW}/LICENSE.txt"),
        (FONTS_DIR / "ibm-plex-mono" / "LICENSE.txt", f"{PLEX_RAW}/LICENSE.txt"),
    ]:
        write(path, fetch(url))


def main() -> int:
    records = vendor_plex()
    records += vendor_unbounded()
    vendor_licences()

    print("\nSHA-256 manifest (record these in public/fonts/README.md):")
    for name, digest, size in records:
        print(f"  {digest}  {size:>8,}  {name}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
