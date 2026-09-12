# Achimari webfonts — provenance and licence status

This directory is the only place the product loads fonts from. Every declared
face is self-hosted, same-origin and WOFF2; the application makes no font
request to Google Fonts or any other third-party origin. `variables.css` is the
only file that declares an `@font-face`, and `test/typography-contract.test.js`
parses the shipped binaries to prove that what the stylesheet promises is what
the files actually deliver.

## Active faces — Sacred Press

Four semantic roles, drawn from three families. The role a piece of text has
decides its family; nothing picks a font by taste.

| Role | Family | Files | Licence |
| --- | --- | --- | --- |
| display | Unbounded Variable | `unbounded/Unbounded-Variable.woff2` | SIL Open Font License 1.1 |
| UI | IBM Plex Sans Condensed | `ibm-plex-sans-condensed/IBMPlexSansCondensed-{Regular,SemiBold}.woff2` | SIL Open Font License 1.1 |
| body / reading | IBM Plex Sans | `ibm-plex-sans/IBMPlexSans-{Regular,SemiBold}.woff2` | SIL Open Font License 1.1 |
| data | IBM Plex Mono | `ibm-plex-mono/IBMPlexMono-{Regular,SemiBold}.woff2` | SIL Open Font License 1.1 |

**display** carries the wordmark, `h1`, a selected `h2` and a small number of
major editorial numerals — never a label, a button, a form or a table. The
contract keeps that list closed. **UI** is condensed because the interface is
dense and the page is not. **body** is the wider face, used where prose has to
be read in quantity. **data** is monospaced, so a column of figures lines up and
a counting number stops jumping.

Every face covers Latin and Cyrillic, so English and Russian are both set in the
real family rather than falling through to a system fallback. The contract
asserts full A–Z, А–Я, digits and interface punctuation against each binary's
own `cmap`.

### Weights

IBM Plex ships static 400 and 600 faces here, and those are the only two weights
any Plex role may request. Unbounded ships as one variable file whose weight
axis runs 400–900, so both display steps (700 and 800) are real interpolated
instances. `font-synthesis: none` is set globally, so the browser never invents
a weight or a slant, and no role can quietly resolve to a smeared outline.

## Licences

The complete SIL Open Font License 1.1 text is kept beside each family:

- `unbounded/OFL.txt` — from `google/fonts`, `ofl/unbounded/OFL.txt`
- `ibm-plex-sans/LICENSE.txt`, `ibm-plex-sans-condensed/LICENSE.txt`,
  `ibm-plex-mono/LICENSE.txt` — from `IBM/plex`, `LICENSE.txt`

Both projects are OFL 1.1, which permits self-hosting, subsetting and format
conversion provided the licence travels with the files. It does, above.

## Provenance and SHA-256 manifest

IBM publishes built WOFF2 upstream, so those six files are vendored byte for
byte. Google publishes Unbounded as a variable TTF only, so it is converted
locally with fontTools, subset to Latin and Cyrillic plus the punctuation both
need, and clamped to the 400–900 band the display role uses. It remains a
variable font.

| SHA-256 | Bytes | File |
| --- | ---: | --- |
| `a71a56e516751883cb7877112d39f9c13b92c2dc15caaf00277b7f9d941d673a` | 63,228 | `ibm-plex-sans-condensed/IBMPlexSansCondensed-Regular.woff2` |
| `385a082a1eac88343eab01fb6746be04b7175dacaf4550b17dee76ea0f78126d` | 66,040 | `ibm-plex-sans-condensed/IBMPlexSansCondensed-SemiBold.woff2` |
| `ba711a3085ff9f27440b6b9c4550cfc47c97bf36591d5da958b975bb3add8c1a` | 63,020 | `ibm-plex-sans/IBMPlexSans-Regular.woff2` |
| `f78048030eab62e860efa39a0df79e2e5581bf122eb95b9bc42c0b8a4988d205` | 67,060 | `ibm-plex-sans/IBMPlexSans-SemiBold.woff2` |
| `ba204497f16b6d334cee9d1e963a831b73e3a56e1d6300a8489d18df7214b350` | 49,248 | `ibm-plex-mono/IBMPlexMono-Regular.woff2` |
| `6a825b4824c01cbb401e829e5a066a1818411bcb3538b5a5792c5ca9b82343c3` | 50,600 | `ibm-plex-mono/IBMPlexMono-SemiBold.woff2` |
| `5f2208b6f4c722f7439428f473c6989f1bf405801f130ba5ffd73b3ee383cac6` | 51,440 | `unbounded/Unbounded-Variable.woff2` |

The Unbounded source that conversion starts from is
`google/fonts` `ofl/unbounded/Unbounded[wght].ttf`, version 1.701, SHA-256
`323b511be380c8d474ef030686b71aedde501f8d9cd46da558b7c40454372c3f`.

Total shipped type payload: **410 KB** across seven files, of which 51 KB is the
display face. Two are preloaded — the condensed UI Regular, which the first
painted text is set in, and the display variable file, which draws the largest
text on screen. Nothing else is preloaded.

## Rebuilding

From `Node/app`:

```sh
python3.11 -m pip install -r scripts/font-requirements.txt
python3.11 scripts/vendor-sacred-press-fonts.py
```

The build is byte-deterministic: `head.created` and `head.modified` are pinned
to a constant and timestamp recalculation is switched off, so two runs of the
same source produce identical bytes and the manifest above stays checkable. The
script prints the manifest it just wrote; if a digest here disagrees with it,
one of the two is wrong and neither should be trusted until that is resolved.

Then run `npm test` and `npm run build:assets`.

## Retired faces

**Achimari Hand** was the single handwritten family that carried every visible
role before the Sacred Press overhaul recorded in `CONSTRAINTS.md` on
2026-09-11. It is no longer declared by any stylesheet, requested by any view or
preloaded by either document shell, and its generated binary has been removed
from this served path — an unused 51 KB font in a production asset directory is
a cost with no consumer.

The work is not destroyed: `scripts/build-achimari-font.py` and
`achimari-hand/SOURCE.md` remain, and the face can be regenerated in under a
second from pinned dependencies if the owner ever wants it back. Its OFL licence
text stays in `achimari-hand/OFL.txt`.

**Kitaro Road** and **Sagfield** were owner-supplied commercial faces whose web
licence status was never verified in this repository. No file for either was
ever installed here, and none may be downloaded, converted or imitated.
