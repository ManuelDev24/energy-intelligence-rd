"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/lib/session";
import { Loading } from "@/components/StateViews";

export default function Home() {
  const { access, loading } = useSession();
  const router = useRouter();
  useEffect(() => {
    if (loading) return;
    router.replace(access ? "/mi-acceso" : "/login");
  }, [access, loading, router]);
  return <Loading />;
}
