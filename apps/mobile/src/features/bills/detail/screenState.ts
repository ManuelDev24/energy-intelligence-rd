// Estado de la pantalla "Detalle de factura" (ERD-BILL-02). Puro. La API piloto (:8000) no tiene estas
// rutas y responde 404: se muestra "no disponible" y se ocultan editar y revisar (fallo suave).
import { isEndpointUnavailable } from '../../goals/model';

export type DetailScreenKind = 'loading' | 'unavailable' | 'error' | 'ready';
export interface DetailScreenState { kind: DetailScreenKind; canEdit: boolean; canAssess: boolean }

export function detailScreenState(q: { isLoading: boolean; error: unknown; hasData: boolean }): DetailScreenState {
  if (q.hasData) return { kind: 'ready', canEdit: true, canAssess: true };
  if (q.isLoading) return { kind: 'loading', canEdit: false, canAssess: false };
  if (q.error && isEndpointUnavailable(q.error)) return { kind: 'unavailable', canEdit: false, canAssess: false };
  return { kind: 'error', canEdit: false, canAssess: false };
}

/** Acceso nuevo desde la tarjeta de factura; la tarjeta conserva su testID `bill-<inicio>`. */
export const billOpenTestID = (periodStart: string) => `bill-open-${periodStart}`;

/** La ruta fija la vivienda de la factura: si el usuario cambia de vivienda no se consulta otra. */
export const belongsToSelectedHome = (selectedHomeId: string | null, routeHomeId: string) => selectedHomeId === routeHomeId;
