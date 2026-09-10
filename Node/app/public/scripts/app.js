const dailyCheckInRoot = document.querySelector("[data-daily-check-in]");
const leaderboardRoot = document.querySelector("[data-recovery-leaderboard]");
const overallBestValue = document.querySelector('[data-streak-best-value="recovery"]');
const overallBestName = document.querySelector('[data-streak-best-name="recovery"]');
const leaderboardBody = document.querySelector("[data-leaderboard-body]");
const tableCount = document.querySelector('[data-streak-count="recovery"]');
const yesButton = document.querySelector(".dashboard-action-yes");
const noButton = document.querySelector(".dashboard-action-no");
const checkInMessage = document.querySelector("[data-check-in-message]");
const checkInTimer = document.querySelector("[data-check-in-timer]");
const checkInProgress = document.querySelector("[data-check-in-progress]");
const prayerForm = document.querySelector("[data-prayer-form]");
const prayersBody = document.querySelector("[data-prayers-body]");
const prayerCount = document.querySelector("[data-prayer-count]");
const activePrayersBody = document.querySelector('[data-prayer-list="active"]');
const activePrayerCount = document.querySelector("[data-active-prayer-count]");
const prayerStatus = document.querySelector("[data-prayer-status]");
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
const settingsReading = document.querySelector("[data-settings-reading]");
const prayerReactionEmoji = ["🙏", "❤️", "🙌", "🕊️", "💪", "🤍"];
const currentUserId = Number((dailyCheckInRoot || leaderboardRoot)?.dataset.currentUserId || 0);
let resetTimerId;
let allPrayers = [];
let prayerTimeOrder = "newest";
let toastTimerId;
let reactionChooserPrayerId = null;
let prayerActionsTrigger = null;
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

  if (target.hasAttribute?.("data-catch-up-open")) {
    focusCatchUpAfterSave();
  }
}

function getOpenModal() {
  return document.querySelector(
    "[data-prayer-reaction-chooser]:not([hidden]), [data-catch-up-answer-modal]:not([hidden]), [data-catch-up-tasks-modal]:not([hidden]), [data-settings-answer-confirm-modal]:not([hidden]), [data-settings-reading-confirm-modal]:not([hidden]), [data-reading-modal]:not([hidden])",
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
  window.setTimeout(() => {
    startPageTransition();
    window.location.reload();
  }, 400);
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
    button.setAttribute("aria-pressed", String(isSelected));
  });
  setAmbientAnswerState(answer);
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

  const bestValue = leaderboard.overallBest?.value || 0;
  if (overallBestValue) {
    overallBestValue.textContent = `${bestValue} ${bestValue === 1 ? "day" : "days"}`;
  }
  if (overallBestName) {
    overallBestName.textContent = leaderboard.overallBest?.name || "No record yet";
  }

  if (tableCount) {
    tableCount.textContent = `${leaderboard.leaders.length} ${leaderboard.leaders.length === 1 ? "user" : "users"}`;
  }

  leaderboardBody.innerHTML = leaderboard.leaders.length
    ? leaderboard.leaders
        .map(
          (entry) => `
            <tr${Number(entry.id) === currentUserId ? ' class="is-current"' : ""}>
              <td><span class="leaderboard-rank">${entry.rank}</span></td>
              <td>
                <span class="leaderboard-user-cell">
                  <a class="leaderboard-user user-link" href="/customer/${entry.id}">${userIcon()}${escapeHtml(entry.name)}</a>
                </span>
              </td>
              <td>
                <span class="leaderboard-streak">
                  <span class="leaderboard-streak-value">${entry.value} ${entry.value === 1 ? "day" : "days"}</span>
                  ${renderMissedDaysTag(entry)}
                </span>
              </td>
            </tr>
          `,
        )
        .join("")
    : '<tr><td colspan="3" class="leaderboard-empty"><span class="table-empty-title">No recovery streaks yet.</span><span class="table-empty-hint">Answer today\'s question to start the first streak.</span></td></tr>';
}

function renderMissedDaysTag(entry) {
  const missedDays = entry?.missedDays;
  if (!missedDays || !missedDays.count) return "";

  const separator = '<span class="leaderboard-streak-separator" aria-hidden="true">·</span>';
  const label = `${missedDays.count} missed`;

  return `${separator}<span class="leaderboard-missed-tag is-static">${escapeHtml(label)}</span>`;
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
        <button class="ui-button ui-button--secondary" type="button" data-settings-answer-cancel>Cancel</button>
        <button class="ui-button ui-button--primary" type="button" data-settings-answer-confirm>Change</button>
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

function updatePrayerTimeState() {
  if (prayerTimeLabel) {
    prayerTimeLabel.textContent = prayerTimeOrder === "oldest" ? "Oldest first" : "Newest first";
  }

  prayerTimeMenu?.querySelectorAll("[data-prayer-time-option]").forEach((button) => {
    const isCurrent = button.dataset.prayerTimeOption === prayerTimeOrder;
    if (isCurrent) button.setAttribute("aria-current", "true");
    else button.removeAttribute("aria-current");
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
  return Boolean(target.closest("[data-prayer-filter-panel]"));
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
              ? `<button class="action-menu-trigger prayer-item-menu" type="button" data-prayer-actions-open data-prayer-id="${item.id}" data-prayer-can-react="${showReactions}" data-prayer-can-answer="${canAnswer}" aria-haspopup="menu" aria-expanded="false" aria-controls="prayer-actions-menu" aria-label="Open prayer actions">${actionMenuTriggerIcon()}</button>`
              : "";

          return `
            <li class="prayer-item"
                data-prayer-row
                data-prayer-id="${item.id}"
                data-prayer-user-id="${item.userId}"
                data-prayer-user-name="${escapeHtml(item.userName)}"
                data-prayer-text="${escapeHtml(item.prayer)}"
                data-prayer-can-mark-answered="${item.canMarkAnswered ? "true" : "false"}"
                data-prayer-current-reaction="${escapeHtml(item.currentReaction || "")}">
              <div class="prayer-item-head">
                <a class="leaderboard-user user-link prayer-item-author" href="/customer/${item.userId}">${escapeHtml(item.userName)}</a>
                ${showRowMenu ? rowMenu : ""}
              </div>
              <p class="prayer-message-text">${escapeHtml(item.prayer)}</p>
              ${reactions ? `<div class="prayer-entry-meta">${reactions}</div>` : ""}
            </li>
          `;
        })
        .join("")
    : `<li class="prayer-item prayer-item--empty"><div class="empty-state"><p class="empty-state-title">${emptyLabel}</p><p class="empty-state-note">${emptyHint}</p></div></li>`;
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
    closeCatchUpAnswerModal();
    closeCatchUpTasksModal();
    closeSettingsAnswerConfirmModal();
    closeSettingsReadingConfirmModal();
    closeReadingModal();
  }
});

window.addEventListener("resize", () => closePrayerActionsMenu());
window.addEventListener("scroll", () => closePrayerActionsMenu(), true);

const horizonBand = document.querySelector("[data-horizon]");

const REVEAL_BATCH_CAP = 5;

window.NoOrRevealNewRows = revealNewRows;

function revealNewRows(rows, previouslyVisible) {
  const batch = rows.slice(previouslyVisible, previouslyVisible + REVEAL_BATCH_CAP);

  // Write every row first, force layout once, then start them together.
  // Reading `offsetWidth` per row interleaved the writes with reads and made
  // the browser lay the document out once per row.
  batch.forEach((row, index) => {
    row.style.setProperty("--reveal-index", String(index));
    row.classList.remove("is-revealing");
  });

  if (batch.length) void batch[0].offsetWidth;

  batch.forEach((row) => {
    row.classList.add("is-revealing");
    row.addEventListener("animationend", () => row.classList.remove("is-revealing"), { once: true });
  });
}

function setHorizonState(answer) {
  if (!horizonBand) return;
  horizonBand.dataset.state = answer === "YES" ? "yes" : answer === "NO" ? "no" : "neutral";
}

function setDailyActionSelection(answer) {
  if (yesButton) {
    yesButton.setAttribute("aria-pressed", String(answer === "YES"));
  }
  if (noButton) {
    noButton.setAttribute("aria-pressed", String(answer === "NO"));
  }
  setHorizonState(answer);
  setAmbientAnswerState(answer);
}

async function updateLeaderboard(action) {
  const endpoint = action === "reset" ? "/api/leaderboard/reset" : "/api/leaderboard/increment";
  setDailyActionSelection(action === "increment" ? "YES" : "NO");

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

if (dailyCheckInRoot) {
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
    const newest = prayersBody?.querySelector("[data-prayer-id]");
    if (newest) {
      newest.classList.add("is-revealing");
      newest.addEventListener("animationend", () => newest.classList.remove("is-revealing"), { once: true });
    }
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
    checkInProgress.style.setProperty("--timer-progress", String(progress / 100));
    checkInProgress.parentElement?.setAttribute("aria-valuenow", String(Math.round(progress)));
  }
}

function formatTimerPart(value) {
  return String(value).padStart(2, "0");
}

