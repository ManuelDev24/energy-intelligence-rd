import { describe, expect, it, vi } from 'vitest';
import { createApiClient } from './index';

const HOME = '00000000-0000-0000-0000-000000000001';
const draft = {
  period_start: { value: '2026-09-01', confidence: 'high' },
  period_end: { value: '2026-09-30', confidence: 'high' },
  days: { value: '30', confidence: 'inferred' },
  kwh: { value: '100', confidence: 'high' },
  amount_dop: { value: '1500', confidence: 'high' },
  reading_previous: { value: null, confidence: 'none' },
  reading_current: { value: '200', confidence: 'inferred' },
  due_date: { value: '2026-10-15', confidence: 'high' },
  warnings: ['Revise la lectura actual'],
  raw_text_excerpt: 'EDE ...',
};

describe('OCR bill client', () => {
  it('posts the selected image as multipart and returns a draft without creating a bill', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response(JSON.stringify(draft), { status: 200, headers: { 'content-type': 'application/json' } }));
    const result = await createApiClient('http://api.test', fetcher).ocrBill(HOME, {
      uri: 'file:///bill.jpg', name: 'bill.jpg', type: 'image/jpeg',
    });
    expect(result).toEqual(draft);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/bills/ocr`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBeUndefined();
    expect(init.body).toBeInstanceOf(FormData);
  });
});

const DOC = '00000000-0000-0000-0000-0000000000d1';
const job = (over: Record<string, unknown> = {}) => ({
  document_id: DOC, status: 'pending', attempts: 0, method: null, pages_read: null, pages_total: null, draft: null,
  error_code: null, error_message: null, created_at: '2026-10-10T12:00:00Z', finished_at: null, ...over,
});
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('OCR asíncrono (ERD-OCR-PROD)', () => {
  it('startOcrJob envía multipart con el origen y exige 202', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(job(), 202));
    const result = await createApiClient('http://api.test', fetcher).startOcrJob(HOME, { uri: 'file:///f.pdf', name: 'f.pdf', type: 'application/pdf' }, 'mobile');
    expect(result.status).toBe('pending');
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/bills/ocr-jobs`);
    expect(init.method).toBe('POST');
    expect(init.headers['Content-Type']).toBeUndefined();
    expect((init.body as FormData).get('source')).toBe('mobile');
  });
  it('rechaza un 200 donde se esperaba 202 y respuestas que no cumplen el contrato', async () => {
    const api = (response: Response) => createApiClient('http://api.test', vi.fn().mockResolvedValue(response));
    await expect(api(json(job(), 200)).startOcrJob(HOME, { uri: 'x' }, 'web')).rejects.toMatchObject({ code: 'invalid_response' });
    await expect(api(json({ status: 'weird' })).getOcrJob(HOME, DOC)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('getOcrJob valida que el estado pertenezca al documento pedido', async () => {
    const other = job({ document_id: '00000000-0000-0000-0000-0000000000d2' });
    const api = createApiClient('http://api.test', vi.fn().mockResolvedValue(json(other)));
    await expect(api.getOcrJob(HOME, DOC)).rejects.toMatchObject({ code: 'invalid_response' });
  });
  it('un trabajo terminado trae el borrador y uno fallido trae un mensaje local', async () => {
    const done = job({ status: 'done', method: 'text_layer', pages_read: 2, pages_total: 2, draft });
    expect((await createApiClient('http://api.test', vi.fn().mockResolvedValue(json(done))).getOcrJob(HOME, DOC)).draft).toEqual(draft);
    const failed = job({ status: 'failed', error_code: 'unreadable', error_message: 'No se pudo leer el archivo.' });
    expect((await createApiClient('http://api.test', vi.fn().mockResolvedValue(json(failed))).getOcrJob(HOME, DOC)).error_code).toBe('unreadable');
  });
  it('retryOcrJob hace POST con cuerpo JSON vacío', async () => {
    const fetcher = vi.fn().mockResolvedValue(json(job(), 202));
    await createApiClient('http://api.test', fetcher).retryOcrJob(HOME, DOC);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(`http://api.test/api/v1/homes/${HOME}/bills/ocr-jobs/${DOC}/retry`);
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{}');
  });
  it('createBill envía document_id para ligar el original', async () => {
    const fetcher = vi.fn().mockResolvedValue(json({}, 201));
    await createApiClient('http://api.test', fetcher).createBill(HOME, { period_start: '2026-08-01', period_end: '2026-08-31', days: 31, kwh: '300', amount_dop: '4000', document_id: DOC }).catch(() => undefined);
    expect(JSON.parse(fetcher.mock.calls[0][1].body as string).document_id).toBe(DOC);
  });
});
