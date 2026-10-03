"use client";

import { useRouter } from "next/navigation";
import { BillForm } from "@/components/bill-form";
import { useCreateBill } from "@/lib/api/hooks";
import { useSession } from "@/lib/session";

export default function NewBillPage() {
  const router = useRouter();
  const { homeId } = useSession();
  const create = useCreateBill(homeId ?? "");

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-bold">Registrar factura</h1>
      <BillForm
        submitLabel="Guardar factura"
        pending={create.isPending}
        serverError={create.error?.message}
        onSubmit={(value) => create.mutate(value, { onSuccess: () => router.push("/bills") })}
        onCancel={() => router.push("/bills")}
      />
    </div>
  );
}
