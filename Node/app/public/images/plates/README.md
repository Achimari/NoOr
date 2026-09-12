# Achimari press plates — provenance

A plate is a printed image: monochrome, screened, and toned to the paper it sits
on, so it reads as ink on the sheet rather than as a photograph pasted over it.
Every file here is built by `scripts/build-press-plates.py` from a source this
project owns. Nothing is stock, nothing is scraped, nothing is downloaded at
build time, and nothing is cropped out of a generated composition reference.

**Retoned 2026-09-12.** The plates were toned to a mineral paper (`#d7d0c5`) and
a warm graphite ink (`#171715`) until the owner moved the product to black and
white. Those two values were baked into every pixel, and no stylesheet can pull
a warm tint back out of a compressed file — so `PAPER` and `INK` in the build
script are now `#ffffff` and `#000000`, and all twelve files below were rebuilt
from source. `test/plate-neutrality.test.js` decodes the shipped files and holds
them to a measured tolerance rather than trusting this paragraph.

## The six placements

| Plate | Placement | Slot | Source | Source size |
| --- | --- | --- | --- | --- |
| `gateway` | Login / onboarding opening | `.auth-plate.press-plate` | The project's own sky photograph, `public/videos/ambient-sky.jpg` | 1200x1500 |
| `terrain` | Progress opening | `.progress-plate.press-plate` | **Original.** Seeded value-noise contour bands | 1400x875 |
| `book` | Today opening | `.today-plate.press-plate` | **Original.** Modelled open book, sphere-traced | 1400x600 |
| `hands` | My Prayers + Community opening | `.prayers-plate.press-plate` | **Original.** Modelled pair of hands, sphere-traced | 1400x700 |
| `bust` | Profile character plate | `.profile-portrait.press-plate` | **Original.** Modelled anonymous bust, sphere-traced | 800x1000 |
| `arena` | Battle stage | `.battle-plate-art.press-plate` | **Original.** Drawn perspective floor etch | 1600x900 |

Each plate also ships a `-small` variant at half width, so `srcset` can hand a
phone the light one.

## Where each image comes from

`gateway` is the same photograph the retired ambient backdrop used. It is not a
new image: it is that picture art-directed as a print plate — cover-cropped,
pushed through a press curve that crushes the sky to a real black and holds the
cloud highlights, blended with a rotated halftone screen, and toned from paper
to ink.

`terrain` is drawn, not photographed. The script builds a multi-octave value
noise field from a pinned seed, biases it radially so it reads as a landmass,
and draws contour lines where the elevation crosses a step — every fifth contour
printed heavier as an index line, with a light stipple in the low ground for
printed tooth.

`book`, `hands` and `bust` are **modelled**. Each subject is built as a signed
distance field out of boxes, ellipsoids, capsules and half-space cuts, sphere-
traced by the small renderer in the same script, lit by one key light and a
bounced fill with an ambient-occlusion term, and handed to the same press screen
every other plate goes through. No photograph, scan, engraving, model file or
reference image is read at any point: every surface is an equation in
`scripts/build-press-plates.py`, which is what makes these original work the
project owns outright.

- **book** — two bowed leaves over a stack of sixteen progressively shorter
  sheets, which is what gives the plate its stepped fore-edge. The spine is a
  carved gutter, not a seam. There is no lettering on the pages, generated or
  otherwise.
- **hands** — two hands in a restrained gesture of support: one open and
  offered, one reaching across to it. Built to real proportion (palm ~55% of
  hand length, index < middle > ring > little, a thumb that leaves the palm low
  and across, and the thenar pad that makes a hand read as a hand). No faces, no
  props, no clasping and no staging.
- **bust** — an anonymous carved bust. Deliberately featureless: a generated
  face is both a likeness risk and the fastest way to make a plate look
  synthetic, so this is a cranium, a brow, a jaw, a neck, a chest and a plinth,
  chiselled back by flat planes. It is nobody's likeness and no player identity
  is invented on it — the reader's own chosen emblem is stamped over it in the
  markup.

