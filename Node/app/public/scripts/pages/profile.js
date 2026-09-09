(() => {
  const root = document.querySelector("[data-profile]");
  if (!root || root.dataset.owner !== "true") return;

  const BASE_TOTAL = 10;
  const STATS = ["strength", "dexterity", "intelligence"];

  const allocationPanel = root.querySelector("[data-allocation]");
  const remaining = root.querySelector("[data-allocation-remaining]");
  const saveButton = root.querySelector("[data-allocation-save]");
  const resetButton = root.querySelector("[data-allocation-reset]");
  const allocationError = root.querySelector("[data-allocation-error]");
  const privacyError = root.querySelector("[data-privacy-error]");
  const spellExplorer = root.querySelector("[data-explore]");
  const spellError = root.querySelector("[data-explore-error]");
  const spellStatus = root.querySelector("[data-explore-status]");
  const headerIdentity = document.querySelector("[data-account-identity]");

  const inputs = new Map(
    STATS.map((stat) => [stat, root.querySelector(`[data-allocation-input="${stat}"]`)]),
  );
  const initial = new Map([...inputs].map(([stat, input]) => [stat, Number(input?.value || 0)]));

  async function send(url, method, body) {
    try {
      const response = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(body),
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return null;
      }

      const data = await response.json().catch(() => ({}));
      return { ok: response.ok, data };
    } catch {
      return { ok: false, data: { error: "You appear to be offline. Please try again." } };
    }
  }

  function showError(element, message) {
    if (!element) return;
    element.textContent = message || "";
    element.hidden = !message;
  }

  function applySpellState(explore) {
    const wisdom = spellExplorer?.querySelector("[data-explore-wisdom]");
    const unlocked = spellExplorer?.querySelector("[data-explore-unlocked]");
    const intelligence = spellExplorer?.querySelector("[data-explore-intelligence]");
    const mana = spellExplorer?.querySelector("[data-explore-mana]");
    const loadoutCount = spellExplorer?.querySelector("[data-loadout-count]");

    if (wisdom) wisdom.textContent = explore.wisdom;
    if (unlocked) unlocked.textContent = explore.unlockedCount;
    if (intelligence) intelligence.textContent = explore.intelligence;
    if (mana) mana.textContent = explore.maxMana;

    if (loadoutCount && Array.isArray(explore.equipped)) {
      loadoutCount.textContent = `${explore.equipped.length} of ${explore.equippedLimit ?? 3} equipped`;
    }

    for (const spell of explore.spells) {
      const item = spellExplorer?.querySelector(`[data-spell="${spell.key}"]`);
      if (!item) continue;

      item.dataset.state = spell.unlocked ? "unlocked" : spell.available ? "available" : "locked";
      if (spell.unlocked) item.dataset.equipped = spell.equipped ? "true" : "false";

      const state = item.querySelector("[data-spell-state]");
      if (state) {
        state.textContent = spell.unlocked
          ? (spell.equipped ? "Carried into battle" : "Learned")
          : spell.available
            ? "Ready to learn"
            : `Needs ${spell.wisdomRemaining} more Wisdom`;
      }

      if (spell.unlocked) renderLoadoutControl(item, spell, explore);
    }
  }

  function renderLoadoutControl(item, spell, explore) {
    const actions = item.querySelector(".explore-actions");
    if (!actions) return;

    const limit = explore?.equippedLimit ?? 3;
    const full = (explore?.equipped?.length ?? 0) >= limit;
    const blocked = !spell.equipped && full;

    const existing = actions.querySelector("[data-loadout-toggle]");
    const button = existing || document.createElement("button");

    button.type = "button";
    button.className = "explore-button explore-loadout-toggle";
    button.dataset.loadoutToggle = spell.key;
    button.setAttribute("aria-pressed", spell.equipped ? "true" : "false");
    button.setAttribute("aria-describedby", `loadout-note-${spell.key}`);
    button.textContent = spell.equipped ? "Unequip" : "Equip";
    button.disabled = blocked;

    const note = actions.querySelector("[data-spell-note]") || document.createElement("p");
    note.className = "explore-note";
    note.id = `loadout-note-${spell.key}`;
    note.dataset.spellNote = "";
    note.textContent = spell.equipped
      ? "This spell is carried into your next battle."
      : blocked
        ? "Unequip one first: you can carry three."
        : "Learned. Equip it to carry it into your next battle.";

    if (!existing) {
      actions.textContent = "";
      actions.append(button, note);
    }
  }

  function equippedKeys() {
    return [...(spellExplorer?.querySelectorAll('[data-loadout-toggle][aria-pressed="true"]') || [])]
      .map((button) => button.dataset.loadoutToggle);
  }

  function readAllocation() {
    return Object.fromEntries(
      STATS.map((stat) => [stat, Math.max(0, Math.trunc(Number(inputs.get(stat)?.value) || 0))]),
    );
  }

  function spentPoints(allocation) {
    return STATS.reduce((total, stat) => total + allocation[stat], 0);
  }

  function syncAllocationState() {
    if (!remaining) return;

    const allocation = readAllocation();
    const spent = spentPoints(allocation);
    const left = BASE_TOTAL - spent;

    if (left === 0) {
      remaining.textContent = "All 10 points spent";
      remaining.dataset.state = "ready";
    } else if (left < 0) {
      remaining.textContent = `${Math.abs(left)} point${Math.abs(left) === 1 ? "" : "s"} too many`;
      remaining.dataset.state = "over";
    } else {
      remaining.textContent = `${left} point${left === 1 ? "" : "s"} left`;
      remaining.dataset.state = "under";
    }

    if (saveButton) saveButton.disabled = left !== 0;
  }

  allocationPanel?.addEventListener("click", (event) => {
    const step = event.target.closest("[data-allocation-step]");
    if (!step) return;

    const stat = step.dataset.allocationStat;
    const input = inputs.get(stat);
    if (!input || input.disabled) return;

    const next = Math.max(0, Math.min(BASE_TOTAL, Number(input.value || 0) + Number(step.dataset.allocationStep)));
    input.value = String(next);
    showError(allocationError, "");
    syncAllocationState();
  });

  for (const input of inputs.values()) {
    input?.addEventListener("input", () => {
      showError(allocationError, "");
      syncAllocationState();
    });
  }

  resetButton?.addEventListener("click", () => {
    for (const [stat, input] of inputs) {
      if (input) input.value = String(initial.get(stat) ?? 0);
    }
    showError(allocationError, "");
    syncAllocationState();
  });

  spellExplorer?.addEventListener("click", async (event) => {
    const toggle = event.target.closest("[data-loadout-toggle]");
    if (toggle) {
      await changeLoadout(toggle);
      return;
    }

    const button = event.target.closest("[data-spell-unlock]");
    if (!button) return;

    const spellKey = button.dataset.spellUnlock;
    const spellName = button.textContent.replace("Learn ", "").trim();
    button.disabled = true;
    showError(spellError, "");

    const result = await send(`/api/spells/${encodeURIComponent(spellKey)}/unlock`, "POST");
    if (!result) return;

    if (!result.ok) {
      showError(spellError, result.data.error || result.data.errors?.[0] || "That spell could not be learned yet.");
      button.disabled = false;
      return;
    }

    applySpellState(result.data.explore);
    const learned = spellExplorer.querySelector(`[data-spell="${CSS.escape(spellKey)}"]`)
      || button.closest("[data-spell]");
    if (learned) {
      learned.classList.add("is-unlocking");
      learned.addEventListener("animationend", () => learned.classList.remove("is-unlocking"), { once: true });
    }
    if (spellStatus) {
      spellStatus.textContent = `${spellName} learned. ${result.data.explore.unlockedCount} of ${result.data.explore.totalCount} spells learned.`;
    }
  });

  saveButton?.addEventListener("click", async () => {
    const allocation = readAllocation();
    if (spentPoints(allocation) !== BASE_TOTAL) {
      showError(allocationError, `Spend exactly ${BASE_TOTAL} points.`);
      return;
    }

    saveButton.disabled = true;
    const result = await send("/api/game/allocation", "POST", allocation);
    if (!result) return;

    if (!result.ok) {
      showError(allocationError, result.data.error || result.data.errors?.[0] || "Could not save your points.");
      saveButton.disabled = false;
      return;
    }

    window.location.reload();
  });

  root.addEventListener("change", async (event) => {
    const preset = event.target.closest("[data-preset-input]");
    const privacy = event.target.closest("[data-privacy-input]");
    if (!preset && !privacy) return;

    const body = preset
      ? { [preset.name]: preset.value }
      : { [privacy.dataset.privacyInput]: privacy.checked };

    const result = await send("/api/game/profile", "PATCH", body);
    if (!result) return;

    if (!result.ok) {
      showError(privacyError, result.data.error || result.data.errors?.[0] || "Could not save that change.");
      if (privacy) privacy.checked = !privacy.checked;
      return;
    }

    showError(privacyError, "");
    if (preset?.name === "accentKey") {
      root.dataset.accent = result.data.profile.accentKey;
      if (headerIdentity) headerIdentity.dataset.accent = result.data.profile.accentKey;
    }
    if (preset?.name === "emblemKey") {
      root.querySelector(".profile-emblem")?.setAttribute("data-emblem", result.data.profile.emblemKey);
      if (headerIdentity) headerIdentity.dataset.emblem = result.data.profile.emblemKey;
    }
  });

  async function changeLoadout(button) {
    if (button.disabled) return;

    const key = button.dataset.loadoutToggle;
    const carried = button.getAttribute("aria-pressed") === "true";
    const next = carried
      ? equippedKeys().filter((entry) => entry !== key)
      : [...equippedKeys(), key];

    button.disabled = true;
    showError(spellError, "");

    const result = await send("/api/game/loadout", "PUT", { spellKeys: next });
    if (!result) return;

    button.disabled = false;

    if (!result.ok) {
      showError(spellError, result.data.error || result.data.errors?.[0] || "That loadout could not be saved.");
      return;
    }

    applySpellState(result.data.explore);
    if (spellStatus) {
      spellStatus.textContent = `${result.data.loadout.equipped.length} of ${result.data.loadout.limit} spells equipped.`;
    }
  }

  syncAllocationState();
})();
