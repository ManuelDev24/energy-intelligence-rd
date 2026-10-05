"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
export default function AccountPage() {
  const { user, error, signOut } = useSession();
  const [pending, setPending] = useState(false);
  const router = useRouter();
  async function logout() { setPending(true); await signOut(); router.replace("/login"); setPending(false); }
  return <Card><h1 className="text-2xl font-bold">Mi cuenta</h1><p className="my-4 break-words">{user?.email}</p><p className="mb-4 text-sm text-muted-foreground">La sesión vence sin renovación automática. Inicia sesión de nuevo cuando se solicite. La recuperación de contraseña no está disponible.</p>{error ? <p role="alert">{error}</p> : null}<Button onClick={() => void logout()} disabled={pending}>{pending ? "Cerrando…" : "Cerrar sesión"}</Button></Card>;
}
