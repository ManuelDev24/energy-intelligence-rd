"use client";

import { EnergyDashboard } from "@/features/energy/EnergyDashboard";
import { env } from "@/lib/env";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const { homeId, signIn } = useSession();
  return <EnergyDashboard initialHomeId={homeId ?? undefined}
    initialMode={env.NEXT_PUBLIC_API_MODE === "live" ? "api" : "demo"}
    onHomeChange={signIn} allowModeSwitch={false} />;
}
