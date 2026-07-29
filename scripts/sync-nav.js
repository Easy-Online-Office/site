document.addEventListener("DOMContentLoaded", () => {
  const BRAND = Object.freeze({
    name: "EasyFile",
    logoOnDark: "logo-w.png",
    logoOnLight: "logo-b.png"
  });

  const MODULE_FILES = new Set([
    "easy-quote.html",
    "easy-invoice.html",
    "easy-purchase-order.html",
    "easy-sales-order.html",
    "easy-receipt.html",
    "easy-statement.html",
    "easy-job-card.html",
    "easy-payroll.html",
    "easy-inventory.html",
    "easy-crm.html",
    "easy-asset-management.html",
    "easy-site-inspection.html"
  ]);

  const SHARED_STYLES = Object.freeze([
    "assets/css/easyfile-brand-tokens.css",
    "assets/css/easyfile-site.css"
  ]);

  const current = (location.pathname.split("/").pop() || "index.html").toLowerCase();

  function ensureSharedStyles() {
    SHARED_STYLES.forEach((href) => {
      const existing = Array.from(document.querySelectorAll('link[rel="stylesheet"]'))
        .find((link) => (link.getAttribute("href") || "").endsWith(href));
      if (existing) return;

      const link = document.createElement("link");
      link.rel = "stylesheet";
      link.href = href;
      link.dataset.easyfileSharedStyle = "";
      document.head.appendChild(link);
    });
  }

  function applyLayoutHooks() {
    document.body.classList.add("easyfile-app");

    document.querySelectorAll('nav[aria-label="Primary navigation"], nav.bg-blue-600').forEach((nav) => {
      nav.classList.add("easyfile-nav");
    });

    const main = document.querySelector("main");
    if (main) main.classList.add("easyfile-main");

    const pageHeader = document.querySelector("body > header, main > header");
    if (pageHeader) pageHeader.classList.add("easyfile-page-header");
  }

  ensureSharedStyles();
  applyLayoutHooks();

  const links = document.querySelectorAll("nav a");
  links.forEach((link) => {
    const href = (link.getAttribute("href") || "").split("#")[0].toLowerCase();
    if (href === current) {
      link.classList.add("underline", "font-extrabold");
      link.setAttribute("aria-current", "page");
    } else {
      link.removeAttribute("aria-current");
    }
  });

  const brandLinks = document.querySelectorAll('nav a[href="index.html"], nav a[href="./"], nav a[href="/"]');
  brandLinks.forEach((link) => {
    if (!/easy\s*(suite|file)/i.test(link.textContent || "")) return;

    link.classList.add("inline-flex", "items-center", "gap-2");
    link.setAttribute("aria-label", `${BRAND.name} home`);
    link.innerHTML = [
      `<img src="${BRAND.logoOnDark}" alt="" width="40" height="40" decoding="async"`,
      ' class="h-10 w-10 object-contain easyfile-brand-logo" data-easyfile-logo data-logo-variant="on-dark">',
      `<span>${BRAND.name}</span>`
    ].join("");
  });

  document.querySelectorAll("header h1").forEach((heading) => {
    const headingText = (heading.textContent || "").trim();
    if (!/^easy/i.test(headingText)) return;

    if (/^easy\s*suite$/i.test(headingText)) heading.textContent = BRAND.name;

    const identity = heading.parentElement?.previousElementSibling;
    if (!identity || !identity.matches(".h-10.w-10")) return;

    identity.textContent = "";
    identity.classList.remove("bg-blue-600", "text-white", "font-black");
    identity.innerHTML = `<img src="${BRAND.logoOnLight}" alt="" width="40" height="40" decoding="async" class="h-10 w-10 object-contain easyfile-brand-logo" data-easyfile-logo data-logo-variant="on-light">`;
  });

  document.querySelectorAll("img[data-easyfile-logo]").forEach((image) => {
    const inNavigation = Boolean(image.closest("nav"));
    image.src = inNavigation ? BRAND.logoOnDark : BRAND.logoOnLight;
    image.dataset.logoVariant = inNavigation ? "on-dark" : "on-light";
  });

  document.querySelectorAll('link[rel="icon"], link[rel="shortcut icon"], link[rel="apple-touch-icon"]').forEach((link) => link.remove());

  [
    { rel: "icon", href: BRAND.logoOnLight, type: "image/png" },
    { rel: "icon", href: BRAND.logoOnLight, type: "image/png", media: "(prefers-color-scheme: light)" },
    { rel: "icon", href: BRAND.logoOnDark, type: "image/png", media: "(prefers-color-scheme: dark)" },
    { rel: "apple-touch-icon", href: BRAND.logoOnLight }
  ].forEach((definition) => {
    const link = document.createElement("link");
    link.rel = definition.rel;
    link.href = definition.href;
    if (definition.type) link.type = definition.type;
    if (definition.media) link.media = definition.media;
    link.dataset.easyfileFavicon = "";
    document.head.appendChild(link);
  });

  if (MODULE_FILES.has(current) && !document.querySelector('script[data-easyfile-module-actions]')) {
    const actionsScript = document.createElement("script");
    actionsScript.src = "assets/js/easyfile-module-actions.js";
    actionsScript.dataset.easyfileModuleActions = "";
    document.head.appendChild(actionsScript);
  }
});
