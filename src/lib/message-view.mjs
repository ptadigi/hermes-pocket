const escapeHtml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const internalEnvelope=value=>/^\s*\[(?:CONTEXT COMPACTION — REFERENCE ONLY|ASYNC DELEGATION BATCH COMPLETE|IMPORTANT: Background process|Continuing toward your standing goal|Your active task list was preserved)/.test(String(value||''));
export const visibleMessages=rows=>(rows||[]).filter(m=>(m?.role==='user'||m?.role==='assistant')&&!internalEnvelope(m.content)&&(m.role==='user'||String(m.content||'').trim()));
export const toolSummary=m=>({name:String(m?.tool_name||'Tool').replaceAll('_',' '),status:m?.finish_reason==='error'?'failed':'completed'});
export const safeMarkdownSource=value=>escapeHtml(typeof value==='string'?value:JSON.stringify(value??''));
export const shortSession=id=>String(id||'').slice(0,16).replace(/_+$/,'');
