const leaderboardRoot = document.querySelector("[data-leaderboard]");
const currentValue = document.querySelector("[data-current-value]");
const maxValue = document.querySelector("[data-max-value]");
const leaderboardBody = document.querySelector("[data-leaderboard-body]");
const tableCount = document.querySelector("[data-table-count]");
const yesButton = document.querySelector(".dashboard-action-yes");
const noButton = document.querySelector(".dashboard-action-no");
const checkInMessage = document.querySelector("[data-check-in-message]");
const dashboardWeek = document.querySelector(".dashboard-week");
const weekDayButtons = document.querySelectorAll("[data-week-day]");
const prayerForm = document.querySelector("[data-prayer-form]");
const prayersBody = document.querySelector("[data-prayers-body]");
const prayerCount = document.querySelector("[data-prayer-count]");
const activePrayersBody = document.querySelector('[data-prayer-list="active"]');
const activePrayerCount = document.querySelector("[data-active-prayer-count]");
const prayerStatus = document.querySelector("[data-prayer-status]");
const prayerFilterToggle = document.querySelector("[data-prayer-filter-toggle]");
const prayerFilterPanel = document.querySelector("[data-prayer-filter-panel]");
const prayerUserFilter = document.querySelector("[data-prayer-user-filter]");
const prayerUserOptions = document.querySelector("[data-prayer-user-options]");
const prayerTimeToggle = document.querySelector("[data-prayer-time-toggle]");
const prayerTimeMenu = document.querySelector("[data-prayer-time-menu]");
const prayerTimeLabel = document.querySelector("[data-prayer-time-label]");
const prayerFilterClear = document.querySelector("[data-prayer-filter-clear]");
const telegramConnectButton = document.querySelector(".telegram-connect-button");
const telegramStatus = document.querySelector("[data-telegram-status]");
const statisticsInsightCards = document.querySelectorAll(".statistics-insight");
const header = document.querySelector(".header");
const headerMenuToggle = document.querySelector("[data-header-menu-toggle]");
const timezoneMenu = document.querySelector("[data-timezone-menu]");
const timezoneToggle = document.querySelector("[data-timezone-toggle]");
const timezoneOptions = document.querySelector("[data-timezone-options]");
const timezoneCurrent = document.querySelector("[data-timezone-current]");
const timezoneSearch = document.querySelector("[data-timezone-search]");
const timezoneEmpty = document.querySelector("[data-timezone-empty]");
const prayerReactionEmoji = ["🙏", "❤️", "🙌", "🕊️", "💪", "🤍"];
const currentUserId = Number(leaderboardRoot?.dataset.currentUserId || 0);
let resetTimerId;
let allPrayers = [];
let prayerTimeOrder = "newest";
let toastTimerId;
let reactionChooserPrayerId = null;
let missedAnswerDateKey = null;

statisticsInsightCards.forEach((card) => {
  card.addEventListener("pointermove", (event) => {
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--glow-x", `${event.clientX - rect.left}px`);
    card.style.setProperty("--glow-y", `${event.clientY - rect.top}px`);
  });
});

function setHeaderMenuOpen(isOpen) {
  if (!header || !headerMenuToggle) return;
  header.classList.toggle("menu-open", isOpen);
  document.body.classList.toggle("header-menu-open", isOpen);
  headerMenuToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  headerMenuToggle.setAttribute("aria-label", isOpen ? "Close navigation menu" : "Open navigation menu");
}

headerMenuToggle?.addEventListener("click", () => {
  setHeaderMenuOpen(!header?.classList.contains("menu-open"));
});

header?.querySelectorAll(".header-link").forEach((link) => {
  link.addEventListener("click", () => setHeaderMenuOpen(false));
});

window.addEventListener("resize", () => {
  if (window.innerWidth > 760) setHeaderMenuOpen(false);
});

function setTimezoneMenuOpen(isOpen) {
  if (!timezoneToggle || !timezoneOptions) return;
  timezoneOptions.hidden = !isOpen;
  timezoneToggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
  if (isOpen) {
    timezoneSearch?.focus();
  } else if (timezoneSearch) {
    timezoneSearch.value = "";
    filterTimezoneOptions();
  }
}

