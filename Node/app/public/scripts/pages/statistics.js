(() => {
  const PREVIEW_ROW_COUNT = 5;

  function getBoardRows(board) {
    const body = board.querySelector("[data-streak-board-body]");
    if (!body || body.querySelector(".leaderboard-empty")) return [];
    return [...body.querySelectorAll("tr")];
  }

  function syncBoardPreview(board, { announce = false } = {}) {
    const rows = getBoardRows(board);
    const toggle = board.querySelector("[data-streak-board-toggle]");
    if (!toggle) return;

    const requestedCount = Number.parseInt(board.dataset.streakVisibleCount, 10);
    const visibleCount = Math.min(
      rows.length,
      Number.isInteger(requestedCount) && requestedCount > 0 ? requestedCount : PREVIEW_ROW_COUNT,
    );
    const remainingCount = Math.max(0, rows.length - visibleCount);
    const nextBatchCount = Math.min(PREVIEW_ROW_COUNT, remainingCount);

    const previouslyVisible = rows.filter((row) => !row.hidden).length;
    const toggleHadFocus = typeof document !== "undefined" && document.activeElement === toggle;
    rows.forEach((row, index) => {
      row.hidden = index >= visibleCount;
    });
    const reveal = typeof window === "undefined" ? null : window.NoOrRevealNewRows;
    if (visibleCount > previouslyVisible && typeof reveal === "function") {
      reveal(rows, previouslyVisible);
    }

    board.dataset.streakVisibleCount = String(visibleCount || PREVIEW_ROW_COUNT);
    toggle.hidden = remainingCount === 0;
    toggle.textContent = "View more";
    toggle.setAttribute("aria-expanded", visibleCount > PREVIEW_ROW_COUNT ? "true" : "false");

    const boardLabel = board.dataset.streakBoardLabel || "leaderboard";
    toggle.setAttribute(
      "aria-label",
      remainingCount > 0
        ? `View ${nextBatchCount} more users in ${boardLabel}; ${remainingCount} remaining`
        : `All users shown in ${boardLabel}`,
    );

    if (announce) {
      const status = board.querySelector("[data-streak-board-status]");
      if (status) {
        status.textContent = remainingCount > 0
          ? `Showing ${visibleCount} of ${rows.length} users in ${boardLabel}.`
          : `Showing all ${rows.length} users in ${boardLabel}.`;
      }
    }

    if (toggleHadFocus && toggle.hidden) {
      // The last activation hides the control the reader is standing on, which
      // would drop focus to the document and send a keyboard walk back to the
      // top of the page. Land on the first row they just revealed instead.
      const firstRevealed = rows[previouslyVisible];
      const target = firstRevealed?.querySelector?.("a, button, [tabindex]") || firstRevealed;
      target?.focus?.();
    }
  }

  function initializeBoardPreview(board) {
    const toggle = board.querySelector("[data-streak-board-toggle]");
    const body = board.querySelector("[data-streak-board-body]");
    if (!toggle || !body) return;

    board.dataset.streakVisibleCount = String(PREVIEW_ROW_COUNT);
    syncBoardPreview(board);

    toggle.addEventListener("click", () => {
      const currentCount = Number.parseInt(board.dataset.streakVisibleCount, 10) || PREVIEW_ROW_COUNT;
      board.dataset.streakVisibleCount = String(currentCount + PREVIEW_ROW_COUNT);
      syncBoardPreview(board, { announce: true });
    });

    if (typeof MutationObserver !== "undefined") {
      new MutationObserver(() => syncBoardPreview(board)).observe(body, { childList: true });
    }
  }

  document.querySelectorAll("[data-streak-board]").forEach(initializeBoardPreview);
})();
