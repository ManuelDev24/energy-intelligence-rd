import { describe, expect, it } from 'vitest';

import { ApiError, ContractError } from '@energyrd/api-client';

import { belongsToSelectedHome, billOpenTestID, detailScreenState } from './screenState';

describe('estado de la pantalla de detalle (fallo suave con la API piloto)', () => {
  it('cargando / listo', () => {
    expect(detailScreenState({ isLoading: true, error: null, hasData: false })).toEqual({ kind: 'loading', canEdit: false, canAssess: false });
    expect(detailScreenState({ isLoading: false, error: null, hasData: true })).toEqual({ kind: 'ready', canEdit: true, canAssess: true });
  });

  it('404/405/501 de la API piloto: "no disponible" y se ocultan edición y revisión', () => {
    for (const status of [404, 405, 501])
      expect(detailScreenState({ isLoading: false, error: new ApiError(status, 'x'), hasData: false })).toEqual({ kind: 'unavailable', canEdit: false, canAssess: false });
  });

  it('red/servidor/contrato: error con reintento, sin edición', () => {
    for (const error of [new ApiError(0, 'x'), new ApiError(500, 'x'), new ContractError()])
      expect(detailScreenState({ isLoading: false, error, hasData: false })).toEqual({ kind: 'error', canEdit: false, canAssess: false });
  });

  it('con dato previo de la misma factura y un error de refresco se mantiene listo', () => {
    expect(detailScreenState({ isLoading: false, error: new ApiError(500, 'x'), hasData: true }).kind).toBe('ready');
  });
});

describe('testID de acceso al detalle', () => {
  it('la pantalla solo muestra la factura si la vivienda seleccionada es la de la ruta', () => {
    expect(belongsToSelectedHome('h1', 'h1')).toBe(true);
    expect(belongsToSelectedHome('h2', 'h1')).toBe(false);
    expect(belongsToSelectedHome(null, 'h1')).toBe(false);
  });
  it('es nuevo y no coincide con el testID existente de la tarjeta (bill-<inicio>)', () => {
    expect(billOpenTestID('2026-07-01')).toBe('bill-open-2026-07-01');
    expect(billOpenTestID('2026-07-01')).not.toBe('bill-2026-07-01');
  });
});
