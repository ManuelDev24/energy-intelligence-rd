import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { describe, expect, it, vi } from 'vitest';

const require = createRequire(import.meta.url);
const babel = require('@babel/core');

// Exercise the real Metro namespace loader, not Vite's safe ESM namespace.
// React Native exposes deprecated modules through getters; importAll enumerates them.
function loadPushAdapter() {
  const deprecatedGetter = vi.fn(() => { throw new Error('native PushNotificationIOS is absent'); });
  const rn = { Platform: { OS: 'ios' } };
  Object.defineProperty(rn, 'PushNotificationIOS', { enumerable: true, get: deprecatedGetter });
  const modules: Record<string, unknown> = {
    'react-native': rn,
    'expo-notifications': {
      getPermissionsAsync: async () => ({ status: 'undetermined' }),
      requestPermissionsAsync: async () => ({ status: 'denied' }),
      getExpoPushTokenAsync: vi.fn(),
    },
    'expo-constants': { __esModule: true, default: { expoConfig: { extra: {} } } },
  };
  const ids = { 'react-native': 1, 'expo-notifications': 2, 'expo-constants': 3 };
  const context = vm.createContext({ __DEV__: false, __METRO_GLOBAL_PREFIX__: '', console });
  vm.runInContext('globalThis.global = globalThis;', context);
  vm.runInContext(readFileSync(require.resolve('metro-runtime/src/polyfills/require.js'), 'utf8'), context);
  const loader = context as unknown as {
    __d: (factory: (...args: unknown[]) => void, id: number, dependencies: number[]) => void;
    __r: { importAll: (id: number) => unknown };
    [key: string]: unknown;
  };
  for (const [name, id] of Object.entries(ids)) {
    loader.__d((...args) => { (args[4] as { exports: unknown }).exports = modules[name]; }, id, []);
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
});
