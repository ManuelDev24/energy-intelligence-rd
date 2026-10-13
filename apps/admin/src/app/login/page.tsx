"use client";
import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { controlStyle, fieldStyle } from "@/lib/controls";

export default function LoginPage() {
  const { login, loading } = useSession();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    try {
      await login(email, password);
      router.replace("/mi-acceso");
    } catch {
      setError("Credenciales inválidas o sin acceso administrativo.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main style={{ maxWidth: 360, margin: "80px auto" }}>
      <h1>Acceso administrativo</h1>
      <form onSubmit={onSubmit}>
        <label htmlFor="email">Correo</label>
        <input style={fieldStyle} id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        <label htmlFor="password">Contraseña</label>
        <input style={fieldStyle} id="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        <button style={controlStyle} type="submit" disabled={submitting || loading}>{submitting ? "Entrando…" : "Entrar"}</button>
      </form>
      {error ? <p role="alert" style={{ color: "#b00020" }}>{error}</p> : null}
    </main>
  );
}
