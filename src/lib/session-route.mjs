export const sessionFromLocation=(search,stored,sessions)=>{const requested=new URLSearchParams(search).get('session')||stored;return sessions.find(s=>s.id===requested)||sessions[0]};
export const sessionUrl=id=>`?session=${encodeURIComponent(id)}`;
