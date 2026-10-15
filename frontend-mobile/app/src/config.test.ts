import { describe, expect, it } from 'vitest';

import { ApiUrlConfigError, resolveApiConfig, resolveApiUrl, resolveAuthEnabled } from './config';

describe('release authentication guard', () => {
  it('only allows legacy mode for explicit false in development', () => {
    expect(resolveAuthEnabled(undefined, true)).toBe(true);
    expect(resolveAuthEnabled('false', true)).toBe(false);
    expect(resolveAuthEnabled('true', true)).toBe(true);
    expect(resolveAuthEnabled('typo', true)).toBe(true);
    expect(resolveAuthEnabled('false', false)).toBe(true);
    expect(resolveAuthEnabled(undefined, false)).toBe(true);
  });
});

describe('resolveApiUrl', () => {
  it('prefers an explicit EXPO_PUBLIC_API_URL', () => {
    expect(resolveApiUrl({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' }, undefined, 'ios', true)).toBe(
      'https://api.example.com',
    );
  });

  it('derives the host from Metro hostUri on a physical device', () => {
    expect(resolveApiUrl({}, '192.168.1.50:8081', 'ios', true)).toBe('http://192.168.1.50:8000');
  });

  it('uses 10.0.2.2 for the Android emulator with no LAN host', () => {
    expect(resolveApiUrl({}, 'localhost:8081', 'android', true)).toBe('http://10.0.2.2:8000');
  });

  it('falls back to localhost on iOS simulator / web', () => {
    expect(resolveApiUrl({}, undefined, 'ios', true)).toBe('http://localhost:8000');
    expect(resolveApiUrl({}, undefined, 'web', true)).toBe('http://localhost:8000');
  });

  it('keeps an explicit http URL usable in development (local/LAN APIs)', () => {
    expect(resolveApiUrl({ EXPO_PUBLIC_API_URL: 'http://127.0.0.1:8011/' }, undefined, 'ios', true)).toBe('http://127.0.0.1:8011');
  });

  it('outside __DEV__ requires an explicit HTTPS origin (fails closed, no local HTTP fallback)', () => {
    expect(resolveApiUrl({ EXPO_PUBLIC_API_URL: 'https://api.example.com/' }, undefined, 'ios', false)).toBe('https://api.example.com');
    expect(resolveApiUrl({ EXPO_PUBLIC_API_URL: 'https://api.example.com:8443' }, undefined, 'android', false)).toBe('https://api.example.com:8443');
    for (const url of [undefined, '', 'http://api.example.com', 'HTTP://api.example.com', 'ftp://api.example.com',
      'https://', 'https://user:pw@api.example.com', 'https://api.example.com/api/v1', 'https://api.example.com?x=1',
      'https://api.example.com#x', 'https://api example.com', '//api.example.com'])
      expect(() => resolveApiUrl({ EXPO_PUBLIC_API_URL: url }, '192.168.1.50:8081', 'android', false), String(url)).toThrow(ApiUrlConfigError);
  });

  it('defaults to the fail-closed (non-development) policy when __DEV__ is not known', () => {
    expect(() => resolveApiUrl({}, undefined, 'ios')).toThrow(/HTTPS/);
  });

  it('exposes a configuration error instead of crashing at import in a misconfigured release', () => {
    expect(resolveApiConfig({}, undefined, 'ios', false)).toEqual({ url: null, error: expect.stringMatching(/HTTPS/) });
    expect(resolveApiConfig({ EXPO_PUBLIC_API_URL: 'https://api.example.com' }, undefined, 'ios', false))
      .toEqual({ url: 'https://api.example.com', error: null });
  });
});
