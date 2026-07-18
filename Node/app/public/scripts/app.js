const leaderboardRoot = document.querySelector("[data-leaderboard]");
const overallBestValue = document.querySelector("[data-overall-best-value]");
const overallBestName = document.querySelector("[data-overall-best-name]");
const leaderboardBody = document.querySelector("[data-leaderboard-body]");
const tableCount = document.querySelector("[data-table-count]");
const yesButton = document.querySelector(".dashboard-action-yes");
const noButton = document.querySelector(".dashboard-action-no");
const checkInMessage = document.querySelector("[data-check-in-message]");
const checkInTimer = document.querySelector("[data-check-in-timer]");
const checkInProgress = document.querySelector("[data-check-in-progress]");
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
const header = document.querySelector(".header");
const headerMenuToggle = document.querySelector("[data-header-menu-toggle]");
const timezoneMenu = document.querySelector("[data-timezone-menu]");
const timezoneToggle = document.querySelector("[data-timezone-toggle]");
const timezoneOptions = document.querySelector("[data-timezone-options]");
const timezoneCurrent = document.querySelector("[data-timezone-current]");
const timezoneSearch = document.querySelector("[data-timezone-search]");
const timezoneEmpty = document.querySelector("[data-timezone-empty]");
const settingsAnswer = document.querySelector("[data-settings-answer]");
const settingsAnswerCurrent = document.querySelector("[data-settings-answer-current]");
const settingsAnswerOptions = document.querySelectorAll("[data-settings-answer-option]");
const prayerReactionEmoji = ["🙏", "❤️", "🙌", "🕊️", "💪", "🤍"];
const currentUserId = Number(leaderboardRoot?.dataset.currentUserId || 0);
let resetTimerId;
let allPrayers = [];
let prayerTimeOrder = "newest";
let toastTimerId;
let reactionChooserPrayerId = null;
let prayerActionsTrigger = null;
let missedAnswerDateKey = null;
let settingsCurrentAnswer = null;
let pendingSettingsAnswer = null;

