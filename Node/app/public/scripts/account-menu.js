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
    if (window.innerWidth <= 760) setOpen(false);
  });

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

  mobileToggle?.addEventListener("click", () => setMobileOpen(Boolean(mobilePanel?.hidden)));

  const header = document.querySelector(".header");
  if (header && mobilePanel) {
    const headerStateObserver = new MutationObserver(() => {
      if (!header.classList.contains("menu-open")) setMobileOpen(false);
    });
    headerStateObserver.observe(header, { attributes: true, attributeFilter: ["class"] });
  }

  window.addEventListener("resize", () => {
    if (window.innerWidth > 760) setMobileOpen(false);
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
