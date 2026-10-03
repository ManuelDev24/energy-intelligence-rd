import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { afterEach, expect, it, vi } from 'vitest';
import { EnergyDashboard } from './EnergyDashboard';
import { demoEnergy, demoEnergyHomes } from './fixtures';

afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
function mount() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}><EnergyDashboard /></QueryClientProvider>);
}
it('shows loading, error and retry, then empty homes without silently switching to demo', async () => {
  const fetchMock = vi.fn().mockImplementationOnce(() => new Promise(() => {}));
  vi.stubGlobal('fetch', fetchMock);
  const view = mount();
  expect(screen.getByText('Cargando dashboard energético…')).toBeInTheDocument();
  view.unmount();
  fetchMock.mockReset().mockResolvedValueOnce({ ok: false, status: 503 }).mockResolvedValueOnce({ ok: true, json: async () => [] });
  mount();
  expect(await screen.findByRole('alert')).toHaveTextContent('No pudimos cargar');
  fireEvent.click(screen.getByRole('button', { name: 'Reintentar' }));
  expect(await screen.findByText(/No hay viviendas registradas/)).toBeInTheDocument();
});
it('demo supports home and period selection, projection, alert, recommendation and an accessible table', async () => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => [] }));
  mount();
  fireEvent.change(screen.getByLabelText('Origen de datos'), { target: { value: 'demo' } });
  expect(screen.getByText(/Datos ficticios/)).toBeInTheDocument();
  expect(screen.getByRole('table', { name: 'Consumo facturado y procedencia' })).toBeInTheDocument();
  expect(screen.getByRole('img', { name: 'Historial mensual por período facturado' })).toBeInTheDocument();
  expect(screen.getByText('300 kWh')).toBeInTheDocument();
  expect(screen.getByText('Ejemplo demo: el consumo subió 25 %.')).toBeInTheDocument();
  expect(screen.getByText(/Ejemplo demo: revisa/)).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Período de factura'), { target: { value: demoEnergy(demoEnergyHomes[0]).bills[0].id } });
  expect(screen.getByText('200 kWh', { selector: 'strong' })).toBeInTheDocument();
  fireEvent.change(screen.getByLabelText('Vivienda'), { target: { value: demoEnergyHomes[1].id } });
  expect(screen.getByText(/No hay facturas para esta vivienda/)).toBeInTheDocument();
  expect(screen.queryByText('300 kWh')).not.toBeInTheDocument();
});
it('loads real API and marks seed data as demo', async () => {
  const data = demoEnergy(demoEnergyHomes[0]);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => ({ ok: true,
    json: async () => url.endsWith('/homes') ? demoEnergyHomes : url.endsWith('/bills') ? data.bills : data.dashboard,
  })));
  mount();
  await waitFor(() => expect(screen.getByText('300 kWh')).toBeInTheDocument());
  expect(screen.getByText(/Datos ficticios/)).toBeInTheDocument();
});
it('does not show the prior home data while the next home loads', async () => {
  const data = demoEnergy(demoEnergyHomes[0]);
  vi.stubGlobal('fetch', vi.fn().mockImplementation(async (url: string) => {
    if (url.includes(demoEnergyHomes[1].id)) return new Promise(() => {});
    return { ok: true, json: async () => url.endsWith('/homes') ? demoEnergyHomes : url.endsWith('/bills') ? data.bills : data.dashboard };
  }));
  mount();
  await screen.findByText('300 kWh');
  fireEvent.change(screen.getByLabelText('Vivienda'), { target: { value: demoEnergyHomes[1].id } });
  expect(screen.getByText('Cargando dashboard energético…')).toBeInTheDocument();
  expect(screen.queryByText('300 kWh')).not.toBeInTheDocument();
});
