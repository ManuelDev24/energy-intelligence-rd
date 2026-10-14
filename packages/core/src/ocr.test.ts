import { describe, expect, it } from 'vitest';
import { isTransientOcrError, OCR_ERROR_CODES, ocrConfidenceText, ocrSourceText } from './ocr';

describe('vocabulario OCR compartido', () => {
  it('describe el método y las páginas solo cuando hay más de una', () => {
    expect(ocrSourceText({ method: 'ocr', pages_read: 1, pages_total: 1 })).toBe('Leído con reconocimiento óptico (OCR).');
    expect(ocrSourceText({ method: 'mixed', pages_read: 2, pages_total: 3 })).toBe('Leído del texto del PDF y con OCR (2 de 3 páginas).');
    expect(ocrSourceText({ method: null })).toBe('');
    expect(ocrSourceText({ method: 'desconocido' })).toBe('');
  });

  it('traduce la confianza', () => {
    expect(ocrConfidenceText('high')).toBe('Alta confianza');
    expect(ocrConfidenceText('inferred')).toBe('Inferido: revise');
    expect(ocrConfidenceText('none')).toBe('No detectado');
  });

  it('solo el error del motor es transitorio', () => {
    expect(OCR_ERROR_CODES.filter(isTransientOcrError)).toEqual(['engine_error']);
    expect(isTransientOcrError(null)).toBe(false);
  });
});
