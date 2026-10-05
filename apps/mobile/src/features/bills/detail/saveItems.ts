// Guardado verificado de ítems (ERD-BILL-02): PUT, luego GET y comparación con lo enviado antes de
// publicar éxito. `check` re-verifica cuenta y vivienda tras cada await (cierre de sesión o cambio
// de vivienda a mitad del guardado => no se publica nada en la pantalla equivocada).
import type { BillItemsOut, BillItemsReplace } from '@energyrd/api-contracts';

import { describeError } from '../../../api/errors';
import { isEndpointUnavailable } from '../../goals/model';

export class ScopeChangedError extends Error {
  constructor() { super('Cuenta o vivienda cambiada'); this.name = 'ScopeChangedError'; }
}
export class BillItemsNotConfirmedError extends Error {
  constructor() { super('Ítems no confirmados'); this.name = 'BillItemsNotConfirmedError'; }
}

/** "1000" / "1000.00" / "-150.0" -> centavos exactos (sin float); null si no es decimal. */
export function cents(value: string): bigint | null {
  const m = /^([-+]?)(\d*)(?:\.(\d*))?$/.exec(value.trim());
  if (!m || (!m[2] && !m[3])) return null;
  const frac = (m[3] ?? '').padEnd(2, '0');
  if (/[1-9]/.test(frac.slice(2))) return null;
  const n = BigInt(m[2] || '0') * 100n + BigInt(frac.slice(0, 2) || '0');
  return m[1] === '-' ? -n : n;
}

/** Lo releído coincide con lo enviado: mismo orden, concepto, tipo y monto. */
export function itemsMatch(sent: BillItemsReplace, got: BillItemsOut): boolean {
  if (sent.items.length !== got.items.length) return false;
  const ordered = [...got.items].sort((a, b) => a.position - b.position);
  return sent.items.every((s, i) => {
    const g = ordered[i];
    const a = cents(String(s.amount_dop));
    return g.label === s.label && g.kind === s.kind && a !== null && a === cents(g.amount_dop);
  });
}

export async function saveBillItemsVerified(op: {
  input: BillItemsReplace;
  check: () => void;
  put: (input: BillItemsReplace) => Promise<BillItemsOut>;
  get: () => Promise<BillItemsOut>;
  publish: (value: BillItemsOut) => void;
  /** Se llama una vez intentado el PUT (éxito o error): el servidor pudo haber cambiado. */
  settled?: () => void;
}): Promise<BillItemsOut> {
  op.check();
  try {
    await op.put(op.input);
    op.check();
    const value = await op.get();
    op.check();
    if (!itemsMatch(op.input, value)) throw new BillItemsNotConfirmedError();
    op.publish(value);
    return value;
  } finally {
    op.settled?.();
  }
}

/** Texto local para el error del guardado; null = la pantalla ya no corresponde (no se muestra nada). */
export function saveItemsErrorMessage(error: unknown): string | null {
  if (error instanceof ScopeChangedError) return null;
  if (error instanceof BillItemsNotConfirmedError)
    return 'No se pudo confirmar el guardado: lo registrado no coincide con lo enviado. Actualice el detalle y revise.';
  if (isEndpointUnavailable(error)) return 'El detalle de factura no está disponible en este servidor.';
  return describeError(error).message;
}
