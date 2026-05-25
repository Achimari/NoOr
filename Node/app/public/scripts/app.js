const leaderboardRoot = document.querySelector("[data-leaderboard]");
const currentValue = document.querySelector("[data-current-value]");
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
let resetTimerId;
let allPrayers = [];
let prayerTimeOrder = "newest";
let toastTimerId;

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
              <td><span class="leaderboard-streak">${entry.value} days</span></td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="3" class="leaderboard-empty">No streaks yet</td></tr>';
}

function renderWeekDays(weekDays) {
  if (!weekDayButtons.length || !Array.isArray(weekDays)) return;

  weekDayButtons.forEach((dayButton, index) => {
    const day = weekDays[index];
    const answer = day?.answer || "";
    if (day?.dateKey) dayButton.dataset.weekDay = day.dateKey;
    if (day?.label) dayButton.textContent = day.label;
    dayButton.classList.toggle("active", Boolean(day?.successful));
    dayButton.dataset.weekAnswer = answer;
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
    canDelete: row.dataset.prayerCanDelete === "true",
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

function renderPrayers(prayers) {
  if (!prayersBody) return;
  const showActions = prayersBody.dataset.prayerActions === "true";

  if (prayerCount) {
    prayerCount.textContent = formatItemCount(prayers.length);
  }

  prayersBody.innerHTML = prayers.length
    ? prayers
        .map(
          (item) => `
            <tr>
              <td><a class="leaderboard-user user-link" href="/customer/${item.userId}">${userIcon()}${escapeHtml(item.userName)}</a></td>
              <td>${escapeHtml(item.prayer)}</td>
              ${showActions ? `<td>${item.canDelete ? `<button class="prayer-remove-button" type="button" data-prayer-remove="${item.id}" aria-label="Remove prayer">Close</button>` : ""}</td>` : ""}
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="${showActions ? 3 : 2}" class="leaderboard-empty">No prayers yet</td></tr>`;
}

function applyPrayerFilters() {
  renderPrayers(getFilteredPrayers());
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
  allPrayers = Array.isArray(data.prayers) ? data.prayers : [];
  updatePrayerUserOptions(allPrayers);
  applyPrayerFilters();
}

if (prayerFilterToggle && prayerFilterPanel) {
  prayerFilterToggle.addEventListener("click", () => {
    const isOpen = prayerFilterPanel.hidden;
    setPrayerFilterPanelOpen(isOpen);
    if (isOpen) prayerUserFilter?.focus();
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
    const button = event.target.closest("[data-prayer-remove]");
    if (!button) return;

    button.disabled = true;
    const response = await fetch(`/api/prayers/${button.dataset.prayerRemove}`, {
      method: "DELETE",
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
      showToast("Could not close prayer", "error");
      return;
    }

    await loadPrayers();
    showToast("Prayer closed");
  });
}

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
    showToast("Prayer added");
  });
}

if (telegramConnectButton) {
  telegramConnectButton.addEventListener("click", async () => {
    const telegramWindow = window.open("about:blank", "_blank", "noopener,noreferrer");
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
        telegramWindow?.close();
        window.location.href = "/login";
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.link) {
        telegramWindow?.close();
        if (telegramStatus) telegramStatus.textContent = "";
        showToast(data.error || "Could not create Telegram link", "error");
        telegramConnectButton.disabled = false;
        return;
      }

      if (telegramStatus) telegramStatus.textContent = "";
      showToast(data.botUsername ? `Telegram link ready: @${data.botUsername}` : "Telegram link ready");
      if (telegramWindow) {
        telegramWindow.location.href = data.link;
      } else {
        window.location.href = data.link;
      }
      telegramConnectButton.disabled = false;
    } catch {
      telegramWindow?.close();
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