function filterTimezoneOptions() {
  const query = String(timezoneSearch?.value || "").trim().toLowerCase();
  let visibleCount = 0;

  timezoneOptions?.querySelectorAll("[data-timezone-option]").forEach((button) => {
    const matches = !query || button.dataset.timezoneLabel?.includes(query) || button.dataset.timezoneValue?.includes(query);
    button.hidden = !matches;
    if (matches) visibleCount += 1;
  });

  if (timezoneEmpty) {
    timezoneEmpty.hidden = visibleCount > 0;
  }
}

timezoneToggle?.addEventListener("click", () => {
  setTimezoneMenuOpen(Boolean(timezoneOptions?.hidden));
});

timezoneSearch?.addEventListener("input", filterTimezoneOptions);

timezoneOptions?.addEventListener("click", async (event) => {
  const button = event.target.closest("[data-timezone-option]");
  if (!button) return;

  const timezone = button.dataset.timezoneOption;
  button.disabled = true;

  const response = await fetch("/api/me/timezone", {
    method: "PATCH",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ timezone }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    button.disabled = false;
    showToast(data.error || data.errors?.[0] || "Could not save timezone", "error");
    return;
  }

  if (timezoneCurrent && data.timezone?.label) {
    timezoneCurrent.textContent = data.timezone.label;
  }
  setTimezoneMenuOpen(false);
  showToast("Timezone updated");
  window.setTimeout(() => window.location.reload(), 400);
});

document.addEventListener("click", (event) => {
  if (timezoneMenu && !timezoneMenu.contains(event.target)) {
    setTimezoneMenuOpen(false);
  }
});

function showToast(message, variant = "default") {
  if (!message) return;

  let toast = document.querySelector("[data-app-toast]");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "app-toast";
    toast.setAttribute("data-app-toast", "");
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.append(toast);
  }

  window.clearTimeout(toastTimerId);
  toast.textContent = message;
  toast.dataset.variant = variant;
  toast.classList.add("visible");

  toastTimerId = window.setTimeout(() => {
    toast.classList.remove("visible");
  }, 3200);
}

