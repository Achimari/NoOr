# Achimari Hand source and build notes

Achimari Hand is the single handwritten typeface used throughout the Achimari
website. The project owner's supplied specimen is the visual direction: thin
monoline strokes, tall ascenders, an upright stance, and a relaxed handwritten
rhythm.

## Construction

The specimen is a flat presentation rather than editable font source. To make a
reliable webfont with complete metrics, the font is constructed from Handlee
Regular, the closest matching open-source outline family, then modified for the
specimen:

- the family and PostScript names are replaced with `Achimari Hand` and
  `AchimariHand-Regular` (the source family name is reserved);
- outlines are scaled to 102% width and 105% height;
- every outline is dilated by 4 units along its outward normal, adding 8 units
  of stroke on every stem and bowl;
- each advance gains 12 units of side bearing, split evenly either side;
- `×`, `‰`, `Ý`, and `ý`, visible in the specimen but absent from the source,
  are constructed from matching source outlines;
- quadratic TrueType outlines are converted to cubic CFF charstrings and saved
  as a genuine `.otf` file;
- OS/2 x-height, cap-height, ascent and descent are measured from the built
  outlines rather than left at zero;
- CFF alignment zones (`BlueValues`, `OtherBlues`) and stem widths (`StdHW`,
  `StdVW`, `StemSnapH`, `StemSnapV`) are supplied, measured from the built
  outlines;
- source kerning and substitution tables are preserved.

## Version 2.000 — screen optimisation, 2026-09-10

Version 1.000 squeezed the face horizontally (X 0.96) against its Handlee
construction. Measured on the built outlines, that narrowed counters and thinned
every stroke:

| Measure (font units, upem 1000) | Handlee source | v1.000 | v2.000 |
| --- | --- | --- | --- |
| Median stroke width | 69.7 | 66.9 | 78.8 |
| `o` counter at mid x-height | — | 261.2 | 270.2 |
| `e` counter at mid x-height | — | 159.9 | 161.0 |
| `a` counter at mid x-height | — | 180.4 | 182.7 |
| OS/2 sxHeight | — | 0 (absent) | 541 |
| OS/2 sCapHeight | — | 0 (absent) | 758 |
| CFF `BlueValues` | — | absent | 8 zones |
| CFF `StdVW` | — | absent | 74 |
| CFF `StemSnapV` | — | absent | 66 / 74 / 82 |

At 16px, v1.000's stroke resolved to 1.07 CSS px — under one device pixel at
DPR 1, so browsers rendered it as a grey smear. v2.000 lands at 1.26px while
leaving counters *wider* than v1.000, because the 102%/105% scaling more than
offsets what the dilation takes back. The face is ~18% heavier in stroke and
still far from bold (a real bold is +60–80%).

Four candidates were built and compared in a browser specimen at DPR 1 and 2,
on white paper, muted paper, the lightest and darkest cloud composites, buttons,
a statistics table and a battle HUD:

| Candidate | X | Y | Dilation | Side bearing | Median stroke |
| --- | --- | --- | --- | --- | --- |
| A — original control | 0.96 | 1.04 | 0 | 0 | 66.9 |
| B — natural width | 1.00 | 1.04 | 0 | 0 | 69.5 |
| C — screen width | 1.02 | 1.05 | 0 | +12 | 71.0 |
| **D — screen strengthened (shipped)** | **1.02** | **1.05** | **4 units** | **+12** | **78.8** |
| D5 — heavier, rejected | 1.02 | 1.05 | 5 units | +12 | 80.8 |

D was selected as the smallest change that measurably improved DPR 1 rendering.
D5 read no better and pulled the `e` counter (158.2) below what v1.000 already
shipped (159.9).

The dilation is a real, deterministic outline operation in the build pipeline
(`OffsetPen`), not a CSS effect, a duplicated contour or a synthesised weight.
Direction is decided by contour *nesting*, not winding: Handlee does not use a
consistent outer/inner winding convention, and deriving direction from signed
area expanded the counters of `o`, `a` and `e` along with their outer walls,
leaving bowls at their original weight while stems thickened.

The global stylesheet's `-webkit-font-smoothing: antialiased` and
`-moz-osx-font-smoothing: grayscale` were removed at the same time. They forced
macOS from subpixel to grayscale rasterisation, thinning exactly the strokes
this revision strengthens.

## Reproducing the build

The pinned construction source is `scripts/font-source/Handlee-Regular.ttf`,
SHA-256 `7b99c0f291b5d52e06c66498a1d0dd6dff45a32e32d13be089c60d2d8dc00445`.
It was obtained from the official Google Fonts repository, whose metadata points
to upstream commit `f9930b13dd4ace03636c6260d73cacb5fa30a107`. The source file
is never modified.

Run the reproducible build from `Node/app`:

```sh
python3.11 -m pip install -r scripts/font-requirements.txt
python3.11 scripts/build-achimari-font.py
```

Pinned build dependencies are `fontTools` 4.64.0 and `afdko` 4.0.1.

## Per-glyph autohinting — opt-in, and why

The face ships the Private-dict hinting above (alignment zones and stem widths),
which is what a CFF rasteriser reads to snap the baseline, x-height and
cap-height. It does **not** ship per-glyph charstring hints.

`otfautohint` is wired into the build and invoked as `python -m
afdko.otfautohint` under the same pinned interpreter, so it never depends on a
globally installed binary. It is behind `--autohint` because its path analysis
is pathologically slow on these outlines once they are dilated: candidate A
(undilated) hints the full 208 glyphs in about 13 minutes, while the shipped
dilated outlines did not finish five glyphs in ten. The likely cause is
self-intersection introduced by normal-offset dilation at sharp corners. The fix
is an overlap-removal pass on the dilated contours before hinting (`pyclipper`
is already an afdko dependency); that is deliberately left for a follow-up
rather than rushed, and `test/typography-contract.test.js` pins the decision so
it is revisited on purpose.

```sh
python3.11 scripts/build-achimari-font.py --autohint   # slow; see above
```

To rebuild the evaluation candidates instead of the production font:

```sh
python3.11 scripts/build-achimari-font.py --all-candidates --out-dir /tmp/cand
python3.11 scripts/build-achimari-font.py --candidate C --out-dir /tmp/cand
```

The build is deterministic: `head.created` and `head.modified` are pinned to a
fixed timestamp, so the same source and candidate parameters produce
byte-identical output. Verified:

```sh
python3.11 scripts/build-achimari-font.py && shasum -a 256 public/fonts/achimari-hand/AchimariHand-Regular.otf
python3.11 scripts/build-achimari-font.py && shasum -a 256 public/fonts/achimari-hand/AchimariHand-Regular.otf
# 150500e2d8f60bf9fa75101d758950e01b156c6fea4ac9587e27e0c5d466a85a  (both runs)
```

## Licence

Achimari Hand is a modified font and remains under the SIL Open Font License
1.1. The complete licence is stored in `OFL.txt` beside the generated font.
Handlee is Copyright (c) 2011, Joe Prince, Vissol Ltd., with Reserved Font Name
“Handlee.” The derivative does not use that reserved family name.
