import type { Config } from "tailwindcss";
import { tokens } from "../../packages/core/src/tokens";

const c = tokens.color;

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: "hsl(var(--muted))",
        "muted-foreground": "hsl(var(--muted-foreground))",
        border: "hsl(var(--border))",
        primary: "hsl(var(--primary))",
        "primary-foreground": "hsl(var(--primary-foreground))",
        brand: c.brand,
        accent: c.accent,
        canvas: c.bg,
        danger: { DEFAULT: c.danger, bg: c.dangerBg, border: c.dangerBorder },
        warning: { DEFAULT: c.warning, bg: c.warningBg, border: c.warningBorder },
        // Severidades del plan: 🟡 información (notice) y 🟢 ahorro (success).
        notice: { DEFAULT: c.notice, bg: c.noticeBg, border: c.noticeBorder },
        success: { DEFAULT: c.success, bg: c.successBg, border: c.successBorder },
        // Azul técnico: gráficos e información, nunca texto sobre fondos tintados.
        info: c.info,
        chart: c.chart,
        quality: c.quality,
      },
      borderRadius: {
        lg: `${tokens.radius.sm}px`,
        xl: `${tokens.radius.md}px`,
        "2xl": `${tokens.radius.lg}px`,
      },
    },
  },
  plugins: [],
};

export default config;
