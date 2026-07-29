/* EasyFile referral access gate */
(function () {
  "use strict";

  const MODULES = Object.freeze({
    "easy-quote.html": "quote",
    "easy-invoice.html": "invoice",
    "easy-purchase-order.html": "purchase-order",
    "easy-sales-order.html": "sales-order",
    "easy-receipt.html": "receipt",
    "easy-statement.html": "statement",
    "easy-job-card.html": "job-card",
    "easy-payroll.html": "payroll",
    "easy-inventory.html": "inventory",
    "easy-crm.html": "crm",
    "easy-asset-management.html": "asset-management",
    "easy-site-inspection.html": "site-inspection"
  });

  const CONFIG = Object.assign({
    apiBase: "https://api-easyfile.skunkworks.africa/api/referrals",
    referralsRequired: 3,
    statusPollMs: 30000,
    supportEmail: "support@easyfile.co.za"
  }, window.EASYFILE_REFERRAL_CONFIG || {});

  const KEYS = Object.freeze({
    email: "easyfile:referral:email",
    pendingCode: "easyfile:referral:pending-code",
    entitlement: "easyfile:referral:entitlement:v1"
  });

  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const moduleId = MODULES[file] || null;
  const referralPage = file === "referrals.html";
  const incomingCode = new URLSearchParams(location.search).get("ref");
  const qualifyingActions = /save|preview|print|pdf|word|excel|csv|export|download|generate/i;

  let entitlement = null;
  let email = localStorage.getItem(KEYS.email) || "";
  let useRequestSent = false;
  let pollingTimer = null;

  if (incomingCode) localStorage.setItem(KEYS.pendingCode, incomingCode.trim().toUpperCase());

  function apiUrl(path) {
    return `${String(CONFIG.apiBase).replace(/\/$/, "")}/${String(path).replace(/^\//, "")}`;
  }

  async function request(path, payload) {
    const response = await fetch(apiUrl(path), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload)
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const error = new Error(data.error || `Referral service returned ${response.status}.`);
      error.status = response.status;
      error.payload = data;
      throw error;
    }
    return data;
  }

  function saveEntitlement(value) {
    entitlement = value;
    try {
      localStorage.setItem(KEYS.entitlement, JSON.stringify(value));
    } catch (_) {
      // Storage can be blocked in privacy-focused browser modes.
    }
  }

  function cachedEntitlement() {
    try {
      return JSON.parse(localStorage.getItem(KEYS.entitlement) || "null");
    } catch (_) {
      return null;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function accessLabel(access) {
    if (access === "unlocked") return "Referral access unlocked";
    if (access === "locked") return "Referral access required";
    return "One free module use available";
  }

  function progress(value) {
    const required = Number(value?.referralsRequired || CONFIG.referralsRequired || 3);
    const qualified = Math.min(required, Number(value?.referralsQualified || 0));
    return { required, qualified, percent: required ? Math.round((qualified / required) * 100) : 100 };
  }

  function referralLink(code) {
    const url = new URL("index.html", location.href);
    url.search = "";
    url.hash = "";
    url.searchParams.set("ref", code);
    return url.href;
  }

  function button(label, className, attributes = "") {
    return `<button type="button" class="easyfile-referral-button ${className}" ${attributes}>${label}</button>`;
  }

  function showMessage(message, isError = false) {
    const target = document.querySelector("[data-referral-message]");
    if (target) {
      target.textContent = message;
      target.classList.toggle("easyfile-referral-error", isError);
      target.classList.toggle("easyfile-referral-success", !isError);
      return;
    }

    let toast = document.querySelector(".easyfile-action-toast[data-referral-toast]");
    if (toast) toast.remove();
    toast = document.createElement("div");
    toast.className = "easyfile-action-toast";
    toast.dataset.referralToast = "";
    toast.setAttribute("role", "status");
    toast.textContent = message;
    document.body.appendChild(toast);
    window.setTimeout(() => toast.remove(), 3200);
  }

  function identityModal(message = "Enter your email to start your one free EasyFile use and manage referral access.") {
    return new Promise((resolve) => {
      const existing = document.getElementById("easyfileReferralIdentity");
      if (existing) existing.remove();

      const modal = document.createElement("section");
      modal.id = "easyfileReferralIdentity";
      modal.className = "easyfile-referral-modal no-print";
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-labelledby", "easyfileReferralIdentityTitle");
      modal.innerHTML = `
        <div class="easyfile-referral-panel">
          <h2 id="easyfileReferralIdentityTitle">Start using EasyFile</h2>
          <p>${escapeHtml(message)}</p>
          <form data-referral-identity-form>
            <div class="easyfile-referral-field">
              <label for="easyfileReferralEmail">Email address</label>
              <input id="easyfileReferralEmail" type="email" autocomplete="email" required
                placeholder="you@example.com" value="${escapeHtml(email)}">
            </div>
            <p class="easyfile-referral-message" data-referral-identity-message aria-live="polite"></p>
            <div class="easyfile-referral-actions">
              ${button("Continue", "easyfile-referral-button--primary", "type=\"submit\"")}
            </div>
          </form>
          <p class="text-xs">Your email is used to identify one referral account. The API stores a one-way hash rather than the plain address.</p>
        </div>`;

      document.body.appendChild(modal);
      const form = modal.querySelector("form");
      const input = modal.querySelector("input");
      const status = modal.querySelector("[data-referral-identity-message]");
      input.focus();

      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(value)) {
          status.textContent = "Enter a valid email address.";
          status.className = "easyfile-referral-message easyfile-referral-error";
          return;
        }
        email = value;
        localStorage.setItem(KEYS.email, value);
        modal.remove();
        resolve(value);
      });
    });
  }

  async function ensureIdentity() {
    if (/^\S+@\S+\.\S+$/.test(email)) return email;
    return identityModal();
  }

  async function loadSession(options = {}) {
    const userEmail = await ensureIdentity();
    const referralCode = localStorage.getItem(KEYS.pendingCode) || undefined;
    const value = await request("session", {
      email: userEmail,
      referralCode,
      page: file,
      refresh: Boolean(options.refresh)
    });
    localStorage.removeItem(KEYS.pendingCode);
    saveEntitlement(value);
    render(value);
    return value;
  }

  function renderBar(value) {
    if (!moduleId) return;
    const existing = document.getElementById("easyfileReferralBar");
    if (existing) existing.remove();

    const p = progress(value);
    const bar = document.createElement("section");
    bar.id = "easyfileReferralBar";
    bar.className = "easyfile-referral-bar no-print";
    bar.setAttribute("aria-label", "EasyFile referral access status");
    bar.innerHTML = `
      <div>
        <strong>${escapeHtml(accessLabel(value.access))}</strong>
        <p>${p.qualified} of ${p.required} referred users have completed an EasyFile use.</p>
      </div>
      <div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}">
        <span style="width:${p.percent}%"></span>
      </div>
      <div class="easyfile-referral-actions">
        ${button("Referral status", "easyfile-referral-button--secondary", "data-referral-open")}
        ${button("Refresh", "easyfile-referral-button--secondary", "data-referral-refresh")}
      </div>`;

    const nav = document.querySelector(".easyfile-nav, nav[aria-label='Primary navigation']");
    if (nav) nav.insertAdjacentElement("afterend", bar);
    else document.body.insertBefore(bar, document.body.firstChild);

    bar.querySelector("[data-referral-open]").addEventListener("click", () => openStatusPanel(value));
    bar.querySelector("[data-referral-refresh]").addEventListener("click", refreshStatus);
  }

  function openStatusPanel(value = entitlement) {
    if (!value) return;
    const existing = document.getElementById("easyfileReferralStatusModal");
    if (existing) existing.remove();
    const p = progress(value);
    const link = referralLink(value.referralCode);
    const modal = document.createElement("section");
    modal.id = "easyfileReferralStatusModal";
    modal.className = "easyfile-referral-modal no-print";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `
      <div class="easyfile-referral-panel">
        <h2>${escapeHtml(accessLabel(value.access))}</h2>
        <p>Share your unique link. Three different people must open EasyFile through it and complete a qualifying module action before your access is unlocked.</p>
        <div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}">
          <span style="width:${p.percent}%"></span>
        </div>
        <p><strong>${p.qualified} / ${p.required} referrals completed</strong></p>
        <div class="easyfile-referral-share">
          <input type="text" readonly value="${escapeHtml(link)}" aria-label="Referral link">
          ${button("Copy link", "easyfile-referral-button--primary", "data-copy-referral")}
        </div>
        <p class="easyfile-referral-message" data-referral-message aria-live="polite"></p>
        <div class="easyfile-referral-actions">
          ${button("Refresh status", "easyfile-referral-button--secondary", "data-refresh-referral")}
          <a class="easyfile-referral-button easyfile-referral-button--secondary" href="referrals.html">Open referral dashboard</a>
          ${button("Close", "easyfile-referral-button--secondary", "data-close-referral")}
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-copy-referral]").addEventListener("click", () => copyReferralLink(value.referralCode));
    modal.querySelector("[data-refresh-referral]").addEventListener("click", refreshStatus);
    modal.querySelector("[data-close-referral]").addEventListener("click", () => modal.remove());
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  }

  function renderLock(value, serviceError = "") {
    if (!moduleId) return;
    let overlay = document.getElementById("easyfileReferralLock");
    if (overlay) overlay.remove();
    const p = progress(value || {});
    const code = value?.referralCode || "";
    const link = code ? referralLink(code) : "";
    overlay = document.createElement("section");
    overlay.id = "easyfileReferralLock";
    overlay.className = "easyfile-referral-overlay no-print";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `
      <div class="easyfile-referral-panel">
        <h2>${serviceError ? "Access could not be verified" : "Refer 3 people to continue"}</h2>
        <p>${serviceError
          ? escapeHtml(serviceError)
          : "Your one free EasyFile module use is complete. Your access will unlock when three different people use EasyFile through your referral link."}</p>
        ${code ? `
          <div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}">
            <span style="width:${p.percent}%"></span>
          </div>
          <p><strong>${p.qualified} of ${p.required} referrals completed</strong></p>
          <div class="easyfile-referral-share">
            <input type="text" readonly value="${escapeHtml(link)}" aria-label="Referral link">
            ${button("Copy link", "easyfile-referral-button--primary", "data-copy-referral")}
          </div>` : ""}
        <p class="easyfile-referral-message" data-referral-message aria-live="polite"></p>
        <div class="easyfile-referral-actions">
          ${button("Refresh access", "easyfile-referral-button--primary", "data-refresh-referral")}
          <a class="easyfile-referral-button easyfile-referral-button--secondary" href="referrals.html">Referral dashboard</a>
          ${button("Use another email", "easyfile-referral-button--secondary", "data-change-email")}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-copy-referral]")?.addEventListener("click", () => copyReferralLink(code));
    overlay.querySelector("[data-refresh-referral]").addEventListener("click", refreshStatus);
    overlay.querySelector("[data-change-email]").addEventListener("click", changeEmail);
  }

  function removeLock() {
    document.getElementById("easyfileReferralLock")?.remove();
  }

  function renderDashboard(value) {
    if (!referralPage) return;
    const p = progress(value);
    const link = referralLink(value.referralCode);
    document.querySelectorAll("[data-referral-access]").forEach((el) => { el.textContent = accessLabel(value.access); });
    document.querySelectorAll("[data-referral-count]").forEach((el) => { el.textContent = `${p.qualified} / ${p.required}`; });
    document.querySelectorAll("[data-referral-code]").forEach((el) => { el.textContent = value.referralCode; });
    document.querySelectorAll("[data-referral-link]").forEach((el) => { el.value = link; });
    document.querySelectorAll("[data-referral-progress]").forEach((el) => {
      el.style.width = `${p.percent}%`;
      el.parentElement?.setAttribute("aria-valuenow", String(p.qualified));
      el.parentElement?.setAttribute("aria-valuemax", String(p.required));
    });
  }

  function render(value) {
    renderBar(value);
    renderDashboard(value);
    if (moduleId && value.access === "locked") renderLock(value);
    else removeLock();
    schedulePolling(value.access === "locked");
  }

  async function copyReferralLink(code) {
    const link = referralLink(code);
    try {
      await navigator.clipboard.writeText(link);
      showMessage("Referral link copied.");
    } catch (_) {
      const input = document.querySelector("[data-referral-link], .easyfile-referral-share input");
      if (input) {
        input.select();
        document.execCommand("copy");
        showMessage("Referral link copied.");
      }
    }
  }

  async function refreshStatus() {
    try {
      showMessage("Refreshing referral status…");
      const value = await loadSession({ refresh: true });
      if (value.access === "unlocked") showMessage("Access unlocked. You can use all EasyFile modules.");
      else showMessage(`Referral status refreshed: ${value.referralsQualified}/${value.referralsRequired}.`);
    } catch (error) {
      showMessage(error.message || "Could not refresh referral status.", true);
    }
  }

  function changeEmail() {
    localStorage.removeItem(KEYS.email);
    localStorage.removeItem(KEYS.entitlement);
    email = "";
    entitlement = null;
    document.getElementById("easyfileReferralLock")?.remove();
    document.getElementById("easyfileReferralStatusModal")?.remove();
    identityModal("Enter the email attached to the EasyFile referral account you want to use.")
      .then(() => loadSession())
      .catch(() => {});
  }

  function actionFromElement(element) {
    if (!element) return "";
    const explicit = element.dataset?.easyfileAction || element.dataset?.action || element.dataset?.act || "";
    const text = `${explicit} ${element.id || ""} ${element.getAttribute?.("aria-label") || ""} ${element.textContent || ""}`;
    return text.replace(/\s+/g, " ").trim().toLowerCase();
  }

  async function recordUse(action) {
    if (!moduleId || useRequestSent || !entitlement || entitlement.access !== "trial") return;
    useRequestSent = true;
    try {
      const value = await request("use", { email, moduleId, event: action || "module-action" });
      saveEntitlement(value);
      render(value);
      showMessage(value.referralQualified
        ? "Your free use is complete and your referrer received one qualifying referral."
        : "Your one free EasyFile use is complete. Refer three people to continue.");
      if (value.access === "locked") window.setTimeout(() => renderLock(value), 900);
    } catch (error) {
      useRequestSent = false;
      if (error.status === 403 && error.payload) {
        saveEntitlement(error.payload);
        renderLock(error.payload);
      } else {
        showMessage("Your use could not be recorded. Check your connection before exporting or printing.", true);
      }
    }
  }

  function bindQualifyingUse() {
    if (!moduleId) return;
    document.addEventListener("click", (event) => {
      const element = event.target.closest("button, a, [role='button']");
      const action = actionFromElement(element);
      if (qualifyingActions.test(action)) window.setTimeout(() => recordUse(action), 100);
    }, true);

    window.addEventListener("easyfile:qualifying-use", (event) => {
      recordUse(String(event.detail?.action || "module-action"));
    });
  }

  function schedulePolling(enabled) {
    if (pollingTimer) {
      clearInterval(pollingTimer);
      pollingTimer = null;
    }
    if (!enabled) return;
    pollingTimer = window.setInterval(() => loadSession({ refresh: true }).catch(() => {}), Number(CONFIG.statusPollMs) || 30000);
  }

  function bindDashboardActions() {
    document.querySelectorAll("[data-copy-referral]").forEach((element) => {
      element.addEventListener("click", () => entitlement && copyReferralLink(entitlement.referralCode));
    });
    document.querySelectorAll("[data-refresh-referral]").forEach((element) => {
      element.addEventListener("click", refreshStatus);
    });
    document.querySelectorAll("[data-change-email]").forEach((element) => {
      element.addEventListener("click", changeEmail);
    });
  }

  async function boot() {
    if (!moduleId && !referralPage && !incomingCode) return;
    bindQualifyingUse();
    bindDashboardActions();

    try {
      await loadSession();
    } catch (error) {
      const cached = cachedEntitlement();
      if (cached?.access === "unlocked") {
        entitlement = cached;
        render(cached);
        showMessage("Referral service is temporarily unavailable. Cached unlocked access is active.", true);
        return;
      }

      const message = `EasyFile could not verify referral access. ${error.message || "Check your connection."}`;
      if (moduleId) renderLock(cached || {}, message);
      else showMessage(message, true);
    }
  }

  window.EasyFileReferrals = Object.freeze({
    refresh: refreshStatus,
    open: () => openStatusPanel(entitlement),
    changeEmail,
    getStatus: () => entitlement
  });

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot, { once: true });
  else boot();
})();
