const ROUTES = [
  ['GET', /^\/health(?:\/detailed)?$/],
  ['GET', /^\/v1\/(?:health|capabilities|models|skills|toolsets)$/],
  ['GET', /^\/api\/model\/options(?:\?.*)?$/],
  ['GET', /^\/api\/sessions(?:\?.*)?$/],
  ['POST', /^\/api\/sessions$/],
  ['GET', /^\/api\/sessions\/[^/?#]+$/],
  ['PATCH', /^\/api\/sessions\/[^/?#]+$/],
  ['GET', /^\/api\/sessions\/[^/?#]+\/messages(?:\?.*)?$/],
  ['POST', /^\/api\/sessions\/[^/?#]+\/(?:fork|chat|chat\/stream)$/],
  ['POST', /^\/v1\/runs$/],
  ['GET', /^\/v1\/runs\/[^/?#]+(?:\/events)?$/],
  ['POST', /^\/v1\/runs\/[^/?#]+\/(?:stop|approval)$/],
];

export const isMutation = method => !['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase());

export function allowedHermesRoute(method, path) {
  if (path.includes('..') || /[\r\n]/.test(path)) return false;
  const upper = method.toUpperCase();
  return ROUTES.some(([candidate, pattern]) => candidate === upper && pattern.test(path));
}
