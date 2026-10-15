"use client";
import { useSession } from "@/lib/session";

export default function MiAccesoPage() {
  const { access } = useSession();
  if (!access) return null;
  return (
    <section>
      <h1>Mi acceso</h1>
      <p>Correo: {access.email}</p>
      <h2>Roles</h2>
      {access.roles.length === 0 ? (
        <p role="status">No tienes ningún rol administrativo asignado.</p>
      ) : (
        <ul>{access.roles.map((r) => <li key={r}>{r}</li>)}</ul>
      )}
      <h2>Scopes</h2>
      {access.scopes.length === 0 ? (
        <p role="status">No tienes scopes administrativos.</p>
      ) : (
        <ul>{access.scopes.map((s) => <li key={s}><code>{s}</code></li>)}</ul>
      )}
    </section>
  );
}