const readingCheck = document.querySelector("[data-reading-check]");
const readingYesButton = document.querySelector('[data-reading-answer="YES"]');
const readingNoButton = document.querySelector('[data-reading-answer="NO"]');
const readingSummary = document.querySelector("[data-reading-summary]");
const readingSummaryBadge = document.querySelector("[data-reading-summary-badge]");
const readingSummaryNote = document.querySelector("[data-reading-summary-note]");
const readingSummaryRefs = document.querySelector("[data-reading-summary-refs]");
const readingTimer = document.querySelector("[data-reading-timer]");
const readingTimerMessage = document.querySelector("[data-reading-timer-message]");
const readingTimerProgress = document.querySelector("[data-reading-timer-progress]");
const readingModal = document.querySelector("[data-reading-modal]");
const readingForm = document.querySelector("[data-reading-form]");
const readingPassageList = document.querySelector("[data-reading-passage-list]");
const readingPassageTemplate = document.querySelector("[data-reading-passage-template]");
const readingAddPassage = document.querySelector("[data-reading-add-passage]");
const readingError = document.querySelector("[data-reading-error]");
const readingReflection = document.querySelector("[data-reading-reflection]");
const readingReflectionCount = document.querySelector("[data-reading-reflection-count]");
const readingSaveButton = document.querySelector("[data-reading-save]");

const READING_MAX_PASSAGES = 20;

let readingBooks = null;
let readingBooksRequest = null;
let readingResetTimerId;
let readingPassageSeed = 0;
let readingSubmitting = false;
let readingModalSession = null;

async function loadBibleBooks() {
  if (readingBooks) return readingBooks;
  if (!readingBooksRequest) {
    readingBooksRequest = apiFetch("/api/reading-check-in/books").then((result) => {
      readingBooksRequest = null;
      if (result?.ok && Array.isArray(result.data.books)) {
        readingBooks = result.data.books;
      }
      return readingBooks;
    });
  }

  return readingBooksRequest;
}

function findReadingBook(code) {
  return readingBooks?.find((book) => book.code === code) || null;
}

function formatPassageReference({ bookName, chapter, startVerse, endVerse }) {
  const verses = startVerse === endVerse ? `${startVerse}` : `${startVerse}–${endVerse}`;
  return `${bookName} ${chapter}:${verses}`;
}

function fillSelect(select, values, { placeholder, selected }) {
  select.replaceChildren();

  const placeholderOption = document.createElement("option");
  placeholderOption.value = "";
  placeholderOption.textContent = placeholder;
  select.append(placeholderOption);

  for (const value of values) {
    const option = document.createElement("option");
    option.value = String(value.value ?? value);
    option.textContent = String(value.label ?? value);
    select.append(option);
  }

  select.value = selected !== undefined && selected !== null ? String(selected) : "";
  if (!select.value) select.selectedIndex = 0;
}

function getPassageControls(row) {
  return {
    book: row.querySelector('[data-reading-select="book"]'),
    chapter: row.querySelector('[data-reading-select="chapter"]'),
    startVerse: row.querySelector('[data-reading-select="startVerse"]'),
    endVerse: row.querySelector('[data-reading-select="endVerse"]'),
  };
}

function range(count) {
  return Array.from({ length: Math.max(0, count) }, (unused, index) => index + 1);
}

function syncChapterSelect(row, { chapter, startVerse, endVerse } = {}) {
  const controls = getPassageControls(row);
  const book = findReadingBook(controls.book.value);
  const chapters = book ? range(book.chapters.length) : [];

  fillSelect(controls.chapter, chapters, { placeholder: "Chapter", selected: chapter });
  controls.chapter.disabled = !book;
  syncVerseSelects(row, { startVerse, endVerse });
}

function syncVerseSelects(row, { startVerse, endVerse } = {}) {
  const controls = getPassageControls(row);
  const book = findReadingBook(controls.book.value);
  const chapter = Number(controls.chapter.value);
  const verseCount = book && chapter ? book.chapters[chapter - 1] || 0 : 0;

  fillSelect(controls.startVerse, range(verseCount), { placeholder: "From", selected: startVerse });
  controls.startVerse.disabled = !verseCount;
  syncEndVerseSelect(row, endVerse);
}

function syncEndVerseSelect(row, endVerse) {
  const controls = getPassageControls(row);
  const book = findReadingBook(controls.book.value);
  const chapter = Number(controls.chapter.value);
  const verseCount = book && chapter ? book.chapters[chapter - 1] || 0 : 0;
  const start = Number(controls.startVerse.value);
  const verses = start ? range(verseCount).filter((verse) => verse >= start) : [];
  const keep = endVerse && Number(endVerse) >= start ? endVerse : (start || null);

  fillSelect(controls.endVerse, verses, { placeholder: "To", selected: keep });
  controls.endVerse.disabled = !verses.length;
}

function renumberPassages() {
  const rows = [...readingPassageList.querySelectorAll("[data-reading-passage]")];

  rows.forEach((row, index) => {
    const title = row.querySelector("[data-reading-passage-title]");
    if (title) title.textContent = `Passage ${index + 1}`;

    const removeButton = row.querySelector("[data-reading-remove-passage]");
    if (removeButton) {
      removeButton.hidden = rows.length < 2;
      removeButton.setAttribute("aria-label", `Remove passage ${index + 1}`);
    }
  });

  if (readingAddPassage) {
    readingAddPassage.disabled = rows.length >= READING_MAX_PASSAGES;
  }
}

function addPassageRow(passage) {
  if (!readingPassageList || !readingPassageTemplate) return null;
  if (readingPassageList.querySelectorAll("[data-reading-passage]").length >= READING_MAX_PASSAGES) return null;

  readingPassageSeed += 1;
  const row = readingPassageTemplate.content.firstElementChild.cloneNode(true);
  const controls = getPassageControls(row);

  for (const [field, select] of Object.entries(controls)) {
    const label = row.querySelector(`[data-reading-label="${field}"]`);
    const id = `reading-${field.toLowerCase()}-${readingPassageSeed}`;
    select.id = id;
    select.name = id;
    if (label) label.setAttribute("for", id);
  }

  fillSelect(controls.book, (readingBooks || []).map((book) => ({ value: book.code, label: book.name })), {
    placeholder: "Book",
    selected: passage?.book,
  });

  readingPassageList.append(row);
  syncChapterSelect(row, passage);
  renumberPassages();

  return row;
}

function readPassageRows() {
  return [...readingPassageList.querySelectorAll("[data-reading-passage]")].map((row) => {
    const controls = getPassageControls(row);

    return {
      row,
      controls,
      value: {
        book: controls.book.value,
        chapter: Number(controls.chapter.value),
        startVerse: Number(controls.startVerse.value),
        endVerse: Number(controls.endVerse.value),
      },
    };
  });
}

function showReadingError(message, field) {
  if (readingError) {
    readingError.textContent = message;
    readingError.hidden = false;
  }
  field?.focus();
}

function clearReadingError() {
  if (!readingError) return;
  readingError.textContent = "";
  readingError.hidden = true;
}

function collectReadingPassages() {
  const rows = readPassageRows();

  if (!rows.length) {
    showReadingError("Add at least one passage you read.", readingAddPassage);
    return null;
  }

  for (const [index, { controls, value }] of rows.entries()) {
    const label = `Passage ${index + 1}`;

    if (!value.book) {
      showReadingError(`${label}: choose a book.`, controls.book);
      return null;
    }
    if (!value.chapter) {
      showReadingError(`${label}: choose a chapter.`, controls.chapter);
      return null;
    }
    if (!value.startVerse) {
      showReadingError(`${label}: choose the first verse.`, controls.startVerse);
      return null;
    }
    if (!value.endVerse) {
      showReadingError(`${label}: choose the last verse.`, controls.endVerse);
      return null;
    }
    if (value.endVerse < value.startVerse) {
      showReadingError(`${label}: the last verse cannot come before the first verse.`, controls.endVerse);
      return null;
    }
  }

  clearReadingError();
  return rows.map(({ value }) => value);
}

function setReadingModalOpen(isOpen) {
  if (!readingModal) return;
  readingModal.hidden = !isOpen;
  document.body.classList.toggle("reading-modal-open", isOpen);
}

function hasUnsavedReading() {
  if (!readingModal || readingModal.hidden) return false;
  return Boolean(readingReflection?.value.trim());
}

window.addEventListener("beforeunload", (event) => {
  if (readingSubmitting || !hasUnsavedReading()) return;
  event.preventDefault();
  event.returnValue = "";
});

async function openReadingModal({ save, passages = [], reflection = "" } = {}) {
  if (!readingModal || !save) return;

  rememberModalTrigger();
  await loadBibleBooks();

  if (!readingBooks) {
    showToast("Could not load the Bible books", "error");
    restoreModalTrigger();
    return;
  }

  readingModalSession = { save };
  clearReadingError();
  readingPassageList.replaceChildren();
  if (readingReflection) readingReflection.value = reflection || "";
  updateReflectionCount();

  if (passages.length) {
    passages.forEach((passage) => addPassageRow(passage));
  } else {
    addPassageRow();
  }

  setReadingModalOpen(true);
  readingPassageList.querySelector('[data-reading-select="book"]')?.focus();
}

function closeReadingModal() {
  const wasOpen = Boolean(readingModal && !readingModal.hidden);
  setReadingModalOpen(false);
  setReadingSubmitting(false);
  readingModalSession = null;
  if (wasOpen) restoreReadingFocus();
}

function restoreReadingFocus() {
  restoreModalTrigger();
  const host = readingCheck || settingsReading;
  if (!host || host.contains(document.activeElement)) return;

  if (document.activeElement && document.activeElement !== document.body) return;

  host.focus();
}

