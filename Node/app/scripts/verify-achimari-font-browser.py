#!/usr/bin/env python3.11
"""Browser-level verification for the self-hosted Achimari Hand font."""

import os

from playwright.sync_api import sync_playwright

BASE_URL = os.environ.get("ACHIMARI_BASE_URL", "http://127.0.0.1:3014")
VIEWPORTS = ((320, 720), (768, 900), (1024, 900), (1440, 900))

def main():
    console_errors = []
    failed_requests = []

    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(headless=True)
        page = browser.new_page()
        page.on("console", lambda message: console_errors.append(message.text) if message.type == "error" else None)
        page.on("requestfailed", lambda request: failed_requests.append(request.url))

        for width, height in VIEWPORTS:
            page.set_viewport_size({"width": width, "height": height})
            response = page.goto(f"{BASE_URL}/login")
            page.wait_for_load_state("networkidle")
            page.wait_for_function(
                "!document.documentElement.classList.contains('page-loading') && "
                "!document.documentElement.classList.contains('page-entering')"
            )
            assert response and response.ok, f"Login returned {response.status if response else 'no response'}"
            assert page.evaluate("document.fonts.check('24px \\\"Achimari Hand\\\"')")
            assert page.locator("h1").evaluate(
                "element => getComputedStyle(element).fontFamily.includes('Achimari Hand')"
            )
            assert page.evaluate(
                "document.documentElement.scrollWidth === document.documentElement.clientWidth"
            ), f"Horizontal overflow at {width}px"

            if width in (320, 1440):
                page.screenshot(path=f"/tmp/achimari-font-login-{width}.png", full_page=True)

        page.set_viewport_size({"width": 1440, "height": 900})
        response = page.goto(f"{BASE_URL}/onboarding")
        page.wait_for_load_state("networkidle")
        page.wait_for_function(
            "!document.documentElement.classList.contains('page-loading') && "
            "!document.documentElement.classList.contains('page-entering')"
        )
        assert response and response.ok
        assert page.locator("h1").evaluate(
            "element => getComputedStyle(element).fontFamily.includes('Achimari Hand')"
        )

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

        browser.close()

    assert not console_errors, f"Console errors: {console_errors}"
    assert not failed_requests, f"Failed requests: {failed_requests}"
    print("Achimari Hand loaded on auth pages and the active battle scope at 320–1440px")

if __name__ == "__main__":
    main()
