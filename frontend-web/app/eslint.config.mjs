import coreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// Next.js 16 / ESLint 10 (flat config). `eslint-config-next@16.4.0` ya exporta arrays flat nativos
// bajo "./core-web-vitals" y "./typescript" — NO usar FlatCompat.extends("next/core-web-vitals", ...):
// esa ruta intenta resolver los presets con el validador clásico de @eslint/eslintrc y revienta con
// "TypeError: Converting circular structure to JSON" (los plugins flat tienen refs circulares que el
// formateador de errores del validador clásico no soporta).
const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  { ignores: [".next/**", "node_modules/**"] },
];

export default eslintConfig;
