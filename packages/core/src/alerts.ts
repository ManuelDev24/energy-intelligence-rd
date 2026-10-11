import type { AlertItem } from '@energyrd/api-contracts';

/** ERD-ALERT-02: presentación de alertas. El texto largo (`message`) lo escribe la API; aquí solo titulares y destinos. */
export function alertTitle(alert: Pick<AlertItem, 'type' | 'severity'>): string {
  switch (alert.type) {
    case 'payment_due': return alert.severity === 'critical' ? 'Factura vencida' : 'Factura por vencer';
    case 'anomaly': return 'Desviación de consumo';
    case 'missing_bill': return 'Falta registrar una factura';
    case 'stale_readings': return 'Lecturas atrasadas';
    case 'bill_variation': return alert.severity === 'savings' ? 'Ahorro frente al período anterior' : 'Consumo más alto que el período anterior';
  }
}

export type AlertTarget =
  | { kind: 'bill'; billId: string; label: string }
  | { kind: 'new-bill'; label: string }
  | { kind: 'new-reading'; label: string }
  | { kind: 'home'; label: string };

/** A dónde lleva «resolver» cada tipo de alerta; cada app lo traduce a su navegación. */
export function alertTarget(alert: Pick<AlertItem, 'type' | 'bill_id'>): AlertTarget | null {
  switch (alert.type) {
    case 'payment_due': return alert.bill_id ? { kind: 'bill', billId: alert.bill_id, label: 'Ver factura' } : null;
    case 'bill_variation': return alert.bill_id ? { kind: 'bill', billId: alert.bill_id, label: 'Ver factura' } : null;
    case 'missing_bill': return { kind: 'new-bill', label: 'Registrar factura' };
    case 'stale_readings': return { kind: 'new-reading', label: 'Registrar lectura' };
    case 'anomaly': return { kind: 'home', label: 'Ver desviaciones' };
  }
}

/** Orden de importancia para mostrar primero lo urgente. */
export const SEVERITY_ORDER: Record<AlertItem['severity'], number> = { critical: 0, warning: 1, info: 2, savings: 3 };
