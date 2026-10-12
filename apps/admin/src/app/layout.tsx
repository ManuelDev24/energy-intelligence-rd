import type { Metadata } from "next";
import type { ReactNode } from "react";
import { SessionProvider } from "@/lib/session";

// La CSP lleva un nonce distinto por petición (src/middleware.ts): la página no puede generarse de forma estática.
export const dynamic = "force-dynamic";

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
