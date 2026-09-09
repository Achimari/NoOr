(() => {
  if (typeof document === "undefined") return;

  const root = document.querySelector("[data-achievements]");
  if (!root) return;

  const buttons = [...root.querySelectorAll("[data-achievement-filter]")];
  const cards = [...root.querySelectorAll("[data-achievement-card]")];
  const categories = [...root.querySelectorAll("[data-achievement-category]")];
  const result = root.querySelector("[data-achievements-status]");
  if (!buttons.length || !cards.length) return;

  const FILTER_NOUNS = {
    EARNED: "earned",
    IN_PROGRESS: "in progress",
    NOT_STARTED: "not started",
  };

  function matchesFilter(status, filter) {
    return filter === "all" || status === filter;
  }

  function describeVisible(count, filter) {
    if (filter === "all") return `Showing all ${count} achievements.`;
    if (count === 0) return "No achievements match this filter.";
    return `Showing ${count} achievements ${FILTER_NOUNS[filter] || ""}.`.replace(/\s+\./, ".");
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
