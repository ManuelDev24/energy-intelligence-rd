import { describe, expect, it } from 'vitest';

import { resolveApiUrl } from './config';

describe('resolveApiUrl', () => {
  it('prefers an explicit EXPO_PUBLIC_API_URL', () => {
    expect(resolveApiUrl({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' }, undefined, 'ios')).toBe(
      'https://api.example.com',
    );
  });

  it('derives the host from Metro hostUri on a physical device', () => {
    expect(resolveApiUrl({}, '192.168.1.50:8081', 'ios')).toBe('http://192.168.1.50:8000');
  });

  it('uses 10.0.2.2 for the Android emulator with no LAN host', () => {
    expect(resolveApiUrl({}, 'localhost:8081', 'android')).toBe('http://10.0.2.2:8000');
  });

  it('falls back to localhost on iOS simulator / web', () => {
    expect(resolveApiUrl({}, undefined, 'ios')).toBe('http://localhost:8000');
    expect(resolveApiUrl({}, undefined, 'web')).toBe('http://localhost:8000');
  });
});
