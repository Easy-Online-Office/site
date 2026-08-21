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
    emailVerificationEnabled: false,
    emailSender: "referrals@easyfile.co.za",
    clientVersion: "2.1.0"
  }, window.EASYFILE_REFERRAL_CONFIG || {});
  const K = {
    email: "easyfile:referral:email",
    pending: "easyfile:referral:pending-code",
    entitlement: "easyfile:referral:entitlement:v2",
    verification: "easyfile:referral:verification:v1"
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

  function storedVerification(forEmail = email) {
    try {
      const value = JSON.parse(localStorage.getItem(K.verification) || "null");
      if (!value || value.email !== String(forEmail || "").toLowerCase()) return null;
      if (!value.emailVerificationToken || Number(value.emailVerificationExpiresAt || 0) <= Date.now()) {
        localStorage.removeItem(K.verification);
        return null;
      }
      return value;
    } catch {
      localStorage.removeItem(K.verification);
      return null;
    }
  }

  function verificationPayload() {
    const value = storedVerification();
    return value ? {
      emailVerificationToken: value.emailVerificationToken,
      emailVerificationExpiresAt: value.emailVerificationExpiresAt
    } : {};
  }

  function rememberVerification(forEmail, value) {
    const proof = {
      email: String(forEmail || "").toLowerCase(),
      emailVerificationToken: String(value.emailVerificationToken || ""),
      emailVerificationExpiresAt: Number(value.emailVerificationExpiresAt || 0)
    };
    if (!proof.emailVerificationToken || proof.emailVerificationExpiresAt <= Date.now()) {
      throw new Error("The verification service returned an invalid proof.");
    }
    localStorage.setItem(K.verification, JSON.stringify(proof));
  }

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

  async function request(path, payload, expectState = true) {
    const controller = new AbortController();
    const emailOperation = ["verification-request", "invite"].includes(String(path));
    const timeoutMs = Math.max(emailOperation ? 30000 : 1000, Number(C.requestTimeoutMs) || 10000);
    const timer = setTimeout(() => controller.abort(), timeoutMs);
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
        error.retryAfter = Number(response.headers.get("Retry-After") || body.retryAfterSeconds || 0);
        throw error;
      }
      return expectState ? validate(body) : body;
    } catch (error) {
      if (error?.name === "AbortError") throw new Error("Referral service timed out. Please retry.");
      throw error;
    } finally { clearTimeout(timer); }
  }
  const post = (path, payload) => request(path, payload, true);
  const postRaw = (path, payload) => request(path, payload, false);

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

  function identity(
    promptText = "Enter your email to start your one free EasyFile use and manage referral access.",
    forceVerification = C.emailVerificationEnabled
  ) {
    return new Promise((resolve, reject) => {
      document.getElementById("easyfileReferralIdentity")?.remove();
      const modal = document.createElement("section");
      modal.id = "easyfileReferralIdentity"; modal.className = "easyfile-referral-modal no-print";
      modal.setAttribute("role", "dialog"); modal.setAttribute("aria-modal", "true");
      modal.innerHTML = `<div class="easyfile-referral-panel">
        <h2>Start using EasyFile</h2><p>${esc(promptText)}</p>
        <form><div class="easyfile-referral-field"><label for="easyfileReferralEmail">Email address</label>
        <input id="easyfileReferralEmail" type="email" autocomplete="email" maxlength="254" required value="${esc(email)}" placeholder="you@example.com"></div>
        <p class="easyfile-referral-message" aria-live="polite"></p>
        <div class="easyfile-referral-actions">${btn(forceVerification ? "Send verification code" : "Continue", "easyfile-referral-button--primary", 'type="submit"')}${btn("Cancel", "easyfile-referral-button--secondary", "data-cancel")}</div></form>
        <p class="text-xs">${forceVerification ? `A six-digit code will be sent from ${esc(C.emailSender)}.` : "Use an address you control."}</p></div>`;
      document.body.appendChild(modal);
      const form = modal.querySelector("form");
      const input = modal.querySelector("input");
      const status = modal.querySelector(".easyfile-referral-message");
      const cancel = () => {
        modal.remove();
        reject(new Error("Email verification was cancelled."));
      };
      modal.querySelector("[data-cancel]")?.addEventListener("click", cancel);
      input.focus();
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const value = input.value.trim().toLowerCase();
        if (!/^\S+@\S+\.\S+$/.test(value) || value.length > 254) {
          status.textContent = "Enter a valid email address."; status.classList.add("easyfile-referral-error"); return;
        }

        if (!forceVerification) {
          email = value;
          localStorage.setItem(K.email, value);
          modal.remove();
          resolve(value);
          return;
        }

        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        status.className = "easyfile-referral-message";
        status.textContent = "Sending a verification code…";

        try {
          const requested = await postRaw("verification-request", {
            email: value,
            referralCode: code(localStorage.getItem(K.pending)) || undefined,
            requestId: id(),
            clientVersion: C.clientVersion
          });
          email = value;
          localStorage.setItem(K.email, value);

          const panel = modal.querySelector(".easyfile-referral-panel");
          panel.innerHTML = `<h2>Verify your email</h2>
            <p>Enter the six-digit code sent to <strong>${esc(requested.emailMasked || value)}</strong>. It expires in 10 minutes.</p>
            <form data-verification-form>
              <div class="easyfile-referral-field"><label for="easyfileReferralCode">Verification code</label>
              <input id="easyfileReferralCode" class="easyfile-referral-code-input" type="text" inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" required placeholder="000000"></div>
              <p class="easyfile-referral-message" aria-live="polite"></p>
              <div class="easyfile-referral-actions">${btn("Verify email", "easyfile-referral-button--primary", 'type="submit"')}${btn("Send another code", "easyfile-referral-button--secondary", "data-resend")}${btn("Cancel", "easyfile-referral-button--secondary", "data-cancel")}</div>
            </form>`;

          const verificationForm = panel.querySelector("[data-verification-form]");
          const otpInput = panel.querySelector("#easyfileReferralCode");
          const verificationStatus = panel.querySelector(".easyfile-referral-message");
          panel.querySelector("[data-cancel]")?.addEventListener("click", cancel);
          panel.querySelector("[data-resend]")?.addEventListener("click", async (resendEvent) => {
            const button = resendEvent.currentTarget;
            button.disabled = true;
            verificationStatus.className = "easyfile-referral-message";
            verificationStatus.textContent = "Sending another code…";
            try {
              await postRaw("verification-request", {
                email: value,
                referralCode: code(localStorage.getItem(K.pending)) || undefined,
                requestId: id(),
                clientVersion: C.clientVersion
              });
              verificationStatus.classList.add("easyfile-referral-success");
              verificationStatus.textContent = "A new code was sent.";
            } catch (error) {
              verificationStatus.classList.add("easyfile-referral-error");
              verificationStatus.textContent = error.message || "The code could not be sent.";
            } finally {
              setTimeout(() => { button.disabled = false; }, Math.max(1000, Number(requested.resendAfterSeconds || 60) * 1000));
            }
          });
          verificationForm.addEventListener("submit", async (verifyEvent) => {
            verifyEvent.preventDefault();
            const otp = otpInput.value.replace(/\D/g, "");
            if (!/^\d{6}$/.test(otp)) {
              verificationStatus.textContent = "Enter the complete six-digit code.";
              verificationStatus.classList.add("easyfile-referral-error");
              return;
            }
            const verifyButton = verificationForm.querySelector('[type="submit"]');
            verifyButton.disabled = true;
            verificationStatus.className = "easyfile-referral-message";
            verificationStatus.textContent = "Verifying…";
            try {
              const proof = await postRaw("verification-confirm", {
                email: value,
                code: otp,
                requestId: id(),
                clientVersion: C.clientVersion
              });
              rememberVerification(value, proof);
              modal.remove();
              resolve(value);
            } catch (error) {
              verifyButton.disabled = false;
              otpInput.select();
              verificationStatus.classList.add("easyfile-referral-error");
              verificationStatus.textContent = error.message || "The code could not be verified.";
            }
          });
          otpInput.focus();
        } catch (error) {
          submit.disabled = false;
          status.classList.add("easyfile-referral-error");
          status.textContent = error.message || "The verification email could not be sent.";
        }
      });
    });
  }

  async function session(refresh = false) {
    if (!/^\S+@\S+\.\S+$/.test(email) || (C.emailVerificationEnabled && !storedVerification(email))) {
      await identity(undefined, C.emailVerificationEnabled);
    }
    const pendingReferral = code(localStorage.getItem(K.pending));
    const value = await post("session", {
      email, referralCode: pendingReferral || undefined,
      page: file, moduleId, refresh, requestId: id(), clientVersion: C.clientVersion,
      ...verificationPayload()
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

  function shareCopy(referralCode) {
    const referralLink = link(referralCode);
    return {
      title: "Try EasyFile",
      text: "Create your first EasyFile business document free. Use my referral link:",
      url: referralLink
    };
  }

  function openShareUrl(url) {
    const popup = window.open(url, "_blank", "noopener,noreferrer,width=720,height=640");
    if (!popup) throw new Error("The browser blocked the share window. Allow pop-ups and try again.");
    popup.opener = null;
  }

  async function share(referralCode, channel) {
    const content = shareCopy(referralCode);
    const combined = `${content.text} ${content.url}`;
    try {
      if (channel === "native") {
        if (!navigator.share) throw new Error("Device sharing is not available in this browser.");
        await navigator.share(content);
      } else if (channel === "whatsapp") {
        openShareUrl(`https://wa.me/?text=${encodeURIComponent(combined)}`);
      } else if (channel === "email") {
        location.href = `mailto:?subject=${encodeURIComponent(content.title)}&body=${encodeURIComponent(combined)}`;
      } else if (channel === "sms") {
        location.href = `sms:?body=${encodeURIComponent(combined)}`;
      } else if (channel === "facebook") {
        openShareUrl(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(content.url)}`);
      } else if (channel === "linkedin") {
        openShareUrl(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(content.url)}`);
      } else if (channel === "x") {
        openShareUrl(`https://twitter.com/intent/tweet?text=${encodeURIComponent(content.text)}&url=${encodeURIComponent(content.url)}`);
      } else if (channel === "qr") {
        showQr(referralCode);
      } else {
        await copy(referralCode);
      }
      if (channel !== "qr") message(`${channel === "native" ? "Share" : channel} option opened.`);
    } catch (error) {
      if (error?.name !== "AbortError") message(error.message || "The referral could not be shared.", true);
    }
  }

  function showQr(referralCode) {
    document.getElementById("easyfileReferralQr")?.remove();
    const referralLink = link(referralCode);
    const modal = document.createElement("section");
    modal.id = "easyfileReferralQr";
    modal.className = "easyfile-referral-modal no-print";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "easyfileReferralQrTitle");
    modal.innerHTML = `<div class="easyfile-referral-panel">
      <h2 id="easyfileReferralQrTitle">Referral QR code</h2>
      <p>People can scan this code to open your EasyFile referral link.</p>
      <div class="easyfile-referral-qr" data-referral-qr aria-label="QR code for the EasyFile referral link"></div>
      <div class="easyfile-referral-actions">${btn("Download PNG", "easyfile-referral-button--primary", "data-download-qr")}${btn("Copy link", "easyfile-referral-button--secondary", "data-copy-qr")}${btn("Close", "easyfile-referral-button--secondary", "data-close-qr")}</div>
      <p class="easyfile-referral-message" aria-live="polite"></p>
    </div>`;
    document.body.appendChild(modal);
    const container = modal.querySelector("[data-referral-qr]");
    const status = modal.querySelector(".easyfile-referral-message");

    if (!window.QRCode) {
      status.classList.add("easyfile-referral-error");
      status.textContent = "The QR generator could not be loaded. Copy the referral link instead.";
      modal.querySelector("[data-download-qr]").disabled = true;
    } else {
      new window.QRCode(container, {
        text: referralLink,
        width: 256,
        height: 256,
        colorDark: "#0f172a",
        colorLight: "#ffffff",
        correctLevel: window.QRCode.CorrectLevel.H
      });
    }

    modal.querySelector("[data-copy-qr]").addEventListener("click", () => copy(referralCode));
    modal.querySelector("[data-close-qr]").addEventListener("click", () => modal.remove());
    modal.querySelector("[data-download-qr]").addEventListener("click", () => {
      const canvas = container.querySelector("canvas");
      const image = container.querySelector("img");
      const dataUrl = canvas?.toDataURL("image/png") || image?.src;
      if (!dataUrl) {
        status.classList.add("easyfile-referral-error");
        status.textContent = "The QR image is not ready yet.";
        return;
      }
      const download = document.createElement("a");
      download.href = dataUrl;
      download.download = `easyfile-referral-${code(referralCode)}.png`;
      download.click();
      status.classList.add("easyfile-referral-success");
      status.textContent = "QR code downloaded.";
    });
    modal.addEventListener("click", (event) => { if (event.target === modal) modal.remove(); });
  }

  function inviteMessage(text, error = false) {
    const target = document.querySelector("[data-referral-invite-message]");
    if (!target) return message(text, error);
    target.textContent = text;
    target.className = `easyfile-referral-message ${error ? "easyfile-referral-error" : "easyfile-referral-success"}`;
  }

  async function sendInvitation(recipientEmail) {
    if (!state?.referralCode) throw new Error("Your referral account is not ready yet.");
    const recipient = String(recipientEmail || "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(recipient) || recipient.length > 254) {
      throw new Error("Enter a valid email address for the person you are inviting.");
    }
    if (recipient === String(email || "").toLowerCase()) {
      throw new Error("You cannot send a referral invitation to your own email address.");
    }

    if (!storedVerification(email)) {
      await identity("Verify your email before EasyFile sends invitations on your behalf.", true);
      await session(true);
    }

    return postRaw("invite", {
      email,
      recipientEmail: recipient,
      referralCode: state.referralCode,
      requestId: id(),
      clientVersion: C.clientVersion,
      ...verificationPayload()
    });
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
    localStorage.removeItem(K.email); localStorage.removeItem(K.entitlement); localStorage.removeItem(K.verification); email = ""; state = null;
    document.getElementById("easyfileReferralLock")?.remove(); document.getElementById("easyfileReferralStatusModal")?.remove();
    identity("Enter the verified email attached to the referral account.", C.emailVerificationEnabled)
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
        occurredAt: new Date().toISOString(), page: file, clientVersion: C.clientVersion,
        ...verificationPayload()
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
    document.querySelectorAll("[data-share-referral]").forEach((button) => {
      const channel = button.dataset.shareReferral;
      if (channel === "native" && !navigator.share) button.hidden = true;
      button.onclick = () => state && share(state.referralCode, channel);
    });
    document.querySelectorAll("[data-referral-invite-form]").forEach((form) => {
      form.addEventListener("submit", async (event) => {
        event.preventDefault();
        const input = form.querySelector("[data-referral-invite-email]");
        const submit = form.querySelector('[type="submit"]');
        submit.disabled = true;
        inviteMessage("Preparing the verified invitation…");
        try {
          const result = await sendInvitation(input.value);
          inviteMessage(`Invitation sent to ${result.recipientMasked || "the verified address"}.`);
          input.value = "";
        } catch (error) {
          inviteMessage(error.message || "The invitation could not be sent.", true);
        } finally {
          submit.disabled = false;
        }
      });
    });
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

  window.EasyFileReferrals = Object.freeze({
    refresh,
    open: () => panel(state),
    changeEmail,
    share: (channel = "native") => state && share(state.referralCode, channel),
    showQr: () => state && showQr(state.referralCode),
    getStatus: () => state,
    recordUse: record
  });
  document.readyState === "loading" ? document.addEventListener("DOMContentLoaded", boot, { once: true }) : boot();
})();
