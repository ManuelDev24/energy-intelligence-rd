"use client";
import { AccountForm } from "@/components/account-form";
import { PilotLogin } from "@/components/pilot-login";
import { authEnabled } from "@/lib/auth/client";
export default function LoginPage() { return authEnabled ? <AccountForm mode="login" /> : <PilotLogin />; }