function setReadingSubmitting(isSubmitting) {
  readingSubmitting = isSubmitting;
  if (readingSaveButton) readingSaveButton.disabled = isSubmitting;
}

function updateReflectionCount() {
  if (!readingReflectionCount || !readingReflection) return;
  readingReflectionCount.textContent = String(readingReflection.value.length);
}

function renderReadingSummary(status) {
  if (!readingSummary) return;

  const hasReading = status.answeredToday && status.answer === "YES";
  readingSummary.hidden = !hasReading;
  if (!hasReading) return;

  readingSummaryBadge.textContent = "Yes";
  readingSummaryBadge.dataset.answer = "yes";
  readingSummaryNote.textContent = "You read today";

  readingSummaryRefs.replaceChildren();
  for (const passage of status.passages || []) {
    const item = document.createElement("li");
    item.className = "reading-summary-ref";
    item.setAttribute("data-reading-summary-ref", "");
    item.textContent = passage.reference || formatPassageReference(passage);
    readingSummaryRefs.append(item);
  }
}

function setReadingAnswerState(status) {
  if (!readingCheck) return;

  window.clearInterval(readingResetTimerId);
  const isLocked = status.canAnswer === false;

  if (readingYesButton) {
    readingYesButton.disabled = isLocked;
    readingYesButton.setAttribute("aria-pressed", String(status.answer === "YES"));
  }
  if (readingNoButton) {
    readingNoButton.disabled = isLocked;
    readingNoButton.setAttribute("aria-pressed", String(status.answer === "NO"));
  }

  renderReadingSummary(status);

  if (status.answeredToday && status.nextResetAt) {
    readingTimer.hidden = false;
    renderReadingResetTimer(status.nextResetAt);
    readingResetTimerId = window.setInterval(() => renderReadingResetTimer(status.nextResetAt), 1000);
  } else {
    readingTimer.hidden = true;
  }
}

function renderReadingResetTimer(nextResetAt) {
  if (!readingTimerMessage || !readingTimer) return;

  const remainingMs = Math.max(0, new Date(nextResetAt).getTime() - Date.now());

  if (remainingMs === 0) {
    window.clearInterval(readingResetTimerId);
    setReadingAnswerState({
      canAnswer: true,
      answeredToday: false,
      answer: null,
      passages: [],
    });
    return;
  }

  const totalSeconds = Math.ceil(remainingMs / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const dayMs = 24 * 60 * 60 * 1000;
  const progress = Math.min(100, Math.max(0, ((dayMs - remainingMs) / dayMs) * 100));

  readingTimerMessage.textContent = `${formatTimerPart(hours)}:${formatTimerPart(minutes)}:${formatTimerPart(seconds)}`;
  if (readingTimerProgress) {
    readingTimerProgress.style.setProperty("--timer-progress", String(progress / 100));
    readingTimerProgress.parentElement?.setAttribute("aria-valuenow", String(Math.round(progress)));
  }
}

async function loadReadingCheckInStatus() {
  const result = await apiFetch("/api/reading-check-in/status");
  if (!result?.ok) return;

  setReadingAnswerState(result.data);
}

async function requestReadingAnswer({ answer, passages = [], reflection = "", method = "POST" }) {
  const result = await apiFetch("/api/reading-check-in/today", {
    method,
    body: { answer, passages, reflection },
  });
  if (!result) return null;

  if (result.status === 409) {
    return { status: null, error: "You already answered the reading check today", conflict: true };
  }

  if (!result.ok) {
    return {
      status: null,
      error: result.data.errors?.[0] || result.data.error || "Could not save the reading answer",
    };
  }

  return { status: result.data, error: null };
}

async function saveReadingAnswer({ answer, passages = [], reflection = "" }) {
  const outcome = await requestReadingAnswer({ answer, passages, reflection, method: "POST" });
  if (!outcome) return null;

  if (outcome.conflict) {
    await loadReadingCheckInStatus();
    showToast(outcome.error);
    return outcome;
  }

  if (outcome.error) {
    showToast(outcome.error, "error");
    return outcome;
  }

  setReadingAnswerState(outcome.status);
  showToast(answer === "YES" ? "Reading saved: yes" : "Reading saved: no");
  return outcome;
}

async function submitReadingModal(event) {
  event.preventDefault();
  if (readingSubmitting || !readingModalSession) return;

  const passages = collectReadingPassages();
  if (!passages) return;

  setReadingSubmitting(true);
  const { status, error } = await readingModalSession.save({
    answer: "YES",
    passages,
    reflection: readingReflection?.value || "",
  }) || {};
  setReadingSubmitting(false);

  if (status) {
    closeReadingModal();
    return;
  }

  if (error) showReadingError(error);
}

if (readingModal) {
  document.body.append(readingModal);

  readingAddPassage?.addEventListener("click", () => {
    const row = addPassageRow();
    row?.querySelector('[data-reading-select="book"]')?.focus();
  });

  readingPassageList?.addEventListener("change", (event) => {
    const row = event.target.closest("[data-reading-passage]");
    if (!row) return;

    const field = event.target.dataset.readingSelect;
    if (field === "book") syncChapterSelect(row);
    if (field === "chapter") syncVerseSelects(row);
    if (field === "startVerse") syncEndVerseSelect(row);
    clearReadingError();
  });

  readingPassageList?.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-reading-remove-passage]");
    if (!removeButton) return;

    const row = removeButton.closest("[data-reading-passage]");
    const rows = [...readingPassageList.querySelectorAll("[data-reading-passage]")];
    if (rows.length < 2) return;

    const nextFocus = row.nextElementSibling || row.previousElementSibling;
    row.remove();
    renumberPassages();
    clearReadingError();
    (nextFocus?.querySelector('[data-reading-select="book"]') || readingAddPassage)?.focus();
  });

  readingReflection?.addEventListener("input", updateReflectionCount);
  readingForm?.addEventListener("submit", submitReadingModal);

  readingModal.addEventListener("click", (event) => {
    if (event.target.closest("[data-reading-close]")) closeReadingModal();
  });

  loadBibleBooks();
}

if (readingCheck) {
  readingYesButton?.addEventListener("click", () => {
    if (readingYesButton.disabled) return;
    openReadingModal({ save: saveReadingAnswer });
  });

  readingNoButton?.addEventListener("click", async () => {
    if (readingNoButton.disabled) return;
    readingNoButton.disabled = true;
    const saved = await saveReadingAnswer({ answer: "NO" });
    if (!saved?.status) await loadReadingCheckInStatus();
  });

  loadReadingCheckInStatus();
}

const settingsReadingCurrent = document.querySelector("[data-settings-reading-current]");
const settingsReadingOptions = document.querySelectorAll("[data-settings-reading-answer-option]");
const settingsReadingDetails = document.querySelector("[data-settings-reading-details]");
const settingsReadingRefs = document.querySelector("[data-settings-reading-refs]");
const settingsReadingEdit = document.querySelector("[data-settings-reading-edit]");

let settingsReadingStatus = null;
let pendingSettingsReadingAnswer = null;

function setSettingsReadingState(status) {
  settingsReadingStatus = status || null;
  const answer = status?.answeredToday ? status.answer : null;

  if (settingsReadingCurrent) {
    settingsReadingCurrent.textContent = answer || "Pending";
  }

  settingsReadingOptions.forEach((button) => {
    const isSelected = button.dataset.settingsReadingAnswerOption === answer;
    button.setAttribute("aria-pressed", String(isSelected));
  });

  const passages = answer === "YES" ? status?.passages || [] : [];
  if (settingsReadingDetails) settingsReadingDetails.hidden = answer !== "YES";
  if (settingsReadingRefs) {
    settingsReadingRefs.replaceChildren(
      ...passages.map((passage) => {
        const item = document.createElement("li");
        item.className = "settings-reading-ref";
        item.setAttribute("data-settings-reading-ref", "");
        item.textContent = passage.reference || "";
        return item;
      }),
    );
  }
}

async function loadSettingsReading() {
  const result = await apiFetch("/api/reading-check-in/status");
  if (!result) return;

  if (!result.ok) {
    setSettingsReadingState(null);
    showToast("Could not load today's reading", "error");
    return;
  }

  setSettingsReadingState(result.data);
}

function setSettingsReadingBusy(isBusy) {
  settingsReadingOptions.forEach((button) => {
    button.disabled = isBusy;
  });
  if (settingsReadingEdit) settingsReadingEdit.disabled = isBusy;
}

async function saveSettingsReading({ answer, passages = [], reflection = "" }) {
  setSettingsReadingBusy(true);
  const outcome = await requestReadingAnswer({ answer, passages, reflection, method: "PATCH" });
  setSettingsReadingBusy(false);
  if (!outcome) return null;

  if (outcome.error) {
    showToast(outcome.error, "error");
    await loadSettingsReading();
    return outcome;
  }

  setSettingsReadingState(outcome.status);
  showToast(answer === "YES" ? "Today's reading answer changed to yes" : "Today's reading answer changed to no");
  return outcome;
}

