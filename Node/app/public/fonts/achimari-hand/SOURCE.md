# Achimari Hand source and build notes

Achimari Hand is the single handwritten typeface used throughout the Achimari
website. The project owner's supplied specimen is the visual direction: thin
monoline strokes, narrow letters, tall ascenders, an upright stance, and a
relaxed handwritten rhythm.

## Construction

The specimen is a flat presentation rather than editable font source. To make a
reliable webfont with complete metrics, the font is constructed from Handlee
Regular, the closest matching open-source outline family, then modified for the
specimen:

- outlines are scaled to 96% width and 104% height;
- the family and PostScript names are replaced with `Achimari Hand` and
  `AchimariHand-Regular` (the source family name is reserved);
- `×`, `‰`, `Ý`, and `ý`, visible in the specimen but absent from the source,
  are constructed from matching source outlines;
- quadratic TrueType outlines are converted to cubic CFF charstrings and saved
  as a genuine `.otf` file;
- source kerning and substitution tables are preserved.

The pinned construction source is `scripts/font-source/Handlee-Regular.ttf`,
SHA-256 `7b99c0f291b5d52e06c66498a1d0dd6dff45a32e32d13be089c60d2d8dc00445`.
It was obtained from the official Google Fonts repository, whose metadata points
to upstream commit `f9930b13dd4ace03636c6260d73cacb5fa30a107`.

Run the reproducible build from `Node/app`:

```sh
python3.11 -m pip install -r scripts/font-requirements.txt
python3.11 scripts/build-achimari-font.py
```

The pinned build dependency is `fontTools` 4.64.0. The script writes
`public/fonts/achimari-hand/AchimariHand-Regular.otf`.

## Licence

Achimari Hand is a modified font and remains under the SIL Open Font License
1.1. The complete licence is stored in `OFL.txt` beside the generated font.
Handlee is Copyright (c) 2011, Joe Prince, Vissol Ltd., with Reserved Font Name
“Handlee.” The derivative does not use that reserved family name.
