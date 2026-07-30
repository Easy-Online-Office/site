export const $ = (id) => document.getElementById(id);
export const dom = {
  file: $("pdfFile"), choose: $("chooseFileButton"), drop: $("dropZone"), badge: $("fileBadge"),
  sample: $("sampleButton"), clear: $("clearButton"), bank: $("bankProfile"), order: $("sourceDateOrder"),
  dateFormat: $("exportDateFormat"), year: $("defaultYear"), ambiguous: $("ambiguousDirection"),
  convert: $("convertButton"), panel: $("processingPanel"), title: $("processingTitle"),
  message: $("processingMessage"), progress: $("processingProgress"), results: $("resultSection"),
  profile: $("detectedBankBadge"), pages: $("pageCountBadge"), rows: $("transactionRows"),
  search: $("transactionSearch"), filter: $("reviewFilter"), add: $("addRowButton"), empty: $("emptyReviewMessage"),
  validations: $("validationList"), ready: $("sageReadyBadge"), count: $("transactionCount"), range: $("dateRangeLabel"),
  moneyIn: $("moneyInTotal"), moneyInCount: $("moneyInCount"), moneyOut: $("moneyOutTotal"),
  moneyOutCount: $("moneyOutCount"), warnings: $("warningCount"), readiness: $("readinessLabel"),
  csv: $("exportCsvButton"), excel: $("exportExcelButton"), audit: $("exportAuditButton"), status: $("exportStatus")
};
export const state = { file:null, pages:0, transactions:[], excludedRows:[], profile:"generic", bank:"generic", currency:"ZAR", reconciliation:null, processing:false };
export const esc = (v) => String(v ?? "").replace(/[&<>"']/g, (c) => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
export const uid = () => crypto?.randomUUID ? crypto.randomUUID() : `tx-${Date.now()}-${Math.random().toString(16).slice(2)}`;
export const clean = (v) => String(v || "").replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim().slice(0,100);
export function cash(value) {
  try { return new Intl.NumberFormat("en-ZA", { style:"currency", currency:/^[A-Z]{3}$/.test(state.currency) ? state.currency : "ZAR" }).format(Number(value) || 0); }
  catch { return `${state.currency} ${(Number(value) || 0).toFixed(2)}`; }
}
export function toast(message, error=false) {
  document.querySelector(".bank-converter-toast")?.remove();
  const node=document.createElement("div"); node.className="bank-converter-toast easyfile-action-toast";
  node.setAttribute("role", error ? "alert" : "status"); node.textContent=message;
  if (error) node.style.background="#b91c1c"; document.body.appendChild(node); setTimeout(()=>node.remove(),3800);
}
export function setStatus(message,error=false) { dom.status.textContent=message; dom.status.style.color=error ? "#dc2626" : ""; }
export function setProcessing(show,title="Reading statement…",message="Preparing the PDF parser.",progress=0) {
  state.processing=show; dom.panel.hidden=!show; dom.title.textContent=title; dom.message.textContent=message;
  dom.progress.value=progress; dom.convert.disabled=show || !state.file;
}
export function options() {
  return { bankProfile:dom.bank.value, sourceDateOrder:dom.order.value, exportDateFormat:dom.dateFormat.value,
    defaultYear:Number(dom.year.value) || new Date().getFullYear(), ambiguousDirection:dom.ambiguous.value };
}
export function errors() {
  const list=state.transactions.flatMap((t)=>t.issues.filter((i)=>i.type==="error"));
  if (state.reconciliation?.status==="fail") list.push({type:"error",message:"Statement balance reconciliation failed"});
  return list;
}
export const warnings = () => state.transactions.flatMap((t)=>t.issues.filter((i)=>i.type==="warning"));
function displayDate(value) {
  if (!value) return ""; const date=new Date(`${value}T00:00:00`);
  return Number.isNaN(date.getTime()) ? value : new Intl.DateTimeFormat("en-ZA",{day:"2-digit",month:"short",year:"numeric"}).format(date);
}
function updateSummary() {
  const credits=state.transactions.filter((t)=>Number(t.amount)>0), debits=state.transactions.filter((t)=>Number(t.amount)<0);
  const dates=state.transactions.map((t)=>t.date).filter(Boolean).sort(), count=errors().length+warnings().length;
  dom.count.textContent=String(state.transactions.length); dom.range.textContent=dates.length ? `${displayDate(dates[0])} – ${displayDate(dates.at(-1))}` : "No valid date range";
  dom.moneyIn.textContent=cash(credits.reduce((s,t)=>s+Number(t.amount),0)); dom.moneyInCount.textContent=`${credits.length} credit${credits.length===1?"":"s"}`;
  dom.moneyOut.textContent=cash(debits.reduce((s,t)=>s+Math.abs(Number(t.amount)),0)); dom.moneyOutCount.textContent=`${debits.length} debit${debits.length===1?"":"s"}`;
  dom.warnings.textContent=String(count); dom.readiness.textContent=errors().length ? "Resolve errors before export" : count ? "Review warnings" : "Ready to export";
}
function renderValidation() {
  const e=errors(), w=warnings(), r=state.reconciliation;
  const rows=[
    {type:state.transactions.length?"pass":"error",text:state.transactions.length?`${state.transactions.length} posted transaction rows detected.`:"No transaction rows detected."},
    {type:e.length?"error":"pass",text:e.length?`${e.length} blocking validation error${e.length===1?"":"s"}.`:"All rows have valid Sage fields."},
    {type:w.length?"warning":"pass",text:w.length?`${w.length} review warning${w.length===1?"":"s"}.`:"No low-confidence or duplicate warnings detected."},
    {type:r?.status==="fail"?"error":r?.status==="pass"?"pass":"warning",text:r?.status==="pass"?`Statement reconciled: calculated closing balance ${cash(r.calculatedClosing)}.`:r?.status==="fail"?`Reconciliation differs by ${cash(r.difference)}.`:"Statement balance reconciliation is unavailable for this document type."},
    {type:state.excludedRows.length?"warning":"pass",text:state.excludedRows.length?`${state.excludedRows.length} non-posting or failed-attempt row${state.excludedRows.length===1?" was":"s were"} excluded using balance movement.`:"No non-posting rows were excluded."},
    {type:state.currency==="ZAR"?"pass":"warning",text:state.currency==="ZAR"?"Source currency is ZAR.":`Source currency is ${state.currency}; import into a matching Sage bank account.`}
  ];
  dom.validations.innerHTML=rows.map((x)=>`<li class="is-${x.type}"><i class="fa-solid ${x.type==="pass"?"fa-circle-check":x.type==="warning"?"fa-triangle-exclamation":"fa-circle-xmark"}"></i><span>${esc(x.text)}</span></li>`).join("");
  const ready=state.transactions.length && !e.length; dom.ready.textContent=ready ? (w.length?"Ready with warnings":"Sage-ready") : "Needs correction";
  dom.ready.className=`bank-status-pill ${ready?(w.length?"bank-status-warning":"bank-status-success"):"bank-status-error"}`;
  dom.csv.disabled=!ready; dom.excel.disabled=!ready; dom.audit.disabled=!state.transactions.length;
}
export function validate() {
  const duplicates=new Map();
  for (const t of state.transactions) { const key=`${t.date}|${clean(t.description).toLowerCase()}|${Number(t.amount||0).toFixed(2)}`; duplicates.set(key,(duplicates.get(key)||0)+1); }
  for (const t of state.transactions) {
    const key=`${t.date}|${clean(t.description).toLowerCase()}|${Number(t.amount||0).toFixed(2)}`, list=[];
    if (!t.date) list.push({type:"error",message:"Invalid or missing date"});
    if (!String(t.description||"").trim()) list.push({type:"error",message:"Description is required"});
    if (String(t.description||"").trim().length>100) list.push({type:"warning",message:"Description will be limited to 100 characters"});
    if (!Number.isFinite(Number(t.amount)) || Math.abs(Number(t.amount))<.005) list.push({type:"error",message:"Amount must be non-zero"});
    if (t.confidence==="low") list.push({type:"warning",message:t.confidenceReason||"Low-confidence extraction"});
    if ((duplicates.get(key)||0)>1) list.push({type:"warning",message:"Possible duplicate transaction"});
    t.issues=list;
  }
  updateSummary(); renderValidation();
}
export function manualEdit() { if (state.reconciliation) state.reconciliation={...state.reconciliation,status:"unavailable"}; }
