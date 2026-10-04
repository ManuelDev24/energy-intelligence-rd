"use client";

import { EnergyDashboard } from "@/features/energy/EnergyDashboard";
import { useSession } from "@/lib/session";

export default function DashboardPage() {
  const { homeId, signIn } = useSession();
  // La web siempre usa la API real (ERD-WEB-REAL-API): sin selector de modo demo.
  return <EnergyDashboard initialHomeId={homeId ?? undefined} initialMode="api"
    onHomeChange={signIn} allowModeSwitch={false} />;
}
