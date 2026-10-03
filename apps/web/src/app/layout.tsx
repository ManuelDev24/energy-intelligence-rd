import type { Metadata } from "next";
import type { ReactNode } from "react";
import { QueryProvider } from "@/lib/query-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Energy RD",
  description: "Plataforma de inteligencia y gestión energética para República Dominicana",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
