"use client";
import { AccountForm } from "@/components/account-form";
import { authEnabled } from "@/lib/auth/client";
import Link from "next/link";
export default function RegisterPage() { return authEnabled ? <AccountForm mode="register" /> : <main className="p-6"><h1>El piloto local no admite cuentas</h1><Link href="/login">Volver al piloto</Link></main>; }
