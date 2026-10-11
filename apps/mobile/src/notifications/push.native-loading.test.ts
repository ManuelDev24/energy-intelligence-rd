import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

// Exercise the real Metro namespace loader, not Vite's safe ESM namespace.
// React Native exposes deprecated modules through getters; importAll enumerates them.
function loadPushAdapter({ os = 'ios', isExpoGo = false, crashNotificationsOnAndroid = false }: { os?: string; isExpoGo?: boolean; crashNotificationsOnAndroid?: boolean } = {}) {
  const deprecatedGetter = vi.fn(() => { throw new Error('native PushNotificationIOS is absent'); });
  const rn = { Platform: { OS: os } };
  Object.defineProperty(rn, 'PushNotificationIOS', { enumerable: true, get: deprecatedGetter });
  const modules: Record<string, unknown> = {
    'react-native': rn,
    expo: { isRunningInExpoGo: () => isExpoGo },
    'expo-notifications': {
      getPermissionsAsync: async () => ({ status: 'undetermined' }),
      requestPermissionsAsync: async () => ({ status: 'denied' }),
      getExpoPushTokenAsync: vi.fn(),
    },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: {} } } },
  };
  const ids = { 'react-native': 1, expo: 4, 'expo-notifications': 2, 'expo-constants': 3 };
  const context = vm.createContext({ __DEV__: false, __METRO_GLOBAL_PREFIX__: '', console });
  vm.runInContext('globalThis.global = globalThis;', context);
  vm.runInContext(readFileSync(require.resolve('metro-runtime/src/polyfills/require.js'), 'utf8'), context);
  const loader = context as unknown as {
    __d: (factory: (...args: unknown[]) => void, id: number, dependencies: number[]) => void;
    __r: { importAll: (id: number) => unknown };
    [key: string]: unknown;
  };
  for (const [name, id] of Object.entries(ids)) {
    loader.__d((...args) => {
      // The real expo-notifications runs an auto-registration side effect at module load time
      // that, on Android inside Expo Go (SDK 53+), throws from OUTSIDE any promise the caller
      // awaits — a surrounding try/catch cannot catch it, so the only safe option is to never
      // import this module at all on Android inside Expo Go. Reproduce it as a load-time throw.
      if (name === 'expo-notifications' && crashNotificationsOnAndroid && rn.Platform.OS === 'android') {
        throw new Error('expo-notifications: Android Push notifications (remote notifications) functionality provided by expo-notifications was removed from Expo Go with the release of SDK 53. Use a development build instead of Expo Go. Learn more at https://docs.expo.dev/develop/development-builds/introduction/.');
      }
      (args[4] as { exports: unknown }).exports = modules[name];
    }, id, []);
  }
  loader.require = (name: string) => modules[name];
  loader.exports = {};
  loader.__metroImport = async (name: keyof typeof ids) => loader.__r.importAll(ids[name]);
  const code = babel.transformSync(readFileSync(new URL('./push.ts', import.meta.url), 'utf8'), {
    filename: 'push.ts', babelrc: false, configFile: false,
    plugins: [
      '@babel/plugin-transform-typescript',
      () => ({ visitor: { CallExpression(path: { node: { callee: { type: string }; arguments: unknown[] }; replaceWith: (node: unknown) => void }) {
        if (path.node.callee.type === 'Import') path.replaceWith(babel.types.callExpression(babel.types.identifier('__metroImport'), path.node.arguments));
      } } }),
      '@babel/plugin-transform-modules-commonjs',
    ],
  }).code;
  vm.runInContext(code, context);
  return { deprecatedGetter, exports: loader.exports as { nativeDeps: (api: unknown) => Promise<{ platform: string; getToken: () => Promise<unknown> }> } };
}

describe('native push adapter in Metro', () => {
  it('reads Platform without evaluating unavailable React Native namespace getters', async () => {
    const adapter = loadPushAdapter();
    const api = { registerDevice: vi.fn(), removeDevice: vi.fn() };
    const deps = await adapter.exports.nativeDeps(api);
    expect(deps.platform).toBe('ios');
    expect(adapter.deprecatedGetter).not.toHaveBeenCalled();
    // Without an EAS project, do not request or register a real device token.
    expect(await deps.getToken()).toBeNull();
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it('never imports expo-notifications on Android inside Expo Go, where loading it alone crashes the app', async () => {
    const adapter = loadPushAdapter({ os: 'android', isExpoGo: true, crashNotificationsOnAndroid: true });
    const api = { registerDevice: vi.fn(), removeDevice: vi.fn() };
    // If the guard failed and the module were imported anyway, the mock above throws
    // synchronously and this call would reject instead of resolving.
    const deps = await adapter.exports.nativeDeps(api);
    expect(await deps.getToken()).toBeNull();
    expect(api.registerDevice).not.toHaveBeenCalled();
  });

  it('still degrades to unavailable (not a crash) for any other native-module load failure', async () => {
    // Outside Expo Go (e.g. a real device build without FCM configured), expo-notifications
    // loads fine but some other native call can still fail; that must not crash the app either.
    const adapter = loadPushAdapter({ os: 'android', isExpoGo: false, crashNotificationsOnAndroid: true });
    const api = { registerDevice: vi.fn(), removeDevice: vi.fn() };
    const deps = await adapter.exports.nativeDeps(api);
    expect(await deps.getToken()).toBeNull();
    expect(api.registerDevice).not.toHaveBeenCalled();
  });
});
