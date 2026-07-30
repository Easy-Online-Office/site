import * as pdfjsLib from "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.min.mjs";

pdfjsLib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/4.10.38/pdf.worker.min.mjs";

const MAX_FILE_BYTES = 25 * 1024 * 1024;
const PAGE_LINE_TOLERANCE = 2.8;
const MODULE_ID = "bank-statement-converter";
const PAGE_FILE = "easy-bank-statement-converter.html";
const REFERRAL_API = String(window.EASYFILE_REFERRAL_CONFIG?.apiBase || "https://api-easyfile.skunkworks.africa/api/referrals").replace(/\/$/, "");
const REFERRAL_KEYS = Object.freeze({
  email: "easyfile:referral:email",
  entitlement: "easyfile:referral:entitlement:v1",
  pendingCode: "easyfile:referral:pending-code"
});

const BANKS = Object.freeze({
  fnb: { label: "FNB / RMB", test: /\b(FNB|FIRST NATIONAL BANK|RAND MERCHANT BANK|RMB)\b/i },
  absa: { label: "Absa", test: /\bABSA\b/i },
  "standard-bank": { label: "Standard Bank", test: /\bSTANDARD BANK\b/i },
  nedbank: { label: "Nedbank", test: /\bNEDBANK\b/i },
  capitec: { label: "Capitec", test: /\bCAPITEC\b/i },
  tymebank: { label: "TymeBank", test: /\bTYME\s*BANK|\bTYMEBANK\b/i },
  investec: { label: "Investec", test: /\bINVESTEC\b/i },
  generic: { label: "Generic statement", test: /.^/ }
});

const DEBIT_TERMS = /\b(POS|PURCHASE|PAYMENT|PAID|DEBIT ORDER|SERVICE FEE|BANK FEE|BANK CHARGE|FEE|ATM|WITHDRAWAL|TRANSFER TO|EFT OUT|CASH WITHDRAWAL|CARD TRANSACTION|IMMEDIATE PMT|INTERNET PMT|MOBILE PMT|PREPAID|LEVY|COMMISSION)\b/i;
const CREDIT_TERMS = /\b(DEPOSIT|CREDIT|SALARY|INTEREST RECEIVED|REFUND|REVERSAL|TRANSFER FROM|EFT IN|PAYMENT RECEIVED|CASH DEP|CASH DEPOSIT|SETTLEMENT|PROCEEDS)\b/i;
const NON_TRANSACTION_TERMS = /\b(OPENING BALANCE|CLOSING BALANCE|BALANCE BROUGHT FORWARD|BALANCE CARRIED FORWARD|TOTAL DEBITS|TOTAL CREDITS|STATEMENT PERIOD|ACCOUNT SUMMARY|AVAILABLE BALANCE|LEDGER BALANCE|DATE DESCRIPTION|TRANSACTION HISTORY|PAGE \d+ OF \d+)\b/i;
const DATE_FINDER = /\b(?:\d{4}[\/.\-]\d{1,2}[\/.\-]\d{1,2}|\d{1,2}[\/.\-]\d{1,2}(?:[\/.\-]\d{2,4})?|\d{1,2}\s+(?:JAN(?:UARY)?|FEB(?:RUARY)?|MAR(?:CH)?|APR(?:IL)?|MAY|JUN(?:E)?|JUL(?:Y)?|AUG(?:UST)?|SEP(?:TEMBER)?|OCT(?:OBER)?|NOV(?:EMBER)?|DEC(?:EMBER)?)(?:\s+\d{2,4})?)\b/i;
const MONEY_FINDER = /(?:\(\s*(?:R\s*)?\d[\d\s,]*[.,]\d{2}\s*\)|[-+]?\s*(?:R\s*)?\d[\d\s,]*[.,]\d{2}(?:\s*(?:CR|DR))?)/gi;

const state = {
  file: null,
  pages: 0,
  rawText: "",
  rawLines: [],
  transactions: [],
  detectedBank: "generic",
  processing: false,
  entitlement: readJson(REFERRAL_KEYS.entitlement),
  accessModalResolve: null,
  accessModalReject: null
};

const el = (id) => document.getElementById(id);
const dom = Object.freeze({
  file: el("pdfFile"),
  chooseFileButton: el("chooseFileButton"),
  dropZone: el("dropZone"),
  fileBadge: el("fileBadge"),
  sampleButton: el("sampleButton"),
  clearButton: el("clearButton"),
  bankProfile: el("bankProfile"),
  sourceDateOrder: el("sourceDateOrder"),
  exportDateFormat: el("exportDateFormat"),
  defaultYear: el("defaultYear"),
  ambiguousDirection: el("ambiguousDirection"),
  convertButton: el("convertButton"),
  processingPanel: el("processingPanel"),
  processingTitle: el("processingTitle"),
  processingMessage: el("processingMessage"),
  processingProgress: el("processingProgress"),
  resultSection: el("resultSection"),
  detectedBankBadge: el("detectedBankBadge"),
  pageCountBadge: el("pageCountBadge"),
  transactionRows: el("transactionRows"),
  transactionSearch: el("transactionSearch"),
  reviewFilter: el("reviewFilter"),
  addRowButton: el("addRowButton"),
  emptyReviewMessage: el("emptyReviewMessage"),
  validationList: el("validationList"),
  sageReadyBadge: el("sageReadyBadge"),
  transactionCount: el("transactionCount"),
  dateRangeLabel: el("dateRangeLabel"),
  moneyInTotal: el("moneyInTotal"),
  moneyInCount: el("moneyInCount"),
  moneyOutTotal: el("moneyOutTotal"),
  moneyOutCount: el("moneyOutCount"),
  warningCount: el("warningCount"),
  readinessLabel: el("readinessLabel"),
  exportCsvButton: el("exportCsvButton"),
  exportExcelButton: el("exportExcelButton"),
  exportAuditButton: el("exportAuditButton"),
  exportStatus: el("exportStatus"),
  accessModal: el("accessModal"),
  accessModalTitle: el("accessModalTitle"),
  accessModalCopy: el("accessModalCopy"),
  accessModalClose: el("accessModalClose"),
  accessForm: el("accessForm"),
  accessEmail: el("accessEmail"),
  accessMessage: el("accessMessage")
});

