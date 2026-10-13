import { SEVERITY_ORDER } from '@energyrd/core';

import type { Alert } from '../api/types';

export const unreadCount = (alerts: Alert[] | undefined) => (alerts ?? []).filter((a) => a.status === 'unread').length;

/** Lo urgente primero; dentro de cada gravedad, lo no leído primero (el orden de la API se conserva en los empates). */
export function sortAlerts<T extends { severity: keyof typeof SEVERITY_ORDER; status: string }>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || Number(b.status === 'unread') - Number(a.status === 'unread'));
}
