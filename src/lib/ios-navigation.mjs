export function isSettingsLocation(search=''){
  return new URLSearchParams(search).get('settings')==='1';
}

export function settingsUrl(search=''){
  const params=new URLSearchParams(search);
  params.set('settings','1');
  const query=params.toString();
  return query?`?${query}`:'?settings=1';
}

export function chatUrl(search=''){
  const params=new URLSearchParams(search);
  params.delete('settings');
  const query=params.toString();
  return query?`?${query}`:locationPathFallback();
}

function locationPathFallback(){return globalThis.location?.pathname||'/'}
