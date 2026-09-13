(() => {
  const menu = document.querySelector("[data-account-menu]");
  const toggle = document.querySelector("[data-account-toggle]");
  const panel = document.querySelector("[data-account-panel]");

  function setOpen(isOpen) {
    if (!toggle || !panel) return;
    panel.hidden = !isOpen;
    toggle.setAttribute("aria-expanded", isOpen ? "true" : "false");
    menu?.classList.toggle("open", isOpen);
  }

  function isOpen() {
    return Boolean(panel && !panel.hidden);
  }

  toggle?.addEventListener("click", () => setOpen(!isOpen()));

  document.addEventListener("click", (event) => {
    if (!isOpen() || !menu) return;
    if (menu.contains(event.target)) return;
    setOpen(false);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;

    const timezoneOpen = panel?.querySelector("[data-timezone-options]:not([hidden])");
    if (timezoneOpen) return;

    setOpen(false);
    toggle?.focus();
  });

  panel?.addEventListener("focusout", (event) => {
    if (!isOpen()) return;
    if (event.relatedTarget && menu?.contains(event.relatedTarget)) return;
    if (!event.relatedTarget) return;
    setOpen(false);
  });

  panel?.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) setOpen(false);
  });

  window.addEventListener("resize", () => {
    if (window.innerWidth <= 959) setOpen(false);
  });

  /* ------------------------------------------------ the phone Menu disclosure
   *
   * A native <details> in the masthead: it opens, closes and reports its
   * expanded state with no script. This only adds dismissal — Escape, an
   * outside activation, focus leaving, following a link, a back/forward cache
   * restore, leaving the Menu range — and the nested time-zone list. The
   * 959px range is header/responsive.css's; the two numbers move together.
   *
   * Non-modal site navigation: no focus trap, no scroll lock, nothing inert.
   */
  const siteMenu = document.querySelector("[data-site-menu]");
  const siteMenuToggle = siteMenu?.querySelector("summary");
  const mobileToggle = document.querySelector("[data-mobile-timezone-toggle]");
  const mobilePanel = document.querySelector("[data-mobile-timezone-panel]");
  const mobileSearch = document.querySelector("[data-mobile-timezone-search]");
  const mobileEmpty = document.querySelector("[data-mobile-timezone-empty]");
  const mobileList = document.querySelector("[data-mobile-timezone-list]");

  function setMobileOpen(open) {
    if (!mobileToggle || !mobilePanel) return;
    mobilePanel.hidden = !open;
    mobileToggle.setAttribute("aria-expanded", open ? "true" : "false");
    if (open) mobileSearch?.focus();
  }

  function closeSiteMenu() {
    if (siteMenu?.open) siteMenu.open = false;
  }

  mobileToggle?.addEventListener("click", () => setMobileOpen(Boolean(mobilePanel?.hidden)));

  // The full-screen panel starts at the masthead's real lower edge, which grows
  // with enlarged text. Measured on press, before the disclosure opens.
  siteMenuToggle?.addEventListener("click", () => {
    const edge = siteMenu.closest(".header")?.getBoundingClientRect().bottom;
    if (edge) siteMenu.style.setProperty("--site-menu-top", `${edge}px`);
  });

  // Closing the Menu closes the list inside it, so the two never disagree.
  siteMenu?.addEventListener("toggle", () => {
    if (!siteMenu.open) setMobileOpen(false);
  });

  // Escape peels one layer at a time: the time-zone list, then the Menu.
  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !siteMenu?.open) return;

    if (mobilePanel && !mobilePanel.hidden) {
      setMobileOpen(false);
      mobileToggle?.focus();
      return;
    }

    closeSiteMenu();
    siteMenuToggle?.focus();
  });

  // An outside activation closes the Menu and leaves focus where it landed.
  // pointerdown, not click: iOS Safari sends no click to the document for a
  // tap on non-interactive content, which would leave the panel stranded open.
  document.addEventListener("pointerdown", (event) => {
    if (siteMenu?.open && !siteMenu.contains(event.target)) closeSiteMenu();
  });

  siteMenu?.addEventListener("focusout", (event) => {
    if (event.relatedTarget && !siteMenu.contains(event.relatedTarget)) closeSiteMenu();
  });

  siteMenu?.addEventListener("click", (event) => {
    if (event.target.closest("a[href]")) closeSiteMenu();
  });

  // A page restored from the back/forward cache keeps its DOM, open state included.
  window.addEventListener("pageshow", closeSiteMenu);

  const menuRange = window.matchMedia?.("(max-width: 959px)");
  menuRange?.addEventListener("change", () => {
    if (menuRange.matches || !siteMenu?.open) return;
    const hadFocus = siteMenu.contains(document.activeElement);
    closeSiteMenu();
    if (hadFocus) (toggle || document.querySelector(".logo-link"))?.focus();
  });

  mobileSearch?.addEventListener("input", () => {
    const query = String(mobileSearch.value || "").trim().toLowerCase();
    let visible = 0;

    mobileList?.querySelectorAll("[data-timezone-option]").forEach((button) => {
      const matches = !query
        || button.dataset.timezoneLabel?.includes(query)
        || button.dataset.timezoneValue?.includes(query);
      button.hidden = !matches;
      if (matches) visible += 1;
    });

    if (mobileEmpty) mobileEmpty.hidden = visible > 0;
  });

  mobileList?.addEventListener("click", async (event) => {
    const button = event.target.closest("[data-timezone-option]");
    if (!button) return;

    button.disabled = true;
    try {
      const response = await fetch("/api/me/timezone", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ timezone: button.dataset.timezoneOption }),
      });

      if (response.status === 401) {
        window.location.href = "/login";
        return;
      }
      if (!response.ok) {
        button.disabled = false;
        return;
      }

      const data = await response.json().catch(() => ({}));
      if (data.timezone?.label) {
        document.querySelectorAll("[data-timezone-current]").forEach((node) => {
          node.textContent = data.timezone.label;
        });
      }
      setMobileOpen(false);
      window.setTimeout(() => window.location.reload(), 300);
    } catch {
      button.disabled = false;
    }
  });
})();
