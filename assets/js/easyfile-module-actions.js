/* EasyFile shared module action bar */
(function () {
  "use strict";

  const MODULES = Object.freeze({
    "easy-quote.html": {
      id: "quote",
      noun: "Quote",
      newLabel: "New Quote #",
      newIcon: "fa-file-circle-plus",
      newPattern: /new\s*quote|btnnewquote/i,
      secondaryLabel: "Mark Accepted",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*accepted|accept\s*quote/i,
      secondaryValue: "Accepted",
      printLabel: "Print Quote"
    },
    "easy-invoice.html": {
      id: "invoice",
      noun: "Invoice",
      newLabel: "New Invoice #",
      newIcon: "fa-file-circle-plus",
      newPattern: /new\s*invoice|btnnewinvoice/i,
      secondaryLabel: "Mark Paid",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*paid|btnmarkpaid/i,
      secondaryValue: "Paid",
      printLabel: "Print Invoice"
    },
    "easy-purchase-order.html": {
      id: "purchase-order",
      noun: "Purchase Order",
      newLabel: "New Purchase Order #",
      newIcon: "fa-cart-plus",
      newPattern: /new\s*(purchase\s*order|po)|btnnew(number|po)/i,
      secondaryLabel: "Mark Approved",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*approved|approve\s*(purchase\s*order|po)/i,
      secondaryValue: "Approved",
      printLabel: "Print Purchase Order"
    },
    "easy-sales-order.html": {
      id: "sales-order",
      noun: "Sales Order",
      newLabel: "New Sales Order #",
      newIcon: "fa-bag-shopping",
      newPattern: /new\s*sales\s*order|btnnew(number|sales)/i,
      secondaryLabel: "Mark Confirmed",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*confirmed|confirm\s*order/i,
      secondaryValue: "Confirmed",
      printLabel: "Print Sales Order"
    },
    "easy-receipt.html": {
      id: "receipt",
      noun: "Receipt",
      newLabel: "New Receipt #",
      newIcon: "fa-receipt",
      newPattern: /new\s*receipt|btnnewreceipt/i,
      secondaryLabel: "Mark Issued",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*issued|issue\s*receipt/i,
      secondaryValue: "Issued",
      printLabel: "Print Receipt"
    },
    "easy-statement.html": {
      id: "statement",
      noun: "Statement",
      newLabel: "New Statement",
      newIcon: "fa-file-circle-plus",
      newPattern: /new\s*statement|btnnewstatement/i,
      secondaryLabel: "Generate Statement",
      secondaryIcon: "fa-rotate",
      secondaryPattern: /generate\s*statement|refresh\s*statement|btngenerate/i,
      printLabel: "Print Statement"
    },
    "easy-job-card.html": {
      id: "job-card",
      noun: "Job Card",
      newLabel: "New Job Card #",
      newIcon: "fa-clipboard-list",
      newPattern: /new\s*job|btnnewnumber|btnnewjob/i,
      secondaryLabel: "Mark Completed",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*completed|btnmarkcompleted/i,
      secondaryValue: "Completed",
      printLabel: "Print Job Card"
    },
    "easy-payroll.html": {
      id: "payroll",
      noun: "Payroll",
      newLabel: "New Payroll",
      newIcon: "fa-money-check-dollar",
      newPattern: /new\s*payroll|btnnewpayroll/i,
      secondaryLabel: "Calculate Payroll",
      secondaryIcon: "fa-calculator",
      secondaryPattern: /calculate\s*payroll|btncalculate/i,
      printLabel: "Print Payslip"
    },
    "easy-inventory.html": {
      id: "inventory",
      noun: "Inventory",
      newLabel: "Add Product",
      newIcon: "fa-box-open",
      newPattern: /add\s*product|btnadd\b/i,
      secondaryLabel: "Import CSV",
      secondaryIcon: "fa-file-import",
      secondaryPattern: /import\s*csv|btnimport/i,
      printLabel: "Print Inventory Report"
    },
    "easy-crm.html": {
      id: "crm",
      noun: "CRM",
      newLabel: "Add Contact",
      newIcon: "fa-user-plus",
      newPattern: /add\s*(contact|customer)|btnadd(contact|customer)?/i,
      secondaryLabel: "Add Opportunity",
      secondaryIcon: "fa-bullseye",
      secondaryPattern: /add\s*opportunit|btnaddopportunit/i,
      printLabel: "Print CRM Report"
    },
    "easy-asset-management.html": {
      id: "asset-management",
      noun: "Asset Register",
      newLabel: "Add Asset",
      newIcon: "fa-screwdriver-wrench",
      newPattern: /add\s*asset|btnaddasset/i,
      secondaryLabel: "Audit List",
      secondaryIcon: "fa-list-check",
      secondaryPattern: /audit\s*list|btnauditlist/i,
      printLabel: "Print Asset Register"
    },
    "easy-site-inspection.html": {
      id: "site-inspection",
      noun: "Site Inspection",
      newLabel: "New Inspection",
      newIcon: "fa-clipboard-check",
      newPattern: /new\s*inspection|btnnewinspection/i,
      secondaryLabel: "Mark Completed",
      secondaryIcon: "fa-circle-check",
      secondaryPattern: /mark\s*completed|complete\s*inspection/i,
      secondaryValue: "Completed",
      printLabel: "Print Inspection Report"
    }
  });

  const currentFile = (location.pathname.split("/").pop() || "index.html").toLowerCase();
  const moduleConfig = MODULES[currentFile];
  if (!moduleConfig) return;

  const TOOLBAR_ID = "easyfileModuleActions";
  const STORAGE_KEY = `easyfile:shared-draft:${moduleConfig.id}:v2`;

  const ACTION_PATTERNS = Object.freeze({
    save: /save\s*draft|btnsave[d_-]?draft/i,
    preview: /(^|\s)preview(\s|$)|btnpreview/i,
    print: /(^|\s)print(\s|$)|btnprint/i,
    pdf: /export\s*pdf|btnpdf/i,
    word: /export\s*word|btnword/i,
    excel: /export\s*excel|btnexcel/i,
    csv: /export\s*csv|btncsv|btn_csv/i
  });

  function toast(message, isError) {
    const existing = document.querySelector(".easyfile-action-toast");
    if (existing) existing.remove();

    const element = document.createElement("div");
    element.className = "easyfile-action-toast";
    element.setAttribute("role", isError ? "alert" : "status");
    element.setAttribute("aria-live", isError ? "assertive" : "polite");
    element.textContent = message;
    if (isError) element.style.background = "#b91c1c";
    document.body.appendChild(element);
    window.setTimeout(() => element.remove(), 2800);
  }

  function setToolbarStatus(message) {
    const status = document.getElementById("easyfileActionStatus");
    if (status) status.textContent = message;
  }

  function buttonText(button) {
    return `${button.id || ""} ${button.name || ""} ${button.textContent || ""}`
      .replace(/\s+/g, " ")
      .trim();
  }

  function nativeButton(pattern) {
    return Array.from(document.querySelectorAll("button, [role='button'], a.btn")).find((button) => {
      if (button.closest(`#${TOOLBAR_ID}`)) return false;
      return pattern.test(buttonText(button));
    });
  }

  function invokeNativeButton(pattern) {
    const existing = nativeButton(pattern);
    if (!existing) return false;
    existing.click();
    return true;
  }

  function invokeFunction(names) {
    for (const name of names) {
      if (typeof window[name] === "function") {
        window[name]();
        return true;
      }
    }
    return false;
  }

  function fieldKey(field, index) {
    return field.id || field.name || `${field.tagName.toLowerCase()}-${index}`;
  }

  function draftFields() {
    const main = document.querySelector("main") || document.body;
    return Array.from(main.querySelectorAll("input, select, textarea, [contenteditable='true']"))
      .filter((field) => !field.closest(`#${TOOLBAR_ID}`))
      .filter((field) => !["file", "button", "submit", "reset"].includes(field.type));
  }

  function serialiseDraft() {
    return {
      module: moduleConfig.id,
      savedAt: new Date().toISOString(),
      fields: draftFields().map((field, index) => ({
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

    const fields = draftFields();
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

    setToolbarStatus(`Draft restored from ${new Date(draft.savedAt).toLocaleString("en-ZA")}.`);
  }

  function saveDraft() {
    if (typeof window.saveDraft === "function") {
      window.saveDraft();
      setToolbarStatus("Draft saved using this module's native save function.");
      return;
    }

    if (invokeNativeButton(ACTION_PATTERNS.save)) {
      setToolbarStatus("Draft save requested.");
      return;
    }

    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(serialiseDraft()));
      toast("Draft saved in this browser.");
      setToolbarStatus("Draft saved locally.");
    } catch {
      toast("Draft could not be saved because browser storage is unavailable.", true);
    }
  }

  function resetForNewRecord() {
    const confirmed = window.confirm(`Start a new ${moduleConfig.noun}? Unsaved values in the current form will be cleared.`);
    if (!confirmed) return;

    localStorage.removeItem(STORAGE_KEY);
    document.querySelectorAll("main form").forEach((form) => form.reset());

    draftFields().forEach((field) => {
      if (field.type === "checkbox" || field.type === "radio") field.checked = false;
      else if (field.isContentEditable) field.textContent = "";
      else if (field.tagName === "SELECT") field.selectedIndex = 0;
      else field.value = "";
      field.dispatchEvent(new Event("input", { bubbles: true }));
      field.dispatchEvent(new Event("change", { bubbles: true }));
    });

    toast(`New ${moduleConfig.noun} form ready.`);
    setToolbarStatus(`Started a new ${moduleConfig.noun}.`);
  }

  function newRecord() {
    if (invokeNativeButton(moduleConfig.newPattern)) return;

    const functionNames = [
      "newInvoiceNumber",
      "generateInvoiceNumber",
      "generateQuoteNumber",
      "generateJobNumber",
      "newDocument",
      "newRecord"
    ];
    if (invokeFunction(functionNames)) return;

    resetForNewRecord();
  }

  function setStatusValue(value) {
    if (!value) return false;

    const candidates = Array.from(document.querySelectorAll("select")).filter((select) => {
      const identity = `${select.id || ""} ${select.name || ""} ${select.getAttribute("aria-label") || ""}`;
      return /status/i.test(identity);
    });

    for (const select of candidates) {
      const option = Array.from(select.options).find((item) =>
        (item.value || item.textContent || "").trim().toLowerCase() === value.toLowerCase()
      );
      if (!option) continue;
      select.value = option.value;
      select.dispatchEvent(new Event("input", { bubbles: true }));
      select.dispatchEvent(new Event("change", { bubbles: true }));
      toast(`Status changed to ${value}.`);
      setToolbarStatus(`Status: ${value}.`);
      return true;
    }

    return false;
  }

  function secondaryAction() {
    if (invokeNativeButton(moduleConfig.secondaryPattern)) return;
    if (moduleConfig.secondaryValue && setStatusValue(moduleConfig.secondaryValue)) return;

    const functionNames = moduleConfig.id === "payroll"
      ? ["calculatePayroll", "calculate"]
      : moduleConfig.id === "statement"
        ? ["generateStatement", "calculate", "render"]
        : [];

    if (invokeFunction(functionNames)) return;
    toast(`${moduleConfig.secondaryLabel} is not available in this module yet.`, true);
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
      rows = [[csvEscape("Field"), csvEscape("Value")]];
      draftFields().forEach((field, index) => {
        const label = field.labels?.[0]?.textContent || field.placeholder || field.id || field.name || `Field ${index + 1}`;
        const value = (field.type === "checkbox" || field.type === "radio") ? field.checked : field.value;
        rows.push([csvEscape(label), csvEscape(value)]);
      });
    }

    downloadBlob(
      new Blob(["\uFEFF", rows.map((row) => row.join(",")).join("\n")], { type: "text/csv;charset=utf-8" }),
      fileName("csv")
    );
    toast("CSV export created.");
  }

  function exportCsv() {
    if (typeof window.exportCSV === "function") {
      window.exportCSV();
      return;
    }
    if (invokeNativeButton(ACTION_PATTERNS.csv)) return;
    genericCsv();
  }

  function exportRootClone() {
    const source = document.querySelector("#printArea, .print-container, #previewCard, main") || document.body;
    const clone = source.cloneNode(true);

    clone.querySelectorAll(".no-print, script, style, button, #easyfileModuleActions").forEach((node) => node.remove());
    clone.querySelectorAll("input, select, textarea").forEach((control) => {
      if (control.type === "file") {
        control.remove();
        return;
      }
      const value = control.tagName === "SELECT"
        ? control.options[control.selectedIndex]?.textContent || control.value
        : (control.type === "checkbox" || control.type === "radio")
          ? (control.checked ? "Yes" : "No")
          : control.value;
      const replacement = document.createElement(control.tagName === "TEXTAREA" ? "div" : "span");
      replacement.textContent = value || "";
      replacement.style.whiteSpace = "pre-wrap";
      control.replaceWith(replacement);
    });

    return clone;
  }

  function preview() {
    if (invokeNativeButton(ACTION_PATTERNS.preview)) return;

    const modal = document.createElement("div");
    modal.className = "easyfile-preview-modal no-print";
    modal.setAttribute("role", "dialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "easyfilePreviewTitle");

    const dialog = document.createElement("div");
    dialog.className = "easyfile-preview-dialog";
    dialog.innerHTML = `
      <div class="easyfile-preview-header">
        <div>
          <div id="easyfilePreviewTitle" class="font-black text-lg">${moduleConfig.noun} Preview</div>
          <div class="text-sm text-gray-500">Review the document before printing or exporting.</div>
        </div>
        <button type="button" class="easyfile-action-button easyfile-action-secondary" data-close-preview>
          <i class="fa-solid fa-xmark" aria-hidden="true"></i><span>Close</span>
        </button>
      </div>
      <div class="easyfile-preview-body"></div>`;

    dialog.querySelector(".easyfile-preview-body").appendChild(exportRootClone());
    modal.appendChild(dialog);
    document.body.appendChild(modal);

    const close = () => modal.remove();
    modal.querySelector("[data-close-preview]").addEventListener("click", close);
    modal.addEventListener("click", (event) => {
      if (event.target === modal) close();
    });
    document.addEventListener("keydown", function escape(event) {
      if (event.key !== "Escape") return;
      close();
      document.removeEventListener("keydown", escape);
    });
  }

  function printDocument() {
    if (invokeNativeButton(ACTION_PATTERNS.print)) return;
    window.print();
  }

  function exportPdf() {
    if (invokeNativeButton(ACTION_PATTERNS.pdf)) return;
    if (invokeFunction(["exportPDF", "exportPdf", "downloadPDF", "downloadPdf"])) return;
    toast("Opening the print dialog. Choose ‘Save as PDF’ as the destination.");
    window.print();
  }

  function exportWord() {
    if (invokeNativeButton(ACTION_PATTERNS.word)) return;
    if (invokeFunction(["exportWord", "downloadWord"])) return;

    const html = `<!doctype html><html><head><meta charset="utf-8"><title>${moduleConfig.noun}</title>
      <style>body{font-family:Arial,sans-serif;color:#111827;padding:24px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #d1d5db;padding:8px;text-align:left}</style>
      </head><body>${exportRootClone().innerHTML}</body></html>`;
    downloadBlob(new Blob(["\uFEFF", html], { type: "application/msword" }), fileName("doc"));
    toast("Word export created.");
  }

  function exportExcel() {
    if (invokeNativeButton(ACTION_PATTERNS.excel)) return;
    if (invokeFunction(["exportExcel", "downloadExcel"])) return;

    const tables = Array.from(document.querySelectorAll("main table"));
    const body = tables.length
      ? tables.map((table, index) => `<h3>Table ${index + 1}</h3>${table.outerHTML}`).join("<br>")
      : `<table><tr><th>Field</th><th>Value</th></tr>${draftFields().map((field, index) => {
          const label = field.labels?.[0]?.textContent || field.placeholder || field.id || field.name || `Field ${index + 1}`;
          return `<tr><td>${escapeHtml(label)}</td><td>${escapeHtml(field.value)}</td></tr>`;
        }).join("")}</table>`;

    const html = `<!doctype html><html><head><meta charset="utf-8"></head><body>${body}</body></html>`;
    downloadBlob(new Blob(["\uFEFF", html], { type: "application/vnd.ms-excel" }), fileName("xls"));
    toast("Excel export created.");
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    }[character]));
  }

  function fileName(extension) {
    const date = new Date().toISOString().slice(0, 10);
    return `easyfile-${moduleConfig.id}-${date}.${extension}`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = name;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  }

  function createButton(id, label, icon, variant, handler) {
    const element = document.createElement("button");
    element.id = id;
    element.type = "button";
    element.className = `easyfile-action-button ${variant}`;
    element.innerHTML = `<i class="fa-solid ${icon}" aria-hidden="true"></i><span>${label}</span>`;
    element.addEventListener("click", handler);
    return element;
  }

  function hideDuplicateNativeActions() {
    const patterns = [
      moduleConfig.newPattern,
      moduleConfig.secondaryPattern,
      ACTION_PATTERNS.save,
      ACTION_PATTERNS.preview,
      ACTION_PATTERNS.print,
      ACTION_PATTERNS.pdf,
      ACTION_PATTERNS.word,
      ACTION_PATTERNS.excel,
      ACTION_PATTERNS.csv
    ];

    document.querySelectorAll("button, [role='button'], a.btn").forEach((element) => {
      if (element.closest(`#${TOOLBAR_ID}`)) return;
      const text = buttonText(element);
      if (patterns.some((pattern) => pattern.test(text))) {
        element.classList.add("easyfile-native-action-hidden");
        element.setAttribute("aria-hidden", "true");
        element.tabIndex = -1;
      }
    });
  }

  function mountToolbar() {
    if (document.getElementById(TOOLBAR_ID)) return;
    const main = document.querySelector("main");
    if (!main) return;

    const toolbar = document.createElement("section");
    toolbar.id = TOOLBAR_ID;
    toolbar.className = "easyfile-action-card card no-print";
    toolbar.setAttribute("aria-label", `${moduleConfig.noun} actions`);

    const row = document.createElement("div");
    row.className = "easyfile-action-row flex flex-wrap gap-2 items-center";

    const newButton = createButton(
      "easyfileBtnNew",
      moduleConfig.newLabel,
      moduleConfig.newIcon,
      "easyfile-action-primary btn text-white px-4 py-2 rounded-lg",
      newRecord
    );

    const secondaryButton = createButton(
      "easyfileBtnSecondary",
      moduleConfig.secondaryLabel,
      moduleConfig.secondaryIcon,
      "easyfile-action-success bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg",
      secondaryAction
    );

    const group = document.createElement("div");
    group.className = "easyfile-action-group ml-auto flex flex-wrap gap-2";

    group.append(
      createButton("easyfileBtnSave", "Save Draft", "fa-floppy-disk", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", saveDraft),
      createButton("easyfileBtnPreview", "Preview", "fa-eye", "easyfile-action-secondary bg-gray-900 text-white px-4 py-2 rounded-lg", preview),
      createButton("easyfileBtnPrint", moduleConfig.printLabel, "fa-print", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", printDocument),
      createButton("easyfileBtnPdf", "Export PDF", "fa-file-pdf text-red-600", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", exportPdf),
      createButton("easyfileBtnWord", "Export Word", "fa-file-word text-blue-600", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", exportWord),
      createButton("easyfileBtnExcel", "Export Excel", "fa-file-excel text-green-600", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", exportExcel),
      createButton("easyfileBtnCsv", "Export CSV", "fa-file-csv text-gray-700", "easyfile-action-secondary bg-white border border-gray-200 hover:bg-gray-50 px-4 py-2 rounded-lg", exportCsv)
    );

    const status = document.createElement("p");
    status.id = "easyfileActionStatus";
    status.className = "easyfile-action-status";
    status.setAttribute("aria-live", "polite");
    status.textContent = "Use the actions above to create, save, preview, print or export this module's records.";

    row.append(newButton, secondaryButton, group, status);
    toolbar.appendChild(row);

    const directHeader = Array.from(main.children).find((child) => child.tagName === "HEADER");
    if (directHeader) directHeader.insertAdjacentElement("afterend", toolbar);
    else main.insertBefore(toolbar, main.firstChild);

    hideDuplicateNativeActions();
    restoreDraft();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", mountToolbar, { once: true });
  } else {
    mountToolbar();
  }
})();
