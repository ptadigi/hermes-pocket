const number=id=>Number(id)||0;
export const latestMessageId=rows=>Math.max(0,...(rows||[]).map(m=>number(m.id)));
export const canonicalRunComplete=(rows,afterId)=>(rows||[]).some(m=>number(m.id)>number(afterId)&&m.role==='assistant'&&(m.finish_reason==='stop'||m.finish_reason==='error'));
