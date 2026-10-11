const DB_NAME = 'energy_rd_admin_e2e_test';
export function validateDatabaseUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === 'postgresql+psycopg:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname) &&
        url.username && url.pathname === `/${DB_NAME}` && !url.search && !url.hash)
      return value;
  } catch { /* fail closed */ }
  throw new Error('Requires exact disposable local database energy_rd_admin_e2e_test');
}
export function validatePorts(api, admin) {
  const reserved = new Set([8000, 3000, 3100, 3101, 8081, 18101]);
  if (![api, admin].every(p => Number.isInteger(p) && p > 1024 && p < 65536 && !reserved.has(p)) || api === admin)
    throw new Error('reserved or invalid port');
  return [api, admin];
}