function getSettingsReadingConfirmModal() {
  let modal = document.querySelector("[data-settings-reading-confirm-modal]");
  if (modal) return modal;

  modal = document.createElement("div");
  modal.className = "settings-confirm-modal";
  modal.setAttribute("data-settings-reading-confirm-modal", "");
  modal.hidden = true;
  modal.innerHTML = `
    <div class="settings-confirm-backdrop" data-settings-reading-cancel></div>
    <div class="settings-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="settings-reading-confirm-title">
      <header class="settings-confirm-head">
        <p class="dashboard-label">Today's Bible reading</p>
        <h2 id="settings-reading-confirm-title">Are you sure?</h2>
        <p data-settings-reading-confirm-copy></p>
      </header>
      <div class="settings-confirm-actions">
        <button class="ui-button ui-button--secondary" type="button" data-settings-reading-cancel>Cancel</button>
        <button class="ui-button ui-button--primary" type="button" data-settings-reading-confirm>Change</button>
      </div>
    </div>
  `;
  document.body.append(modal);
  return modal;
}

function openSettingsReadingConfirmModal(answer) {
  rememberModalTrigger();
  pendingSettingsReadingAnswer = answer;

  const modal = getSettingsReadingConfirmModal();
  const copy = modal.querySelector("[data-settings-reading-confirm-copy]");
  if (copy) {
    copy.textContent = settingsReadingStatus?.answer === "YES"
      ? "Changing today's Bible reading answer to NO will remove today's saved passages and reflection."
      : "Set today's Bible reading answer to NO?";
  }

  modal.querySelectorAll("[data-settings-reading-confirm], [data-settings-reading-cancel]").forEach((button) => {
    button.disabled = false;
  });
  modal.hidden = false;
  modal.querySelector("[data-settings-reading-confirm]")?.focus();
}

function closeSettingsReadingConfirmModal() {
  const modal = document.querySelector("[data-settings-reading-confirm-modal]");
  const wasOpen = Boolean(modal && !modal.hidden);
  if (modal) modal.hidden = true;
  pendingSettingsReadingAnswer = null;
  if (wasOpen) restoreModalTrigger();
}

function openSettingsReadingEditor({ prefill }) {
  const passages = prefill ? settingsReadingStatus?.passages || [] : [];
  const reflection = prefill ? settingsReadingStatus?.reflection || "" : "";

  openReadingModal({
    save: saveSettingsReading,
    passages,
    reflection,
  });
}

if (settingsReading) {
  settingsReadingOptions.forEach((button) => {
    button.addEventListener("click", () => {
      const answer = button.dataset.settingsReadingAnswerOption;
      const currentAnswer = settingsReadingStatus?.answeredToday ? settingsReadingStatus.answer : null;
      if (!answer || answer === currentAnswer) return;

      if (answer === "YES") {
        openSettingsReadingEditor({ prefill: false });
        return;
      }

      openSettingsReadingConfirmModal(answer);
    });
  });

  settingsReadingEdit?.addEventListener("click", () => {
    if (settingsReadingStatus?.answer !== "YES") return;
    openSettingsReadingEditor({ prefill: true });
  });

  document.addEventListener("click", async (event) => {
    if (event.target.closest("[data-settings-reading-cancel]")) {
      closeSettingsReadingConfirmModal();
      return;
    }

    const confirmButton = event.target.closest("[data-settings-reading-confirm]");
    if (!confirmButton || !pendingSettingsReadingAnswer) return;

    const answer = pendingSettingsReadingAnswer;
    confirmButton.closest("[data-settings-reading-confirm-modal]")
      ?.querySelectorAll("[data-settings-reading-confirm], [data-settings-reading-cancel]")
      .forEach((button) => {
        button.disabled = true;
      });
    closeSettingsReadingConfirmModal();
    await saveSettingsReading({ answer });
  });

  loadSettingsReading();
}

const dailyGoalsRoot = document.querySelector("[data-daily-goals]");
const dailyGoalList = document.querySelector("[data-daily-goal-list]");
const dailyGoalTemplate = document.querySelector("[data-daily-goal-template]");
const dailyGoalEmpty = document.querySelector("[data-daily-goal-empty]");
const dailyGoalCount = document.querySelector("[data-daily-goal-count]");
const dailyGoalProgress = document.querySelector("[data-daily-goal-progress]");
const dailyGoalComposer = document.querySelector("[data-daily-goal-composer]");
const dailyGoalInput = document.querySelector("[data-daily-goal-input]");
const dailyGoalSaveButton = document.querySelector("[data-daily-goal-save]");
const dailyGoalCancelButton = document.querySelector("[data-daily-goal-cancel]");
const dailyGoalAddButton = document.querySelector("[data-daily-goal-add]");

const DAILY_GOAL_TEXT_MAX = 200;

let dailyGoalSummary = null;
let dailyGoalResetTimerId;
let dailyGoalComposerBusy = false;
const savingDailyGoalIds = new Set();

function hasFreeDailyGoalSlot() {
  return !dailyGoalSummary || dailyGoalSummary.remainingSlots > 0;
}

function getDailyGoalById(id) {
  return dailyGoalSummary?.goals.find((goal) => goal.id === id) || null;
}

function dailyGoalErrorMessage(result, fallback) {
  return result.data.errors?.[0] || result.data.error || fallback;
}

function validateDailyGoalText(value) {
  const text = String(value || "").trim();

  if (!text) return { text: null, error: "Write what you want to complete" };
  if (text.length > DAILY_GOAL_TEXT_MAX) {
    return { text: null, error: `Keep the goal under ${DAILY_GOAL_TEXT_MAX} characters` };
  }

  return { text, error: null };
}

function captureDailyGoalFocus() {
  const active = document.activeElement;
  const row = active?.closest?.("[data-daily-goal]");
  if (!row) return null;

  const control = ["checkbox", "edit", "remove"].find((name) => active.matches?.(`[data-daily-goal-${name}]`));
  return control ? { id: row.dataset.dailyGoalId, control } : null;
}

function restoreDailyGoalFocus(target) {
  if (!target) return;

  dailyGoalList
    ?.querySelector(`[data-daily-goal][data-daily-goal-id="${target.id}"] [data-daily-goal-${target.control}]`)
    ?.focus();
}

function buildDailyGoalRow(goal) {
  const row = dailyGoalTemplate.content.firstElementChild.cloneNode(true);
  const checkbox = row.querySelector("[data-daily-goal-checkbox]");
  const label = row.querySelector("[data-daily-goal-label]");
  const editLabel = row.querySelector("[data-daily-goal-edit-label]");
  const editInput = row.querySelector("[data-daily-goal-edit-input]");
  const actions = row.querySelector("[data-daily-goal-actions]");

  row.dataset.dailyGoalId = String(goal.id);
  row.classList.toggle("is-completed", goal.completed);

  const checkboxId = `daily-goal-check-${goal.id}`;
  checkbox.id = checkboxId;
  checkbox.checked = goal.completed;
  label.setAttribute("for", checkboxId);
  label.textContent = goal.text;

  const editInputId = `daily-goal-edit-${goal.id}`;
  editInput.id = editInputId;
  editInput.value = goal.text;
  editLabel.setAttribute("for", editInputId);

  actions.hidden = goal.completed;
  row.querySelector("[data-daily-goal-edit]")?.setAttribute("aria-label", `Edit goal: ${goal.text}`);
  row.querySelector("[data-daily-goal-remove]")?.setAttribute("aria-label", `Remove goal: ${goal.text}`);

  return row;
}

function renderDailyGoals(summary) {
  if (!dailyGoalList) return;

  const focusTarget = captureDailyGoalFocus();
  const goals = summary.goals || [];

  dailyGoalList.replaceChildren(...goals.map(buildDailyGoalRow));

  if (dailyGoalCount) dailyGoalCount.textContent = `${summary.total} of ${summary.limit}`;
  if (dailyGoalEmpty) dailyGoalEmpty.hidden = goals.length > 0;
  if (dailyGoalProgress) {
    dailyGoalProgress.textContent = goals.length ? `${summary.completedCount} of ${summary.total} completed` : "";
  }
  if (dailyGoalAddButton) {
    dailyGoalAddButton.hidden = summary.remainingSlots === 0 || !dailyGoalComposer?.hidden;
  }

  restoreDailyGoalFocus(focusTarget);
}

function applyDailyGoalSummary(summary) {
  dailyGoalSummary = summary;
  renderDailyGoals(summary);
  scheduleDailyGoalReset(summary.nextResetAt);
}

async function loadDailyGoals() {
  const result = await apiFetch("/api/daily-goals/today");
  if (!result?.ok) return null;

  applyDailyGoalSummary(result.data);
  return result.data;
}

function setDailyGoalComposerBusy(isBusy) {
  dailyGoalComposerBusy = isBusy;
  if (dailyGoalSaveButton) dailyGoalSaveButton.disabled = isBusy;
  if (dailyGoalCancelButton) dailyGoalCancelButton.disabled = isBusy;
  if (dailyGoalInput) dailyGoalInput.readOnly = isBusy;
}

function openDailyGoalComposer() {
  if (!dailyGoalComposer || !hasFreeDailyGoalSlot()) return;

  dailyGoalComposer.hidden = false;
  if (dailyGoalAddButton) dailyGoalAddButton.hidden = true;
  dailyGoalInput?.focus();
  dailyGoalInput?.select();
}

