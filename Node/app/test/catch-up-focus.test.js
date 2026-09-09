import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";
import vm from "node:vm";

const source = readFileSync(new URL("../public/scripts/app.js", import.meta.url), "utf8");

function slice(startMarker, endMarker) {
  const start = source.indexOf(startMarker);
  assert.notEqual(start, -1, `missing ${startMarker}`);
  const end = source.indexOf(endMarker, start);
  assert.notEqual(end, -1, `missing ${endMarker}`);
  return source.slice(start, end);
}

const showMore = slice("async function showMoreCatchUp()", "\nfunction buildCatchUpRow(");

function runShowMore({ total, loadedCount, visibleCount, pageSize = 5, focusTrigger }) {
  const doc = { activeElement: null };

  const makeButton = (name) => {
    const button = {
      name,
      hidden: false,
      _disabled: false,
      get disabled() {
        return this._disabled;
      },
      set disabled(value) {
        this._disabled = value;
        if (value && doc.activeElement === this) doc.activeElement = doc.body;
      },
      setAttribute() {},
      focus() {
        doc.activeElement = this;
      },
    };
    return button;
  };

  const more = makeButton("more");
  const rowActions = Array.from({ length: total }, (unused, index) => makeButton(`row${index}`));
  doc.body = { name: "body" };
  doc.activeElement = focusTrigger ? more : doc.body;

  const context = {
    document: doc,
    catchUpMore: more,
    catchUpList: {
      querySelectorAll: () => ({ item: (index) => rowActions[index] || null }),
    },
    catchUpLoadingMore: false,
    catchUpVisibleCount: visibleCount,
    catchUpTotal: total,
    catchUpItems: Array.from({ length: loadedCount }, (unused, index) => ({
      dateKey: `2026-09-${String(index + 1).padStart(2, "0")}`,
      activity: "STRONG",
    })),
    CATCH_UP_PAGE_SIZE: pageSize,
    apiFetch: async () => ({
      ok: true,
      data: {
        total,
        items: Array.from({ length: total }, (unused, index) => ({
          dateKey: `2026-09-${String(index + 1).padStart(2, "0")}`,
          activity: "STRONG",
        })),
      },
    }),
    syncCatchUpPagination() {
      more.disabled = context.catchUpLoadingMore;
      more.hidden = context.catchUpVisibleCount >= context.catchUpTotal;
    },
    renderCatchUp() {
      context.syncCatchUpPagination();
    },
    normalizeCatchUpPayload: (payload) => ({ items: payload?.items || [] }),
    mergeCatchUpItems: (current, incoming) => (incoming.length > current.length ? incoming : current),
    showToast() {},
  };

  return vm
    .runInNewContext(`${showMore}\nshowMoreCatchUp();`, context)
    .then(() => ({ focused: doc.activeElement?.name, moreHidden: more.hidden }));
}

describe("catch-up View more keeps the user's place", () => {
  it("returns focus to the trigger when more pages remain", async () => {
    const result = await runShowMore({
      total: 18, loadedCount: 5, visibleCount: 5, focusTrigger: true,
    });

    assert.equal(result.moreHidden, false);
    assert.equal(result.focused, "more", "focus fell off the View more button");
  });

  it("moves focus into the newly revealed rows when the trigger disappears", async () => {
    const result = await runShowMore({
      total: 8, loadedCount: 8, visibleCount: 5, focusTrigger: true,
    });

    assert.equal(result.moreHidden, true);
    assert.equal(result.focused, "row5", "focus should land on the first newly revealed action");
  });

  it("does not steal focus from elsewhere on the page", async () => {
    const result = await runShowMore({
      total: 18, loadedCount: 5, visibleCount: 5, focusTrigger: false,
    });

    assert.equal(result.focused, "body", "a pointer user's focus must not be moved");
  });
});
