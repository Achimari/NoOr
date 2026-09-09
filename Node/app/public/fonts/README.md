# Achimari webfonts — provenance and licence status

This directory is the only place the product loads fonts from. Every declared
face is self-hosted and same-origin; the application makes no third-party font
request.

## Active face

| Family | Role | File status | Licence |
| --- | --- | --- | --- |
| Achimari Hand | All website typography | **Generated** as `achimari-hand/AchimariHand-Regular.otf` | SIL Open Font License 1.1 |

Achimari Hand follows the project owner's supplied specimen: a thin, narrow,
upright handwritten face. Because the specimen is a flat image rather than
editable outlines, the generated font uses the OFL-licensed Handlee Regular as
its construction source, with renamed metadata, specimen-matched proportions,
additional specimen glyphs, and true CFF/OpenType outlines. Full technical
provenance and the reproducible build command are in
`achimari-hand/SOURCE.md`; the complete licence is in `achimari-hand/OFL.txt`.

The resulting Regular face contains Latin Extended characters and the specimen's
math and punctuation additions. Unsupported scripts, including Cyrillic, fall
through to the system sans-serif stack instead of displaying missing-glyph boxes.
No bold or italic face is invented by the browser.

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

Then run `npm test` and `npm run build:assets`. The typography contract verifies
that the generated file exists, has the CFF/OpenType `OTTO` signature, is loaded
locally with `font-display: swap`, and owns every website typography role.