function closeDailyGoalComposer({ clear = false, restoreFocus = false } = {}) {
  if (!dailyGoalComposer) return;

  dailyGoalComposer.hidden = true;
  if (clear && dailyGoalInput) dailyGoalInput.value = "";
  if (dailyGoalAddButton) dailyGoalAddButton.hidden = !hasFreeDailyGoalSlot();

  if (!restoreFocus) return;
  if (dailyGoalAddButton && !dailyGoalAddButton.hidden) {
    dailyGoalAddButton.focus();
  } else {
    dailyGoalsRoot?.focus();
  }
}

async function submitDailyGoalComposer() {
  if (dailyGoalComposerBusy) return;

  const { text, error } = validateDailyGoalText(dailyGoalInput?.value);
  if (error) {
    showToast(error, "error");
    dailyGoalInput?.focus();
    return;
  }

  setDailyGoalComposerBusy(true);
  const result = await apiFetch("/api/daily-goals/today", { method: "POST", body: { text } });
  setDailyGoalComposerBusy(false);
  if (!result) return;

  if (!result.ok) {
    showToast(dailyGoalErrorMessage(result, "Could not add the goal"), "error");
    if (result.status === 409) await loadDailyGoals();
    return;
  }

  applyDailyGoalSummary(result.data);
  closeDailyGoalComposer({ clear: true, restoreFocus: true });
  showToast("Goal added");
}

function setDailyGoalRowBusy(row, isBusy) {
  row.classList.toggle("is-saving", isBusy);
  row.querySelectorAll("button, input").forEach((control) => {
    control.disabled = isBusy;
  });
}

function closeDailyGoalRowPanels(row) {
  const editForm = row.querySelector("[data-daily-goal-edit-form]");
  const confirm = row.querySelector("[data-daily-goal-confirm]");
  const actions = row.querySelector("[data-daily-goal-actions]");

  if (editForm) editForm.hidden = true;
  if (confirm) confirm.hidden = true;
  if (actions) actions.hidden = false;
}

function openDailyGoalEditor(row) {
  closeDailyGoalRowPanels(row);
  const editForm = row.querySelector("[data-daily-goal-edit-form]");
  const editInput = row.querySelector("[data-daily-goal-edit-input]");

  editForm.hidden = false;
  row.querySelector("[data-daily-goal-actions]").hidden = true;
  editInput.focus();
  editInput.select();
}

function closeDailyGoalEditor(row, { restoreFocus = false } = {}) {
  const editInput = row.querySelector("[data-daily-goal-edit-input]");
  const goal = getDailyGoalById(Number(row.dataset.dailyGoalId));

  if (editInput && goal) editInput.value = goal.text;
  closeDailyGoalRowPanels(row);
  if (restoreFocus) row.querySelector("[data-daily-goal-edit]")?.focus();
}

function openDailyGoalRemoveConfirm(row) {
  closeDailyGoalRowPanels(row);
  const confirm = row.querySelector("[data-daily-goal-confirm]");

  confirm.hidden = false;
  row.querySelector("[data-daily-goal-actions]").hidden = true;
  row.querySelector("[data-daily-goal-remove-confirm]")?.focus();
}

function closeDailyGoalRemoveConfirm(row, { restoreFocus = false } = {}) {
  closeDailyGoalRowPanels(row);
  if (restoreFocus) row.querySelector("[data-daily-goal-remove]")?.focus();
}

async function submitDailyGoalEdit(row) {
  const id = Number(row.dataset.dailyGoalId);
  const editInput = row.querySelector("[data-daily-goal-edit-input]");
  if (!id || savingDailyGoalIds.has(id)) return;

  const { text, error } = validateDailyGoalText(editInput?.value);
  if (error) {
    showToast(error, "error");
    editInput?.focus();
    return;
  }

  savingDailyGoalIds.add(id);
  setDailyGoalRowBusy(row, true);
  const result = await apiFetch(`/api/daily-goals/${id}`, { method: "PATCH", body: { text } });
  savingDailyGoalIds.delete(id);
  setDailyGoalRowBusy(row, false);
  if (!result) return;

  if (!result.ok) {
    showToast(dailyGoalErrorMessage(result, "Could not update the goal"), "error");
    if (result.status === 404 || result.status === 409) await loadDailyGoals();
    else editInput?.focus();
    return;
  }

  applyDailyGoalSummary(result.data);
  restoreDailyGoalFocus({ id: String(id), control: "edit" });
  showToast("Goal updated");
}

async function removeDailyGoal(row) {
  const id = Number(row.dataset.dailyGoalId);
  if (!id || savingDailyGoalIds.has(id)) return;

  savingDailyGoalIds.add(id);
  setDailyGoalRowBusy(row, true);
  const result = await apiFetch(`/api/daily-goals/${id}`, { method: "DELETE" });
  savingDailyGoalIds.delete(id);
  setDailyGoalRowBusy(row, false);
  if (!result) return;

  if (!result.ok) {
    showToast(dailyGoalErrorMessage(result, "Could not remove the goal"), "error");
    if (result.status === 404 || result.status === 409) await loadDailyGoals();
    return;
  }

  applyDailyGoalSummary(result.data);
  showToast("Goal removed");
  (dailyGoalAddButton?.hidden ? dailyGoalsRoot : dailyGoalAddButton)?.focus();
}

async function toggleDailyGoalCompletion(checkbox) {
  const row = checkbox.closest("[data-daily-goal]");
  const id = Number(row?.dataset.dailyGoalId);

  if (!id || savingDailyGoalIds.has(id)) {
    checkbox.checked = !checkbox.checked;
    return;
  }

  const completed = checkbox.checked;
  const focusTarget = { id: row.dataset.dailyGoalId, control: "checkbox" };
  savingDailyGoalIds.add(id);
  row.classList.add("is-saving");
  row.classList.toggle("is-completed", completed);

  const result = await apiFetch(`/api/daily-goals/${id}/completion`, {
    method: "PATCH",
    body: { completed },
  });

  savingDailyGoalIds.delete(id);
  row.classList.remove("is-saving");
  if (!result) return;

  if (!result.ok) {
    checkbox.checked = !completed;
    row.classList.toggle("is-completed", !completed);
    showToast(dailyGoalErrorMessage(result, "Could not update the goal"), "error");
    if (result.status === 404 || result.status === 409) await loadDailyGoals();
    return;
  }

  applyDailyGoalSummary(result.data);
  restoreDailyGoalFocus(focusTarget);
  showToast(completed ? "Goal completed" : "Goal reopened");
}

function setDailyGoalControlsDisabled(isDisabled) {
  dailyGoalsRoot?.querySelectorAll("button, input").forEach((control) => {
    control.disabled = isDisabled;
  });
}

async function handleDailyGoalReset() {
  setDailyGoalControlsDisabled(true);
  closeDailyGoalComposer({ clear: true });

  try {
    await loadDailyGoals();
  } finally {
    setDailyGoalControlsDisabled(false);
  }
}

function scheduleDailyGoalReset(nextResetAt) {
  window.clearTimeout(dailyGoalResetTimerId);
  if (!nextResetAt) return;

  const remainingMs = new Date(nextResetAt).getTime() - Date.now();
  if (Number.isNaN(remainingMs)) return;

  if (remainingMs <= 0) {
    handleDailyGoalReset();
    return;
  }

  dailyGoalResetTimerId = window.setTimeout(handleDailyGoalReset, remainingMs + 500);
}

if (dailyGoalsRoot && dailyGoalList && dailyGoalTemplate) {
  dailyGoalAddButton?.addEventListener("click", openDailyGoalComposer);
  dailyGoalCancelButton?.addEventListener("click", () => {
    closeDailyGoalComposer({ clear: true, restoreFocus: true });
  });

  dailyGoalsRoot.addEventListener("submit", (event) => {
    event.preventDefault();

    if (event.target.matches("[data-daily-goal-composer]")) {
      submitDailyGoalComposer();
      return;
    }

    const row = event.target.closest("[data-daily-goal]");
    if (row && event.target.matches("[data-daily-goal-edit-form]")) {
      submitDailyGoalEdit(row);
    }
  });

  dailyGoalsRoot.addEventListener("keydown", (event) => {
    if (event.key !== "Escape") return;

    if (event.target.closest("[data-daily-goal-composer]")) {
      event.preventDefault();
      event.stopPropagation();
      closeDailyGoalComposer({ clear: true, restoreFocus: true });
      return;
    }

    const row = event.target.closest("[data-daily-goal]");
    if (!row) return;

    if (event.target.closest("[data-daily-goal-edit-form]")) {
      event.preventDefault();
      event.stopPropagation();
      closeDailyGoalEditor(row, { restoreFocus: true });
      return;
    }

    if (event.target.closest("[data-daily-goal-confirm]")) {
      event.preventDefault();
      event.stopPropagation();
      closeDailyGoalRemoveConfirm(row, { restoreFocus: true });
    }
  });

  dailyGoalList.addEventListener("change", (event) => {
    const checkbox = event.target.closest("[data-daily-goal-checkbox]");
    if (checkbox) toggleDailyGoalCompletion(checkbox);
  });

  dailyGoalList.addEventListener("click", (event) => {
    const row = event.target.closest("[data-daily-goal]");
    if (!row) return;

    if (event.target.closest("[data-daily-goal-edit]")) {
      openDailyGoalEditor(row);
      return;
    }
    if (event.target.closest("[data-daily-goal-edit-cancel]")) {
      closeDailyGoalEditor(row, { restoreFocus: true });
      return;
    }
    if (event.target.closest("[data-daily-goal-remove]")) {
      openDailyGoalRemoveConfirm(row);
      return;
    }
    if (event.target.closest("[data-daily-goal-remove-cancel]")) {
      closeDailyGoalRemoveConfirm(row, { restoreFocus: true });
      return;
    }
    if (event.target.closest("[data-daily-goal-remove-confirm]")) {
      removeDailyGoal(row);
    }
  });

  loadDailyGoals();
}

