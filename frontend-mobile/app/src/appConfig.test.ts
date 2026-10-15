import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// Auditoría C-14: permisos y metadatos de tienda. `expo config --type prebuild` resuelve esto mismo (verificado a mano al cambiarlo).
const expo = JSON.parse(readFileSync(resolve(__dirname, '../app.json'), 'utf8')).expo;
const imagePicker = (expo.plugins as unknown[]).find((p) => Array.isArray(p) && p[0] === 'expo-image-picker') as [string, Record<string, unknown>] | undefined;

describe('app.json (permisos y tiendas)', () => {
  it('el selector de imágenes no pide micrófono y explica cámara y fotos en español', () => {
    expect(imagePicker).toBeDefined();
    const options = imagePicker![1];
    expect(options.microphonePermission).toBe(false);
    for (const key of ['cameraPermission', 'photosPermission']) {
      expect(typeof options[key]).toBe('string');
      expect(options[key] as string).toMatch(/factura/i);
      expect(options[key] as string).not.toMatch(/Allow \$\(PRODUCT_NAME\)/); // texto genérico en inglés por defecto
    }
  });

  it('bloquea RECORD_AUDIO (la app no graba audio) y no deja respaldos automáticos de Android', () => {
    expect(expo.android.blockedPermissions).toContain('android.permission.RECORD_AUDIO');
    expect(expo.android.allowBackup).toBe(false);
  });

  it('declara que solo usa cifrado exento (HTTPS del sistema) para no repetir la pregunta en cada subida a App Store Connect', () => {
    expect(expo.ios.config.usesNonExemptEncryption).toBe(false);
  });

  it('mantiene los identificadores de tienda', () => {
    expect(expo.ios.bundleIdentifier).toBe('do.energyrd.app');
    expect(expo.android.package).toBe('do.energyrd.app');
  });
});
