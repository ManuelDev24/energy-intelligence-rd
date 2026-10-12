import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

export type AdminBffConfig = { apiBase: string; origin: string; secure: boolean };
export function readAdminBffConfig(env: NodeJS.ProcessEnv = process.env): AdminBffConfig {
  const development = env.NODE_ENV !== "production";
  const api = new URL(env.ADMIN_API_BASE_URL || (development ? "http://localhost:8000" : ""));
  const origin = new URL(env.ADMIN_ORIGIN || (development ? "http://localhost:3100" : ""));
  for (const url of [api, origin]) {
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash)
      throw new Error("Admin BFF requires credential-free origins");
    if (!development && url.protocol !== 'https:') throw new Error("Admin BFF requires HTTPS in production");
  }
  return { apiBase: api.origin, origin: origin.origin, secure: origin.protocol === 'https:' };
}

const name = (config: AdminBffConfig, kind: string) => `${config.secure ? '__Host-' : ''}admin-${kind}`;
const epochPattern = /^[0-9a-f]{32}$/;
const tokenPattern = /^[A-Za-z0-9._~-]{1,4096}$/;
const uuid = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const freshEpoch = () => randomBytes(16).toString('hex');
const options = (config: AdminBffConfig, maxAge: number) => ({ httpOnly: true, secure: config.secure, sameSite: 'strict' as const, path: '/', maxAge });
function cookie(request: Request, name: string) {
  const matches = (request.headers.get('cookie') || '').split(';').map(p => p.trim().split('=')).filter(([key]) => key === name);
  return matches.length === 1 ? matches[0][1] : undefined;
}
function bound(request: Request, config: AdminBffConfig, kind: string) {
  const epoch = cookie(request, name(config, 'epoch'));
  const value = cookie(request, name(config, kind));
  if (!epoch || !epochPattern.test(epoch) || !value || !value.startsWith(`${epoch}~`)) return undefined;
  const token = value.slice(epoch.length + 1);
  return tokenPattern.test(token) ? token : undefined;
}
function reply(body: unknown, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie', 'X-Content-Type-Options': 'nosniff' } });
}
function fail(status: number) {
  const messages: Record<number, string> = {
    400: 'Solicitud inválida.', 401: 'Sesión no válida.', 403: 'No tienes permiso para esta operación.',
    404: 'Ruta no disponible.', 413: 'Solicitud demasiado grande.', 415: 'Se requiere JSON.',
    422: 'Revisa los datos enviados.', 429: 'Demasiadas solicitudes.', 502: 'Servicio no disponible.',
  };
  return reply({ error: messages[status] || 'No se pudo completar la operación.' }, status);
}
async function jsonBody(request: Request) {
  if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return null;
  const text = await request.text();
  if (text.length > 8192) return null;
  try { const value: unknown = JSON.parse(text); return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null; }
  catch { return null; }
}
function route(path: string, method: string, search: URLSearchParams) {
  const simple: Record<string, string[]> = {
    '/me': ['GET'], '/roles': ['GET'], '/scopes': ['GET'],
    '/role-assignments': ['GET', 'POST'], '/audit-events': ['GET'],
  };
  const methods = simple[path] || (new RegExp(`^/role-assignments/${uuid}/revoke$`).test(path) ? ['POST'] : []);
  if (!methods.includes(method)) return false;
  const allowed = path === '/audit-events' ? ['action', 'actor_user_id', 'result', 'limit', 'offset']
    : path === '/role-assignments' && method === 'GET' ? ['user_id', 'role_name', 'status', 'limit', 'offset'] : [];
  return [...search.keys()].every(key => allowed.includes(key) && search.getAll(key).length === 1 && (search.get(key)?.length || 0) <= 120);
}
function setTokens(response: NextResponse, config: AdminBffConfig, epoch: string, body: unknown) {
  if (!body || typeof body !== 'object') return false;
  const pair = body as Record<string, unknown>;
  if (typeof pair.access_token !== 'string' || !tokenPattern.test(pair.access_token) ||
      typeof pair.refresh_token !== 'string' || !tokenPattern.test(pair.refresh_token)) return false;
  response.cookies.set(name(config, 'access'), `${epoch}~${pair.access_token}`, options(config, 900));
  response.cookies.set(name(config, 'refresh'), `${epoch}~${pair.refresh_token}`, options(config, 30 * 24 * 60 * 60));
  return true;
}
async function upstream(url: string, init: RequestInit): Promise<Response | null> {
  try { return await fetch(url, { ...init, cache: 'no-store', redirect: 'manual', signal: AbortSignal.timeout(8000) }); }
  catch { return null; }
}
export async function handleAdminBff(request: Request, config: AdminBffConfig): Promise<NextResponse> {
  const url = new URL(request.url);
  // Next's dev server can report request.url with hostname "localhost" even when bound to
  // 127.0.0.1 (or another explicit host), regardless of the real Host header the client sent.
  // Trust the Host header for the same-origin check instead of url.origin, which this framework
  // quirk makes unreliable; the scheme still comes from config (never attacker-controlled).
  const host = request.headers.get('host');
  const requestOrigin = host ? `${config.secure ? 'https' : 'http'}://${host}` : '';
  if (requestOrigin !== config.origin) return fail(403);
  const path = url.pathname.slice('/api/admin'.length);
  const method = request.method;
  if (method !== 'GET' && request.headers.get('origin') !== config.origin) return fail(403);
  if (method === 'GET' && path === '/session' && !url.search) {
    const response = reply({ ok: true });
    if (!epochPattern.test(cookie(request, name(config, 'epoch')) || ''))
      response.cookies.set(name(config, 'epoch'), freshEpoch(), options(config, 400 * 24 * 60 * 60));
    return response;
  }
  if (method === 'POST' && path === '/auth/logout' && !url.search) {
    const refresh = bound(request, config, 'refresh');
    const response = reply({ ok: true });
    for (const kind of ['access', 'refresh']) response.cookies.set(name(config, kind), '', options(config, 0));
    response.cookies.set(name(config, 'epoch'), freshEpoch(), options(config, 400 * 24 * 60 * 60));
    if (refresh) await upstream(`${config.apiBase}/api/v1/auth/logout`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ refresh_token: refresh }),
    });
    return response;
  }
  if (method === 'POST' && ['/auth/login', '/auth/refresh'].includes(path) && !url.search) {
    const epoch = cookie(request, name(config, 'epoch'));
    if (!epoch || !epochPattern.test(epoch)) return fail(401);
    const refresh = bound(request, config, 'refresh');
    if (path === '/auth/refresh' && !refresh) return fail(401);
    const body = path === '/auth/login' ? await jsonBody(request) : null;
    if (path === '/auth/login' && (!body || typeof body.email !== 'string' || typeof body.password !== 'string' ||
      !body.email || !body.password || Object.keys(body).some(key => !['email', 'password'].includes(key)))) return fail(400);
    const result = await upstream(`${config.apiBase}/api/v1/auth/${path === '/auth/login' ? 'login' : 'refresh'}`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(path === '/auth/login' ? body : { refresh_token: refresh }),
    });
    if (!result) return fail(502);
    if (!result.ok) return fail([400, 401, 403, 422, 429].includes(result.status) ? result.status : 502);
    let pair: unknown;
    try { pair = await result.json(); } catch { return fail(502); }
    const response = reply({ ok: true });
    return setTokens(response, config, epoch, pair) ? response : fail(502);
  }
  if (!path.startsWith('/proxy/')) return fail(404);
  const target = path.slice('/proxy'.length);
  if (!route(target, method, url.searchParams)) return fail(404);
  const access = bound(request, config, 'access');
  if (!access) return fail(401);
  const body = method === 'GET' ? undefined : await jsonBody(request);
  if (method !== 'GET' && !body) return fail(400);
  const result = await upstream(`${config.apiBase}/api/v1/admin${target}${url.search}`, {
    method, headers: { Authorization: `Bearer ${access}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!result) return fail(502);
  if (!result.ok) return fail([400, 401, 403, 404, 422, 429].includes(result.status) ? result.status : 502);
  if (result.status === 204) return new NextResponse(null, { status: 204, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie' } });
  try { return reply(await result.json()); } catch { return fail(502); }
}
