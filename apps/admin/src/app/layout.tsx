import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";

export const metadata: Metadata = { title: "Energy RD · Admin" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="es">
      <body>
        <SessionProvider>{children}</SessionProvider>
      </body>
    </html>
  );
}
