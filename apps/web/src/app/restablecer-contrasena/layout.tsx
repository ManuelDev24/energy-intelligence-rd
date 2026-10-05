import type { Metadata } from "next";
import type { ReactNode } from "react";

// ERD-AUTH-05: el enlace de recuperación llega con el token en el fragmento. Además del encabezado
// Referrer-Policy del middleware, la página declara no-referrer y no se indexa.
export const metadata: Metadata = {
  title: "Restablecer contraseña · Energy RD",
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function ResetPasswordLayout({ children }: { children: ReactNode }) {
  return children;
}