const catchUpCard = document.querySelector("[data-catch-up]");
const catchUpList = document.querySelector("[data-catch-up-list]");
const catchUpTemplate = document.querySelector("[data-catch-up-template]");
const catchUpCount = document.querySelector("[data-catch-up-count]");
const catchUpStatus = document.querySelector("[data-catch-up-status]");
const catchUpMore = document.querySelector("[data-catch-up-more]");
const catchUpPageStatus = document.querySelector("[data-catch-up-page-status]");
const catchUpAnswerModal = document.querySelector("[data-catch-up-answer-modal]");
const catchUpAnswerTitle = document.querySelector("[data-catch-up-answer-title]");
const catchUpAnswerDate = document.querySelector("[data-catch-up-answer-date]");
const catchUpAnswerNote = document.querySelector("[data-catch-up-answer-note]");
const catchUpAnswerYes = document.querySelector("[data-catch-up-answer-yes]");
const catchUpAnswerNo = document.querySelector("[data-catch-up-answer-no]");
const catchUpTasksModal = document.querySelector("[data-catch-up-tasks-modal]");
const catchUpTasksForm = document.querySelector("[data-catch-up-tasks-form]");
const catchUpTasksList = document.querySelector("[data-catch-up-tasks-list]");
const catchUpTaskTemplate = document.querySelector("[data-catch-up-task-template]");
const catchUpTasksDate = document.querySelector("[data-catch-up-tasks-date]");
const catchUpTasksError = document.querySelector("[data-catch-up-tasks-error]");
const catchUpTasksAdd = document.querySelector("[data-catch-up-tasks-add]");
const catchUpTasksNone = document.querySelector("[data-catch-up-tasks-none]");
const catchUpTasksSave = document.querySelector("[data-catch-up-tasks-save]");

const CATCH_UP_ACTIVITIES = {
  STRONG: {
    name: "Strong check-in",
    note: "Say whether you stayed strong that day.",
    action: "Answer",
    question: "Did you stay strong?",
    yes: "Yes, I stayed strong",
    no: "No, I struggled",
    savedYes: "Strong check-in saved: yes",
    savedNo: "Strong check-in saved: no",
  },
  READING: {
    name: "Bible reading",
    note: "Record what you read, or say you did not read.",
    action: "Answer",
    question: "Did you read the Bible?",
    yes: "Yes, I read",
    no: "No, I did not read",
    savedYes: "Reading saved: yes",
    savedNo: "Reading saved: no",
  },
  GOALS: {
    name: "Daily tasks",
    note: "Add the tasks you completed, or say you completed none.",
    action: "Answer",
    question: "What did you complete?",
    yes: "",
    no: "",
    savedYes: "Tasks saved",
    savedNo: "Tasks saved: none completed",
  },
};
const CATCH_UP_TASK_LIMIT = 5;
const CATCH_UP_PAGE_SIZE = 5;

let catchUpItems = [];
let catchUpTotal = 0;
let catchUpVisibleCount = CATCH_UP_PAGE_SIZE;
let catchUpLoadingMore = false;
let catchUpAnswerTarget = null;
let catchUpTasksDateKey = null;
let catchUpTasksSubmitting = false;

function catchUpActivityCopy(activity) {
  return CATCH_UP_ACTIVITIES[activity] || null;
}

function sortCatchUpItems(items) {
  const order = Object.keys(CATCH_UP_ACTIVITIES);

  return [...items].sort((first, second) => (
    first.dateKey === second.dateKey
      ? order.indexOf(first.activity) - order.indexOf(second.activity)
      : first.dateKey.localeCompare(second.dateKey)
  ));
}

function normalizeCatchUpPayload(payload) {
  const items = sortCatchUpItems(
    (payload?.items || []).filter((item) => item?.dateKey && CATCH_UP_ACTIVITIES[item.activity]),
  );

  return { total: items.length, items };
}

