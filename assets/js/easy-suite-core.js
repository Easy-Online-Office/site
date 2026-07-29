/* EasyFile shared core */
(function () {
  const BRAND = Object.freeze({
    name: "EasyFile",
    logoOnDark: "logo-w.png",
    logoOnLight: "logo-b.png"
  });

  const navMount = document.getElementById("easyNavMount");
  const headerMount = document.getElementById("easyHeaderMount");

  function deriveModule() {
    if (window.EASY && typeof window.EASY === "object") return window.EASY;

    const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
    const map = [
      { k: "easy-quote",          badge: "Q",  title: "EasyQUOTE", subtitle: "Quote Generator" },
      { k: "easy-invoice",        badge: "I",  title: "EasyINV",   subtitle: "Invoice Generator" },
      { k: "easy-purchase-order", badge: "PO", title: "EasyPO",    subtitle: "Purchase Order Generator" },
      { k: "easy-sales-order",    badge: "SO", title: "EasySO",    subtitle: "Sales Order Generator" },
      { k: "easy-receipt",        badge: "R",  title: "EasyREC",   subtitle: "Receipt Generator" },
      { k: "easy-statement",      badge: "S",  title: "EasySTAT",  subtitle: "Statement Generator" },
      { k: "easy-job-card",       badge: "JC", title: "EasyJC",    subtitle: "Job Card Manager" },
      { k: "easy-payroll",        badge: "P",  title: "EasyPAY",   subtitle: "Payroll Manager" },
      { k: "easy-inventory",      badge: "IV", title: "EasyINVTR", subtitle: "Inventory Manager" },
      { k: "easy-crm",            badge: "C",  title: "EasyCRM",   subtitle: "CRM Manager" },
      { k: "index",               badge: "EF", title: "EasyFile",  subtitle: "Practical business tools" }
    ];

    for (const module of map) {
      if (file.includes(module.k)) return module;
    }

    return { badge: "EF", title: "EasyFile", subtitle: "Practical business tools" };
  }

  async function injectPartial(mount, url) {
    if (!mount) return;
    const response = await fetch(url, { cache: "no-store" });
    if (!response.ok) return;
    mount.innerHTML = await response.text();
  }

  function brandLogoMarkup(variant = "on-dark") {
    const source = variant === "on-light" ? BRAND.logoOnLight : BRAND.logoOnDark;
    return `<img src="${source}" alt="" width="40" height="40" decoding="async" class="h-10 w-10 object-contain" data-easyfile-logo data-logo-variant="${variant}"><span>${BRAND.name}</span>`;
  }

  function replaceIdentityWithLogo(identity, source = BRAND.logoOnLight) {
    if (!identity) return;

    identity.textContent = "";
    identity.classList.remove("bg-blue-600", "text-white", "font-black");

    const image = document.createElement("img");
    image.src = source;
    image.alt = "";
    image.width = 40;
    image.height = 40;
    image.decoding = "async";
    image.className = "h-10 w-10 object-contain";
    image.dataset.easyfileLogo = "";
    image.dataset.logoVariant = "on-light";
    identity.appendChild(image);
  }

  function ensureFavicons() {
    document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => link.remove());

    const definitions = [
      { rel: "icon", href: BRAND.logoOnLight, type: "image/png" },
      { rel: "icon", href: BRAND.logoOnLight, type: "image/png", media: "(prefers-color-scheme: light)" },
      { rel: "icon", href: BRAND.logoOnDark, type: "image/png", media: "(prefers-color-scheme: dark)" },
      { rel: "apple-touch-icon", href: BRAND.logoOnLight }
    ];

    definitions.forEach((definition) => {
      const link = document.createElement("link");
      link.rel = definition.rel;
      link.href = definition.href;
      if (definition.type) link.type = definition.type;
      if (definition.media) link.media = definition.media;
      link.dataset.easyfileFavicon = "";
      document.head.appendChild(link);
    });
  }

  function applyBranding() {
    document.querySelectorAll('nav a[href="index.html"], nav a[href="./"], nav a[href="/"]').forEach((anchor) => {
      if (!/easy\s*(suite|file)/i.test(anchor.textContent || "")) return;
      anchor.classList.add("inline-flex", "items-center", "gap-2");
      anchor.setAttribute("aria-label", `${BRAND.name} home`);
      anchor.innerHTML = brandLogoMarkup("on-dark");
    });

    document.querySelectorAll("header h1").forEach((heading) => {
      const headingText = (heading.textContent || "").trim();
      if (!/^easy/i.test(headingText)) return;

      if (/^easy\s*suite$/i.test(headingText)) heading.textContent = BRAND.name;

      const identity = heading.parentElement?.previousElementSibling;
      if (!identity || !identity.matches(".h-10.w-10")) return;
      replaceIdentityWithLogo(identity, BRAND.logoOnLight);
    });

    document.querySelectorAll("img[data-easyfile-logo]").forEach((image) => {
      const inNavigation = Boolean(image.closest("nav"));
      image.src = inNavigation ? BRAND.logoOnDark : BRAND.logoOnLight;
      image.dataset.logoVariant = inNavigation ? "on-dark" : "on-light";
    });
  }

  async function boot() {
    try {
      await injectPartial(navMount, "partials/easy-nav.html");
      await injectPartial(headerMount, "partials/easy-header.html");

      const config = deriveModule();
      const badge = document.getElementById("easyBadge");
      const title = document.getElementById("easyTitle");
      const subtitle = document.getElementById("easySubtitle");

      if (badge) {
        if (badge.tagName === "IMG") {
          badge.src = BRAND.logoOnLight;
          badge.alt = "";
        } else {
          replaceIdentityWithLogo(badge, BRAND.logoOnLight);
        }
      }
      if (title) title.textContent = config.title || BRAND.name;
      if (subtitle) subtitle.textContent = config.subtitle || "Practical business tools";

      ensureFavicons();
      applyBranding();
    } catch (error) {
      console.warn("EasyFile core load warning:", error);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
