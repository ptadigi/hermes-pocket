export const isNearBottom=(scrollTop,clientHeight,scrollHeight,threshold=80)=>scrollHeight-scrollTop-clientHeight<=threshold;
export const streamSlice=(text,size=4)=>[text.slice(0,size),text.slice(size)];
