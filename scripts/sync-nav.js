/* EasyFile global navigation, branding, search and theme controls */
(function () {
  "use strict";

  const BRAND = Object.freeze({
    name: "EasyFile",
    subtitle: "Business workspace",
    logoOnDark: "logo-w.png",
    logoOnLight: "logo-b.png"
  });

  const MODULES = Object.freeze([
    { name: "Home", href: "index.html", icon: "fa-house", group: "General", description: "EasyFile landing page" },
    { name: "Quote", href: "easy-quote.html", icon: "fa-file-lines", group: "Documents", description: "Create customer quotations" },
    { name: "Invoice", href: "easy-invoice.html", icon: "fa-file-invoice-dollar", group: "Documents", description: "Create and manage invoices" },
    { name: "Purchase Order", href: "easy-purchase-order.html", icon: "fa-cart-shopping", group: "Documents", description: "Create supplier purchase orders" },
    { name: "Sales Order", href: "easy-sales-order.html", icon: "fa-bag-shopping", group: "Documents", description: "Record customer sales orders" },
    { name: "Receipt", href: "easy-receipt.html", icon: "fa-receipt", group: "Documents", description: "Issue payment receipts" },
    { name: "Statement", href: "easy-statement.html", icon: "fa-file-contract", group: "Documents", description: "Generate account statements" },
    { name: "Job Card", href: "easy-job-card.html", icon: "fa-briefcase", group: "Operations", description: "Track service and repair work" },
    { name: "Payroll", href: "easy-payroll.html", icon: "fa-money-bill-wave", group: "Operations", description: "Prepare payroll summaries" },
    { name: "Inventory", href: "easy-inventory.html", icon: "fa-boxes-stacked", group: "Operations", description: "Track stock and movements" },
    { name: "CRM", href: "easy-crm.html", icon: "fa-users", group: "Operations", description: "Manage customer relationships" },
    { name: "Assets", href: "easy-asset-management.html", icon: "fa-screwdriver-wrench", group: "Operations", description: "Maintain the asset register" },
    { name: "Inspections", href: "easy-site-inspection.html", icon: "fa-clipboard-check", group: "Operations", description: "Capture site inspection records" },
    { name: "Referrals", href: "referrals.html", icon: "fa-user-group", group: "General", description: "Check referral progress and access" }
  ]);

  const MODULE_FILES = new Set(MODULES.filter((item) => !["index.html", "referrals.html"].includes(item.href)).map((item) => item.href));
  const SHARED_STYLES = Object.freeze([
    "assets/css/easyfile-brand-tokens.css",
    "assets/css/easyfile-site.css",
    "assets/css/easyfile-footer.css",
    "assets/css/easyfile-referrals.css",
    "assets/css/easyfile-navigation.css"
  ]);

  const current = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const referralEntry = new URLSearchParams(location.search).has("ref");
  const referralEnabledPage = MODULE_FILES.has(current) || current === "referrals.html" || referralEntry;
  const THEME_KEY = "easyfile:theme";

  function ensureSharedStyles() {
    SHARED_STYLES.forEach((href) => {
      const exists = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .some((link) => (link.getAttribute("href") || "").endsWith(href));
      if (exists) return;
      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.easyfileSharedStyle = "";
      document.head.appendChild(link);
    });
  }

  function ensureScript(src, dataAttribute) {
    const existing = Array.from(document.querySelectorAll("script[src]"))
      .find((script) => (script.getAttribute("src") || "").endsWith(src));
    if (existing) return existing;
    const script = document.createElement("script");
    script.src = src;
    if (dataAttribute) script.dataset[dataAttribute] = "";
    document.head.appendChild(script);
    return script;
  }

  function applyTheme(theme) {
    const dark = theme === "dark";
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    document.documentElement.classList.toggle("dark", dark);
    document.body?.classList.toggle("dark", dark);
    document.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.setAttribute("aria-label", dark ? "Switch to light theme" : "Switch to dark theme");
      button.setAttribute("title", dark ? "Light theme" : "Dark theme");
      button.innerHTML = `<i class="fa-solid ${dark ? "fa-sun" : "fa-moon"}" aria-hidden="true"></i>`;
    });
  }

  function initialTheme() {
    const stored = localStorage.getItem(THEME_KEY) || localStorage.getItem("easySuite.theme");
    if (stored === "dark" || stored === "light") return stored;
    return window.matchMedia?.("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  function groupMarkup(group) {
    const links = MODULES.filter((item) => item.group === group)
      .map((item) => `<a class="easyfile-menu-link" href="${item.href}"><i class="fa-solid ${item.icon}" aria-hidden="true"></i><span>${item.name}</span></a>`)
      .join("");
    return `<section class="easyfile-menu-group"><p class="easyfile-menu-group-title">${group}</p>${links}</section>`;
  }

  function navMarkup() {
    return `
      <div class="easyfile-nav-shell">
        <a class="easyfile-nav-brand" href="index.html"><img src="${BRAND.logoOnDark}" alt="" width="41" height="41"><span class="easyfile-nav-brand-copy"><strong>${BRAND.name}</strong><small>${BRAND.subtitle}</small></span></a>
        <div class="easyfile-nav-desktop" aria-label="Primary links">
          <a class="easyfile-nav-link" href="index.html"><i class="fa-solid fa-house" aria-hidden="true"></i>Home</a>
          <a class="easyfile-nav-link" href="index.html#modules"><i class="fa-solid fa-table-cells-large" aria-hidden="true"></i>Modules</a>
          <a class="easyfile-nav-link" href="referrals.html"><i class="fa-solid fa-user-group" aria-hidden="true"></i>Referrals</a>
        </div>
        <div class="easyfile-nav-tools">
          <div class="easyfile-nav-search-wrap" data-search-wrap>
            <i class="fa-solid fa-magnifying-glass easyfile-nav-search-icon" aria-hidden="true"></i>
            <input class="easyfile-nav-search" data-nav-search type="search" autocomplete="off" spellcheck="false" aria-label="Search EasyFile modules" placeholder="Search modules…">
            <span class="easyfile-nav-search-shortcut" aria-hidden="true">/</span>
            <div class="easyfile-search-results" data-search-results hidden></div>
          </div>
          <button class="easyfile-nav-icon-button" type="button" data-theme-toggle aria-label="Toggle colour theme"></button>
          <button class="easyfile-nav-icon-button easyfile-menu-toggle" type="button" data-menu-toggle aria-label="Open navigation menu" aria-expanded="false" aria-controls="easyfileMobileMenu"><i class="fa-solid fa-bars" aria-hidden="true"></i></button>
        </div>
      </div>
      <div id="easyfileMobileMenu" class="easyfile-mobile-menu" data-mobile-menu>
        <div class="easyfile-mobile-menu-panel">
          <div class="easyfile-mobile-search">
            <div class="easyfile-nav-search-wrap" data-search-wrap>
              <i class="fa-solid fa-magnifying-glass easyfile-nav-search-icon" aria-hidden="true"></i>
              <input class="easyfile-nav-search" data-nav-search type="search" autocomplete="off" spellcheck="false" aria-label="Search EasyFile modules" placeholder="Search modules…">
              <div class="easyfile-search-results" data-search-results hidden></div>
            </div>
          </div>
          <div class="easyfile-mobile-groups">${groupMarkup("General")}${groupMarkup("Documents")}${groupMarkup("Operations")}</div>
        </div>
      </div>`;
  }

  function installNavigation() {
    let topbar = document.querySelector("body > .easyfile-nav:not(nav)");
    if (!topbar) {
      const existingNav = document.querySelector('nav[aria-label="Primary navigation"], nav.easyfile-nav, nav.bg-blue-600');
      topbar = document.createElement("div");
      if (existingNav) existingNav.replaceWith(topbar);
      else document.body.insertBefore(topbar, document.body.firstChild);
    }
    topbar.className = "easyfile-nav no-print";
    topbar.removeAttribute("aria-label");
    topbar.innerHTML = navMarkup();

    topbar.querySelectorAll("a[href]").forEach((link) => {
      if (link.classList.contains("easyfile-nav-brand")) return;
      const rawHref = (link.getAttribute("href") || "").toLowerCase();
      if (rawHref.includes("#")) return;
      const href = rawHref.split("?")[0];
      if (href === current || (current === "" && href === "index.html")) link.setAttribute("aria-current", "page");
    });

    const menu = topbar.querySelector("[data-mobile-menu]");
    const toggle = topbar.querySelector("[data-menu-toggle]");
    toggle?.addEventListener("click", () => {
      const open = !menu.classList.contains("is-open");
      menu.classList.toggle("is-open", open);
      toggle.setAttribute("aria-expanded", String(open));
      toggle.setAttribute("aria-label", open ? "Close navigation menu" : "Open navigation menu");
      toggle.innerHTML = `<i class="fa-solid ${open ? "fa-xmark" : "fa-bars"}" aria-hidden="true"></i>`;
    });

    topbar.querySelectorAll("[data-theme-toggle]").forEach((button) => {
      button.addEventListener("click", () => {
        const next = document.documentElement.dataset.theme === "dark" ? "light" : "dark";
        localStorage.setItem(THEME_KEY, next);
        localStorage.setItem("easySuite.theme", next);
        applyTheme(next);
      });
    });

    installSearch(topbar);
  }

  function installSearch(nav) {
    function render(input, results) {
      const query = input.value.trim().toLowerCase();
      if (!query) {
        results.hidden = true;
        results.innerHTML = "";
        window.dispatchEvent(new CustomEvent("easyfile:module-search", { detail: { query: "" } }));
        return;
      }
      const matches = MODULES.filter((item) => `${item.name} ${item.group} ${item.description}`.toLowerCase().includes(query)).slice(0, 8);
      results.innerHTML = matches.length
        ? matches.map((item) => `<a class="easyfile-search-result" href="${item.href}"><i class="fa-solid ${item.icon}" aria-hidden="true"></i><span class="easyfile-search-result-copy"><strong>${item.name}</strong><small>${item.description}</small></span></a>`).join("")
        : '<p class="easyfile-search-empty">No EasyFile module matches that search.</p>';
      results.hidden = false;
      window.dispatchEvent(new CustomEvent("easyfile:module-search", { detail: { query } }));
    }

    nav.querySelectorAll("[data-search-wrap]").forEach((wrap) => {
      const input = wrap.querySelector("[data-nav-search]");
      const results = wrap.querySelector("[data-search-results]");
      input.addEventListener("input", () => render(input, results));
      input.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { input.value = ""; render(input, results); input.blur(); }
        if (event.key === "Enter") {
          const first = results.querySelector("a");
          if (first) { event.preventDefault(); location.href = first.href; }
        }
      });
      input.addEventListener("focus", () => { if (input.value.trim()) render(input, results); });
    });

    document.addEventListener("click", (event) => {
      nav.querySelectorAll("[data-search-results]").forEach((results) => {
        if (!results.closest("[data-search-wrap]")?.contains(event.target)) results.hidden = true;
      });
    });

    document.addEventListener("keydown", (event) => {
      const target = event.target;
      const editable = target && (target.matches?.("input, textarea, select") || target.isContentEditable);
      if ((event.key === "/" && !editable) || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k")) {
        event.preventDefault();
        const visible = Array.from(nav.querySelectorAll("[data-nav-search]")).find((input) => input.offsetParent !== null) || nav.querySelector("[data-nav-search]");
        visible?.focus();
      }
    });
  }

  function applyLayoutHooks() {
    document.body.classList.add("easyfile-app");
    document.querySelector("main")?.classList.add("easyfile-main");
    document.querySelectorAll("footer").forEach((footer) => {
      footer.classList.add("easyfile-footer");
      if (!footer.hasAttribute("aria-label")) footer.setAttribute("aria-label", "EasyFile site footer");
    });
  }

  function installFavicons() {
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => link.remove());
    [
      { rel: "icon", href: BRAND.logoOnLight, type: "image/png" },
      { rel: "icon", href: BRAND.logoOnLight, type: "image/png", media: "(prefers-color-scheme: light)" },
      { rel: "icon", href: BRAND.logoOnDark, type: "image/png", media: "(prefers-color-scheme: dark)" },
      { rel: "apple-touch-icon", href: BRAND.logoOnLight }
    ].forEach((definition) => {
      const link = document.createElement("link");
      Object.assign(link, definition);
      link.dataset.easyfileFavicon = "";
      document.head.appendChild(link);
    });
  }

  function boot() {
    ensureSharedStyles();
    applyTheme(initialTheme());
    applyLayoutHooks();
    installNavigation();
    installFavicons();

    if (MODULE_FILES.has(current)) ensureScript("assets/js/easyfile-module-actions.js", "easyfileModuleActions");
    if (referralEnabledPage) {
      ensureScript("assets/js/easyfile-referral-compat.js", "easyfileReferralCompat");
      const configScript = ensureScript("assets/js/easyfile-referral-config.js", "easyfileReferralConfig");
      const loadReferralGate = () => ensureScript("assets/js/easyfile-referrals.js", "easyfileReferrals");
      if (window.EASYFILE_REFERRAL_CONFIG) loadReferralGate();
      else configScript.addEventListener("load", loadReferralGate, { once: true });
    }
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
