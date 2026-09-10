# Achimari webfonts — provenance and licence status

This directory is the only place the product loads fonts from. Every declared
face is self-hosted and same-origin; the application makes no third-party font
request.

## Active face

| Family | Role | File status | Licence |
| --- | --- | --- | --- |
| Achimari Hand | All website typography | **Generated** as `achimari-hand/AchimariHand-Regular.otf` | SIL Open Font License 1.1 |

Achimari Hand follows the project owner's supplied specimen: a thin, upright
handwritten face. Because the specimen is a flat image rather than editable
outlines, the generated font uses the OFL-licensed Handlee Regular as its
construction source, with renamed metadata, specimen-matched proportions,
additional specimen glyphs, and true CFF/OpenType outlines.

The active file is **version 2.000**, a screen-optimised revision. Version 1.000
was built at 96% width, which thinned every stroke to roughly one CSS pixel at
interface sizes and left OS/2 x-height, cap-height and all CFF hinting data
empty. Version 2.000 is built at natural width with a small deterministic
outline dilation, and carries measured vertical metrics plus CFF alignment zones
and stem widths. Counters are wider than 1.000's, not narrower. Per-glyph
autohinting is available behind `--autohint` but is not in the shipped file;
`achimari-hand/SOURCE.md` records why.
Full technical provenance, the candidate comparison and the reproducible build
command are in `achimari-hand/SOURCE.md`; the complete licence is in
`achimari-hand/OFL.txt`.

The resulting Regular face contains Latin Extended characters and the specimen's
math and punctuation additions. Unsupported scripts, including Cyrillic, fall
through to the generic `cursive` fallback instead of displaying missing-glyph
boxes; that fallback exists only for load failure and missing glyphs, and is
never selected as an interface font. No bold or italic face is invented by the
browser: `font-synthesis: none` is set globally, because the family ships one
real 400 weight.

## Inactive owner-supplied files

The earlier `Kitaro Road` and `Sagfield` files remain untouched in their
directories so owner-supplied assets are not destroyed. They are no longer
declared by CSS or used by any typography role. Their external web-licence status
was not verified in this repository, so they should remain inactive unless the
owner confirms the appropriate licences.

## Rebuilding

From `Node/app`, run:

```sh
python3.11 -m pip install -r scripts/font-requirements.txt
python3.11 scripts/build-achimari-font.py
```

The build takes under a second and is byte-deterministic. Then run `npm test`
and `npm run build:assets`. The typography contract parses the shipped binary
and verifies that it has the CFF/OpenType `OTTO` signature, carries version
2.000, real OS/2 x-height and cap-height, CFF alignment zones matching those
measured heights, stem widths, is loaded locally with `font-display: swap`, and
owns every website typography role.

For a browser-level check that the face actually rasterises rather than silently
falling back, run the app and then:

```sh
ACHIMARI_BASE_URL=http://127.0.0.1:3002 python3.11 scripts/verify-achimari-font-browser.py
```

It drives Chromium at 320/390/768/1024/1440px and at device-pixel ratios 1 and 2,
and writes screenshots for inspection.
