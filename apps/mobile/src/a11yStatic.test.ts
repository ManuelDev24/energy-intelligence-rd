// ERD-A11Y-NATIVE (parte estática). Comprueba en el código lo que SÍ se puede verificar sin un lector de pantalla:
// roles y nombres accesibles declarados, contraste de los pares del tema y áreas táctiles. NO sustituye la prueba con
// VoiceOver/TalkBack en un dispositivo (ver docs/qa/ERD-A11Y-NATIVE.md, donde esa parte consta como NO ejecutada).
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { colors, TOUCH } from './theme';

const ROOT = new URL('.', import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? files(path) : path.endsWith('.tsx') ? [path] : [];
  });
const SOURCES = files(ROOT).map((path) => ({ path: path.replace(ROOT, 'src/'), text: readFileSync(path, 'utf8') }));

/** Etiqueta de apertura completa de cada `<Name …>` (respeta llaves anidadas; ignora genéricos como `useRef<TextInput>`). */
function openingTags(text: string, names: string[]) {
  const found: { name: string; tag: string; line: number }[] = [];
  const re = new RegExp(`(?<![\\w.])<(${names.join('|')})(?=[\\s/>])(?![^<]{0,0}>)`, 'g');
  for (const m of text.matchAll(re)) {
    // Un genérico (`Ref<TextInput>`) nunca va precedido de espacio+`<`; aquí exigimos que siga un espacio o salto de línea.
    if (!/\s/.test(text[m.index! + m[0].length] ?? '')) continue;
    let depth = 0;
    let i = m.index! + m[0].length;
    for (; i < text.length; i++) {
      const c = text[i];
      if (c === '{') depth++;
      else if (c === '}') depth--;
      else if (c === '>' && depth === 0 && text[i - 1] !== '=') break;
    }
    found.push({ name: m[1], tag: text.slice(m.index, i), line: text.slice(0, m.index).split('\n').length });
  }
  return found;
}

describe('el escáner funciona (si no encuentra nada, las demás comprobaciones no valdrían)', () => {
  it('encuentra decenas de pulsables, campos e interruptores reales', () => {
    const count = (names: string[]) => SOURCES.reduce((n, s) => n + openingTags(s.text, names).length, 0);
    expect(count(['Pressable'])).toBeGreaterThan(20);
    expect(count(['TextInput'])).toBeGreaterThan(0);
    expect(count(['Switch'])).toBeGreaterThan(0);
  });
  it('detecta una infracción sembrada y no confunde genéricos', () => {
    const bad = '<View>\n<Pressable onPress={() => go({ a: 1 })} style={s.x}>\n<Text>hola</Text></Pressable></View>';
    expect(openingTags(bad, ['Pressable']).filter((t) => !t.tag.includes('accessibilityRole'))).toHaveLength(1);
    expect(openingTags('const r = useRef<TextInput>(null); <TextInput\n label="x" />', ['TextInput'])).toHaveLength(1);
  });
});

describe('roles y nombres accesibles declarados', () => {
  it('todo elemento pulsable declara su rol', () => {
    const missing = SOURCES.flatMap(({ path, text }) =>
      openingTags(text, ['Pressable', 'TouchableOpacity', 'TouchableHighlight', 'TouchableWithoutFeedback'])
        .filter((t) => !t.tag.includes('accessibilityRole'))
        .map((t) => `${path}:${t.line} <${t.name}>`),
    );
    expect(missing).toEqual([]);
  });

  it('todo campo de texto e interruptor tiene nombre accesible', () => {
    const missing = SOURCES.flatMap(({ path, text }) =>
      openingTags(text, ['TextInput', 'Switch'])
        .filter((t) => !t.tag.includes('accessibilityLabel'))
        .map((t) => `${path}:${t.line} <${t.name}>`),
    );
    expect(missing).toEqual([]);
  });

  it('los controles de opción (radio) exponen su estado seleccionado', () => {
    const missing = SOURCES.flatMap(({ path, text }) =>
      openingTags(text, ['Pressable'])
        .filter((t) => /accessibilityRole=(\{?['"])radio/.test(t.tag) && !/accessibilityState=\{\{[^}]*(selected|checked)/.test(t.tag))
        .map((t) => `${path}:${t.line}`),
    );
    expect(missing).toEqual([]);
  });

  it('los botones de solo icono (Ionicons sin texto) llevan nombre accesible', () => {
    const missing = SOURCES.flatMap(({ path, text }) =>
      openingTags(text, ['Pressable'])
        .filter((t) => /accessibilityRole=(\{?['"])button/.test(t.tag) && !t.tag.includes('accessibilityLabel'))
        // Un botón con texto visible hereda su nombre del texto; los de solo icono no.
        .filter((t) => {
          const body = text.slice(text.indexOf(t.tag) + t.tag.length, text.indexOf('</Pressable>', text.indexOf(t.tag)));
          return /<Ionicons/.test(body) && !/<Text/.test(body);
        })
        .map((t) => `${path}:${t.line}`),
    );
    expect(missing).toEqual([]);
  });
});

const channel = (v: number) => {
  const s = v / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
function luminance(hex: string) {
  const h = hex.replace('#', '');
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}
const ratio = (fg: string, bg: string) => {
  const [a, b] = [luminance(fg), luminance(bg)].sort((x, y) => y - x);
  return (a + 0.05) / (b + 0.05);
};

describe('contraste de los pares del tema móvil (WCAG 2.x, texto normal ≥ 4.5:1)', () => {
  const textPairs: [string, string, string][] = [
    ['texto/fondo', colors.text, colors.bg],
    ['texto/tarjeta', colors.text, colors.card],
    ['atenuado/fondo', colors.muted, colors.bg],
    ['atenuado/tarjeta', colors.muted, colors.card],
    ['texto primario/blanco', colors.primary, colors.card],
    ['blanco/primario (botón)', colors.primaryText, colors.primary],
    ['marca oscura/marca suave (opción activa, icono de tarjeta)', colors.brandDark, colors.brandSoft],
    ['blanco/marca oscura (cabecera)', colors.onBrand, colors.brandDark],
    ['peligro/fondo de peligro', colors.danger, colors.dangerBg],
    ['advertencia/fondo de advertencia', colors.warning, colors.warningBg],
    ['aviso/fondo de aviso', colors.notice, colors.noticeBg],
    ['éxito/fondo de éxito', colors.success, colors.successBg],
    ['REAL', colors.real, colors.realBg],
    ['ESTIMADO', colors.estimated, colors.estimatedBg],
    ['PROYECTADO', colors.projected, colors.projectedBg],
    ['INFERIDO', colors.inferred, colors.inferredBg],
    ['peligro/tarjeta (errores de campo)', colors.danger, colors.card],
  ];
  it.each(textPairs)('%s', (_name, fg, bg) => {
    expect(ratio(fg, bg), `${fg} sobre ${bg}`).toBeGreaterThanOrEqual(4.5);
  });
});

describe('áreas táctiles', () => {
  it('el mínimo del tema es 44 pt', () => expect(TOUCH).toBeGreaterThanOrEqual(44));
  it('los componentes de selección y botones lo aplican', () => {
    for (const file of ['components/Button.tsx', 'components/Segmented.tsx', 'components/ChoiceGrid.tsx', 'components/Checkbox.tsx']) {
      const text = SOURCES.find((s) => s.path === `src/${file}`)?.text ?? '';
      expect(text, file).toMatch(/(minHeight|minWidth|height): TOUCH/);
    }
  });
});
