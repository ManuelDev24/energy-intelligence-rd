import { expect, it } from 'vitest';
import { createDraft, editDraft, rebaseDraft, confirmDraft, beginDraft } from './editableDraft';
it('confirmación adopta canonical salvo ediciones posteriores al snapshot enviado', () => {
  const original = createDraft({ number: 'OLD' });
  const sent = editDraft(original, 'number', 'SUBMITTED');
  expect(confirmDraft(sent, sent, { number: 'CANONICAL' }).value).toEqual({ number: 'CANONICAL' });
  const later = editDraft(sent, 'number', 'LATER');
  expect(confirmDraft(later, sent, { number: 'CANONICAL' })).toMatchObject({ baseline: { number: 'CANONICAL' }, value: { number: 'LATER' } });
  // A later return to the old baseline is still user intent, not an untouched field.
  expect(confirmDraft(editDraft(sent, 'number', 'OLD'), sent, { number: 'CANONICAL' }).value.number).toBe('OLD');
});
it('readback intermedio respeta una edición posterior incluso si vuelve al valor original', () => {
  const sent = editDraft(createDraft({ number: 'OLD' }), 'number', 'SUBMITTED');
  const later = editDraft(beginDraft(sent), 'number', 'OLD');
  const readback = rebaseDraft(later, { number: 'CANONICAL' });
  expect(readback.value.number).toBe('OLD');
  expect(confirmDraft(readback, sent, { number: 'CANONICAL' }).value.number).toBe('OLD');
});
it('refetch sincroniza untouched pero conserva el campo dirty', () => {
  const initial = createDraft({ name: 'Casa', sector: 'Centro', hasAc: null as boolean | null });
  const edited = editDraft(initial, 'name', 'Draft');
  const refreshed = rebaseDraft(edited, { name: 'Servidor', sector: 'Norte', hasAc: true });
  expect(refreshed.value).toEqual({ name: 'Draft', sector: 'Norte', hasAc: true });
  expect(refreshed.baseline.name).toBe('Servidor');
  expect(rebaseDraft(initial, { name: 'Servidor', sector: 'Norte', hasAc: true }).value.name).toBe('Servidor');
});
