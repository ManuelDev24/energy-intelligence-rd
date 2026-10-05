import { expect, it, vi } from 'vitest';
import { saveVerified } from './saveVerified';
it.each(['before', 'write', 'read'])('no publica ni continúa al cambiar de cuenta en %s', async stage => {
  let active = stage !== 'before';
  const read = vi.fn(async () => { if (stage === 'read') active = false; return 'home-one'; });
  const write = vi.fn(async () => { if (stage === 'write') active = false; });
  const publish = vi.fn();
  await expect(saveVerified({ write, read, publish, check: () => { if (!active) throw new Error('Cuenta cambiada'); } })).rejects.toThrow('Cuenta cambiada');
  expect(publish).not.toHaveBeenCalled();
  if (stage === 'before') expect(write).not.toHaveBeenCalled();
  if (stage === 'write') expect(read).not.toHaveBeenCalled();
});
it('confirma con GET antes de publicar éxito', async () => {
  const order: string[] = [];
  const result = await saveVerified({ write: async () => { order.push('write'); }, read: async () => { order.push('read'); return { name: 'canonical' }; }, check: () => undefined, publish: value => { order.push(value.name); } });
  expect(result).toEqual({ name: 'canonical' });
  expect(order).toEqual(['write', 'read', 'canonical']);
});
