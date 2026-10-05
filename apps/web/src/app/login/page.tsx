"use client";
import { useState } from "react";
import { AccountForm } from "@/components/account-form";
import { PilotLogin } from "@/components/pilot-login";
import { authEnabled } from "@/lib/auth/client";
export default function LoginPage() {
  // Read once on mount: avoids a Suspense boundary for useSearchParams while still showing the
  // post-deletion confirmation coming from the account page's redirect.
  const [deleted] = useState(() => typeof window !== "undefined" && new URLSearchParams(window.location.search).get("deleted") === "1");
  if (!authEnabled) return <PilotLogin />;
  return (
    <>
      {deleted ? (
        <p role="status" className="mx-auto mt-6 max-w-md text-center text-sm text-emerald-700">
          Tu cuenta se eliminó correctamente.
        </p>
      ) : null}
      <AccountForm mode="login" />
    </>
  );
}