function renderLeaderboard(leaderboard) {
  if (!leaderboardRoot || !leaderboard || !currentValue || !leaderboardBody) return;

  currentValue.textContent = leaderboard.current.value;
  if (maxValue) {
    maxValue.textContent = leaderboard.current.maxStreak || 0;
  }
  if (dashboardWeek && leaderboard.current.todayDateKey) {
    dashboardWeek.dataset.currentDateKey = leaderboard.current.todayDateKey;
  }
  renderWeekDays(leaderboard.current.weekDays);

  if (tableCount) {
    tableCount.textContent = `${leaderboard.leaders.length} users`;
  }

  leaderboardBody.innerHTML = leaderboard.leaders.length
    ? leaderboard.leaders
        .map(
          (entry) => `
            <tr>
              <td><span class="leaderboard-rank">${entry.rank}</span></td>
              <td><a class="leaderboard-user user-link" href="/customer/${entry.id}">${userIcon()}${escapeHtml(entry.name)}</a></td>
              <td>
                <span class="leaderboard-streak">
                  ${renderMissedDaysTag(entry)}
                  <span>${entry.value} days</span>
                </span>
              </td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="3" class="leaderboard-empty">No streaks yet</td></tr>';
}

function renderMissedDaysTag(entry) {
  const missedDays = entry?.missedDays;
  if (!missedDays || !missedDays.count) return "";

  const label = `Missed days ${missedDays.count}`;
  if (Number(entry.id) !== currentUserId) {
    return `<span class="leaderboard-missed-tag is-static">${escapeHtml(label)}</span>`;
  }

  return `
    <button class="leaderboard-missed-tag" type="button" data-missed-open data-missed-date="${escapeHtml(missedDays.nextDateKey || "")}" data-missed-count="${missedDays.count}">
      ${escapeHtml(label)}
    </button>
  `;
}

function renderWeekDays(weekDays) {
  if (!weekDayButtons.length || !Array.isArray(weekDays)) return;

  weekDayButtons.forEach((dayButton, index) => {
    const day = weekDays[index];
    const answer = day?.answer || "";
    if (day?.dateKey) dayButton.dataset.weekDay = day.dateKey;
    if (day?.label) dayButton.textContent = day.label;
    dayButton.classList.toggle("active", Boolean(day?.successful));
    dayButton.classList.toggle("missed", Boolean(day?.missed));
    dayButton.dataset.weekAnswer = answer;
    dayButton.dataset.weekMissed = day?.missed ? "true" : "false";
  });
}

function markTodayWeekDay(answer) {
  const todayKey = dashboardWeek?.dataset.currentDateKey;
  if (!todayKey) return;
  const todayButton = [...weekDayButtons].find((dayButton) => dayButton.dataset.weekDay === todayKey);
  if (!todayButton) return;

  todayButton.classList.toggle("active", answer === "YES");
  todayButton.dataset.weekAnswer = answer;
}

function userIcon() {
  return '<svg class="leaderboard-row-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21a8 8 0 0 0-16 0"/><circle cx="12" cy="7" r="4"/></svg>';
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => {
    const replacements = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };

    return replacements[character];
  });
}

function readPrayerReactionCounts(row) {
  try {
    const reactions = JSON.parse(decodeURIComponent(row.dataset.prayerReactionCounts || "%5B%5D"));
    return Array.isArray(reactions) ? reactions : [];
  } catch {
    return [];
  }
}

function normalizePrayerReactions(reactions = []) {
  const counts = new Map();
  reactions.forEach((reaction) => {
    if (prayerReactionEmoji.includes(reaction.emoji)) {
      counts.set(reaction.emoji, Number(reaction.count) || 0);
    }
  });

  prayerReactionEmoji.forEach((emoji) => {
    if (!counts.has(emoji)) {
      counts.set(emoji, 0);
    }
  });

  return [...counts.entries()].map(([emoji, count]) => ({ emoji, count }));
}

function renderPrayerReactions(item) {
  const reactions = normalizePrayerReactions(item.reactions).filter((reaction) => reaction.count > 0);
  if (!reactions.length) return "";

  return `
    <div class="prayer-reactions" data-prayer-reaction-group="${item.id}" aria-label="Prayer reactions">
      ${reactions
        .map((reaction) => {
          const isSelected = item.currentReaction === reaction.emoji;
          return `
            <span class="prayer-reaction-button ${isSelected ? "selected" : ""}" aria-label="${isSelected ? "Your reaction" : "Reaction"}">
              <span aria-hidden="true">${escapeHtml(reaction.emoji)}</span>
              <span>${reaction.count}</span>
            </span>
          `;
        })
        .join("")}
    </div>
  `;
}

function getReactionChooser() {
  let chooser = document.querySelector("[data-prayer-reaction-chooser]");
  if (chooser) return chooser;

  chooser = document.createElement("div");
  chooser.className = "prayer-reaction-modal";
  chooser.setAttribute("data-prayer-reaction-chooser", "");
  chooser.hidden = true;
  chooser.innerHTML = `
    <div class="prayer-reaction-backdrop" data-prayer-reaction-close></div>
    <div class="prayer-reaction-dialog" role="dialog" aria-modal="true" aria-label="Choose reaction">
      ${prayerReactionEmoji
        .map(
          (emoji) => `
            <button class="prayer-reaction-choice" type="button" data-prayer-reaction="${escapeHtml(emoji)}" aria-label="React ${escapeHtml(emoji)}">
              <span aria-hidden="true">${escapeHtml(emoji)}</span>
            </button>
          `,
        )
        .join("")}
    </div>
  `;
  document.body.append(chooser);
  return chooser;
}

function openReactionChooser(prayerId) {
  if (!prayerId) return;
  reactionChooserPrayerId = Number(prayerId);
  const chooser = getReactionChooser();
  const prayer = allPrayers.find((item) => item.id === reactionChooserPrayerId);
  chooser.querySelectorAll("[data-prayer-reaction]").forEach((button) => {
    button.disabled = false;
    const isSelected = prayer?.currentReaction === button.dataset.prayerReaction;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
    button.setAttribute("aria-label", isSelected ? `Remove ${button.dataset.prayerReaction} reaction` : `React ${button.dataset.prayerReaction}`);
  });
  chooser.hidden = false;
  document.body.classList.add("prayer-reaction-modal-open");
  chooser.querySelector("[data-prayer-reaction]")?.focus();
}

function closeReactionChooser() {
  const chooser = document.querySelector("[data-prayer-reaction-chooser]");
  if (chooser) {
    chooser.hidden = true;
    chooser.querySelectorAll("[data-prayer-reaction]").forEach((button) => {
      button.disabled = false;
    });
  }
  reactionChooserPrayerId = null;
  document.body.classList.remove("prayer-reaction-modal-open");
}

function formatMissedDate(dateKey) {
  if (!dateKey) return "this missed day";
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function getMissedAnswerModal() {
  let modal = document.querySelector("[data-missed-answer-modal]");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "missed-answer-modal";
  modal.setAttribute("data-missed-answer-modal", "");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="missed-answer-backdrop" data-missed-close></div>
    <div class="missed-answer-dialog" role="dialog" aria-modal="true" aria-labelledby="missed-answer-title">
      <header class="missed-answer-head">
        <p class="dashboard-label">Missed day</p>
        <h2 id="missed-answer-title" data-missed-title>Answer missed day</h2>
      </header>
      <div class="missed-answer-actions">
        <button class="dashboard-action dashboard-action-yes" type="button" data-missed-answer="YES">Yes, I did</button>
        <button class="dashboard-action dashboard-action-no" type="button" data-missed-answer="NO">No, I didn't</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

function openMissedAnswerModal(dateKey) {
  if (!dateKey) return;
  missedAnswerDateKey = dateKey;
  const modal = getMissedAnswerModal();
  const title = modal.querySelector("[data-missed-title]");
  if (title) title.textContent = `Answer ${formatMissedDate(dateKey)}`;
  modal.querySelectorAll("[data-missed-answer]").forEach((button) => {
    button.disabled = false;
  });
  modal.hidden = false;
  modal.querySelector("[data-missed-answer]")?.focus();
}

function closeMissedAnswerModal() {
  const modal = document.querySelector("[data-missed-answer-modal]");
  if (modal) {
    modal.hidden = true;
    modal.querySelectorAll("[data-missed-answer]").forEach((button) => {
      button.disabled = false;
    });
  }
  missedAnswerDateKey = null;
}

function formatItemCount(count) {
  return `${count} ${count === 1 ? "item" : "items"}`;
}

function uniquePrayerUsers(prayers) {
  const users = new Map();
  prayers.forEach((item) => {
    if (!users.has(item.userId)) {
      users.set(item.userId, item.userName);
    }
  });

  return [...users.entries()].map(([id, name]) => ({ id, name }));
}

function updatePrayerUserOptions(prayers) {
  if (!prayerUserOptions) return;

  const userQuery = String(prayerUserFilter?.value || "").trim().toLowerCase();
  const users = uniquePrayerUsers(prayers).filter((user) => !userQuery || user.name.toLowerCase().includes(userQuery));

  prayerUserOptions.innerHTML = users.length
    ? users
        .map((user) => `<button type="button" data-prayer-user-option="${escapeHtml(user.name)}">${escapeHtml(user.name)}</button>`)
        .join("")
    : '<span class="prayer-filter-empty">No users found</span>';
}

function setUserMenuOpen(isOpen) {
  if (!prayerUserOptions) return;
  prayerUserOptions.hidden = !isOpen;
}

function setTimeMenuOpen(isOpen) {
  if (!prayerTimeMenu || !prayerTimeToggle) return;
  prayerTimeMenu.hidden = !isOpen;
  prayerTimeToggle.setAttribute("aria-expanded", String(isOpen));
}

function closePrayerMenus(except = null) {
  if (except !== "user") setUserMenuOpen(false);
  if (except !== "time") setTimeMenuOpen(false);
}

function setPrayerFilterPanelOpen(isOpen) {
  if (!prayerFilterPanel || !prayerFilterToggle) return;
  prayerFilterPanel.hidden = !isOpen;
  prayerFilterToggle.setAttribute("aria-expanded", String(isOpen));
  prayerFilterPanel.closest(".info-prayers")?.classList.toggle("filter-open", isOpen);
}

function updatePrayerTimeState() {
  if (prayerTimeLabel) {
    prayerTimeLabel.textContent = prayerTimeOrder === "oldest" ? "Oldest first" : "Newest first";
  }

  prayerTimeMenu?.querySelectorAll("[data-prayer-time-option]").forEach((button) => {
    button.classList.toggle("selected", button.dataset.prayerTimeOption === prayerTimeOrder);
  });
}

function openUserMenu() {
  updatePrayerUserOptions(allPrayers);
  closePrayerMenus("user");
  setUserMenuOpen(true);
}

function getPrayerUserOptionButtons() {
  return [...(prayerUserOptions?.querySelectorAll("[data-prayer-user-option]") || [])];
}

function movePrayerUserOptionFocus(direction) {
  const options = getPrayerUserOptionButtons();
  if (!options.length) return;

  const currentIndex = options.indexOf(document.activeElement);
  const nextIndex = currentIndex === -1 ? 0 : (currentIndex + direction + options.length) % options.length;
  options[nextIndex].focus();
}

function selectPrayerUser(name) {
  if (prayerUserFilter) prayerUserFilter.value = name;
  closePrayerMenus();
  applyPrayerFilters();
}

function selectPrayerTime(order) {
  prayerTimeOrder = order === "oldest" ? "oldest" : "newest";
  updatePrayerTimeState();
  closePrayerMenus();
  applyPrayerFilters();
}

function resetPrayerFilters() {
  if (prayerUserFilter) prayerUserFilter.value = "";
  prayerTimeOrder = "newest";
  updatePrayerTimeState();
  updatePrayerUserOptions(allPrayers);
  closePrayerMenus();
  applyPrayerFilters();
}

function isPrayerFilterTarget(target) {
  return Boolean(target.closest("[data-prayer-filter-panel]") || target.closest("[data-prayer-filter-toggle]"));
}

function bindPrayerFilterControls() {
  prayerUserOptions?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-prayer-user-option]");
    if (!option) return;
    selectPrayerUser(option.dataset.prayerUserOption || "");
  });

  prayerUserOptions?.addEventListener("keydown", (event) => {
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      movePrayerUserOptionFocus(event.key === "ArrowDown" ? 1 : -1);
    }

    if (event.key === "Escape") {
      closePrayerMenus();
      prayerUserFilter?.focus();
    }
  });

  prayerTimeToggle?.addEventListener("click", () => {
    const isOpen = prayerTimeMenu?.hidden !== false;
    closePrayerMenus("time");
    setTimeMenuOpen(isOpen);
  });

  prayerTimeMenu?.addEventListener("click", (event) => {
    const option = event.target.closest("[data-prayer-time-option]");
    if (!option) return;
    selectPrayerTime(option.dataset.prayerTimeOption);
  });

  document.addEventListener("click", (event) => {
    if (!isPrayerFilterTarget(event.target)) {
      closePrayerMenus();
      setPrayerFilterPanelOpen(false);
    }
  });
}

function readInitialPrayers() {
  if (!prayersBody) return [];

  return [...prayersBody.querySelectorAll("[data-prayer-row]")].map((row) => ({
    id: Number(row.dataset.prayerId || 0),
    userId: Number(row.dataset.prayerUserId || 0),
    userName: row.dataset.prayerUserName || "",
    prayer: row.dataset.prayerText || "",
    canMarkAnswered: row.dataset.prayerCanMarkAnswered === "true",
    reactions: readPrayerReactionCounts(row),
    currentReaction: row.dataset.prayerCurrentReaction || null,
  }));
}

function getFilteredPrayers() {
  const userQuery = String(prayerUserFilter?.value || "").trim().toLowerCase();

  return allPrayers
    .filter((item) => !userQuery || item.userName.toLowerCase().includes(userQuery))
    .sort((first, second) => {
      return prayerTimeOrder === "oldest" ? first.id - second.id : second.id - first.id;
    });
}

function renderPrayers(prayers, targetBody = prayersBody) {
  if (!targetBody) return;
  const showActions = targetBody.dataset.prayerActions === "true";
  const showReactions = targetBody.dataset.prayerReactions === "true";
  const listType = targetBody.dataset.prayerList || "default";
  const emptyLabel = listType === "active" ? "No active prayer requests" : "No prayers yet";

  if (targetBody === prayersBody && prayerCount) {
    prayerCount.textContent = formatItemCount(prayers.length);
  }

  targetBody.innerHTML = prayers.length
    ? prayers
        .map(
          (item) => `
            <tr>
              <td><a class="leaderboard-user user-link" href="/customer/${item.userId}">${userIcon()}${escapeHtml(item.userName)}</a></td>
              <td>
                <div class="${showReactions ? "prayer-message" : "prayer-inline-message"}" ${showReactions ? `data-prayer-react-open="${item.id}" tabindex="0" role="button" aria-label="Choose prayer reaction"` : ""}>
                  <span class="prayer-message-text">${escapeHtml(item.prayer)}</span>
                  ${showActions && item.canMarkAnswered ? `<button class="prayer-remove-button" type="button" data-prayer-answered="${item.id}" aria-label="Mark prayer as answered">Mark as answered</button>` : ""}
                  ${showReactions ? renderPrayerReactions(item) : ""}
                </div>
              </td>
              ${showActions ? "<td></td>" : ""}
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="${2 + (showActions ? 1 : 0)}" class="leaderboard-empty">${emptyLabel}</td></tr>`;
}

function applyPrayerFilters() {
  renderPrayers(getFilteredPrayers());
}

function renderUserPrayerLists(prayerLists) {
  const active = Array.isArray(prayerLists?.active) ? prayerLists.active : [];

  renderPrayers(active, activePrayersBody);

  if (activePrayerCount) activePrayerCount.textContent = formatItemCount(active.length);
}

async function loadPrayers() {
  if (!prayersBody) return;

  const response = await fetch("/api/prayers", {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok) return;

  const data = await response.json();
  if (data.prayerLists) {
    renderUserPrayerLists(data.prayerLists);
    return;
  }

  allPrayers = Array.isArray(data.prayers) ? data.prayers : [];
  updatePrayerUserOptions(allPrayers);
  applyPrayerFilters();
}

if (prayerFilterToggle && prayerFilterPanel) {
  prayerFilterToggle.addEventListener("click", () => {
    const isOpen = prayerFilterPanel.hidden;
    setPrayerFilterPanelOpen(isOpen);
  });
}

prayerUserFilter?.addEventListener("focus", openUserMenu);
prayerUserFilter?.addEventListener("input", () => {
  updatePrayerUserOptions(allPrayers);
  setUserMenuOpen(true);
  applyPrayerFilters();
});
prayerUserFilter?.addEventListener("keydown", (event) => {
  if (event.key === "ArrowDown") {
    event.preventDefault();
    openUserMenu();
    movePrayerUserOptionFocus(1);
  }

  if (event.key === "Escape") closePrayerMenus();
});
prayerFilterClear?.addEventListener("click", resetPrayerFilters);

if (prayersBody?.dataset.prayerActions === "true") {
  prayersBody.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-prayer-answered]");
    if (!button) return;

    button.disabled = true;
    const response = await fetch(`/api/prayers/${button.dataset.prayerAnswered}/answered`, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      button.disabled = false;
      showToast("Could not mark prayer as answered", "error");
      return;
    }

    await loadPrayers();
    showToast("Prayer marked as answered");
  });
}

if (prayersBody?.dataset.prayerReactions === "true") {
  prayersBody.addEventListener("click", (event) => {
    const opener = event.target.closest("[data-prayer-react-open]");
    if (!opener) return;

    event.preventDefault();
    openReactionChooser(opener.dataset.prayerReactOpen);
  });

  prayersBody.addEventListener("keydown", (event) => {
    const opener = event.target.closest("[data-prayer-react-open]");
    if (!opener || (event.key !== "Enter" && event.key !== " ")) return;
    event.preventDefault();
    openReactionChooser(opener.dataset.prayerReactOpen);
  });
}

document.addEventListener("click", async (event) => {
  const missedCloseButton = event.target.closest("[data-missed-close]");
  if (missedCloseButton) {
    closeMissedAnswerModal();
    return;
  }

  const missedOpenButton = event.target.closest("[data-missed-open]");
  if (missedOpenButton) {
    openMissedAnswerModal(missedOpenButton.dataset.missedDate);
    return;
  }

  const missedAnswerButton = event.target.closest("[data-missed-answer]");
  if (missedAnswerButton && missedAnswerDateKey) {
    const modal = missedAnswerButton.closest("[data-missed-answer-modal]");
    const answer = missedAnswerButton.dataset.missedAnswer;
    modal?.querySelectorAll("[data-missed-answer]").forEach((button) => {
      button.disabled = true;
    });

    const response = await fetch("/api/check-in/missed", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        dateKey: missedAnswerDateKey,
        answer,
      }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.leaderboard) {
      modal?.querySelectorAll("[data-missed-answer]").forEach((button) => {
        button.disabled = false;
      });
      showToast(data.error || "Could not save missed day", "error");
      return;
    }

    renderLeaderboard(data.leaderboard);
    await loadCheckInStatus();
    closeMissedAnswerModal();
    showToast(answer === "YES" ? "Missed day saved: yes" : "Missed day saved: no");
    return;
  }

  const closeButton = event.target.closest("[data-prayer-reaction-close]");
  if (closeButton) {
    closeReactionChooser();
    return;
  }

  const button = event.target.closest("[data-prayer-reaction]");
  if (!button || !reactionChooserPrayerId) return;

  const chooser = button.closest("[data-prayer-reaction-chooser]");
  if (!chooser) return;

  const prayerId = reactionChooserPrayerId;
  const emoji = button.dataset.prayerReaction;
  if (!prayerId || !emoji) return;
  const prayer = allPrayers.find((item) => item.id === prayerId);
  const isRemoving = prayer?.currentReaction === emoji;

  chooser.querySelectorAll("[data-prayer-reaction]").forEach((reactionButton) => {
    reactionButton.disabled = true;
  });

  const response = await fetch(`/api/prayers/${prayerId}/reaction`, {
    method: isRemoving ? "DELETE" : "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: isRemoving ? undefined : JSON.stringify({ emoji }),
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.prayer) {
    chooser.querySelectorAll("[data-prayer-reaction]").forEach((reactionButton) => {
      reactionButton.disabled = false;
    });
    showToast(data.error || "Could not add reaction", "error");
    return;
  }

  allPrayers = allPrayers.map((item) => (item.id === data.prayer.id ? data.prayer : item));
  closeReactionChooser();
  applyPrayerFilters();
  showToast(isRemoving ? "Reaction removed" : "Reaction saved");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape") {
    setHeaderMenuOpen(false);
    setTimezoneMenuOpen(false);
    closeReactionChooser();
    closeMissedAnswerModal();
  }
});

async function updateLeaderboard(action) {
  const endpoint = action === "reset" ? "/api/leaderboard/reset" : "/api/leaderboard/increment";
  yesButton?.classList.toggle("selected", action === "increment");
  noButton?.classList.toggle("selected", action === "reset");
  markTodayWeekDay(action === "increment" ? "YES" : "NO");

  let response;

  try {
    response = await fetch(endpoint, {
      method: "POST",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    await loadCheckInStatus();
    showToast("Could not save answer", "error");
    return;
  }

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (response.status === 409) {
    await loadCheckInStatus();
    showToast("You already answered today");
    return;
  }

  if (!response.ok) {
    await loadCheckInStatus();
    showToast("Could not save answer", "error");
    return;
  }

  const data = await response.json();
  renderLeaderboard(data.leaderboard);
  await loadCheckInStatus();
  showToast(action === "reset" ? "Answer saved: no" : "Answer saved: yes");
}

if (leaderboardRoot) {
  yesButton?.addEventListener("click", () => updateLeaderboard("increment"));
  noButton?.addEventListener("click", () => updateLeaderboard("reset"));
  loadCheckInStatus();
}

if (prayersBody?.dataset.prayerActions === "true") {
  loadPrayers();
} else if (prayersBody) {
  allPrayers = readInitialPrayers();
  updatePrayerUserOptions(allPrayers);
  updatePrayerTimeState();
  bindPrayerFilterControls();
  applyPrayerFilters();
}

if (prayerForm) {
  prayerForm.addEventListener("submit", async (event) => {
    event.preventDefault();
    const formData = new FormData(prayerForm);
    const prayer = String(formData.get("prayer") || "").trim();

    if (!prayer) return;

    const response = await fetch("/api/prayers", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ prayer }),
    });

    if (response.status === 401) {
      window.location.href = "/login";
      return;
    }

    if (!response.ok) {
      if (prayerStatus) prayerStatus.textContent = "";
      showToast("Could not add prayer", "error");
      return;
    }

    prayerForm.reset();
    if (prayerStatus) prayerStatus.textContent = "";
    await loadPrayers();
    showToast("Prayer request added");
  });
}

if (telegramConnectButton) {
  telegramConnectButton.addEventListener("click", async () => {
    telegramConnectButton.disabled = true;
    if (telegramStatus) telegramStatus.textContent = "";
    showToast("Preparing Telegram link");

    try {
      const response = await fetch("/api/telegram/connect-link", {
        headers: {
          Accept: "application/json",
        },
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.link) {
        if (telegramStatus) telegramStatus.textContent = "";
        showToast(data.error || "Could not create Telegram link", "error");
        telegramConnectButton.disabled = false;
        return;
      }

      if (telegramStatus) telegramStatus.textContent = "";
      showToast(data.botUsername ? `Telegram link ready: @${data.botUsername}` : "Telegram link ready");
      window.location.href = data.link;
    } catch {
      if (telegramStatus) telegramStatus.textContent = "";
      showToast("Could not create Telegram link", "error");
      telegramConnectButton.disabled = false;
    }
  });
}

async function loadCheckInStatus() {
  const response = await fetch("/api/check-in/status", {
    headers: {
      Accept: "application/json",
    },
  });

  if (response.status === 401) {
    window.location.href = "/login";
    return;
  }

  if (!response.ok) return;

  setAnswerState(await response.json());
}

function setAnswerState(status) {
  if (!yesButton || !noButton) return;
  window.clearInterval(resetTimerId);
  if (dashboardWeek && status.dateKey) {
    dashboardWeek.dataset.currentDateKey = status.dateKey;
  }
  renderWeekDays(status.weekDays);

  const isLocked = status.canAnswer === false;
  yesButton.disabled = isLocked;
  noButton.disabled = isLocked;
  yesButton.classList.toggle("selected", status.answer === "YES");
  noButton.classList.toggle("selected", status.answer === "NO");

  if (checkInMessage) {
    if (status.answeredToday && status.nextResetAt) {
      renderResetTimer(status.nextResetAt);
      resetTimerId = window.setInterval(() => renderResetTimer(status.nextResetAt), 1000);
    } else {
      checkInMessage.textContent = "";
    }
  }
}

function renderResetTimer(nextResetAt) {
  if (!checkInMessage) return;

  const remainingMs = Math.max(0, new Date(nextResetAt).getTime() - Date.now());

  if (remainingMs === 0) {
    checkInMessage.textContent = "";
    yesButton.disabled = false;
    noButton.disabled = false;
    yesButton.classList.remove("selected");
    noButton.classList.remove("selected");
    window.clearInterval(resetTimerId);
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  checkInMessage.innerHTML = `
    <span class="dashboard-timer">
      <span class="dashboard-timer-label">Next answer</span>
      <span class="dashboard-timer-value">${formatTimerPart(hours)}:${formatTimerPart(minutes)}:${formatTimerPart(seconds)}</span>
    </span>
  `;
}

function formatTimerPart(value) {
  return String(value).padStart(2, "0");
}
