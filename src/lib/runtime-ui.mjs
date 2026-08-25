export const elapsedSeconds=(startedAt,now=Date.now())=>Math.max(0,Math.floor((now-startedAt)/1000));
export const queueLabel=count=>count>0?`Đang chờ · ${count} tin`:'';
