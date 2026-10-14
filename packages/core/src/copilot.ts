/** ERD-AI-CHAT: lógica pura del Energy Copilot compartida por web y móvil (sin DOM ni React Native).
 * - Acciones rápidas: preguntas iniciales que llevan la vivienda y el período elegidos, sin inventar datos que falten.
 * - Lector de Server-Sent Events tolerante a fragmentos.
 * - Markdown SEGURO: un subconjunto cerrado (párrafos, títulos, listas, negrita, cursiva, código y enlaces) convertido en nodos;
 *   nunca HTML. Solo se enlazan rutas internas de la app: cualquier otro enlace queda como texto. */

export type CopilotQuickAction = { id: string; label: string; prompt: string };

const ACTIONS: ReadonlyArray<{ id: string; label: string; ask: string }> = [
  { id: 'why-more', label: '¿Por qué gasté más?', ask: '¿Por qué gasté más en este período que en el anterior?' },
  { id: 'save', label: '¿Cómo puedo ahorrar?', ask: '¿Cómo puedo ahorrar energía y dinero según mis datos?' },
  { id: 'top-device', label: '¿Qué equipo consume más?', ask: '¿Qué equipo consume más en mi casa y cuánto representa?' },
  { id: 'next-bill', label: '¿Cuánto pagaré?', ask: '¿Cuánto pagaré aproximadamente en mi próxima factura?' },
  { id: 'solar', label: '¿Me conviene instalar paneles solares?', ask: '¿Me conviene instalar paneles solares con mi consumo actual? Dime qué datos faltan.' },
  { id: 'bill', label: 'Analiza mi factura', ask: 'Analiza mi última factura: consumo, monto y si algo no cuadra.' },
];

/** El período va en la pregunta para que se lea en el historial; la API además lo recibe aparte y lo pasa al modelo como contexto. */
export function copilotQuickActions(period: { from: string; to: string } | null): CopilotQuickAction[] {
  const suffix = period ? ` (período: ${formatIsoDay(period.from)} al ${formatIsoDay(period.to)})` : '';
  return ACTIONS.map(({ id, label, ask }) => ({ id, label, prompt: `${ask}${suffix}` }));
}

function formatIsoDay(iso: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : iso;
}

// ---------- Server-Sent Events ----------
export type SseEvent = { event: string; data: unknown };

/** Extrae los eventos completos de `buffer` (separados por línea en blanco) y devuelve el resto sin terminar. Ignora comentarios,
 * eventos sin `data` y JSON inválido (nunca lanza). */
export function parseSse(buffer: string): { events: SseEvent[]; rest: string } {
  const normalized = buffer.replace(/\r\n?/g, '\n');
  const parts = normalized.split('\n\n');
  const rest = parts.pop() ?? '';
  const events: SseEvent[] = [];
  for (const part of parts) {
    let event = 'message';
    const data: string[] = [];
    for (const line of part.split('\n')) {
      if (!line || line.startsWith(':')) continue;
      const at = line.indexOf(':');
      const field = at === -1 ? line : line.slice(0, at);
      const value = at === -1 ? '' : line.slice(at + 1).replace(/^ /, '');
      if (field === 'event') event = value;
      else if (field === 'data') data.push(value);
    }
    if (!data.length) continue;
    try {
      events.push({ event, data: JSON.parse(data.join('\n')) });
    } catch {
      /* evento corrupto: se ignora */
    }
  }
  return { events, rest };
}

// ---------- enlaces ----------
const INTERNAL_ROUTES = ['/dashboard', '/bills', '/consumption', '/readings', '/equipment', '/savings', '/goal', '/outages', '/alerts', '/profile', '/copilot'];
const UUID = '[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}';
const BILL_DETAIL = new RegExp(`^/bills/${UUID}$`);

