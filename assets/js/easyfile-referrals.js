/* EasyFile referral access gate v2 */
(function () {
  "use strict";

  const C = Object.assign({
    apiBase: "https://api-easyfile.skunkworks.africa/api/referrals",
    referralsRequired: 3,
    statusPollMs: 30000,
    requestTimeoutMs: 10000,
    allowOfflineUnlockedAccess: false,
    qualifyingClickFallback: true,
    referralCodePattern: "^[A-Z0-9][A-Z0-9_-]{5,31}$",
    clientVersion: "2.0.0"
  }, window.EASYFILE_REFERRAL_CONFIG || {});
  const K = {
    email: "easyfile:referral:email",
    pending: "easyfile:referral:pending-code",
    entitlement: "easyfile:referral:entitlement:v2"
  };
  const file = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const moduleId = /^easy-[a-z0-9][a-z0-9-]*\.html$/.test(file)
    ? file.slice(5, -5)
    : null;
  const dashboard = file === "referrals.html";
  const query = new URLSearchParams(location.search);
  const referralEntry = query.has("ref");
  const actions = /save|preview|print|pdf|word|excel|csv|export|download|generate/i;
  let email = localStorage.getItem(K.email) || "";
  let state = null;
  let usePending = false;
  let poll = null;

  const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (x) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[x]));
  const id = () => crypto?.randomUUID?.() || `ef-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const api = (p) => `${String(C.apiBase).replace(/\/$/, "")}/${String(p).replace(/^\//, "")}`;

  function code(value) {
    const normal = String(value || "").trim().toUpperCase();
    if (!normal) return "";
    try { return new RegExp(C.referralCodePattern).test(normal) ? normal : ""; }
    catch { return /^[A-Z0-9][A-Z0-9_-]{5,31}$/.test(normal) ? normal : ""; }
  }

  const incoming = code(query.get("ref"));
  if (referralEntry) {
    if (incoming) localStorage.setItem(K.pending, incoming);
    else localStorage.removeItem(K.pending);
  }

  function validate(value) {
    if (!value || !["trial", "locked", "unlocked"].includes(value.access)) {
      throw new Error("Referral service returned an invalid access state.");
    }
    const referralCode = code(value.referralCode);
    if (!referralCode) throw new Error("Referral service returned an invalid referral code.");
    const required = Math.max(1, Number(value.referralsRequired || C.referralsRequired || 3));
    const qualified = Math.max(0, Math.min(required, Number(value.referralsQualified || 0)));
    return { ...value, referralCode, referralsRequired: required, referralsQualified: qualified, cachedAt: new Date().toISOString() };
  }

  async function post(path, payload) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.max(1000, Number(C.requestTimeoutMs) || 10000));
    try {
      const response = await fetch(api(path), {
        method: "POST", mode: "cors", credentials: "omit", cache: "no-store",
        referrerPolicy: "strict-origin-when-cross-origin",
        headers: { "Accept": "application/json", "Content-Type": "application/json", "X-EasyFile-Client": C.clientVersion },
        body: JSON.stringify(payload), signal: controller.signal
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) {
        const error = new Error(body.error || `Referral service returned ${response.status}.`);
        error.status = response.status;
        error.payload = body;
        throw error;
      }
      return validate(body);
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Referral service timed out. Please retry.");
      throw error;
    } finally { clearTimeout(timer); }
  }

  function save(value) {
    state = value;
    try { localStorage.setItem(K.entitlement, JSON.stringify(value)); } catch {}
  }
  function cached() {
    try { return JSON.parse(localStorage.getItem(K.entitlement) || "null"); } catch { return null; }
  }
  function offlineAllowed(value) {
    if (!C.allowOfflineUnlockedAccess || value?.access !== "unlocked") return false;
    if (!value.entitlementToken || !value.entitlementExpiresAt) return false;
    return Date.parse(value.entitlementExpiresAt) > Date.now();
  }
  function progress(value = {}) {
    const required = Math.max(1, Number(value.referralsRequired || C.referralsRequired || 3));
    const qualified = Math.max(0, Math.min(required, Number(value.referralsQualified || 0)));
    return { required, qualified, percent: Math.round((qualified / required) * 100) };
  }
  function label(access) {
    return access === "unlocked" ? "Referral access unlocked"
      : access === "locked" ? "Referral access required"
      : "One free module use available";
  }
  function link(referralCode) {
    const url = new URL("index.html", location.href);
    url.search = ""; url.hash = ""; url.searchParams.set("ref", code(referralCode));
    return url.href;
  }
  function btn(text, cls, attrs = "") {
    return `<button type="button" class="easyfile-referral-button ${cls}" ${attrs}>${text}</button>`;
  }
  function message(text, error = false) {
    const target = document.querySelector("[data-referral-message]");
    if (target) {
      target.textContent = text;
      target.className = `easyfile-referral-message ${error ? "easyfile-referral-error" : "easyfile-referral-success"}`;
      return;
    }
    document.querySelector("[data-referral-toast]")?.remove();
    const toast = document.createElement("div");
    toast.className = "easyfile-action-toast"; toast.dataset.referralToast = "";
    toast.setAttribute("role", error ? "alert" : "status"); toast.textContent = text;
    if (error) toast.style.background = "#b91c1c";
    document.body.appendChild(toast); setTimeout(() => toast.remove(), 4200);
  }
  function acknowledgeReferral(value = {}) {
    if (!referralEntry) return;

    const reason = String(value.referralReason || "");
    const accepted = value.referralAccepted === true;
    let title = "Referral link received";
    let detail = "Your referral code was received, but it has not earned credit yet.";
    let action = `<a class="easyfile-referral-button easyfile-referral-button--primary" href="easy-quote.html">Start your free use</a>`;

    if (accepted) {
      title = "Referral link accepted";
      detail = `You are now linked to referral code ${esc(incoming)}. Your referrer will receive credit after you complete your first qualifying Save, Preview, Print or Export action.`;
    } else if (reason === "self-referral") {
      title = "Self-referral not accepted";
      detail = "This referral code belongs to the email already active in this browser. Use a different person’s email address to test or qualify the referral.";
      action = btn("Use a different email", "easyfile-referral-button--primary", "data-referral-change");
    } else if (reason === "already-bound") {
      title = value.referred ? "Referral account already linked" : "Referral link not applied";
      detail = value.referred
        ? "This email is already linked to a referrer. Referral links cannot replace an existing referral relationship."
        : "This account has already used EasyFile, so a new referral code cannot be attached.";
    } else if (reason === "invalid" || !incoming) {
      title = "Referral link not recognised";
      detail = "The referral code is invalid or no longer available. Ask the person who referred you to copy a fresh link from their EasyFile referral dashboard.";
      action = `<a class="easyfile-referral-button easyfile-referral-button--primary" href="referrals.html">Open referral dashboard</a>`;
    } else if (reason === "concurrent-update") {
      title = "Referral confirmation needs a retry";
      detail = "EasyFile received the referral while another account update was in progress. Refresh this page to confirm it.";
      action = btn("Refresh confirmation", "easyfile-referral-button--primary", "data-referral-refresh");
    }

    document.getElementById("easyfileReferralAcknowledgement")?.remove();
    const notice = document.createElement("section");
    notice.id = "easyfileReferralAcknowledgement";
    notice.className = "easyfile-referral-bar no-print";
    notice.setAttribute("role", accepted || reason === "already-bound" ? "status" : "alert");
    notice.setAttribute("aria-live", "polite");
    notice.innerHTML = `<div><strong>${esc(title)}</strong><p>${esc(detail)}</p></div>
      <div class="easyfile-referral-actions">${action}${btn("Dismiss", "easyfile-referral-button--secondary", "data-referral-dismiss")}</div>`;

    const nav = document.querySelector(".easyfile-nav");
    nav ? nav.insertAdjacentElement("afterend", notice) : document.body.prepend(notice);
    notice.querySelector("[data-referral-change]")?.addEventListener("click", changeEmail);
    notice.querySelector("[data-referral-refresh]")?.addEventListener("click", refresh);
    notice.querySelector("[data-referral-dismiss]")?.addEventListener("click", () => notice.remove());
  }

  function interactive(on) {
    if (!moduleId) return;
    const main = document.querySelector("main");
    if (!main) return;
    main.inert = !on; main.setAttribute("aria-busy", String(!on));
  }

  function identity(promptText = "Enter your email to start your one free EasyFile use and manage referral access.") {
    return new Promise((resolve) => {
      document.getElementById("easyfileReferralIdentity")?.remove();
      const modal = document.createElement("section");
      modal.id = "easyfileReferralIdentity"; modal.className = "easyfile-referral-modal no-print";
      modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `<div class="easyfile-referral-panel">
        <h2>Start using EasyFile</h2><p>${esc(promptText)}</p>
        <form><div class="easyfile-referral-field"><label for="easyfileReferralEmail">Email address</label>
        <input id="easyfileReferralEmail" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}" placeholder="you@example.com"></div>
        <p class="easyfile-referral-message" aria-live="polite"></p>
        <div class="easyfile-referral-actions">${btn("Continue", "easyfile-referral-button--primary", 'type="submit"')}</div></form>
        <p class="text-xs">Use an address you control. The production API should verify ownership with a one-time email link or OTP.</p></div>`;
      document.body.appendChild(modal);
      const form = modal.querySelector("form");
      const input = modal.querySelector("input");
      const status = modal.querySelector(".easyfile-referral-message");
      input.focus();
      form.addEventListener("submit", (event) => {
        event.preventDefault();
        const value = input.value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 254) {
          status.textContent = "Enter a valid email address."; status.classList.add("easyfile-referral-error"); return;
        }
        email = value; localStorage.setItem(K.email, value); modal.remove(); resolve(value);
      });
    });
  }

  async function session(refresh = false) {
    if (!/^\S+@\S+\.\S+$/.test(email)) await identity();
    const pendingReferral = code(localStorage.getItem(K.pending));
    const value = await post("session", {
      email, referralCode: pendingReferral || undefined,
      page: file, moduleId, refresh, requestId: id(), clientVersion: C.clientVersion
    });
    if (!pendingReferral || value.referralAccepted || ["already-bound", "invalid", "missing"].includes(value.referralReason)) {
      localStorage.removeItem(K.pending);
    }
    save(value); render(value); return value;
  }

  function statusBar(value) {
    if (!moduleId) return;
    document.getElementById("easyfileReferralBar")?.remove();
    const p = progress(value), bar = document.createElement("section");
    bar.id = "easyfileReferralBar"; bar.className = "easyfile-referral-bar no-print";
    bar.innerHTML = `<div><strong>${esc(label(value.access))}</strong><p>${p.qualified} of ${p.required} referred users qualified.</p></div>
      <div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}"><span style="width:${p.percent}%"></span></div>
      <div class="easyfile-referral-actions">${btn("Referral status", "easyfile-referral-button--secondary", "data-open")}${btn("Refresh", "easyfile-referral-button--secondary", "data-refresh")}</div>`;
    const nav = document.querySelector(".easyfile-nav");
    nav ? nav.insertAdjacentElement("afterend", bar) : document.body.prepend(bar);
    bar.querySelector("[data-open]").onclick = () => panel(value);
    bar.querySelector("[data-refresh]").onclick = refresh;
  }

  function lock(value = {}, error = "", checking = false) {
    if (!moduleId) return;
    interactive(false); document.getElementById("easyfileReferralLock")?.remove();
    const p = progress(value), referralCode = code(value.referralCode), overlay = document.createElement("section");
    overlay.id = "easyfileReferralLock"; overlay.className = "easyfile-referral-overlay no-print";
    overlay.setAttribute("role", "dialog"); overlay.setAttribute("aria-modal", "true");
    overlay.innerHTML = `<div class="easyfile-referral-panel"><h2>${checking ? "Checking referral access…" : error ? "Access could not be verified" : "Refer 3 people to continue"}</h2>
      <p>${checking ? "EasyFile is securely checking your referral entitlement." : error ? esc(error) : "Your free use is complete. Three different verified people must qualify through your referral link."}</p>
      ${!checking && referralCode ? `<div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}"><span style="width:${p.percent}%"></span></div>
      <p><strong>${p.qualified} of ${p.required} referrals completed</strong></p><div class="easyfile-referral-share"><input readonly value="${esc(link(referralCode))}">${btn("Copy link", "easyfile-referral-button--primary", "data-copy")}</div>` : ""}
      <p class="easyfile-referral-message" data-referral-message aria-live="polite"></p>
      ${checking ? "" : `<div class="easyfile-referral-actions">${btn("Refresh access", "easyfile-referral-button--primary", "data-refresh")}<a class="easyfile-referral-button easyfile-referral-button--secondary" href="referrals.html">Referral dashboard</a>${btn("Use another email", "easyfile-referral-button--secondary", "data-change")}</div>`}</div>`;
    document.body.appendChild(overlay);
    overlay.querySelector("[data-copy]")?.addEventListener("click", () => copy(referralCode));
    overlay.querySelector("[data-refresh]")?.addEventListener("click", refresh);
    overlay.querySelector("[data-change]")?.addEventListener("click", changeEmail);
  }
  function unlockUi() { document.getElementById("easyfileReferralLock")?.remove(); interactive(true); }

  function panel(value = state) {
    if (!value) return;
    document.getElementById("easyfileReferralStatusModal")?.remove();
    const p = progress(value), modal = document.createElement("section");
    modal.id = "easyfileReferralStatusModal"; modal.className = "easyfile-referral-modal no-print";
    modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
    modal.innerHTML = `<div class="easyfile-referral-panel"><h2>${esc(label(value.access))}</h2><p>Three different verified people must complete one qualifying module action.</p>
      <div class="easyfile-referral-progress" role="progressbar" aria-valuemin="0" aria-valuemax="${p.required}" aria-valuenow="${p.qualified}"><span style="width:${p.percent}%"></span></div>
      <p><strong>${p.qualified} / ${p.required} referrals completed</strong></p><div class="easyfile-referral-share"><input readonly value="${esc(link(value.referralCode))}">${btn("Copy link", "easyfile-referral-button--primary", "data-copy")}</div>
      <p class="easyfile-referral-message" data-referral-message aria-live="polite"></p><div class="easyfile-referral-actions">${btn("Refresh status", "easyfile-referral-button--secondary", "data-refresh")}<a class="easyfile-referral-button easyfile-referral-button--secondary" href="referrals.html">Dashboard</a>${btn("Close", "easyfile-referral-button--secondary", "data-close")}</div></div>`;
    document.body.appendChild(modal);
    modal.querySelector("[data-copy]").onclick = () => copy(value.referralCode);
    modal.querySelector("[data-refresh]").onclick = refresh;
    modal.querySelector("[data-close]").onclick = () => modal.remove();
    modal.onclick = (event) => { if (event.target === modal) modal.remove(); };
  }

  function dashboardUi(value) {
    if (!dashboard) return;
    const p = progress(value);
    document.querySelectorAll("[data-referral-access]").forEach((e) => e.textContent = label(value.access));
    document.querySelectorAll("[data-referral-count]").forEach((e) => e.textContent = `${p.qualified} / ${p.required}`);
    document.querySelectorAll("[data-referral-code]").forEach((e) => e.textContent = value.referralCode);
    document.querySelectorAll("[data-referral-link]").forEach((e) => e.value = link(value.referralCode));
    document.querySelectorAll("[data-referral-progress]").forEach((e) => { e.style.width = `${p.percent}%`; e.parentElement?.setAttribute("aria-valuenow", p.qualified); });
  }
  function render(value) {
    statusBar(value); dashboardUi(value);
    value.access === "locked" ? lock(value) : unlockUi();
    schedule(value.access === "locked");
  }

  async function copy(referralCode) {
    const value = link(referralCode);
    try { await navigator.clipboard.writeText(value); message("Referral link copied."); }
    catch {
      const input = document.querySelector("[data-referral-link], .easyfile-referral-share input");
      if (!input) return message("Copy failed. Select the link manually.", true);
      input.select(); const ok = document.execCommand("copy"); message(ok ? "Referral link copied." : "Copy failed. Select the link manually.", !ok);
    }
  }
  async function refresh() {
    try {
      message("Refreshing referral status…"); const value = await session(true);
      message(value.access === "unlocked" ? "Access unlocked." : `Referral status: ${value.referralsQualified}/${value.referralsRequired}.`);
    } catch (error) {
      message(error.message || "Could not refresh referral status.", true);
      if (moduleId) lock(state || cached() || {}, error.message || "Could not verify access.");
    }
  }
  function changeEmail() {
    localStorage.removeItem(K.email); localStorage.removeItem(K.entitlement); email = ""; state = null;
    document.getElementById("easyfileReferralLock")?.remove(); document.getElementById("easyfileReferralStatusModal")?.remove();
    identity("Enter the verified email attached to the referral account.")
      .then(() => session())
      .then((value) => { if (referralEntry) acknowledgeReferral(value); })
      .catch(() => {});
  }

  async function record(action) {
    if (!moduleId || usePending || state?.access !== "trial") return;
    usePending = true;
    try {
      const value = await post("use", {
        email, moduleId, event: action || "module-action", idempotencyKey: id(),
        occurredAt: new Date().toISOString(), page: file, clientVersion: C.clientVersion
      });
      save(value); render(value);
      message(value.referralQualified ? "Your referrer received one qualifying referral." : "Your free use is complete. Refer three people to continue.");
      if (value.access !== "locked") usePending = false;
    } catch (error) {
      usePending = false;
      if (error.status === 403 && error.payload) {
        try { const denied = validate(error.payload); save(denied); lock(denied); }
        catch { lock(state || {}, error.message || "Access denied."); }
      } else message("Your use could not be recorded. Check your connection before exporting or printing.", true);
    }
  }
  function bindUse() {
    if (!moduleId) return;
    window.addEventListener("easyfile:qualifying-use", (event) => record(String(event.detail?.action || "module-action")));
    if (!C.qualifyingClickFallback) return;
    document.addEventListener("click", (event) => {
      if (event.defaultPrevented) return;
      const element = event.target.closest("button, a, [role='button']");
      if (!element || element.disabled || element.closest(".easyfile-referral-modal, .easyfile-referral-bar, .easyfile-referral-overlay")) return;
      const action = `${element.dataset?.easyfileAction || ""} ${element.id || ""} ${element.getAttribute("aria-label") || ""} ${element.textContent || ""}`.replace(/\s+/g, " ").trim().toLowerCase();
      if (actions.test(action)) setTimeout(() => record(action), 150);
    });
  }
  function schedule(enabled) {
    if (poll) clearInterval(poll); poll = null;
    if (enabled) poll = setInterval(() => { if (document.visibilityState === "visible") session(true).catch(() => {}); }, Math.max(5000, Number(C.statusPollMs) || 30000));
  }
  function bindDashboard() {
    document.querySelectorAll("[data-copy-referral]").forEach((e) => e.onclick = () => state && copy(state.referralCode));
    document.querySelectorAll("[data-refresh-referral]").forEach((e) => e.onclick = refresh);
    document.querySelectorAll("[data-change-email]").forEach((e) => e.onclick = changeEmail);
  }

  async function boot() {
    if (!moduleId && !dashboard && !referralEntry) return;
    if (moduleId) lock({}, "", true);
    bindUse(); bindDashboard();
    if (referralEntry && !incoming) acknowledgeReferral({ referralReason: "invalid" });
    try {
      const value = await session();
      if (referralEntry && incoming) acknowledgeReferral(value);
    }
    catch (error) {
      const local = cached();
      if (offlineAllowed(local)) { state = local; render(local); return message("Signed offline entitlement active.", true); }
      const text = `EasyFile could not verify referral access. ${error.message || "Check your connection."}`;
      moduleId ? lock(local || {}, text) : message(text, true);
    }
  }

  window.EasyFileReferrals = Object.freeze({ refresh, open: () => panel(state), changeEmail, getStatus: () => state, recordUse: record });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();
})();
