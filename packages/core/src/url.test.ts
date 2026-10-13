import { describe, expect, it } from 'vitest';
import { safeHttpUrl } from './url';

describe('safeHttpUrl (C-22)', () => {
  it('accepts http and https', () => {
    expect(safeHttpUrl('https://sie.gob.do/resolucion.pdf')).toBe('https://sie.gob.do/resolucion.pdf');
    expect(safeHttpUrl('http://example.com')).toBe('http://example.com/');
  });
  it.each(['javascript:alert(1)', 'JavaScript:alert(1)', 'data:text/html,<b>x</b>', 'vbscript:x', 'file:///etc/passwd', '/relative', 'no es url', '', null, undefined])(
    'rejects %s', (value) => expect(safeHttpUrl(value as string | null | undefined)).toBeNull());
  it('rejects absurdly long values', () => expect(safeHttpUrl(`https://a.com/${'x'.repeat(3000)}`)).toBeNull());
});
