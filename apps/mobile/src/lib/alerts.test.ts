import { describe, expect, it } from 'vitest';

import type { Alert } from '../api/types';
import { unreadCount } from './alerts';

const a = (status: Alert['status']): Alert => ({
  id: status, home_id: 'h', bill_id: null, type: 'bill_variation', severity: 'warning', status,
  message: 'm', kwh_pct: '25', threshold_pct: '20', basis_bill_id: null,
  basis_period_start: null, basis_period_end: null, created_at: '',
});

describe('unreadCount', () => {
  it('counts only unread alerts', () => expect(unreadCount([a('unread'), a('read'), a('dismissed'), a('unread')])).toBe(2));
  it('handles undefined', () => expect(unreadCount(undefined)).toBe(0));
});
