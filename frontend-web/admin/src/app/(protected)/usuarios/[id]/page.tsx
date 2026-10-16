"use client";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { ErrorView, Forbidden, Loading } from "@/components/StateViews";
import { formatDate } from "@/lib/ocr";
import { useSession } from "@/lib/session";
import UserWriteActions from "@/components/UserWriteActions";
import { roleLabel, type AdminUserDetail } from "@/lib/users";

type State = { status: "loading" } | { status: "ok"; user: AdminUserDetail } | { status: "forbidden" } | { status: "missing" } | { status: "error"; message: string };
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function UsuarioPage() {
  const params = useParams<{ id: string }>();
  const { access } = useSession();
  const id = UUID.test(params.id ?? "") ? params.id : null;
  const [state, setState] = useState<State>({ status: "loading" });
  const load = useCallback(async () => {
    if (!id) { setState({ status: "missing" }); return; }
    setState({ status: "loading" });
    try { setState({ status: "ok", user: await apiFetch<AdminUserDetail>(`/api/v1/admin/users/${id}`) }); }
    catch (err) {
      if (err instanceof ApiError && err.status === 403) setState({ status: "forbidden" });
      else if (err instanceof ApiError && err.status === 404) setState({ status: "missing" });
      else setState({ status: "error", message: err instanceof Error ? err.message : "Error desconocido" });
    }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  if (state.status === "forbidden") return <Forbidden heading="Persona" onRetry={load} />;
  if (state.status === "loading") return <Loading />;
  if (state.status === "error") return <ErrorView message={state.message} onRetry={load} />;
  if (state.status === "missing") {
    return <section><h1>Persona</h1><p role="alert">Esta persona no existe.</p><Link href="/usuarios">Volver a usuarios</Link></section>;
  }
  const u = state.user;
  const rows: Array<[string, string]> = [
    ["Correo", u.email], ["Correo verificado", u.email_verified ? "Sí" : "No"], ["Cuenta", u.active ? "Activa" : "Desactivada"],
    ["Alta", formatDate(u.created_at)], ["Viviendas", String(u.homes)], ["Sesiones activas", String(u.active_sessions)],
    ["Roles administrativos", u.admin_roles.length ? u.admin_roles.map(roleLabel).join(", ") : "Ninguno"],
    ["Términos aceptados", u.terms_version ? `Versión ${u.terms_version} el ${formatDate(u.terms_accepted_at)}` : "Anterior al consentimiento registrado"],
  ];
  return (
    <section>
      <p><Link href="/usuarios">← Usuarios</Link></p>
      <h1>Persona</h1>
      <p style={{ color: "#555", maxWidth: "70ch" }}>
        Esta ficha muestra datos de cuenta de solo lectura. Los datos de viviendas, facturas y documentos no se muestran aquí.
        Acciones administrativas aparecen solo con su scope, motivo obligatorio y registro de auditoría.
      </p>
      <dl style={{ display: "grid", gridTemplateColumns: "minmax(0, max-content) minmax(0, 1fr)", gap: "6px 16px" }}>
        {rows.map(([term, value]) => (
          <div key={term} style={{ display: "contents" }}>
            <dt style={{ fontWeight: 600 }}>{term}</dt><dd style={{ margin: 0, overflowWrap: "anywhere" }}>{value}</dd>
          </div>
        ))}
      </dl>
      <UserWriteActions user={u} access={access} onRefresh={load} />
    </section>
  );
}
