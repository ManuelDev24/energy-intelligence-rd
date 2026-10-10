import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-provider";
import { SessionProvider } from "@/lib/session";
import "./globals.css";

export const metadata: Metadata = {
  // ERD-WEB-QUALITY H3 (WCAG 2.4.2): cada pantalla declara su título; la raíz añade la marca.
  title: { default: "Energy RD", template: "%s · Energy RD" },
  description: "Plataforma de inteligencia y gestión energética para República Dominicana",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>
          <SessionProvider>{children}</SessionProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
