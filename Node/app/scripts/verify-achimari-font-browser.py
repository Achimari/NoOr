#!/usr/bin/env python3.11
"""Browser-level verification for the self-hosted Achimari Hand font.

CSS assertions alone cannot tell you whether the face actually rasterised: a
missing file, a bad charstring or a silent fallback all leave the stylesheet
looking perfect. This drives a real browser at every supported viewport and at
both device-pixel ratios, checks that the rendered glyphs really are Achimari
Hand rather than the `cursive` fallback, and captures screenshots to look at.

    ACHIMARI_BASE_URL=http://127.0.0.1:3002 python3.11 scripts/verify-achimari-font-browser.py
"""

import os
from pathlib import Path

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("ACHIMARI_BASE_URL", "http://127.0.0.1:3014")
SHOT_DIR = Path(os.environ.get("ACHIMARI_SHOT_DIR", "/tmp/achimari-font"))

# The full supported range, not a sample of it.
WIDTHS = (320, 390, 768, 1024, 1440)
DEVICE_PIXEL_RATIOS = (1, 2)

SETTLED = (
    "!document.documentElement.classList.contains('page-loading') && "
    "!document.documentElement.classList.contains('page-entering')"
)

# Does the branded face actually paint? Compare its advance width against the
# generic fallback's: if the file failed to load they measure identically.
RENDERS_BRANDED_FACE = """
() => {
  const ctx = document.createElement('canvas').getContext('2d');
  const sample = 'Handwriting 0123456789';
  ctx.font = '40px "Achimari Hand", cursive';
  const branded = ctx.measureText(sample).width;
  ctx.font = '40px cursive';
  const fallback = ctx.measureText(sample).width;
  return { branded, fallback, distinct: Math.abs(branded - fallback) > 1 };
}
"""


def check_page(page, url, label, width, dpr, shots):
    response = page.goto(url)
    assert response and response.ok, f"{label} returned {response.status if response else 'no response'}"
    page.wait_for_load_state("networkidle")
    page.wait_for_function(SETTLED)
    page.wait_for_function("document.fonts.check('24px \\\"Achimari Hand\\\"')")

    probe = page.evaluate(RENDERS_BRANDED_FACE)
    assert probe["distinct"], (
        f"{label} at {width}px/dpr{dpr}: text measured identically to the generic "
        f"fallback ({probe['branded']} vs {probe['fallback']}) — the face did not load"
    )

    assert page.locator("h1").first.evaluate(
        "element => getComputedStyle(element).fontFamily.includes('Achimari Hand')"
    ), f"{label}: h1 is not set in Achimari Hand"

    # Every visible run of text must come from the one family, and none of it
    # may fall under the 16px floor.
    offenders = page.evaluate(
        """
        () => {
          const bad = [];
          for (const el of document.querySelectorAll('body *')) {
            const cs = getComputedStyle(el);
            if (cs.display === 'none' || cs.visibility === 'hidden') continue;
            if (el.closest('.sr-only, .visually-hidden')) continue;
            const owns = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
            if (!owns || !el.getBoundingClientRect().height) continue;
            const name = (typeof el.className === 'string' && el.className) || el.tagName;
            if (!/Achimari Hand/.test(cs.fontFamily)) bad.push(`${name}: ${cs.fontFamily}`);
            if (parseFloat(cs.fontSize) < 16) bad.push(`${name}: ${cs.fontSize}`);
            if (Number(cs.fontWeight) > 400) bad.push(`${name}: weight ${cs.fontWeight}`);
          }
          return [...new Set(bad)];
        }
        """
    )
    assert not offenders, f"{label} at {width}px/dpr{dpr}: {offenders}"

    assert page.evaluate(
        "document.documentElement.scrollWidth === document.documentElement.clientWidth"
    ), f"Horizontal overflow on {label} at {width}px/dpr{dpr}"

    if width in (320, 390, 1440):
        SHOT_DIR.mkdir(parents=True, exist_ok=True)
        path = SHOT_DIR / f"{label}-{width}-dpr{dpr}.png"
        page.screenshot(path=str(path), full_page=True)
        shots.append(path)


def main():
    console_errors = []
    failed_requests = []
    shots = []

    # Pre-existing and documented: the optional battle pose art is not in the
    # repository and the arena falls back to drawn silhouettes by design.
    ignorable = ("/images/battle/characters/",)

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)

        for dpr in DEVICE_PIXEL_RATIOS:
            context = browser.new_context(device_scale_factor=dpr)
            context.on(
                "console",
                lambda message: console_errors.append(message.text)
                if message.type == "error" and not any(i in message.text for i in ignorable)
                else None,
            )
            context.on(
                "requestfailed",
                lambda request: failed_requests.append(request.url)
                if not any(i in request.url for i in ignorable)
                else None,
            )
            page = context.new_page()

            for width in WIDTHS:
                page.set_viewport_size({"width": width, "height": 900})
                check_page(page, f"{BASE_URL}/login", "login", width, dpr, shots)

            page.set_viewport_size({"width": 1440, "height": 900})
            check_page(page, f"{BASE_URL}/onboarding", "onboarding", 1440, dpr, shots)

            # The active battle scope re-declares its own type roles; verify the
            # face survives that override too.
            page.set_content(
                """
                <link rel="stylesheet" href="/styles/variables.css">
                <link rel="stylesheet" href="/styles/globals.css">
                <main class="battle-active"><h1>Battle</h1><p>Further than yesterday.</p></main>
                """
            )
            page.wait_for_load_state("networkidle")
            page.wait_for_function("document.fonts.check('24px \\\"Achimari Hand\\\"')")
            assert page.locator(".battle-active").evaluate(
                "element => getComputedStyle(element).fontFamily.includes('Achimari Hand')"
            )

            context.close()

        browser.close()

    assert not console_errors, f"Console errors: {console_errors}"
    assert not failed_requests, f"Failed requests: {failed_requests}"
    print(
        "Achimari Hand verified at "
        f"{'/'.join(str(w) for w in WIDTHS)}px and DPR "
        f"{'/'.join(str(d) for d in DEVICE_PIXEL_RATIOS)}; "
        f"{len(shots)} screenshots in {SHOT_DIR}"
    )


if __name__ == "__main__":
    main()
