import { describe, expect, it } from 'vitest';

import { inclusiveDays, parseDate, parseDecimal, validateBill, type BillFormValues } from './billForm';

const valid: BillFormValues = {
  periodStart: '2026-08-01',
  periodEnd: '2026-08-31',
  days: '31',
  kwh: '250.5',
  amount: '3100',
  readingPrevious: '',
  readingCurrent: '',
  dueDate: '',
};

describe('parseDate', () => {
  it('accepts a real calendar date', () => expect(parseDate('2026-08-31')).not.toBeNull());
  it('rejects an invalid day (Feb 30)', () => expect(parseDate('2026-02-30')).toBeNull());
  it('rejects a malformed string', () => expect(parseDate('31-08-2026')).toBeNull());
});

describe('parseDecimal', () => {
  it.each([
    ['250.5', 250.5],
    ['1,250.50', 1250.5],
    ['1250,50', 1250.5],
    ['0', 0],
    ['-3', -3],
  ])('parses %s -> %d', (input, expected) => expect(parseDecimal(input)).toBe(expected));
  it.each(['', 'abc', '1.2.3', '12,34,56'])('rejects %s', (input) => expect(parseDecimal(input)).toBeNull());
});

describe('inclusiveDays', () => {
  it('counts both endpoints (31 days in August)', () => expect(inclusiveDays('2026-08-01', '2026-08-31')).toBe(31));
  it('returns null when end precedes start', () => expect(inclusiveDays('2026-08-31', '2026-08-01')).toBeNull());
});

describe('validateBill', () => {
  it('accepts a fully valid bill', () => {
    const { errors, input } = validateBill(valid);
    expect(errors).toEqual({});
    expect(input).toMatchObject({ kwh: '250.5', amount_dop: '3100', days: 31 });
  });

  it('accepts zero kwh/amount/days', () => {
    const { errors } = validateBill({ ...valid, kwh: '0', amount: '0', days: '0' });
    expect(errors).toEqual({});
  });

  it.each([
    ['kwh', '-1'],
    ['amount', '-0.01'],
    ['days', '-1'],
    ['readingCurrent', '-1'],
  ])('rejects negative %s', (field, val) => {
    const { errors } = validateBill({ ...valid, [field]: val } as BillFormValues);
    expect(errors[field as keyof BillFormValues]).toBeDefined();
  });

  it('rejects period_end before period_start', () => {
    const { errors } = validateBill({ ...valid, periodStart: '2026-09-01', periodEnd: '2026-08-01' });
    expect(errors.periodEnd).toBeDefined();
  });

  it('rejects non-integer days', () => {
    const { errors } = validateBill({ ...valid, days: '30.5' });
    expect(errors.days).toBeDefined();
  });

  it('rejects reading_current below reading_previous', () => {
    const { errors } = validateBill({ ...valid, readingPrevious: '100', readingCurrent: '50' });
    expect(errors.readingCurrent).toBeDefined();
  });

  it('accepts reading_current equal to reading_previous', () => {
    const { errors } = validateBill({ ...valid, readingPrevious: '100', readingCurrent: '100' });
    expect(errors.readingCurrent).toBeUndefined();
  });

  it('leaves readings out of the payload when blank', () => {
    const { input } = validateBill(valid);
    expect(input?.reading_previous).toBeNull();
    expect(input?.reading_current).toBeNull();
  });
});

describe('fecha límite de pago (ERD-ALERT-02)', () => {
  it('es opcional: vacía no envía nada', () => {
    expect(validateBill(valid).input?.due_date).toBeNull();
  });
  it('se envía tal cual cuando es válida', () => {
    expect(validateBill({ ...valid, dueDate: ' 2026-09-15 ' }).input?.due_date).toBe('2026-09-15');
  });
  it.each([
    ['2026-09-31', 'AAAA-MM-DD'], ['15/09/2026', 'AAAA-MM-DD'], ['2026-07-31', 'anterior al inicio'], ['2027-01-15', 'más de 120 días'],
  ])('rechaza %s', (dueDate, message) => {
    const r = validateBill({ ...valid, dueDate });
    expect(r.input).toBeNull();
    expect(r.errors.dueDate).toContain(message);
  });
  it('120 días después del fin todavía es válido', () => {
    expect(validateBill({ ...valid, dueDate: '2026-12-29' }).input?.due_date).toBe('2026-12-29');
  });
});
