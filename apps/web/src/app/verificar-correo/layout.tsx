import type { Metadata } from "next";
import type { ReactNode } from "react";

// Auditoría C-10: el enlace de verificación llega con el token en el fragmento. Además del encabezado Referrer-Policy del middleware,
// la página declara no-referrer y no se indexa.
export const metadata: Metadata = {
  title: "Confirmar correo",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function VerifyEmailLayout({ children }: { children: ReactNode }) {
  return children;
}
