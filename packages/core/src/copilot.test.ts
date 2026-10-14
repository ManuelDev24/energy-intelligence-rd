import { describe, expect, it } from 'vitest';
import { copilotQuickActions, markdownToPlainText, parseCopilotMarkdown, parseInline, parseSse, safeInternalHref } from './copilot';

describe('acciones rápidas del Copilot', () => {
  it('son las seis acordadas y llevan el período elegido', () => {
    const actions = copilotQuickActions({ from: '2026-09-01', to: '2026-09-30' });
    expect(actions.map(a => a.label)).toEqual(['¿Por qué gasté más?', '¿Cómo puedo ahorrar?', '¿Qué equipo consume más?', '¿Cuánto pagaré?',
      '¿Me conviene instalar paneles solares?', 'Analiza mi factura']);
    expect(actions.every(a => a.prompt.endsWith('(período: 01/09/2026 al 30/09/2026)'))).toBe(true);
    expect(copilotQuickActions(null)[0].prompt).not.toContain('(período:');
  });
});

describe('lector de Server-Sent Events', () => {
  it('devuelve los eventos completos y conserva el fragmento pendiente', () => {
    const first = parseSse('event: start\ndata: {}\n\nevent: delta\ndata: {"text":"Ho');
    expect(first.events).toEqual([{ event: 'start', data: {} }]);
    const second = parseSse(first.rest + 'la"}\n\n: comentario\n\nevent: done\r\ndata: {"ok":true}\r\n\r\n');
    expect(second.events).toEqual([{ event: 'delta', data: { text: 'Hola' } }, { event: 'done', data: { ok: true } }]);
    expect(second.rest).toBe('');
  });

  it('ignora JSON corrupto y eventos sin datos', () => {
    expect(parseSse('event: delta\ndata: {mal\n\nevent: x\n\n').events).toEqual([]);
  });
});

describe('enlaces internos', () => {
  it('solo rutas de la app', () => {
    expect(safeInternalHref('/bills')).toBe('/bills');
    expect(safeInternalHref('/bills/11111111-1111-4111-8111-111111111111')).toBe('/bills/11111111-1111-4111-8111-111111111111');
    expect(safeInternalHref('/savings?x=1')).toBe('/savings');
    for (const bad of ['https://example.com', 'javascript:alert(1)', '//evil.com/bills', '/admin', '/bills/../profile', '/bills/<x>', '', null, 'bills']) {
      expect(safeInternalHref(bad as string | null), String(bad)).toBeNull();
    }
  });
});

describe('Markdown seguro', () => {
  it('párrafos, títulos, listas e inline', () => {
    const blocks = parseCopilotMarkdown('## Resumen\nTu factura fue **alta**\ny _rara_.\n\n- uno\n- dos con `kWh`\n\n1. primero\n2) segundo');
    expect(blocks.map(b => b.type)).toEqual(['heading', 'paragraph', 'list', 'list']);
    expect(blocks[1]).toEqual({ type: 'paragraph', children: [{ type: 'text', text: 'Tu factura fue ' }, { type: 'strong', children: [{ type: 'text', text: 'alta' }] },
      { type: 'text', text: ' y ' }, { type: 'em', children: [{ type: 'text', text: 'rara' }] }, { type: 'text', text: '.' }] });
    expect(blocks[3]).toMatchObject({ type: 'list', ordered: true });
  });

  it('nunca produce HTML ni enlaces externos o peligrosos', () => {
    const nodes = parseInline('Mira [facturas](/bills), [esto](https://example.com) y [x](javascript:alert(1)) <img src=x onerror=alert(1)>');
    expect(nodes).toEqual([{ type: 'text', text: 'Mira ' }, { type: 'link', href: '/bills', children: [{ type: 'text', text: 'facturas' }] },
      { type: 'text', text: ', esto y x) <img src=x onerror=alert(1)>' }]);
  });

  it('deja como texto lo que no cierra y limita la anidación', () => {
    expect(parseInline('2 * 3 = 6 y **sin cerrar')).toEqual([{ type: 'text', text: '2 * 3 = 6 y **sin cerrar' }]);
    expect(markdownToPlainText(parseCopilotMarkdown('**_`a`_**'))).toBe('a');
    expect(parseInline('**a **b **c **d****').length).toBeGreaterThan(0);
  });

  it('acota textos enormes', () => {
    expect(markdownToPlainText(parseCopilotMarkdown('a'.repeat(50_000))).length).toBe(32_000);
  });
});
