import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
it('ofrece cierre explícito del teclado en el flujo de metas y ocupantes', () => {
  const screen = readFileSync(new URL('./AccountOnboardingScreen.tsx', import.meta.url), 'utf8');
  expect(screen.includes('<KeyboardDoneBar keyboardHeight={keyboardHeight} />')).toBe(true);
});
it('no permite vaciar contrato o meta después de crear parcialmente la vivienda', () => {
  const screen = readFileSync(new URL('./AccountOnboardingScreen.tsx', import.meta.url), 'utf8');
  expect(screen.includes("homeId && ['accountNumber', 'goalAmount', 'goalKwh'].includes(key)")).toBe(true);
  expect(screen.includes('Contrato y meta quedan fijados')).toBe(true);
});
it('bloquea segundo POST ambiguo y usa errores locales incluso fuera de ApiError', () => {
  const screen = readFileSync(new URL('./AccountOnboardingScreen.tsx', import.meta.url), 'utf8');
  expect(screen.includes('creationUncertain')).toBe(true);
  expect(screen.includes('inFlight.current')).toBe(true);
  expect(screen.includes('error.message')).toBe(false);
});
it('onboarding ofrece tres opciones explícitas y revisa también respuestas negativas', () => {
  const screen = readFileSync(new URL('./AccountOnboardingScreen.tsx', import.meta.url), 'utf8');
  expect(screen).toContain('<EnergyProfileFields');
  expect(screen).not.toContain("set(key, !draft[key])");
  expect(screen).toContain('triStateLabel(draft[key])');
});
