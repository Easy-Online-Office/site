/* Easy Suite core (shared) */
(function () {
  const navMount = document.getElementById("easyNavMount");
  const headerMount = document.getElementById("easyHeaderMount");

  function deriveModule() {
    // Prefer explicit config if present:
    if (window.EASY && typeof window.EASY === "object") return window.EASY;

    // Otherwise infer from filename:
    const file = (location.pathname.split("/").pop() || "").toLowerCase();
    const map = [
      { k: "easy-quote",        badge: "Q",  title: "EasyQUOTE", subtitle: "Quote Generator" },
      { k: "easy-invoice",      badge: "I",  title: "EasyINV",   subtitle: "Invoice Generator" },
      { k: "easy-purchase-order", badge:"PO", title: "EasyPO",    subtitle: "Purchase Order Generator" },
      { k: "easy-sales-order",  badge: "SO", title: "EasySO",    subtitle: "Sales Order Generator" },
      { k: "easy-receipt",      badge: "R",  title: "EasyREC",   subtitle: "Receipt Generator" },
      { k: "easy-statement",    badge: "S",  title: "EasySTAT",  subtitle: "Statement Generator" },
      { k: "easy-job-card",     badge: "JC", title: "EasyJC",    subtitle: "Job Card Manager" },
      { k: "easy-payroll",      badge: "P",  title: "EasyPAY",   subtitle: "Payroll Manager" },
      { k: "easy-inventory",    badge: "IV", title: "EasyINVTR", subtitle: "Inventory Manager" },
      { k: "easy-crm",          badge: "C",  title: "EasyCRM",   subtitle: "CRM Manager" },
      { k: "index",             badge: "ES", title: "Easy Suite",subtitle: "Dashboard" }
    ];
    for (const m of map) if (file.includes(m.k)) return m;
    return { badge:"ES", title:"Easy Suite", subtitle:"Feature-Rich Document Generator" };
  }

  async function injectPartial(mount, url) {
    if (!mount) return;
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) return;
    mount.innerHTML = await res.text();
  }

  async function boot() {
    try {
      await injectPartial(navMount, "partials/easy-nav.html");
      await injectPartial(headerMount, "partials/easy-header.html");

      // Apply per-page identity to header
      const cfg = deriveModule();
      const badge = document.getElementById("easyBadge");
      const title = document.getElementById("easyTitle");
      const sub = document.getElementById("easySubtitle");
      if (badge) badge.textContent = cfg.badge || "ES";
      if (title) title.textContent = cfg.title || "Easy Suite";
      if (sub) sub.textContent = cfg.subtitle || "Feature-Rich Document Generator";
    } catch (e) {
      // Fail silently; pages still load
      console.warn("Easy Suite core load warning:", e);
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
