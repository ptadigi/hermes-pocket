export const canonicalProvider=value=>String(value||'').startsWith('custom:')?'custom':String(value||'');
