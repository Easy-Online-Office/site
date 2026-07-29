/* EasyFile shared module actions: Save Draft, Export CSV and Print */
(function () {
  "use strict";

  const MODULES = Object.freeze({
    "easy-quote.html": { id: "quote", printLabel: "Print Quote" },
    "easy-invoice.html": { id: "invoice", printLabel: "Print Invoice" },
    "easy-purchase-order.html": { id: "purchase-order", printLabel: "Print Purchase Order" },
    "easy-sales-order.html": { id: "sales-order", printLabel: "Print Sales Order" },
    "easy-receipt.html": { id: "receipt", printLabel: "Print Receipt" },
    "easy-statement.html": { id: "statement", printLabel: "Print Statement" },
    "easy-job-card.html": { id: "job-card", printLabel: "Print Job Card" },
    "easy-payroll.html": { id: "payroll", printLabel: "Print Payslip" },
    "easy-inventory.html": { id: "inventory", printLabel: "Print Inventory Report" },
    "easy-crm.html": { id: "crm", printLabel: "Print CRM Report" },
    "easy-asset-management.html": { id: "asset-management", printLabel: "Print Asset Register" },
    "easy-site-inspection.html": { id: "site-inspection", printLabel: "Print Inspection Report" }
  });

  const currentFile = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const moduleConfig = MODULES[currentFile];
  if (!moduleConfig) return;

  const TOOLBAR_ID = "easyfileModuleActions";
  const STORAGE_KEY = `easyfile:shared-draft:${moduleConfig.id}:v1`;

  function addStyles() {
    if (document.getElementById("easyfileModuleActionsStyles")) return;

    const style = document.createElement("style");
    style.id = "easyfileModuleActionsStyles";
    style.textContent = `
      #${TOOLBAR_ID} {
        display: flex;
        flex-wrap: wrap;
        align-items: center;
        gap: .75rem;
        width: min(100%, 80rem);
        margin: 1rem auto 1.5rem;
        padding: 1rem;
        border: 1px solid #e5e7eb;
        border-radius: 1rem;
        background: #fff;
        box-shadow: 0 10px 25px rgba(15, 23, 42, .07);
      }
      #${TOOLBAR_ID} .easyfile-action-title {
        margin-right: auto;
        color: #334155;
        font-size: .875rem;
        font-weight: 800;
      }
      #${TOOLBAR_ID} button {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        gap: .5rem;
        min-height: 2.75rem;
        border: 0;
        border-radius: .625rem;
        padding: .65rem 1.25rem;
        color: #fff;
        font: inherit;
        font-weight: 800;
        cursor: pointer;
        transition: transform .15s ease, filter .15s ease;
      }
      #${TOOLBAR_ID} button:hover { transform: translateY(-1px); filter: brightness(.96); }
      #${TOOLBAR_ID} button:focus-visible { outline: 3px solid rgba(37, 99, 235, .3); outline-offset: 2px; }
      #${TOOLBAR_ID} [data-easyfile-action="save"] { background: #4b5563; }
      #${TOOLBAR_ID} [data-easyfile-action="csv"] { background: #9333ea; }
      #${TOOLBAR_ID} [data-easyfile-action="print"] { background: #111827; }
      .easyfile-action-toast {
        position: fixed;
        right: 1rem;
        bottom: 1rem;
        z-index: 9999;
        max-width: min(24rem, calc(100vw - 2rem));
        border-radius: .75rem;
        padding: .8rem 1rem;
        background: #111827;
        color: #fff;
        box-shadow: 0 18px 45px rgba(15, 23, 42, .28);
        font-size: .875rem;
        font-weight: 700;
      }
      @media (max-width: 640px) {
        #${TOOLBAR_ID} { align-items: stretch; }
        #${TOOLBAR_ID} .easyfile-action-title { width: 100%; margin-right: 0; }
        #${TOOLBAR_ID} button { flex: 1 1 100%; }
      }
      @media print {
        #${TOOLBAR_ID}, .easyfile-action-toast { display: none !important; }
      }
      @media (prefers-reduced-motion: reduce) {
        #${TOOLBAR_ID} button { transition: none; }
      }
    `;
    document.head.appendChild(style);
  }

  function toast(message) {
    const existing = document.querySelector(".easyfile-action-toast");
    if (existing) existing.remove();

    const element = document.createElement("div");
    element.className = "easyfile-action-toast";
    element.setAttribute("role", "status");
    element.setAttribute("aria-live", "polite");
    element.textContent = message;
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), 2600);
  }

  function fieldKey(field, index) {
    return field.id || field.name || `${field.tagName.toLowerCase()}-${index}`;
  }

  function serialiseDraft() {
    const main = document.querySelector("main") || document.body;
    const fields = Array.from(main.querySelectorAll("input, select, textarea, [contenteditable='true']"))
      .filter((field) => !field.closest(`#${TOOLBAR_ID}`))
      .filter((field) => field.type !== "file" && field.type !== "button" && field.type !== "submit" && field.type !== "reset");

    return {
      module: moduleConfig.id,
      savedAt: new Date().toISOString(),
      fields: fields.map((field, index) => ({
        key: fieldKey(field, index),
        type: field.type || field.tagName.toLowerCase(),
        value: field.isContentEditable ? field.textContent : field.value,
        checked: Boolean(field.checked)
      }))
    };
  }

  function restoreDraft() {
    let draft;
    try {
      draft = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null");
    } catch {
      return;
    }

    if (!draft || !Array.isArray(draft.fields)) return;

    const main = document.querySelector("main") || document.body;
    const fields = Array.from(main.querySelectorAll("input, select, textarea, [contenteditable='true']"))
      .filter((field) => !field.closest(`#${TOOLBAR_ID}`))
      .filter((field) => field.type !== "file" && field.type !== "button" && field.type !== "submit" && field.type !== "reset");

    const saved = new Map(draft.fields.map((item) => [item.key, item]));
    fields.forEach((field, index) => {
      const item = saved.get(fieldKey(field, index));
      if (!item) return;

      if (field.type === "checkbox" || field.type === "radio") field.checked = Boolean(item.checked);
      else if (field.isContentEditable) field.textContent = item.value || "";
      else field.value = item.value ?? "";

      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }

  function nativeButton(pattern) {
    return Array.from(document.querySelectorAll("button, [role='button']")).find((button) => {
      if (button.closest(`#${TOOLBAR_ID}`)) return false;
      const text = `${button.id || ""} ${button.textContent || ""}`.replace(/\s+/g, " ").trim();
      return pattern.test(text);
    });
  }

  function saveDraft() {
    if (typeof window.saveDraft === "function" && window.saveDraft !== saveDraft) {
      window.saveDraft();
      return;
    }

    const existing = nativeButton(/save\s*draft|btnsave[d_-]?draft/i);
    if (existing) {
      existing.click();
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialiseDraft()));
      toast("Draft saved in this browser.");
    } catch {
      toast("Draft could not be saved because browser storage is unavailable.");
    }
  }

  function csvEscape(value) {
    const text = String(value ?? "").replace(/\r?\n/g, " ").trim();
    return `"${text.replace(/"/g, '""')}"`;
  }

  function tableRows(table) {
    return Array.from(table.querySelectorAll("tr")).map((row) =>
      Array.from(row.querySelectorAll("th, td")).map((cell) => {
        const control = cell.querySelector("input:not([type='file']), select, textarea");
        return csvEscape(control ? control.value : cell.textContent);
      })
    ).filter((row) => row.length);
  }

  function genericCsv() {
    const tables = Array.from(document.querySelectorAll("main table"));
    let rows = [];

    tables.forEach((table, index) => {
      if (tables.length > 1) rows.push([csvEscape(`Table ${index + 1}`)]);
      rows.push(...tableRows(table));
      if (tables.length > 1) rows.push([]);
    });

    if (!rows.length) {
      const main = document.querySelector("main") || document.body;
      rows = [[csvEscape("Field"), csvEscape("Value")]];
      Array.from(main.querySelectorAll("input, select, textarea"))
        .filter((field) => field.type !== "file" && field.type !== "button" && field.type !== "submit")
        .forEach((field, index) => {
          const label = field.labels?.[0]?.textContent || field.placeholder || field.id || field.name || `Field ${index + 1}`;
          const value = (field.type === "checkbox" || field.type === "radio") ? field.checked : field.value;
          rows.push([csvEscape(label), csvEscape(value)]);
        });
    }

    const csv = rows.map((row) => row.join(",")).join("\n");
    const blob = new Blob(["\uFEFF", csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    const date = new Date().toISOString().slice(0, 10);
    link.href = url;
    link.download = `easyfile-${moduleConfig.id}-${date}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    toast("CSV export created.");
  }

  function exportCsv() {
    if (typeof window.exportCSV === "function" && window.exportCSV !== exportCsv) {
      window.exportCSV();
      return;
    }

    const existing = nativeButton(/export\s*csv|btncsv|btn_csv/i);
    if (existing) {
      existing.click();
      return;
    }

    genericCsv();
  }

  function button(action, label, icon) {
    const element = document.createElement("button");
    element.type = "button";
    element.dataset.easyfileAction = action;
    element.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>`;
    return element;
  }

  function mountToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;
    const main = document.querySelector("main");
    if (!main) return;

    addStyles();

    const toolbar = document.createElement("section");
    toolbar.id = TOOLBAR_ID;
    toolbar.className = "no-print";
    toolbar.setAttribute("aria-label", "EasyFile document actions");

    const title = document.createElement("span");
    title.className = "easyfile-action-title";
    title.textContent = "Document actions";

    const save = button("save", "Save Draft", "fa-floppy-disk");
    const csv = button("csv", "Export CSV", "fa-file-csv");
    const print = button("print", moduleConfig.printLabel, "fa-print");

    save.addEventListener("click", saveDraft);
    csv.addEventListener("click", exportCsv);
    print.addEventListener("click", () => window.print());

    toolbar.append(title, save, csv, print);

    const directHeader = Array.from(main.children).find((child) => child.tagName === "HEADER");
    if (directHeader) directHeader.insertAdjacentElement("afterend", toolbar);
    else main.insertBefore(toolbar, main.firstChild);

    restoreDraft();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToolbar, { once: true });
  } else {
    mountToolbar();
  }
})();
