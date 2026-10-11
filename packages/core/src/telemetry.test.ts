import { describe, expect, it } from 'vitest';

import { FILTERED, scrubSentryEvent, scrubText, scrubValue, validDsn } from './telemetry';

const TOKEN43 = 'A'.repeat(20) + 'b'.repeat(23);
const JWT = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.abc_DEF-123';

describe('scrubText', () => {
  it('redacta correos, JWT, Bearer y tokens opacos de 43 caracteres', () => {
    const text = scrubText(`falló para ana@example.com con ${JWT}, Bearer abcdef123456789 y ${TOKEN43} fin`);
    for (const secret of ['ana@example.com', JWT, 'abcdef123456789', TOKEN43]) expect(text).not.toContain(secret);
    expect(text.match(/\[Filtered\]/g)?.length).toBe(4);
  });
  it('deja intacto el texto normal', () => expect(scrubText('Error al cargar el dashboard (500)')).toBe('Error al cargar el dashboard (500)'));
});

describe('scrubValue', () => {
  it('oculta los valores bajo claves sensibles y quita vars y líneas de código de los frames', () => {
    const out = scrubValue({ password: 'x', Email: 'a@b.co', nested: { account_number: '123', ok: 'texto', vars: { a: 1 }, context_line: 'secret()' }, n: 3 }) as any;
    expect(out.password).toBe(FILTERED);
    expect(out.Email).toBe(FILTERED);
    expect(out.nested).toEqual({ account_number: FILTERED, ok: 'texto' });
    expect(out.n).toBe(3);
  });
  it('no serializa funciones ni objetos exóticos', () => expect(scrubValue({ f: () => 1 })).toEqual({ f: FILTERED }));
});

describe('scrubSentryEvent', () => {
  const event = {
    level: 'error',
    user: { id: '1', email: 'a@b.co', ip_address: '1.2.3.4' },
    server_name: 'host',
    request: {
      url: 'https://app.example.com/homes/abc?token=zzz#frag', method: 'GET',
      headers: { Cookie: 'sid=1', Authorization: 'Bearer abcdefghij', 'User-Agent': 'UA', 'X-Request-ID': 'r1' },
      data: { password: 'x' }, query_string: 'token=zzz', cookies: { sid: '1' },
    },
    exception: { values: [{ type: 'Error', value: `falló ${JWT}`, stacktrace: { frames: [{ function: 'f', lineno: 3, vars: { p: 1 }, context_line: 'x', pre_context: ['a'], post_context: ['b'] }] } }] },
    breadcrumbs: [{ message: 'click en ana@example.com', data: { token: 'zzz' } }],
    extra: { email: 'a@b.co', note: 'ok' },
  };
  const out = scrubSentryEvent(event as any) as any;

  it('quita usuario, servidor y todo de la petición salvo URL sin query, método y 2 cabeceras', () => {
    expect(out.user).toBeUndefined();
    expect(out.server_name).toBeUndefined();
    expect(out.request).toEqual({ url: 'https://app.example.com/homes/abc', method: 'GET', headers: { 'User-Agent': 'UA', 'X-Request-ID': 'r1' } });
  });
  it('redacta excepción, migas y extras; conserva función y línea', () => {
    const frame = out.exception.values[0].stacktrace.frames[0];
    expect(frame).toEqual({ function: 'f', lineno: 3 });
    expect(out.exception.values[0].value).toBe('falló [Filtered]');
    expect(out.breadcrumbs[0].message).toBe('click en [Filtered]');
    expect(out.breadcrumbs[0].data.token).toBe(FILTERED);
    expect(out.extra).toEqual({ email: FILTERED, note: 'ok' });
  });
  it('no modifica el evento original', () => expect(event.user.email).toBe('a@b.co'));
  it('ante un fallo devuelve un evento mínimo y nunca el original', () => {
    const hostile = { level: 'fatal', get request() { throw new Error('boom'); } };
    expect(scrubSentryEvent(hostile as any)).toEqual({ message: 'scrub_failed', level: 'fatal' });
  });
  it('un evento sin petición no inventa una', () => expect(scrubSentryEvent({ level: 'error' } as any)).toEqual({ level: 'error' }));
});

describe('validDsn', () => {
  it('acepta https; http solo a loopback y solo si se permite', () => {
    expect(validDsn('https://k@o1.ingest.sentry.io/1')).toBe('https://k@o1.ingest.sentry.io/1');
    expect(validDsn('http://k@127.0.0.1:9000/1')).toBeNull();
    expect(validDsn('http://k@127.0.0.1:9000/1', true)).toBe('http://k@127.0.0.1:9000/1');
    expect(validDsn('http://k@evil.example.com/1', true)).toBeNull();
    expect(validDsn('')).toBeNull();
    expect(validDsn(undefined)).toBeNull();
    expect(validDsn('no es un dsn')).toBeNull();
  });
});
