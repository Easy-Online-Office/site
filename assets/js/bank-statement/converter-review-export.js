import { dom, state, esc, uid, clean, validate, errors, setStatus, manualEdit } from "./converter-state.js";
import { PROFILE_LABELS } from "./easy-bank-parser-engine.js";

function filtered() {
  const query=dom.search.value.trim().toLowerCase(), filter=dom.filter.value;
  return state.transactions.filter((t)=>(!query||`${t.date} ${t.description} ${t.amount}`.toLowerCase().includes(query)) &&
    (filter==="all" || filter==="warnings"&&t.issues.length || filter==="credits"&&t.amount>0 || filter==="debits"&&t.amount<0));
}
export function renderRows() {
  const rows=filtered(); dom.rows.innerHTML=""; dom.empty.hidden=Boolean(rows.length);
  for (const t of rows) {
    const tr=document.createElement("tr"), hasError=t.issues.some((i)=>i.type==="error");
    tr.className=hasError?"bank-row-error":t.issues.length?"bank-row-warning":"";
    const confidence=String(t.confidence||"low"), label=confidence[0].toUpperCase()+confidence.slice(1);
    tr.innerHTML=`<td><input data-field="date" type="date" value="${esc(t.date)}"></td><td><input data-field="description" type="text" maxlength="180" value="${esc(t.description)}"><small title="${esc(t.raw)}">Page ${t.page||"manual"}</small></td><td><select data-field="direction"><option value="credit" ${t.amount>=0?"selected":""}>Money in</option><option value="debit" ${t.amount<0?"selected":""}>Money out</option></select></td><td><input data-field="amount" class="amount-input" type="number" min="0" step="0.01" value="${Math.abs(Number(t.amount)||0).toFixed(2)}"></td><td><span class="bank-confidence bank-confidence-${confidence}" title="${esc(t.confidenceReason)}">${label}</span></td><td class="no-print"><button class="bank-delete-row" type="button" aria-label="Delete transaction"><i class="fa-solid fa-trash-can"></i></button></td>`;
    const date=tr.querySelector('[data-field="date"]'), description=tr.querySelector('[data-field="description"]'), direction=tr.querySelector('[data-field="direction"]'), amount=tr.querySelector('[data-field="amount"]');
    date.onchange=()=>{t.date=date.value;manualEdit();refresh()}; description.oninput=()=>{t.description=description.value;manualEdit();refresh(false)};
    direction.onchange=()=>{t.amount=Math.abs(Number(t.amount)||0)*(direction.value==="debit"?-1:1);t.confidence="high";t.confidenceReason="Direction confirmed by user";manualEdit();refresh()};
    amount.oninput=()=>{t.amount=Math.abs(Number(amount.value)||0)*(direction.value==="debit"?-1:1);t.confidence="high";t.confidenceReason="Amount confirmed by user";manualEdit();refresh(false)};
    tr.querySelector("button").onclick=()=>{state.transactions=state.transactions.filter((x)=>x.id!==t.id);manualEdit();validate();renderRows()}; dom.rows.appendChild(tr);
  }
}
let timer;
function refresh(rerender=true) { clearTimeout(timer); timer=setTimeout(()=>{validate();if(rerender)renderRows()},160); }
export function addRow() {
  state.transactions.push({id:uid(),date:"",description:"",amount:0,confidence:"low",confidenceReason:"Manual row requires review",page:0,raw:"Manual row",sourceIndex:state.transactions.length+1,issues:[]});
  manualEdit();dom.filter.value="all";dom.search.value="";validate();renderRows();dom.rows.lastElementChild?.querySelector("input")?.focus();
}
export function render() {
  dom.results.hidden=false;dom.profile.textContent=`Layout: ${PROFILE_LABELS[state.profile]||state.profile}`;dom.profile.className="bank-status-pill bank-status-success";
  dom.pages.textContent=`${state.pages} page${state.pages===1?"":"s"}`;renderRows();validate();
}
function exportDate(iso) { const[y,m,d]=String(iso||"").split("-");if(dom.dateFormat.value==="yyyy/mm/dd")return`${y}/${m}/${d}`;if(dom.dateFormat.value==="mm/dd/yyyy")return`${m}/${d}/${y}`;return`${d}/${m}/${y}`; }
function exportRows() { return state.transactions.slice().sort((a,b)=>(a.sourceIndex||0)-(b.sourceIndex||0)).map((t)=>({Date:exportDate(t.date),Description:clean(t.description),Amount:Number(t.amount).toFixed(2)})); }
function csvCell(v) { const s=String(v??"");return/[",\r\n]/.test(s)?`"${s.replace(/"/g,'""')}"`:s; }
function filename(ext) { const source=state.file?.name?.replace(/\.pdf$/i,"")||"easyfile-bank-statement",safe=source.replace(/[^a-z0-9._-]+/gi,"-").replace(/-+/g,"-").replace(/^-|-$/g,"");return`${safe||"easyfile-bank-statement"}-sage-import.${ext}`; }
function download(blob,name) { const url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove()},0); }
function canExport() { validate();if(!state.transactions.length){setStatus("No transactions are available to export.",true);return false}if(errors().length){setStatus(`Resolve ${errors().length} blocking validation error${errors().length===1?"":"s"} before exporting.`,true);return false}return true; }
function qualifying(action) { window.dispatchEvent(new CustomEvent("easyfile:qualifying-use",{detail:{action}})); }
export function exportCsv() {
  if(!canExport())return;const rows=exportRows(),csv=`Date,Description,Amount\r\n${rows.map((r)=>[r.Date,r.Description,r.Amount].map(csvCell).join(",")).join("\r\n")}`;
  download(new Blob(["\ufeff",csv],{type:"text/csv;charset=utf-8"}),filename("csv"));setStatus(`Downloaded ${rows.length} Sage-formatted transaction rows.`);qualifying("export csv");
}
export function exportExcel() {
  if(!canExport())return;if(!window.XLSX){setStatus("The Excel export library did not load. Use CSV or check your network connection.",true);return}
  const rows=exportRows().map((r)=>({...r,Amount:Number(r.Amount)})),sheet=window.XLSX.utils.json_to_sheet(rows,{header:["Date","Description","Amount"]});sheet["!cols"]=[{wch:14},{wch:70},{wch:16}];
  const book=window.XLSX.utils.book_new();window.XLSX.utils.book_append_sheet(book,sheet,"Sage Bank Import");window.XLSX.utils.book_append_sheet(book,window.XLSX.utils.aoa_to_sheet([["Source currency",state.currency],["Detected layout",PROFILE_LABELS[state.profile]||state.profile],["Posted transactions",state.transactions.length],["Excluded non-posting rows",state.excludedRows.length],["Reconciliation",state.reconciliation?.status||"unavailable"]]),"Conversion Notes");
  window.XLSX.writeFile(book,filename("xlsx"));setStatus(`Downloaded ${rows.length} transactions as an Excel workbook.`);qualifying("export excel");
}
export function exportAudit() {
  if(!state.transactions.length)return;const payload={generatedAt:new Date().toISOString(),sourceFile:state.file?{name:state.file.name,size:state.file.size,type:state.file.type}:{name:"sample"},profile:state.profile,bank:state.bank,currency:state.currency,pages:state.pages,reconciliation:state.reconciliation,excludedRows:state.excludedRows,transactions:state.transactions.map((t)=>({date:t.date,description:t.description,amount:t.amount,balance:t.balance,confidence:t.confidence,confidenceReason:t.confidenceReason,page:t.page,issues:t.issues,sourceText:t.raw}))};
  download(new Blob([JSON.stringify(payload,null,2)],{type:"application/json"}),filename("audit.json"));setStatus("Downloaded the local conversion audit file.");qualifying("download audit");
}
