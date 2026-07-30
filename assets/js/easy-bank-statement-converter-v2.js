import { extractPdf, parseStatement } from "./bank-statement/easy-bank-parser-engine.js";
import { normaliseHeaderItems } from "./bank-statement/normalise-header-items.js";
import { dom, state, uid, options, toast, setStatus, setProcessing, validate } from "./bank-statement/converter-state.js";
import { render, renderRows, addRow, exportCsv, exportExcel, exportAudit } from "./bank-statement/converter-review-export.js";

const MAX=25*1024*1024;
function selectFile(file) {
  if(!file)return;if(file.type!=="application/pdf"&&!file.name.toLowerCase().endsWith(".pdf"))return toast("Select a PDF bank statement.",true);
  if(file.size>MAX)return toast("The PDF is larger than the 25 MB browser-processing limit.",true);
  state.file=file;state.transactions=[];state.excludedRows=[];state.reconciliation=null;dom.badge.textContent=`${file.name} · ${(file.size/1024/1024).toFixed(2)} MB`;
  dom.badge.className="bank-status-pill bank-status-success";dom.convert.disabled=false;dom.results.hidden=true;setStatus("");
}
function clearSession() {
  Object.assign(state,{file:null,pages:0,transactions:[],excludedRows:[],profile:"generic",bank:"generic",currency:"ZAR",reconciliation:null});
  dom.file.value="";dom.badge.textContent="No file selected";dom.badge.className="bank-status-pill";dom.convert.disabled=true;dom.results.hidden=true;dom.rows.innerHTML="";setProcessing(false);setStatus("");
}
async function convert() {
  if(!state.file||state.processing)return;setProcessing(true,"Reading statement…","Loading the PDF into browser memory.",3);setStatus("");
  try {
    const extracted=await extractPdf(state.file,(page,total)=>{dom.title.textContent="Reading statement…";dom.message.textContent=`Extracting structured text from page ${page} of ${total}.`;dom.progress.value=Math.round(page/total*68)});
    state.pages=extracted.pages;dom.title.textContent="Identifying statement layout…";dom.message.textContent="Selecting a bank- and account-type-specific parser.";dom.progress.value=76;
    Object.assign(state,parseStatement(normaliseHeaderItems(extracted.rows),extracted.rawText,options()));dom.title.textContent="Validating Sage output…";dom.message.textContent="Checking rows and reconciling statement balances.";dom.progress.value=92;
    validate();render();dom.title.textContent="Conversion complete";dom.message.textContent=`${state.transactions.length} posted transaction rows are ready for review.`;dom.progress.value=100;setTimeout(()=>setProcessing(false),450);
    if(!state.transactions.length)toast("No posted transactions could be recognised. Try another profile or download CSV/OFX from the bank.",true);else dom.results.scrollIntoView({behavior:"smooth",block:"start"});
  } catch(error) {
    console.error(error);setProcessing(false);const message=error?.name==="PasswordException"?"The PDF is password-protected. Save an unlocked copy and try again.":error?.message||"The PDF could not be processed.";toast(message,true);setStatus(message,true);
  }
}
function sample() {
  const year=Number(dom.year.value)||new Date().getFullYear();Object.assign(state,{file:null,pages:1,profile:"generic",bank:"generic",currency:"ZAR",excludedRows:[],reconciliation:{status:"unavailable"},transactions:[
    {id:uid(),date:`${year}-07-03`,description:"CLIENT PAYMENT 4581",amount:4500,confidence:"high",confidenceReason:"Sample credit",page:1,raw:"Sample",sourceIndex:1,issues:[]},
    {id:uid(),date:`${year}-07-04`,description:"MONTHLY SERVICE FEE",amount:-175,confidence:"high",confidenceReason:"Sample debit",page:1,raw:"Sample",sourceIndex:2,issues:[]}
  ]});dom.badge.textContent="Sample transactions loaded";dom.badge.className="bank-status-pill bank-status-success";validate();render();dom.results.scrollIntoView({behavior:"smooth",block:"start"});
}
function bind() {
  dom.year.value=String(new Date().getFullYear());dom.choose.onclick=(event)=>{event.stopPropagation();dom.file.click()};dom.drop.onclick=()=>dom.file.click();dom.drop.onkeydown=(event)=>{if(event.key==="Enter"||event.key===" "){event.preventDefault();dom.file.click()}};dom.file.onchange=()=>selectFile(dom.file.files?.[0]);
  ["dragenter","dragover"].forEach((name)=>dom.drop.addEventListener(name,(event)=>{event.preventDefault();dom.drop.classList.add("is-dragging")}));["dragleave","drop"].forEach((name)=>dom.drop.addEventListener(name,(event)=>{event.preventDefault();dom.drop.classList.remove("is-dragging")}));dom.drop.addEventListener("drop",(event)=>selectFile(event.dataTransfer?.files?.[0]));
  dom.convert.onclick=convert;dom.sample.onclick=sample;dom.clear.onclick=clearSession;dom.search.oninput=renderRows;dom.filter.onchange=renderRows;dom.add.onclick=addRow;dom.csv.onclick=exportCsv;dom.excel.onclick=exportExcel;dom.audit.onclick=exportAudit;dom.dateFormat.onchange=()=>{validate();setStatus("Export date format updated.")};
}
bind();
