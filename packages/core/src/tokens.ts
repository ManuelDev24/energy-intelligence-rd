// Design tokens de Energy RD. Fuente única para el preset de Tailwind (web) y el theme del móvil.
// Interfaz: paleta del plan maestro (verde #197A52, azul #2563EB, fondo #F5F7F6, texto #1F2937).
// Marca: 900 (#0B2B1F) y accent (#C6F432) siguen derivados del logo oficial (assets/brand/energy-rd-logo.png),
// que no se recolorea (docs/BRAND_ASSETS.md). Contrastes medidos (WCAG): ver docs/architecture/COLOR_CONTRAST.md.

export const tokens = {
  color: {
    brand: {
      900: '#0B2B1F', // fondo del logo: splash, ícono, cabecera de marca
      700: '#005636',
      600: '#197A52', // primario (verde energético): botones, tab activo, enlaces
      500: '#2C875F',
      400: '#22C55E', // gráficos, positivo
      100: '#DCFCE7',
      50: '#F0FDF4',
    },
    accent: '#C6F432', // lima del logo: uso muy puntual
    info: '#2563EB', // azul técnico: información y gráficos (no texto sobre fondos tintados)
    bg: '#F5F7F6',
    card: '#FFFFFF',
    text: '#1F2937',
    muted: '#566577', // #64748B daba 4.42:1 sobre el fondo nuevo; este da 5.54:1
    border: '#E2E8F0',
    danger: '#B91C1C',
    dangerBg: '#FEE2E2',
    dangerBorder: '#FCA5A5',
    // Severidades del plan (🔴 crítica · 🟠 advertencia · 🟡 información · 🟢 ahorro).
    // Matices separados ≥ 15° para que no se confundan; el icono también comunica la severidad.
    warning: '#C2410C', // naranja: 4.52:1 sobre warningBg
    warningBg: '#FFEDD5',
    warningBorder: '#FDBA74',
    notice: '#A16207', // amarillo "información": 4.58:1 sobre noticeBg
    noticeBg: '#FEF9C3',
    noticeBorder: '#FDE047',
    success: '#197A52', // verde "ahorro": 4.84:1 sobre successBg
    successBg: '#DCFCE7',
    successBorder: '#86EFAC',
    // Series de gráficos: real (verde), comparación/info (azul), proyectado (morado), estimado (azul oscuro).
    chart: {
      real: '#197A52',
      info: '#2563EB',
      projected: '#6D28D9',
      estimated: '#1D4ED8',
      grid: '#E2E8F0',
      axis: '#566577',
    },
    quality: {
      real: '#197A52',
      realBg: '#DCFCE7',
      estimated: '#1D4ED8',
      estimatedBg: '#DBEAFE',
      projected: '#6D28D9',
      projectedBg: '#EDE9FE',
      inferred: '#475569', // 6.92:1 sobre inferredBg; borde punteado en la UI
      inferredBg: '#F1F5F9',
    },
  },
  radius: { sm: 8, md: 12, lg: 16, full: 999 },
  space: { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 },
  font: { xs: 12, sm: 14, md: 16, lg: 20, xl: 28, hero: 36 },
  touchTarget: 44,
} as const;

export type Tokens = typeof tokens;
