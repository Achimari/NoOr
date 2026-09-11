(() => {
  const root = document.querySelector("[data-battle-page]");
  if (!root) return;

  const POLL_MS = 2000;
  const QUEUE_POLL_MS = 3000;
  const MAX_BACKOFF_MS = 15000;

  // A primary is a move that happened. Everything else modifies one.
  const PRIMARY_CODES = new Set([
    "ATTACK", "DEFEND", "BREAK", "SURGE", "CAST", "FORFEIT", "TIMEOUT", "BURN_TICK",
    "PHASE_CHANGE",
  ]);

  const STATUS_CODES = ["STATUS_APPLIED", "STATUS_REFRESHED", "STATUS_CONSUMED", "STATUS_BONUS"];

  const STATUS_WORDS = {
    GUARD: "Guard",
    SHIELD: "Shield",
    BURN: "Burn",
    EXPOSED: "Exposed",
    RIPOSTE: "Riposte",
  };

  const POST_CODES = {
    ATTACK: ["RESOLVE_GAIN", ...STATUS_CODES],
    BREAK: ["RESOLVE_GAIN", ...STATUS_CODES],
    SURGE: ["RESOLVE_GAIN", ...STATUS_CODES],
    DEFEND: [],
    BURN_TICK: [],
    FORFEIT: [],
    TIMEOUT: [],
    PHASE_CHANGE: [],
    CAST: [
      "HEAL", "RESTORE", "SHIELD", "DAMAGE", "GUARD_BROKEN", "GUARD_ABSORB",
      "SHIELD_ABSORB", "SLOW", "BURN_APPLIED", "RESOLVE_GAIN", ...STATUS_CODES,
    ],
  };

  const ACTION_WORDS = {
    ATTACK: "attack",
    DEFEND: "guard",
    BREAK: "break your guard",
    SURGE: "surge",
  };

  function compileBeats(entries) {
    const beats = [];
    let carry = [];
    let sealed = false;
    let endsBattle = false;

    for (const entry of entries || []) {
      if (!entry || !entry.code) continue;

      if (entry.code === "BATTLE_END") {
        endsBattle = true;
        continue;
      }

      if (PRIMARY_CODES.has(entry.code)) {
        beats.push({ primary: entry, before: carry, after: [] });
        carry = [];
        sealed = false;
        continue;
      }

      const open = beats[beats.length - 1];
      const accepts = open && (POST_CODES[open.primary.code] || []).includes(entry.code);

      if (!sealed && accepts) {
        open.after.push(entry);
        continue;
      }

      sealed = true;
      carry.push(entry);
    }

    if (carry.length) beats.push({ primary: null, before: carry, after: [] });

    return { beats, endsBattle };
  }

  function planBeat(beat, context) {
    const { yourSide, names, spellName } = context;
    const sideOf = (side) => (side === yourSide ? "you" : "them");
    const primary = beat.primary;
    const entries = [...beat.before, ...(primary ? [primary] : []), ...beat.after];

    const plan = {
      kind: "effects",
      actor: null,
      target: null,
      tier: "small",
      weak: false,
      fatal: false,
      banner: "",
      announce: "",
      damage: null,
      heal: null,
      resolveGains: [],
      shield: null,
      guardAbsorbed: false,
      guardBroken: false,
      shieldAbsorbed: null,
      slowed: false,
      burnTurns: null,
      statusApplied: [],
      statusRefreshed: [],
      statusConsumed: [],
      statusBonus: 0,
      phase: null,
      commits: [],
    };

    for (const entry of entries) {
      const side = sideOf(entry.side);
      const target = entry.targetSide ? sideOf(entry.targetSide) : null;

      switch (entry.code) {
        case "ATTACK":
        case "BREAK":
        case "SURGE":
          plan.kind = entry.code.toLowerCase();
          plan.actor = side;
          plan.target = target;
          plan.damage = entry.amount;
          plan.guardBroken = plan.guardBroken || Boolean(entry.guardBroken);
          plan.weak = entry.code === "BREAK" && !entry.guardBroken;
          plan.commits.push({ side: target, key: "health", value: entry.health });
          break;
        case "DEFEND":
          plan.kind = "guard";
          plan.actor = side;
          plan.commits.push({ side, key: "defending", value: true });
          break;
        case "CAST":
          plan.kind = "cast";
          plan.actor = side;
          plan.spellKey = entry.spellKey;
          plan.manaCost = entry.manaCost;
          plan.commits.push({ side, key: "mana", value: entry.mana });
          break;
        case "FORFEIT":
          plan.kind = "forfeit";
          plan.actor = side;
          break;
        case "TIMEOUT":
          plan.kind = "timeout";
          plan.actor = side;
          break;
        case "BURN_TICK":
          plan.kind = "burn";
          plan.target = side;
          plan.damage = entry.amount;
          plan.commits.push({ side, key: "health", value: entry.health });
          break;
        case "DAMAGE":
          plan.target = target;
          plan.damage = entry.amount;
          plan.commits.push({ side: target, key: "health", value: entry.health });
          break;
        case "HEAL":
        case "RESTORE":
          plan.target = side;
          plan.heal = entry.amount;
          plan.commits.push({ side, key: "health", value: entry.health });
          break;
        case "SHIELD":
          plan.target = side;
          plan.shield = entry.amount;
          plan.commits.push({ side, key: "shield", value: entry.shield });
          break;
        case "SHIELD_ABSORB":
          plan.shieldAbsorbed = entry.amount;
          plan.commits.push({ side, key: "shield", value: entry.remaining });
          break;
        case "GUARD_ABSORB":
          plan.guardAbsorbed = true;
          plan.commits.push({ side, key: "defending", value: false });
          break;
        case "GUARD_BROKEN":
          plan.guardBroken = true;
          plan.commits.push({ side, key: "defending", value: false });
          break;
        case "SLOW":
          plan.slowed = true;
          plan.target = target;
          break;
        case "BURN_APPLIED":
          plan.target = target;
          plan.burnTurns = entry.turns;
          plan.commits.push({ side: target, key: "burnTurns", value: entry.turns });
          break;
        case "RESOLVE_GAIN":
          plan.resolveGains.push({ side, amount: entry.amount });
          plan.commits.push({ side, key: "resolve", value: entry.resolve });
          break;
        case "RESOLVE_SPEND":
          plan.commits.push({ side, key: "resolve", value: entry.resolve });
          break;
        case "STATUS_APPLIED":
          plan.statusApplied.push(entry.key);
          break;
        case "STATUS_REFRESHED":
          plan.statusRefreshed.push(entry.key);
          break;
        case "STATUS_CONSUMED":
          plan.statusConsumed.push(entry.key);
          break;
        case "STATUS_BONUS":
          plan.statusBonus += entry.amount || 0;
          break;
        case "PHASE_CHANGE":
          plan.kind = "phase";
          plan.actor = side;
          plan.phase = entry.phase;
          break;
        default:
          break;
      }
    }

    plan.tier = tierFor(plan);
    plan.banner = bannerFor(plan, names, spellName);
    plan.announce = announceFor(plan, names, spellName);

    return plan;
  }

  function tierFor(plan) {
    if (plan.fatal) return "large";
    if (plan.kind === "phase") return "small";
    if (plan.kind === "surge") return "large";
    if (plan.kind === "break" && plan.guardBroken) return "large";
    if (plan.kind === "burn") return "small";
    if (plan.damage > 0) return plan.weak ? "small" : "medium";
    return "small";
  }

  function moveNameFor(plan, spellName) {
    switch (plan.kind) {
      case "attack": return "Attack";
      case "guard": return "Guard";
      case "break": return "Break";
      case "surge": return "Surge";
      case "cast": return spellName(plan.spellKey);
      case "forfeit": return "Forfeit";
      case "timeout": return "Out of time";
      default: return "";
    }
  }

  const PHASE_BANNERS = {
    STEADY: "holds its ground",
    PRESSURE: "presses harder",
    LAST_STAND: "gathers everything it has left",
  };

  function bannerFor(plan, names, spellName) {
    if (plan.kind === "phase") {
      const who = names[plan.actor] || "The trial";
      return `${who} ${PHASE_BANNERS[plan.phase] || "changes"}`.trim();
    }
    if (plan.kind === "burn") return `${names[plan.target] || ""} is burning`.trim();
    if (plan.kind === "effects") return "";

    const who = names[plan.actor] || "";
    const move = moveNameFor(plan, spellName);
    if (!move) return "";
    if (plan.kind === "cast") return `${who} cast ${move}`.trim();
    if (plan.kind === "timeout") return `${who} ran out of time`.trim();

    return `${who} used ${move}`.trim();
  }

  function announceFor(plan, names, spellName) {
    const actor = plan.actor === "you" ? "You" : names.them || "Your opponent";
    const target = plan.target === "you" ? "you" : names.them || "your opponent";
    const parts = [];

    switch (plan.kind) {
      case "attack":
        parts.push(`${actor} attacked for ${plan.damage} damage.`);
        break;
      case "break":
        parts.push(plan.guardBroken
          ? `${actor} broke the guard for ${plan.damage} damage.`
          : `${actor} broke early for only ${plan.damage} damage.`);
        break;
      case "surge":
        parts.push(`${actor} surged for ${plan.damage} damage.`);
        break;
      case "guard":
        parts.push(`${actor} took a defensive stance.`);
        break;
      case "cast":
        parts.push(`${actor} cast ${spellName(plan.spellKey)}.`);
        if (plan.damage > 0) parts.push(`It dealt ${plan.damage} damage.`);
        if (plan.heal > 0) parts.push(`Recovered ${plan.heal} health.`);
        if (plan.shield > 0) parts.push(`Shield of ${plan.shield}.`);
        if (plan.slowed) parts.push("The opponent was slowed.");
        if (plan.burnTurns > 0) parts.push(`A lingering effect for ${plan.burnTurns} turns.`);
        break;
      case "burn":
        parts.push(`${plan.target === "you" ? "You" : names.them || "Your opponent"} took ${plan.damage} lingering damage.`);
        break;
      case "forfeit":
        parts.push(`${actor} forfeited.`);
        break;
      case "timeout":
        parts.push(`${actor} ran out of time.`);
        break;
      case "phase":
        parts.push(`${plan.actor === "you" ? "You" : names.them || "The trial"} ${PHASE_BANNERS[plan.phase] || "changed"}.`);
        break;
      default:
        break;
    }

    for (const key of plan.statusConsumed) {
      parts.push(`${STATUS_WORDS[key] || key} was spent${plan.statusBonus > 0 ? ` for ${plan.statusBonus} more damage` : ""}.`);
    }
    for (const key of plan.statusApplied) {
      parts.push(key === "RIPOSTE"
        ? "A Riposte is ready."
        : `${target === "you" ? "You are" : "They are"} ${(STATUS_WORDS[key] || key).toLowerCase()}.`);
    }
    for (const key of plan.statusRefreshed) {
      parts.push(`${(STATUS_WORDS[key] || key)} was refreshed.`);
    }
    if (plan.guardAbsorbed) parts.push(`A guard absorbed part of the hit on ${target}.`);
    if (plan.guardBroken && plan.kind !== "break") parts.push("The guard was stripped.");
    if (plan.shieldAbsorbed > 0) parts.push(`A shield absorbed ${plan.shieldAbsorbed}.`);
    for (const gain of plan.resolveGains) {
      if (gain.amount > 0) parts.push(`${gain.side === "you" ? "You" : "They"} gained ${gain.amount} Resolve.`);
    }

    return parts.join(" ");
  }

  /* Presentation compiler (test boundary: end) */

  const entry = root.querySelector("[data-battle-entry]");
  const modes = root.querySelector("[data-battle-modes]");
  const active = root.querySelector("[data-battle-active]");
  const stage = root.querySelector("[data-battle-stage]");
  const scene = root.querySelector("[data-battle-scene]");
  const dock = root.querySelector("[data-battle-dock]");
  const banner = root.querySelector("[data-action-banner]");
  const announcer = root.querySelector("[data-battle-announcer]");
  const errorLine = root.querySelector("[data-battle-error]");
  const connectionLine = root.querySelector("[data-battle-connection]");
  const logList = root.querySelector("[data-battle-log]");
  const spellBox = root.querySelector("[data-spell-actions]");
  const spellEmpty = root.querySelector("[data-spell-empty]");
  const spellTray = root.querySelector("[data-spell-tray]");
  const moreTray = root.querySelector("[data-more-tray]");
  const queuePanel = root.querySelector("[data-queue-panel]");
  const queueStatus = root.querySelector("[data-queue-status]");
  const joinButton = root.querySelector("[data-queue-join]");
  const cancelButton = root.querySelector("[data-queue-cancel]");
  const intentChip = root.querySelector("[data-battle-intent]");
  const intentLabel = root.querySelector("[data-intent-label]");
  const intentPreview = root.querySelector("[data-intent-preview]");
  const intentSeverity = root.querySelector("[data-intent-severity]");
  const intentCounter = root.querySelector("[data-intent-counter]");
  const phaseBanner = root.querySelector("[data-phase-banner]");
  const turnChip = root.querySelector("[data-turn-chip]");
  const surgeHint = root.querySelector("[data-surge-hint]");
  const leaveLink = root.querySelector("[data-battle-leave]");
  const outcomePanel = root.querySelector("[data-battle-outcome]");
  const outcomeTitle = root.querySelector("[data-outcome-title]");
  const outcomeText = root.querySelector("[data-outcome-text]");
  const outcomeAction = root.querySelector("[data-outcome-action]");

  const figures = {
    you: root.querySelector('[data-character="you"]'),
    them: root.querySelector('[data-character="them"]'),
  };

  let battleId = root.dataset.activeBattle ? Number(root.dataset.activeBattle) : null;

  let committedBattle = null;
  let pendingBattle = null;
  let presentationQueue = Promise.resolve();
  let animationGeneration = 0;

  let pollTimer = null;
  let queueTimer = null;
  let failures = 0;
  let busy = false;
  let resolving = false;
  let renderedLogCount = 0;
  let artIdentity = { you: null, them: null };

  const SPELL_LABELS = new Map();
  const SPELL_COSTS = new Map();

  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const reduced = () => reduceMotion.matches;

  const TIMING = {
    banner: 140,
    anticipation: 110,
    lunge: 150,
    reaction: { small: 150, medium: 190, large: 250 },
    hitStop: { small: 0, medium: 0, large: 60 },
    settle: 180,
    number: 520,
    outcomeHold: 350,
  };

  const MAX_SEQUENCE_MS = 1800;

  const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

  const runningAnimations = new Set();
  const pendingWaits = new Set();

  function wait(ms) {
    if (ms <= 0) return Promise.resolve();

    return new Promise((resolve) => {
      const slot = { resolve, id: 0 };
      slot.id = window.setTimeout(() => {
        pendingWaits.delete(slot);
        resolve();
      }, ms);
      pendingWaits.add(slot);
    });
  }

  function animate(element, keyframes, options) {
    if (!element || typeof element.animate !== "function") return null;

    element.style.willChange = "transform";
    const animation = element.animate(keyframes, options);
    runningAnimations.add(animation);

    const release = () => {
      runningAnimations.delete(animation);
      element.style.willChange = "";
    };
    animation.finished.then(release, release);

    return animation;
  }

  function cancelSequence() {
    animationGeneration += 1;

    for (const animation of runningAnimations) {
      try { animation.cancel(); } catch { /* already finished */ }
    }
    runningAnimations.clear();

    for (const slot of pendingWaits) {
      window.clearTimeout(slot.id);
      slot.resolve();
    }
    pendingWaits.clear();

    resetSceneTransforms();
    setResolving(false);
    hideBanner();

    window.clearTimeout(phaseTimer);
    if (phaseBanner) {
      phaseBanner.hidden = true;
      phaseBanner.textContent = "";
    }
  }

  function resetSceneTransforms() {
    for (const side of ["you", "them"]) {
      const motion = figures[side]?.querySelector("[data-figure-motion]");
      if (motion) motion.style.transform = "";
      const impact = figures[side]?.querySelector("[data-impact]");
      if (impact) impact.style.opacity = "";
    }
    if (scene) scene.style.transform = "";
    if (stage) stage.dataset.hitStop = "false";
  }

  function setResolving(value) {
    resolving = value;
    if (stage) stage.dataset.battleResolving = value ? "true" : "false";
    if (dock) dock.dataset.locked = value ? "true" : "false";
  }

  function newIdempotencyKey() {
    return (crypto.randomUUID?.() || `k${Date.now()}${Math.random()}`).slice(0, 60);
  }

  function showError(message) {
    if (!errorLine) return;
    errorLine.textContent = message || "";
    errorLine.hidden = !message;
  }

  function setConnection(visible) {
    if (connectionLine) connectionLine.hidden = !visible;
  }

  async function api(url, options = {}) {
    try {
      const response = await fetch(url, {
        ...options,
        headers: { Accept: "application/json", ...(options.body ? { "Content-Type": "application/json" } : {}) },
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return null;
      }

      const data = await response.json().catch(() => ({}));
      failures = 0;
      setConnection(false);
      return { ok: response.ok, status: response.status, data };
    } catch {
      failures += 1;
      setConnection(true);
      return { ok: false, status: 0, data: {} };
    }
  }

  function backoff(base) {
    return Math.min(base * 2 ** Math.max(0, failures - 1), MAX_BACKOFF_MS);
  }

  const POSES = ["idle", "ready", "anticipation", "attack", "guard", "hurt", "heavy-hit", "sad", "defeated"];
  const PLAYER_ART = "ruth";
  const PVP_OPPONENT_ART = "guardian";

  function artFor(battle, side) {
    if (side === "you") return { slug: PLAYER_ART, silhouette: "guardian" };
    if (battle.mode === "PVE" && battle.encounterKey) {
      return { slug: battle.encounterKey, silhouette: "wraith" };
    }
    return { slug: PVP_OPPONENT_ART, silhouette: "guardian" };
  }

  function posePath(slug, pose) {
    return `/images/battle/characters/${encodeURIComponent(slug)}/${pose}.webp`;
  }

  function syncArt(battle, side) {
    const figure = figures[side];
    if (!figure) return;

    const art = artFor(battle, side);
    if (artIdentity[side] === art.slug) return;

    artIdentity[side] = art.slug;
    figure.dataset.silhouette = art.silhouette;
    figure.dataset.art = "silhouette";

    const image = figure.querySelector("[data-character-image]");
    if (!image) return;

    image.onload = () => {
      figure.dataset.art = "image";
      preloadPoses(art.slug);
    };
    image.onerror = () => { figure.dataset.art = "silhouette"; };
    image.src = posePath(art.slug, "idle");
  }

  const preloaded = new Set();

  function preloadPoses(slug) {
    if (preloaded.has(slug)) return;
    preloaded.add(slug);

    const run = () => {
      for (const pose of POSES) {
        if (pose === "idle") continue;
        const image = new Image();
        image.decoding = "async";
        image.src = posePath(slug, pose);
      }
    };

    if (typeof window.requestIdleCallback === "function") window.requestIdleCallback(run, { timeout: 2000 });
    else window.setTimeout(run, 400);
  }

  function setPose(side, pose) {
    const figure = figures[side];
    if (!figure) return;

    figure.dataset.pose = pose;
    if (figure.dataset.art !== "image") return;

    const image = figure.querySelector("[data-character-image]");
    if (image && artIdentity[side]) image.src = posePath(artIdentity[side], pose);
  }

  function setTrack(node, value, max) {
    if (!node) return;
    const ratio = max > 0 ? Math.max(0, Math.min(1, value / max)) : 0;
    node.style.transform = `scaleX(${ratio})`;
  }

  function text(selector, value) {
    const node = root.querySelector(selector);
    if (node) node.textContent = value;
  }

  function glyph(name) {
    const template = document.createElement("template");
    const marks = {
      guard: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 2.5 20 5.5v6.2c0 4.6-3.2 8.6-8 10.3-4.8-1.7-8-5.7-8-10.3V5.5Z"/></svg>',
      shield: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 19 5.6v5.6c0 4.1-2.9 7.7-7 9.2-4.1-1.5-7-5.1-7-9.2V5.6Z"/><path d="m9 12 2 2 4-4"/></svg>',
      burn: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M8.5 14.5A3.5 3.5 0 0 0 12 21a6 6 0 0 0 6-6c0-4-3-6.5-4.5-9.5-.5 2.5-2 4-4 5.5-.8.6-1 1.8-.5 3.5Z"/></svg>',
      danger: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M12 8v5"/><path d="M12 16.5v.01"/><circle cx="12" cy="12" r="9"/></svg>',
      exposed: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><path d="M12 3 19 5.6v5.6c0 4.1-2.9 7.7-7 9.2-4.1-1.5-7-5.1-7-9.2V5.6Z" stroke-dasharray="3 3"/><path d="m9.5 9.5 5 5"/><path d="m14.5 9.5-5 5"/></svg>',
      riposte: '<svg class="battle-glyph" aria-hidden="true" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20 20 4"/><path d="M15 4h5v5"/><path d="M4 14v6h6"/></svg>',
    };
    template.innerHTML = marks[name] || "";
    return template.content;
  }

  function chipsFor(view) {
    if (Array.isArray(view.statuses) && view.statuses.length) {
      return view.statuses.map((status) => ({
        mark: status.icon,
        state: status.key,
        label: [
          status.label,
          status.turns ? `${status.turns}` : "",
          status.amount && !status.turns ? `${status.amount}` : "",
        ].filter(Boolean).join(" "),
      }));
    }

    const chips = [];
    if (view.defending) chips.push({ mark: "guard", label: "Guard", state: "GUARD" });
    if (view.shield > 0) chips.push({ mark: "shield", label: `Shield ${view.shield}`, state: "SHIELD" });
    if (view.burnTurns > 0) chips.push({ mark: "burn", label: `Burn ${view.burnTurns}`, state: "BURN" });

    return chips;
  }

  function renderStatus(side, view) {
    const list = root.querySelector(`[data-${side}-status]`);
    if (!list) return;

    const chips = chipsFor(view);

    const ratio = view.maxHealth > 0 ? view.health / view.maxHealth : 1;
    if (ratio > 0 && ratio <= 0.25) chips.push({ mark: "danger", label: "Low health", state: "danger" });

    list.textContent = "";
    for (const chip of chips) {
      const item = document.createElement("li");
      if (chip.state) item.dataset.status = chip.state;
      item.append(glyph(chip.mark));
      const label = document.createElement("span");
      label.textContent = chip.label;
      item.append(label);
      list.append(item);
    }

    const figure = figures[side];
    if (figure) {
      figure.dataset.guarding = view.defending ? "true" : "false";
      figure.dataset.shielded = view.shield > 0 ? "true" : "false";
      figure.dataset.burning = view.burnTurns > 0 ? "true" : "false";
    }

    const track = root.querySelector(`[data-${side}-health-bar]`)?.closest(".battle-track");
    if (track) track.dataset.danger = ratio > 0 && ratio <= 0.25 ? "true" : "false";
  }

  function renderSide(side, view) {
    text(`[data-${side}-health]`, view.health);
    text(`[data-${side}-maxhealth]`, view.maxHealth);
    setTrack(root.querySelector(`[data-${side}-health-bar]`), view.health, view.maxHealth);
    setTrack(root.querySelector(`[data-${side}-health-lag]`), view.health, view.maxHealth);

    if (side === "you") {
      text("[data-you-mana]", view.mana);
      text("[data-you-maxmana]", view.maxMana);
      setTrack(root.querySelector("[data-you-mana-bar]"), view.mana, view.maxMana);
    }

    const group = root.querySelector(`[data-${side}-resolve-group]`);
    if (group) {
      const enabled = typeof view.resolve === "number";
      group.hidden = !enabled;
      if (enabled) {
        text(`[data-${side}-resolve]`, view.resolve);
        text(`[data-${side}-maxresolve]`, view.maxResolve);
        setTrack(root.querySelector(`[data-${side}-resolve-bar]`), view.resolve, view.maxResolve);
      }
    }

    renderStatus(side, view);
  }

  function spellName(key) {
    if (!key) return "a spell";
    return SPELL_LABELS.get(key) || String(key).replace(/-/g, " ");
  }

  function renderSpells(battle) {
    if (!spellBox) return;

    const completed = battle.status !== "ACTIVE";
    const entries = Array.isArray(battle.you.spells) && battle.you.spells.length
      ? battle.you.spells
      : (battle.you.spellKeys || []).map((key) => ({
        key,
        name: spellName(key),
        manaCost: SPELL_COSTS.get(key) ?? 0,
        cooldownTurns: null,
        cooldownRemaining: 0,
        preview: "",
        available: true,
        reason: null,
      }));

    if (spellBox.dataset.rendered !== String(battle.id)) {
      spellBox.textContent = "";
      for (const spell of entries) {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "battle-spell";
        button.dataset.spellCast = spell.key;

        const head = document.createElement("span");
        head.className = "battle-spell-head";
        const label = document.createElement("span");
        label.textContent = spell.name;
        const price = document.createElement("span");
        price.className = "battle-spell-cost";
        price.textContent = `${spell.manaCost} mana`;
        head.append(label, price);

        const preview = document.createElement("span");
        preview.className = "battle-spell-preview";
        preview.dataset.spellPreview = spell.key;

        const reason = document.createElement("span");
        reason.className = "battle-spell-reason";
        reason.dataset.spellReason = spell.key;
        reason.id = `spell-reason-${spell.key}`;
        button.setAttribute("aria-describedby", reason.id);

        button.append(head, preview, reason);
        spellBox.append(button);
      }
      spellBox.dataset.rendered = String(battle.id);
    }

    if (spellEmpty) spellEmpty.hidden = entries.length > 0;

    for (const spell of entries) {
      const button = spellBox.querySelector(`[data-spell-cast="${CSS.escape(spell.key)}"]`);
      if (!button) continue;

      const preview = button.querySelector("[data-spell-preview]");
      if (preview) {
        preview.textContent = [
          spell.preview,
          spell.cooldownTurns ? `Cooldown ${spell.cooldownTurns}.` : "",
        ].filter(Boolean).join(" ");
      }

      const reason = button.querySelector("[data-spell-reason]");
      const blocked = !spell.available;
      button.disabled = completed || !battle.isYourTurn || busy || resolving || blocked;

      if (reason) {
        reason.textContent = !button.disabled
          ? ""
          : completed
            ? "This battle is over."
            : blocked
              ? spell.reason || "Not available"
              : resolving || busy
                ? "Resolving the last action."
                : "Waiting for your opponent's turn.";
      }
    }
  }

  function renderMoves(battle) {
    const completed = battle.status !== "ACTIVE";
    const supported = battle.supportedActions || ["ATTACK", "DEFEND", "CAST", "FORFEIT"];
    const surgeCost = battle.surgeCost;
    const resolve = typeof battle.you.resolve === "number" ? battle.you.resolve : 0;
    const canAffordSurge = typeof surgeCost === "number" && resolve >= surgeCost;

    for (const button of root.querySelectorAll(".battle-dock-actions [data-action]")) {
      const action = button.dataset.action;

      button.hidden = !supported.includes(action);
      const blockedBySurge = action === "SURGE" && !canAffordSurge;
      button.disabled = button.hidden || completed || !battle.isYourTurn || busy || resolving || blockedBySurge;

      const reason = root.querySelector(`[data-move-reason="${action}"]`);
      if (reason) {
        if (!button.disabled) reason.textContent = "";
        else if (completed) reason.textContent = "This battle is over.";
        else if (blockedBySurge) reason.textContent = `Needs ${surgeCost} Resolve. You have ${resolve}.`;
        else if (resolving || busy) reason.textContent = "Resolving the last action.";
        else reason.textContent = "Waiting for your opponent's turn.";
      }
    }

    const forfeit = root.querySelector('[data-action="FORFEIT"]');
    if (forfeit) {
      forfeit.hidden = completed || battle.mode !== "PVP";
      forfeit.disabled = !battle.isYourTurn || busy || resolving;
    }

    if (surgeHint) {
      const show = !completed && supported.includes("SURGE") && !canAffordSurge;
      surgeHint.hidden = !show;
      surgeHint.textContent = show
        ? `Surge needs ${surgeCost} Resolve; you have ${resolve}. Attacking banks 20, and a guard that absorbs a hit banks 25.`
        : "";
    }

    if (leaveLink) leaveLink.hidden = !completed;
  }

  const SEVERITY_WORDS = {
    LIGHT: "Light",
    STANDARD: "Standard",
    HEAVY: "Heavy",
    CONTROL: "Control",
  };

  function renderIntent(battle) {
    if (!intentChip) return;

    const intent = battle.status === "ACTIVE" ? battle.nextOpponentIntent : null;
    intentChip.hidden = !intent;

    if (!intent) {
      intentChip.removeAttribute("data-severity");
      if (intentLabel) intentLabel.textContent = "";
      if (intentPreview) intentPreview.textContent = "";
      if (intentSeverity) intentSeverity.textContent = "";
      if (intentCounter) intentCounter.textContent = "";
      intentChip.open = false;
      return;
    }

    if (typeof intent === "string") {
      intentChip.removeAttribute("data-severity");
      if (intentLabel) intentLabel.textContent = `Next: ${ACTION_WORDS[intent] || intent.toLowerCase()}`;
      if (intentPreview) intentPreview.textContent = "";
      if (intentSeverity) intentSeverity.textContent = "";
      if (intentCounter) intentCounter.textContent = "";
      return;
    }

    intentChip.dataset.severity = intent.severity;
    if (intentLabel) intentLabel.textContent = `Next: ${intent.label}`;
    if (intentPreview) {
      intentPreview.textContent = intent.estimatedDamage !== null && intent.estimatedDamage !== undefined
        ? `${intent.estimatedDamage} damage`
        : intent.effectSummary || "";
    }
    if (intentSeverity) intentSeverity.textContent = SEVERITY_WORDS[intent.severity] || intent.severity;
    if (intentCounter) intentCounter.textContent = intent.counter || "";
  }

  let phaseTimer = null;

  function showPhaseBanner(label) {
    if (!phaseBanner || !label) return;

    window.clearTimeout(phaseTimer);
    phaseBanner.textContent = label;
    phaseBanner.hidden = false;

    if (!reduced()) {
      animate(phaseBanner, [
        { opacity: 0, transform: "translateY(6px)" },
        { opacity: 1, transform: "translateY(0)" },
      ], { duration: TIMING.banner, easing: EASE_OUT, fill: "both" });
    }

    phaseTimer = window.setTimeout(() => {
      phaseBanner.hidden = true;
      phaseBanner.textContent = "";
    }, 1400);
  }

  function renderHistory(log) {
    if (!logList) return;

    for (let index = renderedLogCount; index < log.length; index += 1) {
      const plan = planBeat(
        { primary: log[index], before: [], after: [] },
        { yourSide: committedBattle?.yourSide, names: currentNames(), spellName },
      );
      if (!plan.announce) continue;

      const item = document.createElement("li");
      item.textContent = plan.announce;
      logList.append(item);
    }

    renderedLogCount = log.length;
    logList.scrollTop = logList.scrollHeight;
  }

  function currentNames() {
    return {
      you: committedBattle?.you?.name || "You",
      them: committedBattle?.them?.name || "Opponent",
    };
  }

  function restingPose(battle, side) {
    if (battle.status === "COMPLETED") {
      const lost = battle.outcome === "LOSS";
      const defeated = lost ? "you" : "them";
      return side === defeated ? "defeated" : "ready";
    }
    if (battle[side === "you" ? "you" : "them"].defending) return "guard";

    const acting = battle.isYourTurn ? "you" : "them";
    return side === acting ? "ready" : "idle";
  }

  function renderStaticState(battle) {
    setFocusMode(true);
    modes?.setAttribute("hidden", "");
    active?.removeAttribute("hidden");

    text("[data-you-name]", battle.you.name || "You");
    text("[data-them-name]", battle.them.name || "Opponent");

    syncArt(battle, "you");
    syncArt(battle, "them");

    renderSide("you", battle.you);
    renderSide("them", battle.them);

    if (turnChip) turnChip.hidden = !battle.isYourTurn || battle.status !== "ACTIVE";

    renderIntent(battle);
    renderMoves(battle);
    renderSpells(battle);
    renderHistory(battle.log || []);

    if (!resolving) {
      setPose("you", restingPose(battle, "you"));
      setPose("them", restingPose(battle, "them"));
    }

    renderOutcomePanel(battle);
  }

  function renderOutcomePanel(battle) {
    if (!outcomePanel) return;

    if (battle.status !== "COMPLETED") {
      outcomePanel.hidden = true;
      if (stage) stage.dataset.dimmed = "false";
      return;
    }

    const won = battle.outcome === "WIN";
    if (outcomeTitle) outcomeTitle.textContent = won ? "Victory" : "Defeat";
    if (outcomeText) {
      outcomeText.textContent = won
        ? "The trial gave way. Nothing was won but the ground you stood on."
        : "It held this time. Nothing was lost but the attempt.";
    }
    if (outcomeAction) outcomeAction.textContent = battle.mode === "PVE" ? "Return to trials" : "Return to battle";
    outcomePanel.hidden = false;
  }

  function setFocusMode(activeBattle) {
    root.dataset.battleFocus = activeBattle ? "true" : "false";
  }

  function showBanner(label) {
    if (!banner || !label) return null;

    banner.textContent = label;
    banner.hidden = false;

    if (reduced()) return null;
    return animate(banner, [
      { opacity: 0, transform: "translateY(6px)" },
      { opacity: 1, transform: "translateY(0)" },
    ], { duration: TIMING.banner, easing: EASE_OUT, fill: "both" });
  }

  function hideBanner() {
    if (banner) {
      banner.hidden = true;
      banner.textContent = "";
    }
  }

  function announce(message) {
    if (!announcer || !message) return;
    announcer.textContent = message;
  }

  function forwardFor(side) {
    return side === "you" ? 1 : -1;
  }

  function lungeDistance() {
    return Math.max(36, Math.min(120, window.innerWidth * 0.06));
  }

  function motionOf(side) {
    return figures[side]?.querySelector("[data-figure-motion]") || null;
  }

  function flashImpact(side) {
    const impact = figures[side]?.querySelector("[data-impact]");
    if (!impact) return;

    animate(impact, [
      { opacity: 0, transform: "scale(0.9)" },
      { opacity: 1, transform: "scale(1.05)", offset: 0.35 },
      { opacity: 0, transform: "scale(1.18)" },
    ], { duration: reduced() ? 120 : 70, easing: "linear" });
  }

  function popNumber(side, value, kind, tier) {
    const layer = root.querySelector(`[data-effect-layer="${side}"]`);
    if (!layer || value === null || value === undefined) return;

    const node = document.createElement("span");
    node.className = "battle-hit";
    node.dataset.tier = tier;
    node.dataset.kind = kind;
    node.textContent = kind === "damage" ? `−${value}` : `+${value}`;
    layer.append(node);

    const frames = reduced()
      ? [{ opacity: 0 }, { opacity: 1, offset: 0.2 }, { opacity: 1, offset: 0.75 }, { opacity: 0 }]
      : [
        { opacity: 0, transform: "translateY(0) scale(0.92)" },
        { opacity: 1, transform: "translateY(-8px) scale(1.04)", offset: 0.22 },
        { opacity: 1, transform: "translateY(-16px) scale(1)", offset: 0.6 },
        { opacity: 0, transform: "translateY(-24px) scale(1)" },
      ];

    const animation = animate(node, frames, {
      duration: reduced() ? 420 : TIMING.number,
      easing: EASE_OUT,
    });

    const remove = () => node.remove();
    if (animation) animation.finished.then(remove, remove);
    else window.setTimeout(remove, 600);
  }

  function popToken(side, label) {
    const layer = root.querySelector(`[data-effect-layer="${side}"]`);
    if (!layer) return;

    const node = document.createElement("span");
    node.className = "battle-token";
    node.textContent = label;
    layer.append(node);

    const animation = animate(node, [
      { opacity: 0, transform: "translateY(6px) scale(0.94)" },
      { opacity: 1, transform: "translateY(0) scale(1)", offset: 0.2 },
      { opacity: 1, transform: "translateY(-4px) scale(1)", offset: 0.75 },
      { opacity: 0, transform: "translateY(-10px) scale(1)" },
    ], { duration: 900, easing: EASE_OUT });

    const remove = () => node.remove();
    if (animation) animation.finished.then(remove, remove);
    else window.setTimeout(remove, 950);
  }

  function shakeScene(tier) {
    if (!scene || reduced() || tier === "small") return;

    const amplitude = tier === "large" ? 9 : 4;
    const steps = 9;
    const frames = [];

    for (let index = 0; index <= steps; index += 1) {
      const decay = (1 - index / steps) ** 2;
      const phase = index * 2.3;
      const x = Math.sin(phase) * amplitude * decay;
      const y = Math.cos(phase * 1.4) * amplitude * 0.45 * decay;
      frames.push({ transform: `translate(${x.toFixed(2)}px, ${y.toFixed(2)}px)` });
    }
    frames.push({ transform: "translate(0px, 0px)" });

    animate(scene, frames, { duration: tier === "large" ? 380 : 240, easing: "linear" });
  }

  function commitValues(plan) {
    if (!committedBattle) return;

    for (const change of plan.commits) {
      if (!change.side) continue;
      const view = committedBattle[change.side];
      if (!view) continue;

      view[change.key] = change.value;
      renderSide(change.side, view);
    }
  }

  function estimateBeat(plan) {
    if (plan.kind === "effects") return 120;
    if (plan.damage > 0) {
      return TIMING.banner + TIMING.anticipation + TIMING.lunge
        + TIMING.hitStop[plan.tier] + TIMING.reaction[plan.tier] + TIMING.settle;
    }
    return TIMING.banner + TIMING.anticipation + TIMING.settle;
  }

  function speedFor(plans) {
    if (plans.length <= 2) return 1;
    const total = plans.reduce((sum, plan) => sum + estimateBeat(plan), 0);
    if (total <= MAX_SEQUENCE_MS) return 1;

    return Math.max(0.4, MAX_SEQUENCE_MS / total);
  }

  async function playBeat(plan, generation, speed) {
    const alive = () => generation === animationGeneration;
    const ms = (value) => Math.round(value * speed);

    const actor = plan.actor;
    const target = plan.target;
    const travels = Boolean(actor) && Boolean(target) && actor !== target && plan.kind !== "guard";
    const strikes = plan.damage > 0 && plan.kind !== "burn";

    showBanner(plan.banner);
    if (plan.banner) await wait(ms(TIMING.banner));
    if (!alive()) return;

    if (plan.kind === "phase" && reduced()) {
      showPhaseBanner(plan.banner);
      commitValues(plan);
      hideBanner();
      return;
    }

    if (reduced()) {
      if (actor) setPose(actor, strikes ? "attack" : plan.kind === "guard" ? "guard" : "ready");
      if (target && (strikes || plan.kind === "burn")) setPose(target, plan.tier === "large" ? "heavy-hit" : "hurt");
      commitValues(plan);
      paintCallouts(plan);
      await wait(150);
      if (!alive()) return;
      settlePoses(plan);
      hideBanner();
      return;
    }

    if (actor) {
      setPose(actor, plan.kind === "guard" ? "guard" : "anticipation");
      await wait(ms(TIMING.anticipation));
      if (!alive()) return;
    }

    const motion = actor ? motionOf(actor) : null;
    const distance = lungeDistance() * (plan.tier === "large" ? 1.15 : 1);
    let lunged = false;

    if (motion && travels) {
      setPose(actor, plan.kind === "cast" ? "ready" : "attack");
      animate(motion, [
        { transform: "translateX(0)" },
        { transform: `translateX(${forwardFor(actor) * distance}px)` },
      ], { duration: ms(TIMING.lunge), easing: EASE_OUT, fill: "forwards" });
      lunged = true;
      await wait(ms(TIMING.lunge));
      if (!alive()) return;
    } else if (actor && plan.kind !== "guard") {
      setPose(actor, "ready");
    }

    if (plan.kind === "guard" && actor) {
      setPose(actor, "guard");
      popToken(actor, "Guard");
    }

    if (strikes && target) {
      flashImpact(target);

      const stopMs = TIMING.hitStop[plan.tier];
      if (stopMs > 0) {
        if (stage) stage.dataset.hitStop = "true";
        await wait(stopMs);
        if (stage) stage.dataset.hitStop = "false";
        if (!alive()) return;
      }

      recoil(target, plan.tier, ms(TIMING.reaction[plan.tier]) + 120);
      shakeScene(plan.tier);
    }

    if (plan.kind === "phase") {
      showPhaseBanner(plan.banner);
      if (plan.actor) setPose(plan.actor, "ready");
      commitValues(plan);
      await wait(ms(220));
      if (!alive()) return;
      if (plan.actor) setPose(plan.actor, "idle");
      hideBanner();
      return;
    }

    if (plan.kind === "burn" && target) {
      flashImpact(target);
      setPose(target, "hurt");
    }
    if (plan.kind === "cast" && plan.heal > 0 && plan.target) flashImpact(plan.target);

    commitValues(plan);
    paintCallouts(plan);

    await wait(ms(TIMING.reaction[plan.tier]));
    if (!alive()) return;

    if (lunged && motion) {
      animate(motion, [
        { transform: `translateX(${forwardFor(actor) * distance}px)` },
        { transform: "translateX(0)" },
      ], { duration: ms(TIMING.settle), easing: EASE_OUT, fill: "forwards" });
    }

    settlePoses(plan);

    await wait(ms(TIMING.settle));
    if (!alive()) return;

    if (motion) motion.style.transform = "";
    hideBanner();
  }

  function recoil(side, tier, duration) {
    const motion = motionOf(side);
    if (!motion) return;

    const knock = tier === "large" ? 24 : tier === "medium" ? 10 : 4;
    const back = -forwardFor(side) * knock;

    setPose(side, tier === "large" ? "heavy-hit" : "hurt");
    animate(motion, [
      { transform: "translateX(0) rotate(0deg)" },
      { transform: `translateX(${back}px) rotate(${forwardFor(side) * -2}deg)`, offset: 0.35 },
      { transform: "translateX(0) rotate(0deg)" },
    ], { duration, easing: EASE_OUT });
  }

  function settlePoses(plan) {
    if (plan.kind === "forfeit" || plan.kind === "timeout") {
      if (plan.actor) setPose(plan.actor, "sad");
      return;
    }

    if (plan.actor && plan.kind !== "guard") setPose(plan.actor, "idle");
    if (plan.target && plan.target !== plan.actor) setPose(plan.target, "idle");
  }

  function paintCallouts(plan) {
    if (plan.damage > 0 && plan.target) popNumber(plan.target, plan.damage, "damage", plan.tier);
    if (plan.heal > 0 && plan.target) popNumber(plan.target, plan.heal, "heal", "small");
    if (plan.guardAbsorbed && plan.target) popToken(plan.target, "Guard absorbed");
    if (plan.guardBroken && plan.target && plan.kind !== "cast") popToken(plan.target, "Guard broken");
    if (plan.shieldAbsorbed > 0 && plan.target) popToken(plan.target, `Shield ${plan.shieldAbsorbed}`);
    if (plan.shield > 0 && plan.target) popToken(plan.target, `Shield ${plan.shield}`);
    if (plan.slowed && plan.target) popToken(plan.target, "Slowed");
    if (plan.burnTurns > 0 && plan.target) popToken(plan.target, `Burn ${plan.burnTurns}`);
    for (const gain of plan.resolveGains) {
      if (gain.amount > 0) popToken(gain.side, `+${gain.amount} Resolve`);
    }
    for (const key of plan.statusApplied) {
      popToken(key === "RIPOSTE" ? plan.actor || plan.target : plan.target, STATUS_WORDS[key] || key);
    }
    for (const key of plan.statusRefreshed) {
      popToken(key === "RIPOSTE" ? plan.actor || plan.target : plan.target, `${STATUS_WORDS[key] || key} refreshed`);
    }
    for (const key of plan.statusConsumed) {
      popToken(plan.actor, `${STATUS_WORDS[key] || key} spent`);
    }
  }

  let focusBeforeAction = null;

  function rememberFocus() {
    const node = document.activeElement;
    focusBeforeAction = node && root.contains(node) && node.matches("[data-action], [data-spell-cast]")
      ? node
      : null;
  }

  function restoreFocus() {
    const activeNode = document.activeElement;
    const stranded = !activeNode
      || activeNode === document.body
      || activeNode === document.documentElement
      || activeNode === root
      || activeNode.disabled === true;
    if (!stranded) return;

    if (focusBeforeAction && !focusBeforeAction.disabled && !focusBeforeAction.hidden) {
      focusBeforeAction.focus();
      return;
    }

    const next = root.querySelector(".battle-dock-actions [data-action]:not([hidden]):not(:disabled)");
    next?.focus();
  }

  function present(next) {
    if (!next) return;

    pendingBattle = next;
    presentationQueue = presentationQueue.then(drain, drain);
  }

  async function drain() {
    while (pendingBattle) {
      const next = pendingBattle;
      pendingBattle = null;

      try {
        await consume(next);
      } catch {
        cancelSequence();
        settle(next);
      }
    }

    schedulePoll();
  }

  function settle(next) {
    committedBattle = next;
    battleId = next.id;
    renderStaticState(next);
    renderedLogCount = next.log?.length || 0;
  }

  async function consume(next) {
    const previous = committedBattle;

    const reconcilable = previous
      && previous.id === next.id
      && Array.isArray(next.log)
      && Array.isArray(previous.log)
      && next.log.length >= previous.log.length
      && next.version >= previous.version;

    if (!reconcilable) {
      cancelSequence();
      settle(next);
      return;
    }

    if (next.version === previous.version && next.log.length === previous.log.length) {
      committedBattle = next;
      renderStaticState(next);
      return;
    }

    const slice = next.log.slice(previous.log.length);
    const script = compileBeats(slice);

    if (!script.beats.length) {
      settle(next);
      if (script.endsBattle) await presentOutcome(next, animationGeneration);
      return;
    }

    await runSequence(script, next);
  }

  async function runSequence(script, next) {
    const generation = animationGeneration;
    const names = { you: next.you.name || "You", them: next.them.name || "Opponent" };
    const plans = script.beats.map((beat) => planBeat(beat, { yourSide: next.yourSide, names, spellName }));

    if (script.endsBattle && plans.length) {
      const last = plans[plans.length - 1];
      last.fatal = true;
      last.tier = tierFor(last);
    }

    const speed = speedFor(plans);
    setResolving(true);

    try {
      for (const plan of plans) {
        if (generation !== animationGeneration) return;
        announce(plan.announce);
        await playBeat(plan, generation, speed);
      }
    } finally {
      if (generation === animationGeneration) {
        resetSceneTransforms();
        hideBanner();
        setResolving(false);
        settle(next);
      } else {
        setResolving(false);
      }
    }

    if (generation !== animationGeneration) return;

    await presentOutcome(next, generation);
    restoreFocus();
  }

  async function presentOutcome(battle, generation) {
    if (battle.status !== "COMPLETED") return;

    const defeated = battle.outcome === "LOSS" ? "you" : "them";
    setPose(defeated, "sad");
    await wait(reduced() ? 0 : 160);
    if (generation !== animationGeneration) return;

    setPose(defeated, "defeated");
    setPose(defeated === "you" ? "them" : "you", "ready");
    await wait(reduced() ? 0 : TIMING.outcomeHold);
    if (generation !== animationGeneration) return;

    if (stage) stage.dataset.dimmed = "true";
    renderOutcomePanel(battle);

    const focused = document.activeElement;
    if (!focused || focused === document.body || root.contains(focused)) outcomeAction?.focus();
  }

  function clearPoll() {
    if (pollTimer) window.clearTimeout(pollTimer);
    pollTimer = null;
  }

  function schedulePoll() {
    clearPoll();
    const battle = committedBattle;
    if (!battle || battle.status !== "ACTIVE" || battle.mode !== "PVP" || battle.isYourTurn) return;
    if (document.hidden || resolving) return;

    pollTimer = window.setTimeout(refresh, backoff(POLL_MS));
  }

  async function refresh() {
    if (!battleId || busy) return;

    const result = await api(`/api/battles/${battleId}`);
    if (!result) return;

    if (result.ok) {
      present(result.data.battle);
      return;
    }

    if (result.status === 404) {
      window.location.href = "/battle";
      return;
    }

    if (!committedBattle) setFocusMode(false);

    schedulePoll();
  }

  function lockControls() {
    if (spellTray) spellTray.open = false;
    if (moreTray) moreTray.open = false;

    for (const button of root.querySelectorAll("[data-action], [data-spell-cast]")) {
      button.disabled = true;
    }
    for (const reason of root.querySelectorAll("[data-move-reason]")) {
      reason.textContent = "Resolving the last action.";
    }
  }

  async function act(type, spellKey) {
    if (busy || resolving) return;
    const battle = committedBattle;
    if (!battle || !battle.isYourTurn || battle.status !== "ACTIVE") return;

    busy = true;
    rememberFocus();
    lockControls();
    showError("");

    let result = null;
    try {
      result = await api(`/api/battles/${battleId}/actions`, {
        method: "POST",
        body: JSON.stringify({
          type,
          spellKey,
          expectedVersion: battle.version,
          idempotencyKey: newIdempotencyKey(),
        }),
      });
    } finally {
      busy = false;
    }

    if (!result) return;

    if (!result.ok) {
      showError(result.data.error || result.data.errors?.[0] || "That move was not accepted.");
      if (result.status === 409) {
        await refresh();
        return;
      }
      renderStaticState(battle);
      restoreFocus();
      return;
    }

    present(result.data.battle);
  }

  function resetForNewBattle(id) {
    cancelSequence();
    committedBattle = null;
    pendingBattle = null;
    renderedLogCount = 0;
    artIdentity = { you: null, them: null };
    if (logList) logList.textContent = "";
    if (outcomePanel) outcomePanel.hidden = true;
    if (stage) stage.dataset.dimmed = "false";
    if (spellBox) delete spellBox.dataset.rendered;
    if (spellTray) spellTray.open = false;
    if (moreTray) moreTray.open = false;
    battleId = id;
  }

  root.addEventListener("click", async (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      if (actionButton.dataset.action === "FORFEIT") {
        if (busy || resolving) return;
        busy = true;
        lockControls();
        let result = null;
        try {
          result = await api(`/api/battles/${battleId}/forfeit`, {
            method: "POST",
            body: JSON.stringify({ idempotencyKey: newIdempotencyKey() }),
          });
        } finally {
          busy = false;
        }
        if (result?.ok) present(result.data.battle);
        else if (committedBattle) renderStaticState(committedBattle);
        return;
      }
      await act(actionButton.dataset.action);
      return;
    }

    const spellButton = event.target.closest("[data-spell-cast]");
    if (spellButton) {
      await act("CAST", spellButton.dataset.spellCast);
      return;
    }

    const pveButton = event.target.closest("[data-pve-start]");
    if (pveButton) {
      pveButton.disabled = true;
      const result = await api(`/api/pve/encounters/${pveButton.dataset.pveStart}/start`, { method: "POST" });
      if (!result) {
        pveButton.disabled = false;
        return;
      }

      if (!result.ok) {
        showError(result.data.error || "That trial could not be started.");
        pveButton.disabled = false;
        return;
      }

      resetForNewBattle(result.data.battle.id);
      present(result.data.battle);
    }
  });

  function setQueueState(state, message) {
    if (queuePanel) queuePanel.dataset.queueState = state;
    if (queueStatus) queueStatus.textContent = message;
    if (joinButton) joinButton.hidden = state === "SEARCHING";
    if (cancelButton) cancelButton.hidden = state !== "SEARCHING";
  }

  function clearQueuePoll() {
    if (queueTimer) window.clearTimeout(queueTimer);
    queueTimer = null;
  }

  function handleQueue(queue) {
    if (queue.state === "MATCHED" && queue.battleId) {
      clearQueuePoll();
      setQueueState("MATCHED", "Opponent found. Starting the battle.");
      resetForNewBattle(queue.battleId);
      refresh();
      return;
    }

    if (queue.state === "SEARCHING") {
      const seconds = Math.round((queue.waitedMs || 0) / 1000);
      setQueueState("SEARCHING", `Searching for an opponent… ${seconds}s`);
      clearQueuePoll();
      if (!document.hidden) queueTimer = window.setTimeout(pollQueue, backoff(QUEUE_POLL_MS));
      return;
    }

    if (queue.state === "TIMED_OUT") {
      clearQueuePoll();
      setQueueState("IDLE", "No opponent was found in time. You can search again.");
      return;
    }

    clearQueuePoll();
    setQueueState("IDLE", "Not searching.");
  }

  async function pollQueue() {
    const result = await api("/api/pvp/queue");
    if (!result) return;

    if (!result.ok) {
      clearQueuePoll();
      queueTimer = window.setTimeout(pollQueue, backoff(QUEUE_POLL_MS));
      return;
    }

    handleQueue(result.data.queue);
  }

  joinButton?.addEventListener("click", async () => {
    joinButton.disabled = true;
    setQueueState("SEARCHING", "Searching for an opponent…");

    const result = await api("/api/pvp/queue", { method: "POST" });
    joinButton.disabled = false;

    if (!result) return;
    if (!result.ok) {
      setQueueState("IDLE", result.data.error || "Could not start searching.");
      return;
    }
    handleQueue(result.data.queue);
  });

  cancelButton?.addEventListener("click", async () => {
    cancelButton.disabled = true;
    await api("/api/pvp/queue", { method: "DELETE" });
    cancelButton.disabled = false;
    clearQueuePoll();
    setQueueState("IDLE", "Search cancelled.");
  });

  async function loadSpellMeta() {
    const result = await api("/api/spells");
    if (!result?.ok) return;

    for (const spell of result.data.spells || []) {
      SPELL_LABELS.set(spell.key, spell.name);
      SPELL_COSTS.set(spell.key, spell.manaCost);
    }
  }

  document.addEventListener("visibilitychange", () => {
    if (stage) stage.dataset.battlePaused = document.hidden ? "true" : "false";

    if (document.hidden) {
      clearPoll();
      clearQueuePoll();
      return;
    }
    if (battleId) refresh();
    if (queuePanel?.dataset.queueState === "SEARCHING") pollQueue();
  });

  window.addEventListener("pagehide", () => {
    cancelSequence();
    clearPoll();
    clearQueuePoll();
  });

  reduceMotion.addEventListener?.("change", () => {
    if (reduced()) cancelSequence();
  });

  if (!battleId) setFocusMode(false);

  // The first usable battle screen needs the spell metadata: without it the
  // action tray renders empty. Hold the loader until it resolves rather than
  // revealing a half-built arena — and release on failure too, so a dead
  // request can never trap the reader behind the overlay.
  const ready = window.NoOrPageReady?.hold() ?? (() => {});
  loadSpellMeta().then(() => {
    if (battleId) refresh();
    else pollQueue();
  }).catch(() => {}).finally(ready);
})();
