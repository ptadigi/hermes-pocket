const escapeHtml=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;');
const internalEnvelope=value=>/^\s*\[(?:CONTEXT COMPACTION — REFERENCE ONLY|ASYNC DELEGATION BATCH COMPLETE|IMPORTANT: Background process|Continuing toward your standing goal|Your active task list was preserved)/.test(String(value||''));
export const visibleMessages=rows=>(rows||[]).filter(m=>(m?.role==='user'||m?.role==='assistant')&&!internalEnvelope(m.content)&&(m.role==='user'||String(m.content||'').trim()));
export const visibleTimeline=(rows,toolLimit=80)=>{let left=toolLimit;return[...(rows||[])].reverse().filter(m=>{if(m?.role==='tool')return left-->0;return(m?.role==='user'||m?.role==='assistant')&&!internalEnvelope(m.content)&&(m.role==='user'||String(m.content||'').trim())}).reverse()};
export const toolSummary=m=>({name:String(m?.tool_name||'Tool').replaceAll('_',' '),status:m?.finish_reason==='error'?'failed':'completed'});
export const safeMarkdownSource=value=>escapeHtml(typeof value==='string'?value:JSON.stringify(value??''));
export const shortSession=id=>String(id||'').slice(0,16).replace(/_+$/,'');

// Split a message's content into ordered {type:'text',text}|{type:'image',url} parts so the UI
// renders images from both directions: user multimodal arrays and assistant markdown ![](url).
export const messageParts=content=>{
  const parts=[];
  const pushText=t=>{if(t)parts.push({type:'text',text:t})};
  const scanText=t=>{
    const s=String(t??'');let last=0;
    // Match markdown ![](url) OR a bare MEDIA:/Media: tag pointing at an image file.
    const re=/!\[[^\]]*\]\((\S+?)\)|(?:MEDIA:|Media:)([^\r\n]+?\.(?:png|jpe?g|gif|webp|bmp|svg))(?=[\t )\]]*(?:\r?\n|$))/gi;let m;
    while((m=re.exec(s))){pushText(s.slice(last,m.index));
      const url=m[1]?m[1]:'/pocket/media?path='+encodeURIComponent(m[2]);
      parts.push({type:'image',url});last=re.lastIndex}
    pushText(s.slice(last))};
  if(Array.isArray(content)){
    for(const p of content){
      if(p&&p.type==='image_url'){const u=typeof p.image_url==='string'?p.image_url:p.image_url?.url;if(u)parts.push({type:'image',url:u})}
      else if(p&&p.type==='text')scanText(p.text);
      else if(typeof p==='string')scanText(p);
    }
  } else scanText(content);
  return parts.length?parts:[{type:'text',text:''}];
};
