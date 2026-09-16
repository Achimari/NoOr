(() => {
  if (typeof document === "undefined") return;

  const root = document.querySelector("[data-achievements]");
  if (!root) return;

  const buttons = [...root.querySelectorAll("[data-achievement-filter]")];
  const cards = [...root.querySelectorAll("[data-achievement-card]")];
  const categories = [...root.querySelectorAll("[data-achievement-category]")];
  const result = root.querySelector("[data-achievements-status]");
  if (!buttons.length || !cards.length) return;

  const FILTER_MESSAGES = {
    EARNED: "Showing {count} achievements earned.",
    IN_PROGRESS: "Showing {count} achievements in progress.",
    NOT_STARTED: "Showing {count} achievements not started.",
  };

  function matchesFilter(status, filter) {
    return filter === "all" || status === filter;
  }

  function describeVisible(count, filter) {
    if (filter === "all") return t("Showing all {count} achievements.", { count });
    if (count === 0) return t("No achievements match this filter.");
    return t(FILTER_MESSAGES[filter] || "Showing all {count} achievements.", { count });
  }

  function applyFilter(filter) {
    let visible = 0;

    cards.forEach((card) => {
      const shown = matchesFilter(card.dataset.status, filter);
      card.hidden = !shown;
      if (shown) visible += 1;
    });

    categories.forEach((category) => {
      const hasVisibleCard = [...category.querySelectorAll("[data-achievement-card]")]
        .some((card) => !card.hidden);
      category.hidden = !hasVisibleCard;
    });

    buttons.forEach((button) => {
      button.setAttribute("aria-pressed", button.dataset.achievementFilter === filter ? "true" : "false");
    });

    if (result) result.textContent = describeVisible(visible, filter);
  }

  buttons.forEach((button) => {
    button.addEventListener("click", () => applyFilter(button.dataset.achievementFilter));
  });

  applyFilter("all");
})();