function formatCatchUpDate(dateKey) {
  const date = new Date(`${dateKey}T12:00:00.000Z`);
  if (Number.isNaN(date.getTime())) return String(dateKey || "");

  return date.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function catchUpStatusMessage(total) {
  if (!total) return "You are all caught up.";

  return `${total} ${total === 1 ? "activity" : "activities"} left to complete.`;
}

function getCatchUpPageState(totalCount, requestedVisibleCount) {
  const total = Math.max(0, Number(totalCount) || 0);
  const requested = Math.max(CATCH_UP_PAGE_SIZE, Number(requestedVisibleCount) || CATCH_UP_PAGE_SIZE);
  const visibleCount = Math.min(total, requested);
  const remainingCount = Math.max(0, total - visibleCount);

  return {
    visibleCount,
    remainingCount,
    nextBatchCount: Math.min(CATCH_UP_PAGE_SIZE, remainingCount),
  };
}

function syncCatchUpPagination({ announce = false } = {}) {
  if (!catchUpList || !catchUpMore) return;

  const rows = [...catchUpList.querySelectorAll("[data-catch-up-item]")];
  const page = getCatchUpPageState(catchUpTotal, catchUpVisibleCount);
  catchUpVisibleCount = page.visibleCount || CATCH_UP_PAGE_SIZE;

  const previouslyVisible = rows.filter((row) => !row.hidden).length;
  rows.forEach((row, index) => {
    row.hidden = index >= page.visibleCount;
  });
  if (page.visibleCount > previouslyVisible) revealNewRows(rows, previouslyVisible);

  catchUpMore.hidden = page.remainingCount === 0;
  catchUpMore.disabled = catchUpLoadingMore;
  catchUpMore.setAttribute("aria-busy", catchUpLoadingMore ? "true" : "false");
  catchUpMore.textContent = "View more";
  catchUpMore.setAttribute("aria-expanded", page.visibleCount > CATCH_UP_PAGE_SIZE ? "true" : "false");
  catchUpMore.setAttribute(
    "aria-label",
    page.remainingCount > 0
      ? `View ${page.nextBatchCount} more missed activities; ${page.remainingCount} activities remaining`
      : "All missed activities are shown",
  );

  if (announce && catchUpPageStatus) {
    catchUpPageStatus.textContent = page.remainingCount > 0
      ? `Showing ${page.visibleCount} of ${catchUpTotal} missed activities.`
      : `Showing all ${catchUpTotal} missed activities.`;
  }
}

function mergeCatchUpItems(firstPage, nextPage) {
  const byItem = new Map();

  [...firstPage, ...nextPage].forEach((item) => {
    byItem.set(`${item.dateKey}:${item.activity}`, item);
  });

  return sortCatchUpItems([...byItem.values()]);
}

function reconcileCatchUpItemsAfterSave(currentItems, payload, resolvedItem) {
  const normalized = normalizeCatchUpPayload(payload);
  const total = Math.max(normalized.items.length, Number(payload?.total) || 0);
  const desiredLoadedCount = Math.min(total, currentItems.length);
  const unresolvedItems = currentItems.filter(
    (item) => item.dateKey !== resolvedItem.dateKey || item.activity !== resolvedItem.activity,
  );
  const items = mergeCatchUpItems(unresolvedItems, normalized.items).slice(0, desiredLoadedCount);

  return { total, desiredLoadedCount, items };
}

async function showMoreCatchUp() {
  if (catchUpLoadingMore || catchUpVisibleCount >= catchUpTotal) return;

  const previousVisibleCount = catchUpVisibleCount;
  const nextVisibleCount = Math.min(catchUpTotal, catchUpVisibleCount + CATCH_UP_PAGE_SIZE);
  const missingCount = Math.max(0, nextVisibleCount - catchUpItems.length);
  const triggerHadFocus = document.activeElement === catchUpMore;

  if (missingCount > 0) {
    catchUpLoadingMore = true;
    syncCatchUpPagination();

    const result = await apiFetch(
      `/api/missed-activities?offset=${catchUpItems.length}&limit=${missingCount}`,
    );

    catchUpLoadingMore = false;
    if (!result?.ok) {
      syncCatchUpPagination();
      showToast(catchUpErrorMessage(result, "Could not load more missed activities"), "error");
      return;
    }

    catchUpItems = mergeCatchUpItems(catchUpItems, normalizeCatchUpPayload(result.data).items);
    catchUpTotal = Math.max(catchUpItems.length, Number(result.data?.total) || 0);
  }

  catchUpVisibleCount = nextVisibleCount;
  renderCatchUp({ total: catchUpTotal, items: catchUpItems }, { announcePage: true });

  if (catchUpMore?.hidden) {
    catchUpList
      ?.querySelectorAll("[data-catch-up-open]")
      .item(previousVisibleCount)
      ?.focus();
  } else if (triggerHadFocus) {
    catchUpMore?.focus();
  }
}

function buildCatchUpRow(item) {
  const row = catchUpTemplate.content.firstElementChild.cloneNode(true);
  const copy = catchUpActivityCopy(item.activity);
  const date = formatCatchUpDate(item.dateKey);
  const action = row.querySelector("[data-catch-up-open]");

  row.dataset.catchUpDate = item.dateKey;
  row.dataset.catchUpActivity = item.activity;
  row.querySelector("[data-catch-up-date]").textContent = date;
  row.querySelector("[data-catch-up-activity]").textContent = copy.name;
  row.querySelector("[data-catch-up-note]").textContent = copy.note;

  action.textContent = copy.action;
  action.dataset.catchUpDate = item.dateKey;
  action.dataset.catchUpActivity = item.activity;
  action.setAttribute("aria-haspopup", "dialog");
  action.setAttribute("aria-label", `${copy.action} ${copy.name} for ${date}`);

  return row;
}

function renderCatchUp(payload, { announcePage = false } = {}) {
  if (!catchUpCard || !catchUpList || !catchUpTemplate) return;

  const { total, items } = normalizeCatchUpPayload(payload);
  const remaining = Math.max(total, Number(payload?.total) || 0);

  catchUpItems = items;
  catchUpTotal = remaining;
  if (!items.length) catchUpVisibleCount = CATCH_UP_PAGE_SIZE;
  catchUpCard.hidden = remaining === 0;
  catchUpList.replaceChildren(...items.map(buildCatchUpRow));
  syncCatchUpPagination({ announce: announcePage });

  if (catchUpCount) catchUpCount.textContent = remaining ? `${remaining} left` : "";
  if (catchUpStatus) catchUpStatus.textContent = catchUpStatusMessage(remaining);
}

async function applyCatchUpPayload(payload, resolvedItem) {
  if (!payload) return;

  if (resolvedItem && catchUpItems.length) {
    const reconciled = reconcileCatchUpItemsAfterSave(catchUpItems, payload, resolvedItem);
    const missingCount = reconciled.desiredLoadedCount - reconciled.items.length;

    if (missingCount > 0) {
      const result = await apiFetch(
        `/api/missed-activities?offset=${reconciled.items.length}&limit=${missingCount}`,
      );
      if (result?.ok) {
        reconciled.items = mergeCatchUpItems(
          reconciled.items,
          normalizeCatchUpPayload(result.data).items,
        ).slice(0, reconciled.desiredLoadedCount);
      }
    }

    renderCatchUp({ total: reconciled.total, items: reconciled.items });
    return;
  }

  renderCatchUp(payload);
}

async function loadCatchUp() {
  const result = await apiFetch(`/api/missed-activities?offset=0&limit=${CATCH_UP_PAGE_SIZE}`);
  if (!result?.ok) return null;

  renderCatchUp(result.data);
  return result.data;
}

function catchUpErrorMessage(result, fallback = "Could not save that day") {
  return result?.data?.errors?.[0] || result?.data?.error || fallback;
}

function focusCatchUpAfterSave() {
  const next = catchUpList?.querySelector("[data-catch-up-open]");
  if (next) {
    next.focus();
    return;
  }

  document.getElementById("main-content")?.focus();
}

function setCatchUpModalOpen(modal, isOpen) {
  if (!modal) return;
  modal.hidden = !isOpen;
  document.body.classList.toggle(
    "catch-up-modal-open",
    Boolean(document.querySelector("[data-catch-up-answer-modal]:not([hidden]), [data-catch-up-tasks-modal]:not([hidden])")),
  );
}

function setCatchUpAnswerBusy(isBusy) {
  [catchUpAnswerYes, catchUpAnswerNo].forEach((button) => {
    if (button) button.disabled = isBusy;
  });
}

function openCatchUpAnswerModal({ dateKey, activity }) {
  const copy = catchUpActivityCopy(activity);
  if (!catchUpAnswerModal || !copy) return;

  rememberModalTrigger();
  catchUpAnswerTarget = { dateKey, activity };

  if (catchUpAnswerDate) catchUpAnswerDate.textContent = formatCatchUpDate(dateKey);
  if (catchUpAnswerTitle) catchUpAnswerTitle.textContent = copy.question;
  if (catchUpAnswerNote) catchUpAnswerNote.textContent = copy.note;
  if (catchUpAnswerYes) catchUpAnswerYes.textContent = copy.yes;
  if (catchUpAnswerNo) catchUpAnswerNo.textContent = copy.no;

  setCatchUpAnswerBusy(false);
  setCatchUpModalOpen(catchUpAnswerModal, true);
  catchUpAnswerYes?.focus();
}

function closeCatchUpAnswerModal() {
  const wasOpen = Boolean(catchUpAnswerModal && !catchUpAnswerModal.hidden);
  setCatchUpModalOpen(catchUpAnswerModal, false);
  setCatchUpAnswerBusy(false);
  catchUpAnswerTarget = null;
  if (wasOpen) restoreModalTrigger();
}

async function saveMissedStrong({ dateKey, answer }) {
  const result = await apiFetch("/api/check-in/missed", {
    method: "POST",
    body: { dateKey, answer },
  });
  if (!result) return null;

  if (!result.ok) {
    return { ok: false, error: catchUpErrorMessage(result) };
  }

  if (result.data.leaderboard) renderLeaderboard(result.data.leaderboard);
  if (result.data.status) setAnswerState(result.data.status);
  await applyCatchUpPayload(result.data.missedActivities, { dateKey, activity: "STRONG" });

  const copy = catchUpActivityCopy("STRONG");
  return { ok: true, message: answer === "YES" ? copy.savedYes : copy.savedNo };
}

async function saveMissedReading({ dateKey, answer, passages = [], reflection = "" }) {
  const result = await apiFetch("/api/reading-check-in/missed", {
    method: "POST",
    body: { dateKey, answer, passages, reflection },
  });
  if (!result) return null;

  if (!result.ok) {
    return { ok: false, error: catchUpErrorMessage(result, "Could not save that reading") };
  }

  await applyCatchUpPayload(result.data.missedActivities, { dateKey, activity: "READING" });

  const copy = catchUpActivityCopy("READING");
  return {
    ok: true,
    reading: result.data.reading || true,
    message: answer === "YES" ? copy.savedYes : copy.savedNo,
  };
}

function buildMissedReadingEditorSave(dateKey) {
  return async ({ answer, passages, reflection }) => {
    const outcome = await saveMissedReading({ dateKey, answer, passages, reflection });
    if (!outcome) return null;
    if (!outcome.ok) return { status: null, error: outcome.error };

    showToast(outcome.message);
    return { status: outcome.reading, error: null };
  };
}

async function submitCatchUpAnswer(answer) {
  if (!catchUpAnswerTarget || !["YES", "NO"].includes(answer)) return;

  const { dateKey, activity } = catchUpAnswerTarget;

  if (activity === "READING" && answer === "YES") {
    closeCatchUpAnswerModal();
    await openReadingModal({ save: buildMissedReadingEditorSave(dateKey) });
    return;
  }

  setCatchUpAnswerBusy(true);
  const outcome = activity === "STRONG"
    ? await saveMissedStrong({ dateKey, answer })
    : await saveMissedReading({ dateKey, answer });
  setCatchUpAnswerBusy(false);

  if (!outcome) return;
  if (!outcome.ok) {
    showToast(outcome.error, "error");
    return;
  }

  closeCatchUpAnswerModal();
  showToast(outcome.message);
}

function showCatchUpTasksError(message, field) {
  if (catchUpTasksError) {
    catchUpTasksError.textContent = message;
    catchUpTasksError.hidden = false;
  }
  field?.focus();
}

function clearCatchUpTasksError() {
  if (!catchUpTasksError) return;
  catchUpTasksError.textContent = "";
  catchUpTasksError.hidden = true;
}

function catchUpTaskRows() {
  return [...(catchUpTasksList?.querySelectorAll("[data-catch-up-task]") || [])];
}

function renumberCatchUpTasks() {
  const rows = catchUpTaskRows();

  rows.forEach((row, index) => {
    const position = index + 1;
    const label = row.querySelector("[data-catch-up-task-label]");
    const input = row.querySelector("[data-catch-up-task-input]");
    const remove = row.querySelector("[data-catch-up-task-remove]");
    const inputId = `catch-up-task-${position}`;

    if (input) input.id = inputId;
    if (label) {
      label.setAttribute("for", inputId);
      label.textContent = `Task ${position}`;
    }
    if (remove) {
      remove.hidden = rows.length < 2;
      remove.setAttribute("aria-label", `Remove task ${position}`);
    }
  });

  if (catchUpTasksAdd) catchUpTasksAdd.hidden = rows.length >= CATCH_UP_TASK_LIMIT;
}

function addCatchUpTaskRow({ focus = false } = {}) {
  if (!catchUpTasksList || !catchUpTaskTemplate) return null;
  if (catchUpTaskRows().length >= CATCH_UP_TASK_LIMIT) return null;

  const row = catchUpTaskTemplate.content.firstElementChild.cloneNode(true);
  catchUpTasksList.append(row);
  renumberCatchUpTasks();
  if (focus) row.querySelector("[data-catch-up-task-input]")?.focus();

  return row;
}

function removeCatchUpTaskRow(row) {
  if (!row || catchUpTaskRows().length < 2) return;

  const nextFocus = row.nextElementSibling || row.previousElementSibling;
  row.remove();
  renumberCatchUpTasks();
  clearCatchUpTasksError();
  (nextFocus?.querySelector("[data-catch-up-task-input]") || catchUpTasksAdd)?.focus();
}

function collectCatchUpTasks() {
  const rows = catchUpTaskRows();
  const tasks = [];

  for (const [index, row] of rows.entries()) {
    const input = row.querySelector("[data-catch-up-task-input]");
    const text = String(input?.value || "").trim();

    if (!text) {
      showCatchUpTasksError(`Task ${index + 1}: write what you completed, or remove it.`, input);
      return null;
    }

    tasks.push(text);
  }

  if (!tasks.length) {
    showCatchUpTasksError("Add at least one task you completed.", catchUpTasksAdd);
    return null;
  }

  clearCatchUpTasksError();
  return tasks;
}

function setCatchUpTasksSubmitting(isSubmitting) {
  catchUpTasksSubmitting = isSubmitting;
  if (catchUpTasksSave) catchUpTasksSave.disabled = isSubmitting;
  if (catchUpTasksNone) catchUpTasksNone.disabled = isSubmitting;
}

function openCatchUpTasksModal(dateKey) {
  if (!catchUpTasksModal || !catchUpTasksList) return;

  rememberModalTrigger();
  catchUpTasksDateKey = dateKey;
  if (catchUpTasksDate) catchUpTasksDate.textContent = formatCatchUpDate(dateKey);

  clearCatchUpTasksError();
  catchUpTasksList.replaceChildren();
  addCatchUpTaskRow();
  setCatchUpTasksSubmitting(false);
  setCatchUpModalOpen(catchUpTasksModal, true);
  catchUpTasksList.querySelector("[data-catch-up-task-input]")?.focus();
}

function closeCatchUpTasksModal() {
  const wasOpen = Boolean(catchUpTasksModal && !catchUpTasksModal.hidden);
  setCatchUpModalOpen(catchUpTasksModal, false);
  setCatchUpTasksSubmitting(false);
  catchUpTasksDateKey = null;
  if (wasOpen) restoreModalTrigger();
}

async function submitCatchUpTasksAnswer({ answer, tasks }) {
  if (catchUpTasksSubmitting || !catchUpTasksDateKey) return;

  const dateKey = catchUpTasksDateKey;
  setCatchUpTasksSubmitting(true);
  const result = await apiFetch("/api/daily-goals/missed", {
    method: "POST",
    body: { dateKey, answer, tasks },
  });
  setCatchUpTasksSubmitting(false);
  if (!result) return;

  if (!result.ok) {
    showCatchUpTasksError(catchUpErrorMessage(result, "Could not save those tasks"));
    return;
  }

  await applyCatchUpPayload(result.data.missedActivities, { dateKey, activity: "GOALS" });
  closeCatchUpTasksModal();
  const copy = catchUpActivityCopy("GOALS");
  showToast(answer === "YES" ? copy.savedYes : copy.savedNo);
}

async function submitCatchUpTasks(event) {
  event.preventDefault();

  const tasks = collectCatchUpTasks();
  if (!tasks) return;

  await submitCatchUpTasksAnswer({ answer: "YES", tasks });
}

function openCatchUpItem(dateKey, activity) {
  if (!dateKey || !catchUpActivityCopy(activity)) return;

  if (activity === "GOALS") {
    openCatchUpTasksModal(dateKey);
    return;
  }

  openCatchUpAnswerModal({ dateKey, activity });
}

if (catchUpCard && catchUpList && catchUpTemplate) {
  if (catchUpAnswerModal) document.body.append(catchUpAnswerModal);
  if (catchUpTasksModal) document.body.append(catchUpTasksModal);

  catchUpList.addEventListener("click", (event) => {
    const trigger = event.target.closest("[data-catch-up-open]");
    if (!trigger) return;

    openCatchUpItem(trigger.dataset.catchUpDate, trigger.dataset.catchUpActivity);
  });

  catchUpMore?.addEventListener("click", showMoreCatchUp);

  catchUpAnswerModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-catch-up-answer-close]")) {
      closeCatchUpAnswerModal();
      return;
    }

    const answerButton = event.target.closest("[data-catch-up-answer]");
    if (answerButton && !answerButton.disabled) {
      submitCatchUpAnswer(answerButton.dataset.catchUpAnswer);
    }
  });

  catchUpTasksModal?.addEventListener("click", (event) => {
    if (event.target.closest("[data-catch-up-tasks-close]")) {
      closeCatchUpTasksModal();
      return;
    }
    if (event.target.closest("[data-catch-up-tasks-add]")) {
      addCatchUpTaskRow({ focus: true });
      return;
    }
    if (event.target.closest("[data-catch-up-tasks-none]")) {
      submitCatchUpTasksAnswer({ answer: "NO", tasks: [] });
      return;
    }

    const removeButton = event.target.closest("[data-catch-up-task-remove]");
    if (removeButton) removeCatchUpTaskRow(removeButton.closest("[data-catch-up-task]"));
  });

  catchUpTasksList?.addEventListener("input", clearCatchUpTasksError);
  catchUpTasksForm?.addEventListener("submit", submitCatchUpTasks);

  loadCatchUp();
}