`arena` is scenery and only scenery. It is a perspective floor etch — concentric
sweep lines and a few long spokes, a stippled tooth, a soft back wall and four
eroded standing stones at the left and right margins. Its centre and its whole
upper band are held open by construction, because that is where the two live
combatants and the HUD go. **No figure, meter, label, bar or effect is baked
into it.** The battle owns all of those, and a stage that drew its own would
double them.

## Neutrality

Measured on the shipped files by decoding them and taking `max(R,G,B) -
min(R,G,B)` per pixel:

| Encoding | Max channel spread | Mean spread |
| --- | ---: | ---: |
| JPEG | 0 | 0.00 |
| WebP | 1 | <=0.06 |
| AVIF | 1 | <=0.06 |

JPEG is exactly neutral. WebP and AVIF are subsampled chroma formats, so a
single least-significant bit of drift survives round-tripping; `1/255` is the
documented tolerance, not an exemption, and the test fails on anything above it.

## Encodings

Each plate ships at two widths, and each width as AVIF, WebP and a JPEG
fallback, so `<picture>` hands the browser the smallest format it understands
and the markup can declare real intrinsic dimensions.

| File | Bytes |
| --- | ---: |
| `gateway.avif` | 89,586 |
| `gateway.webp` | 314,370 |
| `gateway.jpg` | 416,308 |
| `gateway-small.avif` | 36,313 |
| `gateway-small.webp` | 94,524 |
| `gateway-small.jpg` | 111,411 |
| `terrain.avif` | 138,346 |
| `terrain.webp` | 140,110 |
| `terrain.jpg` | 259,247 |
| `terrain-small.avif` | 58,913 |
| `terrain-small.webp` | 61,972 |
| `terrain-small.jpg` | 99,006 |
| `book.avif` | 47,186 |
| `book.webp` | 123,762 |
| `book.jpg` | 179,181 |
| `book-small.avif` | 13,729 |
| `book-small.webp` | 31,498 |
| `book-small.jpg` | 44,455 |
| `hands.avif` | 51,180 |
| `hands.webp` | 124,038 |
| `hands.jpg` | 196,311 |
| `hands-small.avif` | 15,709 |
| `hands-small.webp` | 36,510 |
| `hands-small.jpg` | 52,481 |
| `bust.avif` | 47,887 |
| `bust.webp` | 117,186 |
| `bust.jpg` | 177,008 |
| `bust-small.avif` | 15,800 |
| `bust-small.webp` | 30,420 |
| `bust-small.jpg` | 46,363 |
| `arena.avif` | 132,526 |
| `arena.webp` | 176,042 |
| `arena.jpg` | 297,393 |
| `arena-small.avif` | 32,164 |
| `arena-small.webp` | 37,332 |
| `arena-small.jpg` | 72,920 |

A pure halftone is the most faithful print simulation and the least compressible
thing you can put on a page — the dot grid is high-frequency noise, and it cost
roughly ten times the bytes for no visible gain at the sizes these are actually
displayed at. The screen is therefore blended back into the continuous tone at
20-36%, which keeps the printed texture where the eye looks for it and keeps the
plate affordable. `arena` is the heaviest file in the set because its floor
stipple is uncorrelated noise by design; its dot density is tuned against the
weight cap in `test/ambient-media-scope.test.js`.

Ink coverage below `MIN_DOT` (5.5%) is dropped to bare paper. Without that clamp
the screen lays a faint dot everywhere and the whole plate reads as a grey
rectangle on a white page — which is exactly what it did before the clamp was
added. It is also what a real press does: below a few percent, a plate holds no
dot at all.

## Rebuilding

From `Node/app`:

```sh
python3.11 -m pip install -r scripts/font-requirements.txt
python3.11 scripts/build-press-plates.py             # all twelve files
python3.11 scripts/build-press-plates.py book arena  # or just the named ones
```

Requires `cwebp` and `avifenc` on PATH. Every generator is seeded or fully
deterministic, so the same command redraws the same pixels every run.

The paper fibre under the whole sheet is a separate asset with its own
generator: `scripts/build-paper-texture.py` writes
`public/textures/paper-fiber.webp`. It is a neutral grey in the alpha channel
and needed no retoning for the monochrome direction; what changed is
`--paper-texture-opacity`, from 0.5 to 0.22, because the same layer that was
felt on a mineral ground turned a white sheet grey.
