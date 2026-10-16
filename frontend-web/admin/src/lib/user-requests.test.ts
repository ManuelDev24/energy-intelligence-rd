import { describe, expect, it } from "vitest";
import { allowedNextStatuses, requestKindLabel, requestStatusLabel } from "./user-requests";

describe("solicitudes administrativas de datos", () => {
  it("presenta estados y tipos con etiquetas en español", () => {
    expect(requestKindLabel("export")).toBe("Exportación");
    expect(requestKindLabel("deletion")).toBe("Borrado");
    expect(requestStatusLabel("pending")).toBe("Pendiente");
    expect(requestStatusLabel("in_progress")).toBe("En revisión");
    expect(requestStatusLabel("completed")).toBe("Atendida");
    expect(requestStatusLabel("rejected")).toBe("Rechazada");
  });

  it("solo ofrece transiciones válidas y ninguna vuelve atrás desde un estado final", () => {
    expect(allowedNextStatuses("pending")).toEqual(["in_progress", "rejected"]);
    expect(allowedNextStatuses("in_progress")).toEqual(["completed", "rejected"]);
    expect(allowedNextStatuses("completed")).toEqual([]);
    expect(allowedNextStatuses("rejected")).toEqual([]);
  });
});