const FOCUS_MOVING_KEYS = new Set([
  "Tab", "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
  "Home", "End", "PageUp", "PageDown", "Escape",
]);

function setInputModality(modality) {
  document.documentElement.dataset.inputModality = modality;
}

document.addEventListener("pointerdown", () => setInputModality("pointer"), true);
document.addEventListener("keydown", (event) => {
  if (FOCUS_MOVING_KEYS.has(event.key)) setInputModality("keyboard");
}, true);

const PAGE_TRANSITION_DELAY = 160;

let pageTransitionTimer = 0;

function pageTransitionRoot() {
  return document.documentElement;
}

function startPageTransition() {
  if (pageTransitionTimer) return;

  pageTransitionTimer = window.setTimeout(() => {
    pageTransitionTimer = 0;
    pageTransitionRoot().classList.add("page-transitioning");

    const loader = document.querySelector("[data-noor-loader]");
    if (!loader) return;
    loader.removeAttribute("aria-hidden");
    loader.setAttribute("aria-busy", "true");
    const status = loader.querySelector("[data-noor-loader-status]");
    if (status) status.textContent = "Loading page…";
  }, PAGE_TRANSITION_DELAY);
}

function resetPageTransition() {
  window.clearTimeout(pageTransitionTimer);
  pageTransitionTimer = 0;
  pageTransitionRoot().classList.remove("page-transitioning");

  const loader = document.querySelector("[data-noor-loader]");
  if (!loader) return;
  loader.setAttribute("aria-hidden", "true");
  loader.removeAttribute("aria-busy");
  const status = loader.querySelector("[data-noor-loader-status]");
  if (status) status.textContent = "";
}

window.NoOrStartPageTransition = startPageTransition;
window.NoOrResetPageTransition = resetPageTransition;

function isSameOriginDocumentLink(anchor) {
  const href = anchor.getAttribute("href");
  if (!href) return false;
  if (anchor.hasAttribute("download")) return false;
  if (anchor.target && anchor.target !== "_self") return false;
  if (/^(mailto:|tel:|sms:|tg:)/i.test(href)) return false;

  let url;
  try {
    url = new URL(anchor.href, window.location.href);
  } catch {
    return false;
  }
  if (url.origin !== window.location.origin) return false;
  if (/(^|\.)t\.me$/i.test(url.hostname)) return false;
  if (url.pathname === window.location.pathname
    && url.search === window.location.search
    && url.hash) return false;
  return true;
}

function isPlainActivation(event) {
  return !event.defaultPrevented
    && event.button === 0
    && !event.metaKey
    && !event.ctrlKey
    && !event.shiftKey
    && !event.altKey;
}

function optedOut(element) {
  return Boolean(element.closest("[data-no-page-transition]"));
}

document.addEventListener("click", (event) => {
  const anchor = event.target.closest?.("a[href]");
  if (!anchor || !isPlainActivation(event) || optedOut(anchor)) return;
  if (!isSameOriginDocumentLink(anchor)) return;
  if (hasUnsavedReading()) return;
  startPageTransition();
});

document.addEventListener("submit", (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement) || event.defaultPrevented) return;
  if (optedOut(form)) return;
  if (!form.getAttribute("action") && !form.action) return;
  try {
    if (new URL(form.action, window.location.href).origin !== window.location.origin) return;
  } catch {
    return;
  }
  if (form.target && form.target !== "_self") return;
  if (typeof form.checkValidity === "function" && !form.checkValidity()) return;
  if (hasUnsavedReading()) return;
  startPageTransition();
});

window.addEventListener("pageshow", (event) => {
  resetPageTransition();
  if (event.persisted) pageTransitionRoot().classList.remove("page-loading", "page-entering");
});

window.addEventListener("pagehide", resetPageTransition);

let ambientRoot = null;

function setAmbientAnswerState(answer) {
  if (!ambientRoot) return;
  ambientRoot.dataset.state = answer === "YES" ? "yes" : answer === "NO" ? "no" : "neutral";
}

function initAmbientArt() {
  if (ambientRoot) return;

  const sharedSky = document.querySelector("[data-app-sky]");
  if (!sharedSky) return;

  ambientRoot = sharedSky;
  document.body.classList.add("has-ambient-video");
  document.body.dataset.ambient = document.body.dataset.page === "battle" ? "scene" : "shared";
}

initAmbientArt();
