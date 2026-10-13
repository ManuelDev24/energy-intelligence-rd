import type { Metadata } from "next";
import type { ReactNode } from "react";
import { TelemetryInit } from "@/components/telemetry-init";
import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

// Auditoría C-06: la CSP lleva un nonce distinto por petición (src/middleware.ts); Next solo puede aplicarlo a sus scripts en línea si la
// página se renderiza por petición, no en la compilación. Las pantallas ya cargan sus datos en el cliente, así que el costo es mínimo.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  // ERD-WEB-QUALITY H3 (WCAG 2.4.2): cada pantalla declara su título; la raíz añade la marca.
  title: { default: "Energy RD", template: "%s · Energy RD" },
  description: "Plataforma de inteligencia y gestión energética para República Dominicana",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <TelemetryInit />
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
