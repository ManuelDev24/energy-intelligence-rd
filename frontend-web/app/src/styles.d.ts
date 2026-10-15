declare module "*.css";

// Auditoría C-06: next.config.mjs se importa en una prueba para comprobar que sus cabeceras coinciden con src/lib/security-headers.ts.
declare module "*/next.config.mjs" {
  const config: { poweredByHeader?: boolean; headers?: () => Promise<{ source: string; headers: { key: string; value: string }[] }[]> };
  export default config;
}
