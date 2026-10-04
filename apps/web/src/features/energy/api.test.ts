import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadEnergy, loadHomes } from './api';
import { demoEnergy, demoEnergyHomes } from './fixtures';
import { compareBill } from './model';

afterEach(() => vi.unstubAllGlobals());
const home = demoEnergyHomes[0];
const data = demoEnergy(home);
describe('API énergétique', () => {
  it('loads published endpoints and parses Decimal strings without changing quality', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce({ ok: true, json: async () => data.bills.map(bill => ({ ...bill, kwh: String(bill.kwh) })) })
      .mockResolvedValueOnce({ ok: true, json: async () => data.dashboard });
    vi.stubGlobal('fetch', fetchMock);
    const result = await loadEnergy('http://localhost:8000/', home.id);
    expect(result.bills[0].kwh).toBe(200);
    expect(result.dashboard.projection?.kwh.quality).toBe('PROJECTED');
    expect(fetchMock.mock.calls.map(call => call[0])).toEqual([
      `http://localhost:8000/api/v1/homes/${home.id}/bills`, `http://localhost:8000/api/v1/homes/${home.id}/dashboard`,
    ]);
  });
  it('rejects HTTP failures rather than silently using demo', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 503 }));
    await expect(loadHomes('http://localhost:8000')).rejects.toThrow('503');
  });
  it.each([NaN, -1, '', 'Infinity'])('rejects invalid consumption %s', async value => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => [{ ...data.bills[0], kwh: value }] })
      .mockResolvedValueOnce({ ok: true, json: async () => data.dashboard }));
    await expect(loadEnergy('http://localhost:8000', home.id)).rejects.toThrow();
  });
  it('rejects responses from another home', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValueOnce({ ok: true, json: async () => data.bills })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ...data.dashboard, home: demoEnergyHomes[1] }) }));
    await expect(loadEnergy('http://localhost:8000', home.id)).rejects.toThrow('vivienda');
  });
});
describe('monthly comparison', () => {
  it('compares calendar months and handles zero and missing baseline', () => {
    expect(compareBill(data.bills[1], data.bills)?.percent).toBe(25);
    expect(compareBill(data.bills[1], [{ ...data.bills[0], kwh: 0 }])?.percent).toBeNull();
    expect(compareBill({ ...data.bills[1], period_end: '2026-03-31' }, [data.bills[0]])).toBeNull();
  });
  it('does not arbitrarily select among multiple bills in the prior month', () => {
    expect(compareBill(data.bills[1], [data.bills[0], { ...data.bills[0], id: 'another' }])).toBeNull();
  });
  it('handles January rollover and never compares a different home', () => {
    const january = { ...data.bills[1], period_end: '2027-01-31' };
    const december = { ...data.bills[0], period_end: '2026-12-31' };
    expect(compareBill(january, [december])?.delta).toBe(50);
    expect(compareBill(january, [{ ...december, home_id: demoEnergyHomes[1].id }])).toBeNull();
  });
});
