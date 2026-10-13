import { defineConfig } from 'vitest/config';

// Pruebas de lógica pura (sin dependencias de React Native): formularios, formato y resolución de URL.
// react-native/expo-constants se simulan: su código fuente usa sintaxis Flow que Vite/Rollup
// no parsean sin Babel; en producción corren vía Metro, que sí la soporta.
export default defineConfig({
  resolve: {
    alias: {
      'react-native': new URL('./src/test/mocks/react-native.ts', import.meta.url).pathname,
      'expo-constants': new URL('./src/test/mocks/expo-constants.ts', import.meta.url).pathname,
      'expo-secure-store': new URL('./src/test/mocks/expo-secure-store.ts', import.meta.url).pathname,
    },
  },
  test: {
    environment: 'node',
    globals: true,
    include: ['src/**/*.test.ts'],
  },
});