function readJson(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); }
  catch { return null; }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;"
  }[character]));
}

function uid() {
  if (crypto?.randomUUID) return crypto.randomUUID();
  return `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function money(value) {
  return new Intl.NumberFormat("en-ZA", { style: "currency", currency: "ZAR" }).format(Number(value || 0));
}

function setStatus(message, isError = false) {
  dom.exportStatus.textContent = message;
  dom.exportStatus.style.color = isError ? "#dc2626" : "";
}

function setProcessing(show, title = "Reading statement…", message = "Preparing the PDF parser.", progress = 0) {
  state.processing = show;
  dom.processingPanel.hidden = !show;
  dom.processingTitle.textContent = title;
  dom.processingMessage.textContent = message;
  dom.processingProgress.value = progress;
  dom.convertButton.disabled = show || !state.file;
}

function updateProcessing(title, message, progress) {
  dom.processingTitle.textContent = title;
  dom.processingMessage.textContent = message;
  dom.processingProgress.value = Math.max(0, Math.min(100, progress));
}

function toast(message, isError = false) {
  document.querySelector(".bank-converter-toast")?.remove();
  const node = document.createElement("div");
  node.className = "bank-converter-toast easyfile-action-toast";
  node.setAttribute("role", isError ? "alert" : "status");
  node.textContent = message;
  if (isError) node.style.background = "#b91c1c";
  document.body.appendChild(node);
  window.setTimeout(() => node.remove(), 3600);
}

function selectFile(file) {
  if (!file) return;
  if (file.type !== "application/pdf" && !file.name.toLowerCase().endsWith(".pdf")) {
    toast("Select a PDF bank statement.", true);
    return;
  }
  if (file.size > MAX_FILE_BYTES) {
    toast("The PDF is larger than the 25 MB browser-processing limit.", true);
    return;
  }

  state.file = file;
  state.transactions = [];
  state.rawLines = [];
  state.rawText = "";
  state.pages = 0;
  dom.fileBadge.textContent = `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB`;
  dom.fileBadge.className = "bank-status-pill bank-status-success";
  dom.convertButton.disabled = false;
  dom.resultSection.hidden = true;
  setStatus("");
}

function clearSession() {
  state.file = null;
  state.pages = 0;
  state.rawText = "";
  state.rawLines = [];
  state.transactions = [];
  state.detectedBank = "generic";
  dom.file.value = "";
  dom.fileBadge.textContent = "No file selected";
  dom.fileBadge.className = "bank-status-pill";
  dom.convertButton.disabled = true;
  dom.resultSection.hidden = true;
  dom.transactionRows.innerHTML = "";
  setProcessing(false);
  setStatus("");
}

function groupTextItems(items, pageNumber) {
  const groups = [];
  const sorted = items
    .filter((item) => String(item.str || "").trim())
    .map((item) => ({
      text: String(item.str || "").trim(),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      width: Number(item.width || 0)
    }))
    .sort((a, b) => b.y - a.y || a.x - b.x);

  for (const item of sorted) {
    let group = groups.find((candidate) => Math.abs(candidate.y - item.y) <= PAGE_LINE_TOLERANCE);
    if (!group) {
      group = { y: item.y, items: [] };
      groups.push(group);
    }
    group.items.push(item);
  }

  return groups
    .sort((a, b) => b.y - a.y)
    .map((group) => {
      const row = group.items.sort((a, b) => a.x - b.x);
      let text = "";
      let previousEnd = null;
      for (const item of row) {
        const gap = previousEnd === null ? 0 : item.x - previousEnd;
        if (text && gap > 16) text += "    ";
        else if (text && !text.endsWith(" ")) text += " ";
        text += item.text;
        previousEnd = item.x + item.width;
      }
      return { page: pageNumber, text: text.replace(/\s+/g, " ").trim() };
    })
    .filter((line) => line.text);
}

async function extractPdf(file) {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const loadingTask = pdfjsLib.getDocument({ data: bytes, isEvalSupported: false, useSystemFonts: true });
  const pdf = await loadingTask.promise;
  const lines = [];
  let characterCount = 0;

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    updateProcessing("Reading statement…", `Extracting text from page ${pageNumber} of ${pdf.numPages}.`, Math.round((pageNumber / pdf.numPages) * 68));
    const page = await pdf.getPage(pageNumber);
    const text = await page.getTextContent({ includeMarkedContent: false });
    const pageLines = groupTextItems(text.items, pageNumber);
    characterCount += pageLines.reduce((sum, line) => sum + line.text.length, 0);
    lines.push(...pageLines);
  }

  if (characterCount < 80) {
    const error = new Error("This PDF appears to contain scanned images rather than selectable text. Run OCR first or download CSV/OFX from your bank.");
    error.code = "IMAGE_ONLY_PDF";
    throw error;
  }

  return { pages: pdf.numPages, lines, rawText: lines.map((line) => line.text).join("\n") };
}

function detectBank(text) {
  for (const [key, bank] of Object.entries(BANKS)) {
    if (key !== "generic" && bank.test.test(text)) return key;
  }
  return "generic";
}

function findDate(text) {
  const match = String(text || "").match(DATE_FINDER);
  return match ? { raw: match[0], index: match.index || 0 } : null;
}

function monthIndex(value) {
  const key = String(value || "").slice(0, 3).toLowerCase();
  return ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"].indexOf(key) + 1;
}

function normaliseDate(raw, order = "dmy", defaultYear = new Date().getFullYear()) {
  const value = String(raw || "").trim().replace(/\./g, "/").replace(/-/g, "/").replace(/\s+/g, " ");
  if (!value) return "";

  let day;
  let month;
  let year;

  if (/[A-Za-z]/.test(value)) {
    const parts = value.split(" ");
    day = Number(parts[0]);
    month = monthIndex(parts[1]);
    year = Number(parts[2] || defaultYear);
  } else {
    const parts = value.split("/").map((part) => Number(part));
    if (parts.length === 2) parts.push(Number(defaultYear));
    if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return "";
    if (String(parts[0]).length === 4 || order === "ymd") [year, month, day] = parts;
    else if (order === "mdy") [month, day, year] = parts;
    else [day, month, year] = parts;
  }

  if (year < 100) year += year >= 70 ? 1900 : 2000;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return "";
  return `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function findMoneyTokens(text) {
  const tokens = [];
  MONEY_FINDER.lastIndex = 0;
  let match;
  while ((match = MONEY_FINDER.exec(String(text || ""))) !== null) {
    tokens.push({ raw: match[0], index: match.index, end: match.index + match[0].length, value: parseMoney(match[0]) });
  }
  return tokens;
}

function parseMoney(raw) {
  const source = String(raw || "").trim();
  const negative = /^\s*-/.test(source) || /^\s*\(/.test(source) || /\bDR\b/i.test(source);
  const positive = /^\s*\+/.test(source) || /\bCR\b/i.test(source);
  let value = source.replace(/[Rr()\s+\-]|CR|DR/gi, "");

  const lastComma = value.lastIndexOf(",");
  const lastDot = value.lastIndexOf(".");
  if (lastComma > lastDot) value = value.replace(/\./g, "").replace(/,/g, ".");
  else value = value.replace(/,/g, "");

  const number = Number(value);
  if (!Number.isFinite(number)) return 0;
  if (negative) return -Math.abs(number);
  if (positive) return Math.abs(number);
  return number;
}

function buildTransactionBlocks(lines) {
  const blocks = [];
  let current = null;

  for (const line of lines) {
    const text = line.text.replace(/\s+/g, " ").trim();
    if (!text) continue;
    const date = findDate(text);

    if (date && !NON_TRANSACTION_TERMS.test(text)) {
      if (current) blocks.push(current);
      current = { page: line.page, lines: [text] };
      continue;
    }

    if (current && current.lines.length < 5 && !NON_TRANSACTION_TERMS.test(text)) {
      current.lines.push(text);
    }
  }
  if (current) blocks.push(current);
  return blocks;
}

function chooseAmount(tokens) {
  if (!tokens.length) return null;
  if (tokens.length === 1) return { transaction: tokens[0], balance: null };

  const balance = tokens[tokens.length - 1];
  const preceding = tokens.slice(0, -1);
  let transaction = preceding[preceding.length - 1];

  if (preceding.length >= 2) {
    const lastTwo = preceding.slice(-2);
    const nonZero = lastTwo.filter((token) => Math.abs(token.value) > 0.0001);
    if (nonZero.length === 1) transaction = nonZero[0];
  }
  return { transaction, balance };
}

function cleanDescription(text, dateRaw, tokens) {
  let description = String(text || "");
  if (dateRaw) description = description.replace(dateRaw, " ");
  for (const token of [...tokens].sort((a, b) => b.index - a.index)) {
    description = `${description.slice(0, token.index)} ${description.slice(token.end)}`;
  }
  return description
    .replace(/\b(?:CR|DR|DEBIT|CREDIT|BALANCE)\b/gi, " ")
    .replace(/\bPAGE\s+\d+(?:\s+OF\s+\d+)?\b/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/^[\s|:;,-]+|[\s|:;,-]+$/g, "")
    .trim();
}

function inferDirection(description, token, ambiguousDirection) {
  const raw = token.raw;
  if (/\bDR\b/i.test(raw) || /^\s*-|^\s*\(/.test(raw)) return { sign: -1, confidence: "high", reason: "Explicit debit marker" };
  if (/\bCR\b/i.test(raw) || /^\s*\+/.test(raw)) return { sign: 1, confidence: "high", reason: "Explicit credit marker" };
  if (DEBIT_TERMS.test(description) && !CREDIT_TERMS.test(description)) return { sign: -1, confidence: "medium", reason: "Debit description keyword" };
  if (CREDIT_TERMS.test(description) && !DEBIT_TERMS.test(description)) return { sign: 1, confidence: "medium", reason: "Credit description keyword" };
  if (token.value < 0) return { sign: -1, confidence: "high", reason: "Negative amount" };
  if (ambiguousDirection === "credit") return { sign: 1, confidence: "low", reason: "Defaulted to money in" };
  if (ambiguousDirection === "positive") return { sign: token.value < 0 ? -1 : 1, confidence: "low", reason: "Kept extracted sign" };
  return { sign: -1, confidence: "low", reason: "Defaulted to money out" };
}

function parseBlocks(blocks, settings) {
  const transactions = [];

  for (const block of blocks) {
    const combined = block.lines.join(" ").replace(/\s+/g, " ").trim();
    if (!combined || NON_TRANSACTION_TERMS.test(combined)) continue;
    const dateMatch = findDate(combined);
    if (!dateMatch) continue;
    const date = normaliseDate(dateMatch.raw, settings.sourceDateOrder, settings.defaultYear);
    const tokens = findMoneyTokens(combined);
    if (!tokens.length) continue;
    const selected = chooseAmount(tokens);
    if (!selected || Math.abs(selected.transaction.value) < 0.0001) continue;

    const description = cleanDescription(combined, dateMatch.raw, tokens);
    if (!description || description.length < 2) continue;
    const direction = inferDirection(description, selected.transaction, settings.ambiguousDirection);
    const absoluteAmount = Math.abs(selected.transaction.value);

    transactions.push({
      id: uid(),
      date,
      originalDate: dateMatch.raw,
      description,
      amount: absoluteAmount * direction.sign,
      balance: selected.balance ? selected.balance.value : null,
      confidence: date ? direction.confidence : "low",
      confidenceReason: date ? direction.reason : "Date could not be interpreted",
      page: block.page,
      raw: combined,
      issues: []
    });
  }

  applyBalanceInference(transactions);
  return transactions;
}

function applyBalanceInference(transactions) {
  const chronological = transactions
    .filter((item) => item.date && Number.isFinite(item.balance))
    .slice()
    .sort((a, b) => a.date.localeCompare(b.date));

  for (let index = 1; index < chronological.length; index += 1) {
    const previous = chronological[index - 1];
    const current = chronological[index];
    if (current.date === previous.date) continue;
    const delta = Number(current.balance) - Number(previous.balance);
    const tolerance = Math.max(.03, Math.abs(current.amount) * .015);
    if (Math.abs(Math.abs(delta) - Math.abs(current.amount)) <= tolerance) {
      current.amount = delta;
      current.confidence = "high";
      current.confidenceReason = "Direction inferred from running balance";
    }
  }
}

function settings() {
  return {
    sourceDateOrder: dom.sourceDateOrder.value,
    exportDateFormat: dom.exportDateFormat.value,
    defaultYear: Number(dom.defaultYear.value || new Date().getFullYear()),
    ambiguousDirection: dom.ambiguousDirection.value
  };
}

async function convertStatement() {
  if (!state.file || state.processing) return;
  setStatus("");
  setProcessing(true, "Reading statement…", "Loading the PDF into browser memory.", 3);

  try {
    const extracted = await extractPdf(state.file);
    state.pages = extracted.pages;
    state.rawLines = extracted.lines;
    state.rawText = extracted.rawText;
    const requestedBank = dom.bankProfile.value;
    state.detectedBank = requestedBank === "auto" ? detectBank(extracted.rawText) : requestedBank;

    updateProcessing("Finding transactions…", "Grouping statement rows and detecting dates and amounts.", 76);
    const blocks = buildTransactionBlocks(state.rawLines);
    state.transactions = parseBlocks(blocks, settings());

    updateProcessing("Validating Sage output…", "Checking dates, descriptions, duplicates and amount signs.", 92);
    validateAll();
    renderResults();
    updateProcessing("Conversion complete", `${state.transactions.length} transaction rows are ready for review.`, 100);
    window.setTimeout(() => setProcessing(false), 450);

    if (!state.transactions.length) {
      toast("No transaction rows could be recognised. Try another bank profile or use your bank's CSV/OFX download.", true);
    } else {
      dom.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  } catch (error) {
    console.error(error);
    setProcessing(false);
    const message = error?.name === "PasswordException"
      ? "The PDF is password-protected. Save an unlocked copy and try again."
      : error?.message || "The PDF could not be processed.";
    toast(message, true);
    setStatus(message, true);
  }
}

function sampleTransactions() {
  const year = Number(dom.defaultYear.value || new Date().getFullYear());
  state.file = null;
  state.pages = 1;
  state.rawText = "EASYFILE SAMPLE BANK STATEMENT";
  state.rawLines = [];
  state.detectedBank = "generic";
  state.transactions = [
    { id: uid(), date: `${year}-07-03`, originalDate: "03/07", description: "CLIENT PAYMENT 4581", amount: 4500, balance: null, confidence: "high", confidenceReason: "Sample credit", page: 1, raw: "03/07 CLIENT PAYMENT 4581 4500.00", issues: [] },
    { id: uid(), date: `${year}-07-04`, originalDate: "04/07", description: "MONTHLY SERVICE FEE", amount: -175, balance: null, confidence: "medium", confidenceReason: "Debit description keyword", page: 1, raw: "04/07 MONTHLY SERVICE FEE 175.00", issues: [] },
    { id: uid(), date: `${year}-07-05`, originalDate: "05/07", description: "OFFICE SUPPLIES CARD PURCHASE", amount: -820.45, balance: null, confidence: "medium", confidenceReason: "Debit description keyword", page: 1, raw: "05/07 OFFICE SUPPLIES CARD PURCHASE 820.45", issues: [] }
  ];
  dom.fileBadge.textContent = "Sample transactions loaded";
  dom.fileBadge.className = "bank-status-pill bank-status-success";
  validateAll();
  renderResults();
  dom.resultSection.scrollIntoView({ behavior: "smooth", block: "start" });
}

function validationFor(transaction, duplicateCount) {
  const issues = [];
  if (!transaction.date) issues.push({ type: "error", message: "Invalid or missing date" });
  if (!String(transaction.description || "").trim()) issues.push({ type: "error", message: "Description is required" });
  if (String(transaction.description || "").trim().length > 100) issues.push({ type: "warning", message: "Description will be limited to 100 characters" });
  if (!Number.isFinite(Number(transaction.amount)) || Math.abs(Number(transaction.amount)) < .005) issues.push({ type: "error", message: "Amount must be non-zero" });
  if (transaction.confidence === "low") issues.push({ type: "warning", message: transaction.confidenceReason || "Low-confidence extraction" });
  if (duplicateCount > 1) issues.push({ type: "warning", message: "Possible duplicate transaction" });
  return issues;
}

function validateAll() {
  const duplicateMap = new Map();
  for (const transaction of state.transactions) {
    const key = `${transaction.date}|${sanitiseDescription(transaction.description)}|${Number(transaction.amount || 0).toFixed(2)}`;
    duplicateMap.set(key, (duplicateMap.get(key) || 0) + 1);
  }

  for (const transaction of state.transactions) {
    const key = `${transaction.date}|${sanitiseDescription(transaction.description)}|${Number(transaction.amount || 0).toFixed(2)}`;
    transaction.issues = validationFor(transaction, duplicateMap.get(key) || 0);
  }

  updateSummary();
  renderValidationSummary();
}

function blockingErrors() {
  return state.transactions.flatMap((item) => item.issues.filter((issue) => issue.type === "error"));
}

function warningIssues() {
  return state.transactions.flatMap((item) => item.issues.filter((issue) => issue.type === "warning"));
}

function updateSummary() {
  const credits = state.transactions.filter((item) => Number(item.amount) > 0);
  const debits = state.transactions.filter((item) => Number(item.amount) < 0);
  const moneyIn = credits.reduce((sum, item) => sum + Number(item.amount), 0);
  const moneyOut = debits.reduce((sum, item) => sum + Math.abs(Number(item.amount)), 0);
  const warnings = warningIssues().length + blockingErrors().length;
  const dates = state.transactions.map((item) => item.date).filter(Boolean).sort();

  dom.transactionCount.textContent = String(state.transactions.length);
  dom.dateRangeLabel.textContent = dates.length ? `${formatDisplayDate(dates[0])} – ${formatDisplayDate(dates[dates.length - 1])}` : "No valid date range";
  dom.moneyInTotal.textContent = money(moneyIn);
  dom.moneyInCount.textContent = `${credits.length} credit${credits.length === 1 ? "" : "s"}`;
  dom.moneyOutTotal.textContent = money(moneyOut);
  dom.moneyOutCount.textContent = `${debits.length} debit${debits.length === 1 ? "" : "s"}`;
  dom.warningCount.textContent = String(warnings);
  dom.readinessLabel.textContent = blockingErrors().length ? "Resolve errors before export" : warnings ? "Review warnings" : "Ready to export";
}

function renderValidationSummary() {
  const errors = blockingErrors();
  const warnings = warningIssues();
  const items = [
    { type: state.transactions.length ? "pass" : "error", text: state.transactions.length ? `${state.transactions.length} transaction rows detected.` : "No transaction rows detected." },
    { type: errors.length ? "error" : "pass", text: errors.length ? `${errors.length} blocking validation error${errors.length === 1 ? "" : "s"}.` : "All rows have a valid date, description and non-zero amount." },
    { type: warnings.length ? "warning" : "pass", text: warnings.length ? `${warnings.length} review warning${warnings.length === 1 ? "" : "s"}, including low confidence or possible duplicates.` : "No low-confidence or duplicate warnings detected." },
    { type: "pass", text: "Export columns are Date, Description and Amount in Sage order." }
  ];

  dom.validationList.innerHTML = items.map((item) => {
    const icon = item.type === "pass" ? "fa-circle-check" : item.type === "warning" ? "fa-triangle-exclamation" : "fa-circle-xmark";
    return `<li class="is-${item.type}"><i class="fa-solid ${icon}" aria-hidden="true"></i><span>${escapeHtml(item.text)}</span></li>`;
  }).join("");

  const ready = state.transactions.length > 0 && errors.length === 0;
  dom.sageReadyBadge.textContent = ready ? (warnings.length ? "Ready with warnings" : "Sage-ready") : "Needs correction";
  dom.sageReadyBadge.className = `bank-status-pill ${ready ? (warnings.length ? "bank-status-warning" : "bank-status-success") : "bank-status-error"}`;
  dom.exportCsvButton.disabled = !ready;
  dom.exportExcelButton.disabled = !ready;
  dom.exportAuditButton.disabled = !state.transactions.length;
}

function renderResults() {
  dom.resultSection.hidden = false;
  const bank = BANKS[state.detectedBank] || BANKS.generic;
  dom.detectedBankBadge.textContent = `Bank: ${bank.label}`;
  dom.detectedBankBadge.className = "bank-status-pill bank-status-success";
  dom.pageCountBadge.textContent = `${state.pages} page${state.pages === 1 ? "" : "s"}`;
  renderTransactions();
  updateSummary();
  renderValidationSummary();
}

function filteredTransactions() {
  const query = dom.transactionSearch.value.trim().toLowerCase();
  const filter = dom.reviewFilter.value;
  return state.transactions.filter((item) => {
    const queryMatch = !query || `${item.date} ${item.description} ${item.amount}`.toLowerCase().includes(query);
    const filterMatch = filter === "all"
      || (filter === "warnings" && item.issues.length)
      || (filter === "credits" && item.amount > 0)
      || (filter === "debits" && item.amount < 0);
    return queryMatch && filterMatch;
  });
}

function renderTransactions() {
  const rows = filteredTransactions();
  dom.transactionRows.innerHTML = "";
  dom.emptyReviewMessage.hidden = rows.length > 0;

  for (const item of rows) {
    const tr = document.createElement("tr");
    const hasError = item.issues.some((issue) => issue.type === "error");
    tr.className = hasError ? "bank-row-error" : item.issues.length ? "bank-row-warning" : "";
    const confidenceLabel = item.confidence.charAt(0).toUpperCase() + item.confidence.slice(1);
    tr.innerHTML = `
      <td><input data-field="date" type="date" value="${escapeHtml(item.date)}" aria-label="Transaction date" aria-invalid="${!item.date}"></td>
      <td><input data-field="description" type="text" maxlength="180" value="${escapeHtml(item.description)}" aria-label="Transaction description" aria-invalid="${!item.description}"><small title="${escapeHtml(item.raw)}">Page ${item.page}</small></td>
      <td><select data-field="direction" aria-label="Money direction"><option value="credit" ${item.amount >= 0 ? "selected" : ""}>Money in</option><option value="debit" ${item.amount < 0 ? "selected" : ""}>Money out</option></select></td>
      <td><input data-field="amount" class="amount-input" type="number" min="0" step="0.01" value="${Math.abs(Number(item.amount || 0)).toFixed(2)}" aria-label="Transaction amount" aria-invalid="${Math.abs(Number(item.amount || 0)) < .005}"></td>
      <td><span class="bank-confidence bank-confidence-${item.confidence}" title="${escapeHtml(item.confidenceReason)}">${confidenceLabel}</span></td>
      <td class="no-print"><button class="bank-delete-row" type="button" aria-label="Delete transaction"><i class="fa-solid fa-trash-can" aria-hidden="true"></i></button></td>`;

    const dateInput = tr.querySelector('[data-field="date"]');
    const descriptionInput = tr.querySelector('[data-field="description"]');
    const directionInput = tr.querySelector('[data-field="direction"]');
    const amountInput = tr.querySelector('[data-field="amount"]');

    dateInput.addEventListener("change", () => { item.date = dateInput.value; item.confidence = item.date ? item.confidence : "low"; refreshAfterEdit(); });
    descriptionInput.addEventListener("input", () => { item.description = descriptionInput.value; refreshAfterEdit(false); });
    directionInput.addEventListener("change", () => { item.amount = Math.abs(Number(item.amount || 0)) * (directionInput.value === "debit" ? -1 : 1); item.confidence = "high"; item.confidenceReason = "Direction confirmed by user"; refreshAfterEdit(); });
    amountInput.addEventListener("input", () => { const sign = directionInput.value === "debit" ? -1 : 1; item.amount = Math.abs(Number(amountInput.value || 0)) * sign; item.confidence = "high"; item.confidenceReason = "Amount confirmed by user"; refreshAfterEdit(false); });
    tr.querySelector(".bank-delete-row").addEventListener("click", () => { state.transactions = state.transactions.filter((transaction) => transaction.id !== item.id); validateAll(); renderTransactions(); });
    dom.transactionRows.appendChild(tr);
  }
}

let editRefreshTimer = null;
function refreshAfterEdit(rerender = true) {
  window.clearTimeout(editRefreshTimer);
  editRefreshTimer = window.setTimeout(() => {
    validateAll();
    if (rerender) renderTransactions();
  }, 160);
}

function addRow() {
  state.transactions.push({
    id: uid(), date: "", originalDate: "", description: "", amount: -0, balance: null,
    confidence: "low", confidenceReason: "Manual row requires review", page: 0, raw: "Manual row", issues: []
  });
  dom.reviewFilter.value = "all";
  dom.transactionSearch.value = "";
  validateAll();
  renderTransactions();
  dom.transactionRows.lastElementChild?.querySelector("input")?.focus();
}

function sanitiseDescription(value) {
  return String(value || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0, 100);
}

function formatExportDate(iso, format = dom.exportDateFormat.value) {
  const [year, month, day] = String(iso || "").split("-");
  if (!year || !month || !day) return "";
  if (format === "yyyy/mm/dd") return `${year}/${month}/${day}`;
  if (format === "mm/dd/yyyy") return `${month}/${day}/${year}`;
  return `${day}/${month}/${year}`;
}

function formatDisplayDate(iso) {
  if (!iso) return "";
  const date = new Date(`${iso}T00:00:00`);
  return Number.isNaN(date.getTime()) ? iso : new Intl.DateTimeFormat("en-ZA", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function exportRows() {
  return state.transactions.map((item) => ({
    Date: formatExportDate(item.date),
    Description: sanitiseDescription(item.description),
    Amount: Number(item.amount).toFixed(2)
  }));
}

function csvCell(value) {
  const text = String(value ?? "");
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function filename(extension) {
  const source = state.file?.name?.replace(/\.pdf$/i, "") || "easyfile-bank-statement";
  const safe = source.replace(/[^a-z0-9._-]+/gi, "-").replace(/-+/g, "-").replace(/^-|-$/g, "");
  return `${safe || "easyfile-bank-statement"}-sage-import.${extension}`;
}

function downloadBlob(blob, name) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  document.body.appendChild(anchor);
  anchor.click();
  window.setTimeout(() => { URL.revokeObjectURL(url); anchor.remove(); }, 0);
}

async function exportCsv() {
  if (!await prepareExport("CSV")) return;
  const rows = exportRows();
  const csv = `Date,Description,Amount\r\n${rows.map((row) => [row.Date, row.Description, row.Amount].map(csvCell).join(",")).join("\r\n")}`;
  downloadBlob(new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }), filename("csv"));
  setStatus(`Downloaded ${rows.length} Sage-formatted transaction rows.`);
  await recordQualifyingUse("export csv");
}

async function exportExcel() {
  if (!await prepareExport("Excel")) return;
  if (!window.XLSX) {
    setStatus("The Excel export library did not load. Use Sage CSV or check your network connection.", true);
    return;
  }
  const rows = exportRows().map((row) => ({ Date: row.Date, Description: row.Description, Amount: Number(row.Amount) }));
  const sheet = window.XLSX.utils.json_to_sheet(rows, { header: ["Date", "Description", "Amount"] });
  sheet["!cols"] = [{ wch: 14 }, { wch: 70 }, { wch: 16 }];
  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, sheet, "Sage Bank Import");
  window.XLSX.writeFile(workbook, filename("xlsx"));
  setStatus(`Downloaded ${rows.length} transactions as an Excel workbook.`);
  await recordQualifyingUse("export excel");
}

async function exportAudit() {
  if (!state.transactions.length) return;
  if (!await ensureExportAccess()) return;
  const payload = {
    generatedAt: new Date().toISOString(),
    sourceFile: state.file ? { name: state.file.name, size: state.file.size, type: state.file.type } : { name: "sample", size: 0, type: "sample" },
    detectedBank: BANKS[state.detectedBank]?.label || state.detectedBank,
    pageCount: state.pages,
    settings: settings(),
    transactions: state.transactions.map((item) => ({
      date: item.date, description: item.description, amount: item.amount, confidence: item.confidence,
      confidenceReason: item.confidenceReason, page: item.page, issues: item.issues, sourceText: item.raw
    }))
  };
  downloadBlob(new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" }), filename("audit.json"));
  setStatus("Downloaded the local conversion audit file.");
  await recordQualifyingUse("download audit");
}

async function prepareExport(type) {
  validateAll();
  if (!state.transactions.length) { setStatus("No transactions are available to export.", true); return false; }
  if (blockingErrors().length) { setStatus(`Resolve ${blockingErrors().length} blocking validation error${blockingErrors().length === 1 ? "" : "s"} before exporting.`, true); return false; }
  setStatus(`Checking EasyFile access before ${type} export…`);
  return ensureExportAccess();
}

async function referralRequest(path, payload) {
  const response = await fetch(`${REFERRAL_API}/${String(path).replace(/^\//, "")}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(data.error || `Access service returned ${response.status}.`);
    error.status = response.status;
    error.payload = data;
    throw error;
  }
  return data;
}

function validEmail(value) {
  return /^\S+@\S+\.\S+$/.test(String(value || "").trim());
}

function promptForEmail(message = "Enter the email linked to your EasyFile referral account.") {
  return new Promise((resolve, reject) => {
    state.accessModalResolve = resolve;
    state.accessModalReject = reject;
    dom.accessModalTitle.textContent = "Confirm EasyFile access";
    dom.accessModalCopy.textContent = message;
    dom.accessForm.hidden = false;
    dom.accessEmail.value = localStorage.getItem(REFERRAL_KEYS.email) || "";
    dom.accessMessage.textContent = "";
    dom.accessMessage.className = "bank-modal-message";
    dom.accessModal.hidden = false;
    window.setTimeout(() => dom.accessEmail.focus(), 0);
  });
}

function closeAccessModal(error = new Error("Access confirmation cancelled.")) {
  dom.accessModal.hidden = true;
  if (state.accessModalReject) state.accessModalReject(error);
  state.accessModalResolve = null;
  state.accessModalReject = null;
}

function showLockedAccess(entitlement) {
  const qualified = Number(entitlement?.referralsQualified || 0);
  const required = Number(entitlement?.referralsRequired || 3);
  dom.accessModalTitle.textContent = "Refer three people to continue";
  dom.accessModalCopy.textContent = `Your one free EasyFile use is complete. ${qualified} of ${required} qualifying referrals are complete. Open the referral dashboard to copy your link or refresh access.`;
  dom.accessForm.hidden = true;
  dom.accessMessage.textContent = "Export remains locked until the referral requirement is met.";
  dom.accessMessage.className = "bank-modal-message is-error";
  dom.accessModal.hidden = false;
}

async function ensureExportAccess() {
  const cached = state.entitlement || readJson(REFERRAL_KEYS.entitlement);
  if (cached?.access === "unlocked") return true;
  let email = localStorage.getItem(REFERRAL_KEYS.email) || "";

  try {
    if (!validEmail(email)) email = await promptForEmail();
    const referralCode = localStorage.getItem(REFERRAL_KEYS.pendingCode) || undefined;
    const entitlement = await referralRequest("session", { email, referralCode, page: PAGE_FILE, refresh: true });
    localStorage.removeItem(REFERRAL_KEYS.pendingCode);
    state.entitlement = entitlement;
    localStorage.setItem(REFERRAL_KEYS.entitlement, JSON.stringify(entitlement));

    if (entitlement.access === "locked") {
      showLockedAccess(entitlement);
      setStatus("Referral access is required before another export.", true);
      return false;
    }
    dom.accessModal.hidden = true;
    return true;
  } catch (error) {
    if (error?.message === "Access confirmation cancelled.") return false;
    console.error(error);
    const fallback = readJson(REFERRAL_KEYS.entitlement);
    if (fallback?.access === "unlocked") return true;
    setStatus("EasyFile access could not be verified. Check your connection and referral account before exporting.", true);
    toast("Access could not be verified.", true);
    return false;
  }
}

async function recordQualifyingUse(action) {
  if (!state.entitlement || state.entitlement.access !== "trial") return;
  const email = localStorage.getItem(REFERRAL_KEYS.email) || "";
  if (!validEmail(email)) return;
  try {
    const entitlement = await referralRequest("use", { email, moduleId: MODULE_ID, event: action });
    state.entitlement = entitlement;
    localStorage.setItem(REFERRAL_KEYS.entitlement, JSON.stringify(entitlement));
    if (entitlement.access === "locked") toast("Your free EasyFile use is complete. Refer three people to continue.");
  } catch (error) {
    console.error(error);
    toast("The export completed, but the referral service could not record this use. Refresh your referral status before the next export.", true);
  }
}

function bindEvents() {
  dom.defaultYear.value = String(new Date().getFullYear());
  const incomingReferral = new URLSearchParams(location.search).get("ref");
  if (incomingReferral) localStorage.setItem(REFERRAL_KEYS.pendingCode, incomingReferral.trim().toUpperCase());

  dom.chooseFileButton.addEventListener("click", (event) => { event.stopPropagation(); dom.file.click(); });
  dom.dropZone.addEventListener("click", () => dom.file.click());
  dom.dropZone.addEventListener("keydown", (event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); dom.file.click(); } });
  dom.file.addEventListener("change", () => selectFile(dom.file.files?.[0]));

  ["dragenter", "dragover"].forEach((name) => dom.dropZone.addEventListener(name, (event) => { event.preventDefault(); dom.dropZone.classList.add("is-dragging"); }));
  ["dragleave", "drop"].forEach((name) => dom.dropZone.addEventListener(name, (event) => { event.preventDefault(); dom.dropZone.classList.remove("is-dragging"); }));
  dom.dropZone.addEventListener("drop", (event) => selectFile(event.dataTransfer?.files?.[0]));

  dom.convertButton.addEventListener("click", convertStatement);
  dom.sampleButton.addEventListener("click", sampleTransactions);
  dom.clearButton.addEventListener("click", clearSession);
  dom.transactionSearch.addEventListener("input", renderTransactions);
  dom.reviewFilter.addEventListener("change", renderTransactions);
  dom.addRowButton.addEventListener("click", addRow);
  dom.exportCsvButton.addEventListener("click", exportCsv);
  dom.exportExcelButton.addEventListener("click", exportExcel);
  dom.exportAuditButton.addEventListener("click", exportAudit);
  dom.exportDateFormat.addEventListener("change", () => { validateAll(); setStatus("Export date format updated."); });

  dom.accessForm.addEventListener("submit", (event) => {
    event.preventDefault();
    const email = dom.accessEmail.value.trim().toLowerCase();
    if (!validEmail(email)) {
      dom.accessMessage.textContent = "Enter a valid email address.";
      dom.accessMessage.className = "bank-modal-message is-error";
      return;
    }
    localStorage.setItem(REFERRAL_KEYS.email, email);
    dom.accessModal.hidden = true;
    state.accessModalResolve?.(email);
    state.accessModalResolve = null;
    state.accessModalReject = null;
  });
  dom.accessModalClose.addEventListener("click", () => closeAccessModal());
  dom.accessModal.addEventListener("click", (event) => { if (event.target === dom.accessModal) closeAccessModal(); });
}

bindEvents();