/** Devuelve la ruta interna si está permitida; `null` para cualquier otra cosa (externas, `javascript:`, `//host`, rutas desconocidas). */
export function safeInternalHref(href: string | null | undefined): string | null {
  if (!href || href.length > 200 || !href.startsWith('/') || href.startsWith('//') || /[\s\\<>"'`]/.test(href)) return null;
  const path = href.split(/[?#]/, 1)[0];
  return INTERNAL_ROUTES.includes(path) || BILL_DETAIL.test(path) ? path : null;
}

// ---------- Markdown seguro ----------
export type MdInline =
  | { type: 'text'; text: string }
  | { type: 'strong'; children: MdInline[] }
  | { type: 'em'; children: MdInline[] }
  | { type: 'code'; text: string }
  | { type: 'link'; href: string; children: MdInline[] };
export type MdBlock =
  | { type: 'paragraph'; children: MdInline[] }
  | { type: 'heading'; level: 2 | 3; children: MdInline[] }
  | { type: 'list'; ordered: boolean; items: MdInline[][] };

const MAX_MARKDOWN_CHARS = 32_000;

export function parseCopilotMarkdown(source: string): MdBlock[] {
  const lines = source.slice(0, MAX_MARKDOWN_CHARS).replace(/\r\n?/g, '\n').split('\n');
  const blocks: MdBlock[] = [];
  let paragraph: string[] = [];
  let list: { ordered: boolean; items: string[] } | null = null;
  const flushParagraph = () => {
    if (paragraph.length) blocks.push({ type: 'paragraph', children: parseInline(paragraph.join(' ')) });
    paragraph = [];
  };
  const flushList = () => {
    if (list) blocks.push({ type: 'list', ordered: list.ordered, items: list.items.map(parseInline) });
    list = null;
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushParagraph(); flushList(); continue; }
    const heading = /^(#{1,6})\s+(.*)$/.exec(line);
    if (heading) {
      flushParagraph(); flushList();
      blocks.push({ type: 'heading', level: heading[1].length <= 2 ? 2 : 3, children: parseInline(heading[2]) });
      continue;
    }
    const bullet = /^[-*•]\s+(.*)$/.exec(line);
    const numbered = /^\d{1,3}[.)]\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      flushParagraph();
      const ordered = !!numbered;
      if (!list || list.ordered !== ordered) { flushList(); list = { ordered, items: [] }; }
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    if (list) flushList();
    paragraph.push(line);
  }
  flushParagraph();
  flushList();
  return blocks;
}

/** Inline: `código`, **negrita**, *cursiva* / _cursiva_ y [texto](ruta). Lo que no casa queda como texto literal. */
export function parseInline(text: string, depth = 0): MdInline[] {
  const out: MdInline[] = [];
  let buffer = '';
  const push = (node: MdInline) => {
    if (buffer) { out.push({ type: 'text', text: buffer }); buffer = ''; }
    out.push(node);
  };
  let i = 0;
  while (i < text.length) {
    const rest = text.slice(i);
    let match: RegExpExecArray | null;
    if ((match = /^`([^`\n]{1,200})`/.exec(rest))) {
      push({ type: 'code', text: match[1] });
    } else if (depth < 3 && (match = /^\*\*(?=\S)([\s\S]*?\S)\*\*/.exec(rest))) {
      push({ type: 'strong', children: parseInline(match[1], depth + 1) });
    } else if (depth < 3 && (match = /^([*_])(?=\S)([^*_]*?\S)\1(?![*_\w])/.exec(rest))) {
      push({ type: 'em', children: parseInline(match[2], depth + 1) });
    } else if ((match = /^\[([^\]\n]{1,200})\]\(([^)\s]{1,300})\)/.exec(rest))) {
      const href = safeInternalHref(match[2]);
      const children = depth < 3 ? parseInline(match[1], depth + 1) : [{ type: 'text' as const, text: match[1] }];
      if (href) push({ type: 'link', href, children });
      else buffer += match[1];  // enlace no permitido: solo su texto
    } else {
      buffer += text[i];
      i += 1;
      continue;
    }
    i += match[0].length;
  }
  if (buffer) out.push({ type: 'text', text: buffer });
  return out;
}

/** Texto plano (para lectores de pantalla, avisos y pruebas). */
export function markdownToPlainText(blocks: MdBlock[]): string {
  const inline = (nodes: MdInline[]): string => nodes.map(n => (n.type === 'text' || n.type === 'code' ? n.text : inline(n.children))).join('');
  return blocks.map(b => (b.type === 'list' ? b.items.map(inline).join('\n') : inline(b.children))).join('\n\n');
}
