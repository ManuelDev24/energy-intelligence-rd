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
