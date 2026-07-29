/* EasyFile shared core */
(function () {
  const BRAND = Object.freeze({
    name: "EasyFile",
    logo: "icon.png"
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
      { k: "index",               badge: "EF", title: "EasyFile",  subtitle: "Easy Suite Dashboard" }
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

  function brandLogoMarkup() {
    return `<img src="${BRAND.logo}" alt="" width="40" height="40" decoding="async" class="h-10 w-10 rounded-xl object-contain bg-white bg-opacity-10" data-easyfile-logo><span>${BRAND.name}</span>`;
  }

  function applyBranding() {
    document.querySelectorAll('nav a[href="index.html"], nav a[href="./"], nav a[href="/"]').forEach((anchor) => {
      if (!/easy\s*(suite|file)/i.test(anchor.textContent || "")) return;
      anchor.classList.add("inline-flex", "items-center", "gap-2");
      anchor.setAttribute("aria-label", `${BRAND.name} home`);
      anchor.innerHTML = brandLogoMarkup();
    });

    document.querySelectorAll("h1").forEach((heading) => {
      if (!/^easy\s*suite$/i.test((heading.textContent || "").trim())) return;
      heading.textContent = BRAND.name;

      const identity = heading.parentElement?.previousElementSibling;
      if (!identity) return;

      identity.textContent = "";
      const image = document.createElement("img");
      image.src = BRAND.logo;
      image.alt = "";
      image.width = 40;
      image.height = 40;
      image.decoding = "async";
      image.className = "h-10 w-10 rounded-xl object-contain";
      image.dataset.easyfileLogo = "";
      identity.appendChild(image);
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

      if (badge) badge.textContent = config.badge || "EF";
      if (title) title.textContent = config.title || BRAND.name;
      if (subtitle) subtitle.textContent = config.subtitle || "Practical business tools";

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