async function apiFetch(url, { method = "GET", body } = {}) {
  const options = { method, headers: { Accept: "application/json" } };
  if (body !== undefined) {
    options.headers["Content-Type"] = "application/json";
    options.body = JSON.stringify(body);
  }

  let response;
  try {
    response = await fetch(url, options);
  } catch {
    return { ok: false, status: 0, data: {} };
  }

  if (response.status === 401) {
    window.location.href = "/login";
    return null;
  }

  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

let modalReturnFocus = null;

function rememberModalTrigger() {
  modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
}

function restoreModalTrigger() {
  const target = modalReturnFocus;
  modalReturnFocus = null;
  if (!target) return;

  if (target.isConnected) {
    target.focus();
    return;
  }

  const prayerId = target.dataset?.prayerId;
  if (prayerId && target.hasAttribute?.("data-prayer-actions-open")) {
    document.querySelector(`[data-prayer-actions-open][data-prayer-id="${prayerId}"]`)?.focus();
    return;
  }

  if (target.hasAttribute?.("data-missed-open")) {
    document.querySelector("[data-missed-open]")?.focus();
  }
}

function getOpenModal() {
  return document.querySelector(
    "[data-prayer-reaction-chooser]:not([hidden]), [data-missed-answer-modal]:not([hidden]), [data-settings-answer-confirm-modal]:not([hidden])",
  );
}

document.addEventListener("keydown", (event) => {
  if (event.key !== "Tab") return;

  const modal = getOpenModal();
  if (!modal) return;

  const focusable = [...modal.querySelectorAll("button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex='-1'])")];
  if (!focusable.length) return;

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const isInside = modal.contains(document.activeElement);

  if (event.shiftKey && (document.activeElement === first || !isInside)) {
    event.preventDefault();
    last.focus();
  } else if (!event.shiftKey && (document.activeElement === last || !isInside)) {
    event.preventDefault();
    first.focus();
  }
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

  const result = await apiFetch("/api/me/timezone", { method: "PATCH", body: { timezone } });
  if (!result) return;

  if (!result.ok) {
    button.disabled = false;
    showToast(result.data.error || result.data.errors?.[0] || "Could not save timezone", "error");
    return;
  }

  if (timezoneCurrent && result.data.timezone?.label) {
    timezoneCurrent.textContent = result.data.timezone.label;
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

const settingsToast = document.querySelector("[data-settings-toast]");
if (settingsToast?.dataset.settingsToast) {
  showToast(settingsToast.dataset.settingsToast, settingsToast.dataset.settingsToastVariant || "default");
}

function setSettingsAnswerState(answer) {
  settingsCurrentAnswer = answer || null;

  if (settingsAnswerCurrent) {
    settingsAnswerCurrent.textContent = answer || "Pending";
  }

  settingsAnswerOptions.forEach((button) => {
    const isSelected = button.dataset.settingsAnswerOption === answer;
    button.classList.toggle("selected", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

async function loadSettingsAnswer() {
  if (!settingsAnswer) return;

  const result = await apiFetch("/api/check-in/status");
  if (!result) return;

  if (!result.ok) {
    setSettingsAnswerState(null);
    showToast("Could not load today's answer", "error");
    return;
  }

  setSettingsAnswerState(result.data.answer);
}

async function saveSettingsAnswer(answer) {
  settingsAnswerOptions.forEach((button) => {
    button.disabled = true;
  });
  setSettingsAnswerState(answer);

  try {
    const result = await apiFetch("/api/check-in/today", { method: "PATCH", body: { answer } });
    if (!result) return;

    if (!result.ok) {
      await loadSettingsAnswer();
      showToast(result.data.error || "Could not change today's answer", "error");
      return;
    }

    setSettingsAnswerState(result.data.status?.answer || answer);
    showToast(answer === "YES" ? "Today's answer changed to yes" : "Today's answer changed to no");
  } finally {
    settingsAnswerOptions.forEach((button) => {
      button.disabled = false;
    });
  }
}

if (settingsAnswer) {
  settingsAnswerOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const answer = button.dataset.settingsAnswerOption;
      if (!answer || answer === settingsCurrentAnswer) return;
      openSettingsAnswerConfirmModal(answer);
    });
  });
  loadSettingsAnswer();
}

function renderLeaderboard(leaderboard) {
  if (!leaderboardRoot || !leaderboard || !leaderboardBody) return;

  if (overallBestValue) {
    overallBestValue.textContent = leaderboard.overallBest?.value || 0;
  }
  if (overallBestName) {
    overallBestName.textContent = leaderboard.overallBest?.name || "No record yet";
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
            <tr${Number(entry.id) === currentUserId ? ' class="is-current"' : ""}>
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
    : '<tr><td colspan="3" class="leaderboard-empty"><span class="table-empty-title">No streaks yet</span><span class="table-empty-hint">Answer today\'s question above to start the first streak.</span></td></tr>';
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

function actionMenuTriggerIcon() {
  return '<svg class="ui-icon action-menu-icon" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="19" cy="12" r="1.7"/></svg>';
}

function actionMenuItemIcon(name) {
  const paths = {
    heart: '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
  };
  return `<svg class="ui-icon" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths[name] || ""}</svg>`;
}

function getPrayerActionsMenu() {
  let menu = document.querySelector("[data-prayer-actions-menu]");
  if (menu) return menu;

  menu = document.createElement("div");
  menu.id = "prayer-actions-menu";
  menu.className = "action-menu";
  menu.setAttribute("data-prayer-actions-menu", "");
  menu.setAttribute("role", "menu");
  menu.hidden = true;
  menu.innerHTML = `
    <button class="action-menu-item" type="button" role="menuitem" data-prayer-menu-action="react">${actionMenuItemIcon("heart")}<span>React</span></button>
    <button class="action-menu-item" type="button" role="menuitem" data-prayer-menu-action="answered">${actionMenuItemIcon("check")}<span>Mark as answered</span></button>
  `;
  document.body.append(menu);
  return menu;
}

function positionPrayerActionsMenu(trigger, menu) {
  const viewportGap = 8;
  const triggerGap = 6;
  const triggerRect = trigger.getBoundingClientRect();
  const menuRect = menu.getBoundingClientRect();
  const left = Math.min(
    window.innerWidth - menuRect.width - viewportGap,
    Math.max(viewportGap, triggerRect.right - menuRect.width),
  );
  const spaceBelow = window.innerHeight - triggerRect.bottom;
  const placeBelow = spaceBelow >= menuRect.height + triggerGap + viewportGap;
  const top = placeBelow
    ? triggerRect.bottom + triggerGap
    : Math.max(viewportGap, triggerRect.top - menuRect.height - triggerGap);

  menu.dataset.placement = placeBelow ? "bottom" : "top";
  menu.style.left = `${left}px`;
  menu.style.top = `${top}px`;
}

function closePrayerActionsMenu({ restoreFocus = false } = {}) {
  const menu = document.querySelector("[data-prayer-actions-menu]");
  const trigger = prayerActionsTrigger;

  if (menu) menu.hidden = true;
  if (trigger) trigger.setAttribute("aria-expanded", "false");
  prayerActionsTrigger = null;

  if (restoreFocus && trigger?.isConnected) {
    trigger.focus({ preventScroll: true });
  }
}

function openPrayerActionsMenu(trigger) {
  const menu = getPrayerActionsMenu();
  const prayerId = trigger.dataset.prayerId;
  const canReact = trigger.dataset.prayerCanReact === "true";
  const canAnswer = trigger.dataset.prayerCanAnswer === "true";

  closePrayerActionsMenu();
  prayerActionsTrigger = trigger;
  trigger.setAttribute("aria-expanded", "true");
  menu.dataset.prayerId = prayerId;
  menu.querySelectorAll("button").forEach((button) => {
    button.disabled = false;
  });
  menu.querySelector('[data-prayer-menu-action="react"]').hidden = !canReact;
  menu.querySelector('[data-prayer-menu-action="answered"]').hidden = !canAnswer;
  menu.hidden = false;
  positionPrayerActionsMenu(trigger, menu);
  menu.querySelector("button:not([hidden])")?.focus({ preventScroll: true });
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
  rememberModalTrigger();
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
  const wasOpen = Boolean(chooser && !chooser.hidden);
  if (chooser) {
    chooser.hidden = true;
    chooser.querySelectorAll("[data-prayer-reaction]").forEach((button) => {
      button.disabled = false;
    });
  }
  reactionChooserPrayerId = null;
  document.body.classList.remove("prayer-reaction-modal-open");
  if (wasOpen) restoreModalTrigger();
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
  rememberModalTrigger();
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
  const wasOpen = Boolean(modal && !modal.hidden);
  if (modal) {
    modal.hidden = true;
    modal.querySelectorAll("[data-missed-answer]").forEach((button) => {
      button.disabled = false;
    });
  }
  missedAnswerDateKey = null;
  if (wasOpen) restoreModalTrigger();
}

function getSettingsAnswerConfirmModal() {
  let modal = document.querySelector("[data-settings-answer-confirm-modal]");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "settings-confirm-modal";
  modal.setAttribute("data-settings-answer-confirm-modal", "");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="settings-confirm-backdrop" data-settings-answer-cancel></div>
    <div class="settings-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-answer-confirm-title">
      <header class="settings-confirm-head">
        <p class="dashboard-label">Today's answer</p>
        <h2 id="settings-answer-confirm-title">Are you sure?</h2>
        <p data-settings-answer-confirm-copy>Change today's answer?</p>
      </header>
      <div class="settings-confirm-actions">
        <button class="settings-confirm-button settings-confirm-cancel" type="button" data-settings-answer-cancel>Cancel</button>
        <button class="settings-confirm-button settings-confirm-save" type="button" data-settings-answer-confirm>Change</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

function openSettingsAnswerConfirmModal(answer) {
  rememberModalTrigger();
  pendingSettingsAnswer = answer;
  const modal = getSettingsAnswerConfirmModal();
  const copy = modal.querySelector("[data-settings-answer-confirm-copy]");
  if (copy) {
    copy.textContent = `Change today's answer to ${answer === "YES" ? "YES" : "NO"}?`;
  }
  modal.hidden = false;
  modal.querySelector("[data-settings-answer-confirm]")?.focus();
}

function closeSettingsAnswerConfirmModal() {
  const modal = document.querySelector("[data-settings-answer-confirm-modal]");
  const wasOpen = Boolean(modal && !modal.hidden);
  if (modal) {
    modal.hidden = true;
    modal.querySelectorAll("[data-settings-answer-confirm], [data-settings-answer-cancel]").forEach((button) => {
      button.disabled = false;
    });
  }
  pendingSettingsAnswer = null;
  if (wasOpen) restoreModalTrigger();
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
  prayerUserFilter?.setAttribute("aria-expanded", String(isOpen));
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
  closePrayerActionsMenu();
  const showActions = targetBody.dataset.prayerActions === "true";
  const showReactions = targetBody.dataset.prayerReactions === "true";
  const showRowMenu = showActions || showReactions;
  const listType = targetBody.dataset.prayerList || "default";
  const emptyLabel = listType === "active" ? "No active prayer requests" : "No prayers yet";

  if (targetBody === prayersBody && prayerCount) {
    prayerCount.textContent = formatItemCount(prayers.length);
  }

  const emptyHint =
    listType === "active"
      ? "Requests you share appear here until they are answered."
      : "Prayer requests from the community will appear here.";

  targetBody.innerHTML = prayers.length
    ? prayers
        .map((item) => {
          const reactions = showReactions ? renderPrayerReactions(item) : "";
          const canAnswer = showActions && item.canMarkAnswered;
          const rowMenu =
            showReactions || canAnswer
              ? `<button class="action-menu-trigger" type="button" data-prayer-actions-open data-prayer-id="${item.id}" data-prayer-can-react="${showReactions}" data-prayer-can-answer="${canAnswer}" aria-haspopup="menu" aria-expanded="false" aria-controls="prayer-actions-menu" aria-label="Open prayer actions">${actionMenuTriggerIcon()}</button>`
              : "";

          return `
            <tr>
              <td><a class="leaderboard-user user-link" href="/customer/${item.userId}">${userIcon()}${escapeHtml(item.userName)}</a></td>
              <td>
                <div class="prayer-entry">
                  <p class="prayer-message-text">${escapeHtml(item.prayer)}</p>
                  ${reactions ? `<div class="prayer-entry-meta">${reactions}</div>` : ""}
                </div>
              </td>
              ${showRowMenu ? `<td class="prayer-row-actions">${rowMenu}</td>` : ""}
            </tr>
          `;
        })
        .join("")
    : `<tr><td colspan="${2 + (showRowMenu ? 1 : 0)}" class="leaderboard-empty"><span class="table-empty-title">${emptyLabel}</span><span class="table-empty-hint">${emptyHint}</span></td></tr>`;
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

  const result = await apiFetch("/api/prayers");
  if (!result?.ok) return;

  renderUserPrayerLists(result.data.prayerLists || {});
}

async function markPrayerAnswered(prayerId, control) {
  if (!prayerId) return;
  if (control) control.disabled = true;

  const result = await apiFetch(`/api/prayers/${prayerId}/answered`, { method: "POST" });
  if (!result?.ok) {
    if (control) control.disabled = false;
    showToast(result?.data.error || "Could not mark prayer as answered", "error");
    return;
  }

  await loadPrayers();
  showToast("Prayer marked as answered");
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

document.addEventListener("click", async (event) => {
  const actionsTrigger = event.target.closest("[data-prayer-actions-open]");
  if (actionsTrigger) {
    event.preventDefault();
    const isOpen = actionsTrigger === prayerActionsTrigger;
    if (isOpen) {
      closePrayerActionsMenu({ restoreFocus: true });
    } else {
      openPrayerActionsMenu(actionsTrigger);
    }
    return;
  }

  const menuAction = event.target.closest("[data-prayer-menu-action]");
  if (menuAction) {
    const menu = menuAction.closest("[data-prayer-actions-menu]");
    const prayerId = menu?.dataset.prayerId;
    const trigger = prayerActionsTrigger;
    const action = menuAction.dataset.prayerMenuAction;

    closePrayerActionsMenu();
    if (trigger?.isConnected) trigger.focus({ preventScroll: true });

    if (action === "react") {
      openReactionChooser(prayerId);
    } else if (action === "answered") {
      await markPrayerAnswered(prayerId, menuAction);
    }
    return;
  }

  const actionsMenu = document.querySelector("[data-prayer-actions-menu]");
  if (actionsMenu && !actionsMenu.hidden && !actionsMenu.contains(event.target)) {
    closePrayerActionsMenu();
  }

  const settingsAnswerCancel = event.target.closest("[data-settings-answer-cancel]");
  if (settingsAnswerCancel) {
    closeSettingsAnswerConfirmModal();
    return;
  }

  const settingsAnswerConfirm = event.target.closest("[data-settings-answer-confirm]");
  if (settingsAnswerConfirm && pendingSettingsAnswer) {
    const answer = pendingSettingsAnswer;
    const modal = settingsAnswerConfirm.closest("[data-settings-answer-confirm-modal]");
    modal?.querySelectorAll("[data-settings-answer-confirm], [data-settings-answer-cancel]").forEach((button) => {
      button.disabled = true;
    });
    closeSettingsAnswerConfirmModal();
    await saveSettingsAnswer(answer);
    return;
  }

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

    const result = await apiFetch("/api/check-in/missed", {
      method: "POST",
      body: {
        dateKey: missedAnswerDateKey,
        answer,
      },
    });
    if (!result) return;

    if (!result.ok || !result.data.leaderboard) {
      modal?.querySelectorAll("[data-missed-answer]").forEach((button) => {
        button.disabled = false;
      });
      showToast(result.data.error || "Could not save missed day", "error");
      return;
    }

    renderLeaderboard(result.data.leaderboard);
    if (result.data.status) {
      setAnswerState(result.data.status);
    } else {
      await loadCheckInStatus();
    }
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

  const result = await apiFetch(
    `/api/prayers/${prayerId}/reaction`,
    isRemoving ? { method: "DELETE" } : { method: "POST", body: { emoji } },
  );
  if (!result) return;

  if (!result.ok || !result.data.prayer) {
    chooser.querySelectorAll("[data-prayer-reaction]").forEach((reactionButton) => {
      reactionButton.disabled = false;
    });
    showToast(result.data.error || "Could not add reaction", "error");
    return;
  }

  allPrayers = allPrayers.map((item) => (item.id === result.data.prayer.id ? result.data.prayer : item));
  applyPrayerFilters();
  closeReactionChooser();
  showToast(isRemoving ? "Reaction removed" : "Reaction saved");
});

document.addEventListener("keydown", (event) => {
  const actionsTrigger = event.target.closest?.("[data-prayer-actions-open]");
  if (actionsTrigger && (event.key === "ArrowDown" || event.key === "ArrowUp")) {
    event.preventDefault();
    openPrayerActionsMenu(actionsTrigger);
    if (event.key === "ArrowUp") {
      const items = [...getPrayerActionsMenu().querySelectorAll("button:not([hidden])")];
      items.at(-1)?.focus();
    }
    return;
  }

  const actionsMenu = document.querySelector("[data-prayer-actions-menu]");
  if (actionsMenu && !actionsMenu.hidden && actionsMenu.contains(event.target)) {
    const items = [...actionsMenu.querySelectorAll("button:not([hidden]):not([disabled])")];
    const currentIndex = items.indexOf(document.activeElement);

    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault();
      const direction = event.key === "ArrowDown" ? 1 : -1;
      const nextIndex = (currentIndex + direction + items.length) % items.length;
      items[nextIndex]?.focus();
      return;
    }

    if (event.key === "Home" || event.key === "End") {
      event.preventDefault();
      items[event.key === "Home" ? 0 : items.length - 1]?.focus();
      return;
    }

    if (event.key === "Escape") {
      event.preventDefault();
      closePrayerActionsMenu({ restoreFocus: true });
      return;
    }
  }

  if (event.key === "Escape") {
    closePrayerActionsMenu({ restoreFocus: true });
    setHeaderMenuOpen(false);
    setTimezoneMenuOpen(false);
    closeReactionChooser();
    closeMissedAnswerModal();
    closeSettingsAnswerConfirmModal();
  }
});

window.addEventListener("resize", () => closePrayerActionsMenu());
window.addEventListener("scroll", () => closePrayerActionsMenu(), true);

function setDailyActionSelection(answer) {
  if (yesButton) {
    yesButton.classList.toggle("selected", answer === "YES");
    yesButton.setAttribute("aria-pressed", String(answer === "YES"));
  }
  if (noButton) {
    noButton.classList.toggle("selected", answer === "NO");
    noButton.setAttribute("aria-pressed", String(answer === "NO"));
  }
}

async function updateLeaderboard(action) {
  const endpoint = action === "reset" ? "/api/leaderboard/reset" : "/api/leaderboard/increment";
  setDailyActionSelection(action === "increment" ? "YES" : "NO");
  markTodayWeekDay(action === "increment" ? "YES" : "NO");

  const result = await apiFetch(endpoint, { method: "POST" });
  if (!result) return;

  if (result.status === 409) {
    await loadCheckInStatus();
    showToast("You already answered today");
    return;
  }

  if (!result.ok) {
    await loadCheckInStatus();
    showToast("Could not save answer", "error");
    return;
  }

  renderLeaderboard(result.data.leaderboard);
  if (result.data.status) {
    setAnswerState(result.data.status);
  } else {
    await loadCheckInStatus();
  }
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

    const result = await apiFetch("/api/prayers", { method: "POST", body: { prayer } });
    if (!result) return;

    if (!result.ok) {
      if (prayerStatus) prayerStatus.textContent = "";
      showToast(result.data.errors?.[0] || "Could not add prayer", "error");
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

    const result = await apiFetch("/api/telegram/connect-link");
    if (!result) return;

    if (!result.ok || !result.data.link) {
      showToast(result.data.error || "Could not create Telegram link", "error");
      telegramConnectButton.disabled = false;
      return;
    }

    showToast(result.data.botUsername ? `Telegram link ready: @${result.data.botUsername}` : "Telegram link ready");
    window.location.href = result.data.link;
  });
}

async function loadCheckInStatus() {
  const result = await apiFetch("/api/check-in/status");
  if (!result?.ok) return;

  setAnswerState(result.data);
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
  setDailyActionSelection(status.answer || null);

  if (checkInMessage && checkInTimer) {
    if (status.answeredToday && status.nextResetAt) {
      checkInTimer.hidden = false;
      renderResetTimer(status.nextResetAt);
      resetTimerId = window.setInterval(() => renderResetTimer(status.nextResetAt), 1000);
    } else {
      checkInTimer.hidden = true;
    }
  }
}

function renderResetTimer(nextResetAt) {
  if (!checkInMessage || !checkInTimer) return;

  const remainingMs = Math.max(0, new Date(nextResetAt).getTime() - Date.now());

  if (remainingMs === 0) {
    checkInTimer.hidden = true;
    yesButton.disabled = false;
    noButton.disabled = false;
    setDailyActionSelection(null);
    window.clearInterval(resetTimerId);
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const dayMs = 24 * 60 * 60 * 1000;
  const progress = Math.min(100, Math.max(0, ((dayMs - remainingMs) / dayMs) * 100));

  checkInMessage.textContent = `${formatTimerPart(hours)}:${formatTimerPart(minutes)}:${formatTimerPart(seconds)}`;
  if (checkInProgress) {
    checkInProgress.style.width = `${progress}%`;
    checkInProgress.parentElement?.setAttribute("aria-valuenow", String(Math.round(progress)));
  }
}

function formatTimerPart(value) {
  return String(value).padStart(2, "0");
}
