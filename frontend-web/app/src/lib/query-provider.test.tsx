import { onlineManager, useMutation, useQuery } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { QueryProvider } from "./query-provider";

afterEach(() => { act(() => onlineManager.setOnline(true)); });

function ReadProbe({ read }: { read: () => Promise<number> }) {
  const query = useQuery({ queryKey: ["reconnect-test"], queryFn: read });
  return <output>{query.data ?? "Cargando"}</output>;
}

function WriteProbe({ write }: { write: () => Promise<void> }) {
  const mutation = useMutation({ mutationFn: write });
  return <button onClick={() => mutation.mutate()}>Guardar prueba</button>;
}

describe("política de conectividad de React Query", () => {
  it("refresca lecturas al volver la conexión aunque sigan frescas", async () => {
    const read = vi.fn(async () => read.mock.calls.length);
    render(<QueryProvider><ReadProbe read={read} /></QueryProvider>);
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    act(() => onlineManager.setOnline(false));
    act(() => onlineManager.setOnline(true));
    await waitFor(() => expect(read).toHaveBeenCalledTimes(2));
  });

  it("no pausa ni reenvía una escritura que falla sin conexión", async () => {
    const write = vi.fn(async () => { throw new Error("offline"); });
    act(() => onlineManager.setOnline(false));
    render(<QueryProvider><WriteProbe write={write} /></QueryProvider>);
    fireEvent.click(screen.getByRole("button", { name: "Guardar prueba" }));
    await waitFor(() => expect(write).toHaveBeenCalledTimes(1));
    act(() => onlineManager.setOnline(true));
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(write).toHaveBeenCalledTimes(1);
  });
});
