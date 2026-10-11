import { describe, expect, it } from 'vitest';

import type { Alert } from '../api/types';
import { sortAlerts, unreadCount } from './alerts';

const a = (status: Alert['status']): Alert => ({
  id: status, home_id: 'h', bill_id: null, anomaly_id: null, type: 'bill_variation', severity: 'warning', status,
  message: 'm', kwh_pct: '25', threshold_pct: '20', basis_bill_id: null,
  basis_period_start: null, basis_period_end: null, created_at: '',
});

describe('unreadCount', () => {
  it('counts only unread alerts', () => expect(unreadCount([a('unread'), a('read'), a('dismissed'), a('unread')])).toBe(2));
  it('handles undefined', () => expect(unreadCount(undefined)).toBe(0));
});

describe('pantalla de alertas (ERD-ALERT-02)', () => {
  it('ordena lo urgente primero y, dentro de cada gravedad, lo no leído', () => {
    const mk = (id: string, severity: Alert['severity'], status: Alert['status']) => ({ ...a(status), id, severity });
    const sorted = sortAlerts([mk('ahorro', 'savings', 'unread'), mk('info', 'info', 'unread'), mk('adv-leida', 'warning', 'read'),
      mk('crit-leida', 'critical', 'read'), mk('adv-nueva', 'warning', 'unread')]);
    expect(sorted.map((x) => x.id)).toEqual(['crit-leida', 'adv-nueva', 'adv-leida', 'info', 'ahorro']);
  });
});
