// Claves de React Query del detalle de factura (ERD-BILL-02). Puro: recibe el alcance de la cuenta
// (`['account', epoch]` o `['pilot']`), así el `queryClient.clear()` del cierre de sesión y el cambio
// de época eliminan el detalle y la revisión de la cuenta anterior.
export function billDetailKeys(scope: readonly unknown[]) {
  return {
    items: (homeId: string, billId: string) => [...scope, 'bill-items', homeId, billId] as const,
    assessment: (homeId: string, billId: string) => [...scope, 'bill-assessment', homeId, billId] as const,
  };
}
export type BillDetailKeys = ReturnType<typeof billDetailKeys>;

/** Reemplazar los ítems cambia el detalle y la revisión de esa factura; la factura en sí no cambia. */
export const billItemsSavedInvalidations = (k: BillDetailKeys, homeId: string, billId: string): (readonly unknown[])[] =>
  [k.items(homeId, billId), k.assessment(homeId, billId)];
