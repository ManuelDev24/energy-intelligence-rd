// ERD-CLAIM-01-MOBILE: lógica pura de las pantallas de reclamaciones.
import { ApiError } from '@energyrd/api-client';

/** Texto local según el error; nunca el `detail` del servidor. */
export function claimErrorText(error: unknown, action: 'create' | 'update' = 'update'): string {
  if (error instanceof ApiError) {
    if (error.status === 409) {
      if (error.code === 'claim_limit') return 'Tienes demasiadas reclamaciones abiertas o este caso llegó a su límite de notas. Cierra alguna antes de seguir.';
      return action === 'create' ? 'Ya tienes una reclamación abierta de este tipo para esa factura.' : 'Este caso ya está cerrado.';
    }
    if (error.status === 404) return 'No se encontró el caso o la factura. Actualiza e inténtalo de nuevo.';
    if (error.status === 0) return 'No se pudo conectar. Revisa tu conexión e inténtalo de nuevo.';
  }
  return action === 'create' ? 'No se pudo crear la reclamación. Inténtalo de nuevo.' : 'No se pudo completar la acción. Inténtalo de nuevo.';
}

export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('es-DO', { timeZone: 'America/Santo_Domingo', day: 'numeric', month: 'short', year: 'numeric' });
