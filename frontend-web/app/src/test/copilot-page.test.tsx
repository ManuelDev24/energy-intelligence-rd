// ERD-AI-CHAT (web): Copilot — streaming, cancelación, reintento, límites, sin conexión, Markdown seguro, fuentes y valoraciones.
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CopilotPage from "@/app/(app)/copilot/page";
import { getApi } from "@/lib/api";
import { HOME_A } from "./mock-api";
import { renderWithApp } from "./render";

vi.mock("@/lib/api", async () => {
  const { createMockApi } = await import("./mock-api");
  const api = createMockApi();
  return { getApi: () => api };
});

const CONV = "cccccccc-0000-4000-8000-000000000999";
const MSG = "dddddddd-0000-4000-8000-000000000001";
const answer = (over: Record<string, unknown> = {}) => ({
  id: MSG, conversation_id: CONV, role: "assistant", status: "complete", tools: ["list_bills"], feedback: null, created_at: "2026-10-14T10:00:01Z",
  content: "Tu última factura fue de **320 kWh**. Revisa [tus facturas](/bills) o [este sitio](https://evil.example) <script>alert(1)</script>",
  sources: [{ kind: "bill", label: "Factura 01/08/2026–31/08/2026", quality: "REAL", href: "/bills/11111111-1111-4111-8111-111111111111" },
    { kind: "cost", label: "Costo estimado", quality: "ESTIMATED", href: null }], ...over,
});
const encoder = new TextEncoder();
function sseResponse(events: Array<[string, unknown]>, { hold = false } = {}) {
  let controller!: ReadableStreamDefaultController<Uint8Array>;
  const body = new ReadableStream<Uint8Array>({ start(c) {
    controller = c;
    for (const [event, data] of events) c.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
    if (!hold) c.close();
  } });
  return { response: new Response(body, { status: 200, headers: { "content-type": "text/event-stream" } }), controller };
}
const conversation = { id: CONV, home_id: HOME_A, title: "¿Cuánto gasté?", created_at: "2026-10-14T10:00:00Z", updated_at: "2026-10-14T10:00:00Z" };

describe("CopilotPage", () => {
  beforeEach(() => {
    window.localStorage.clear();
    vi.spyOn(getApi(), "createCopilotConversation").mockResolvedValue(conversation as never);
    vi.spyOn(getApi(), "listCopilotConversations").mockResolvedValue([] as never);
    vi.spyOn(getApi(), "listCopilotMessages").mockResolvedValue([] as never);
  });
  afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

  it("muestra las seis preguntas rápidas con el período y el uso del día", async () => {
    renderWithApp(<CopilotPage />, HOME_A);
    const group = await screen.findByRole("group", { name: "Preguntas rápidas" });
    expect(within(group).getAllByRole("button").map(b => b.textContent)).toEqual(["¿Por qué gasté más?", "¿Cómo puedo ahorrar?", "¿Qué equipo consume más?",
      "¿Cuánto pagaré?", "¿Me conviene instalar paneles solares?", "Analiza mi factura"]);
    expect(await screen.findByTestId("copilot-usage")).toHaveTextContent("Hoy: 0 de 40 preguntas.");
    expect(screen.getByText("¿En qué te ayudo?")).toBeInTheDocument();
  });

  it("transmite la respuesta, muestra la herramienta y guarda el turno con fuentes y Markdown seguro", async () => {
    const { response } = sseResponse([["start", {}], ["tool", { name: "list_bills", label: "Consultando facturas" }], ["delta", { text: "Tu última factura " }],
      ["delta", { text: "fue de **320 kWh**." }], ["done", { message: answer(), warnings: [] }]]);
    const fetchMock = vi.fn().mockResolvedValue(response);
    vi.stubGlobal("fetch", fetchMock);
    const messages = vi.spyOn(getApi(), "listCopilotMessages");
    renderWithApp(<CopilotPage />, HOME_A);
    fireEvent.change(await screen.findByLabelText("Tu pregunta"), { target: { value: "¿Cuánto gasté?" } });
    vi.spyOn(getApi(), "listCopilotConversations").mockResolvedValue([conversation] as never);
    messages.mockResolvedValue([{ id: "e0000000-0000-4000-8000-000000000001", conversation_id: CONV, role: "user", content: "¿Cuánto gasté?", status: "complete",
      sources: [], tools: [], feedback: null, created_at: "2026-10-14T10:00:00Z" }, answer()] as never);
    fireEvent.click(screen.getByRole("button", { name: "Enviar" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toMatch(new RegExp(`/homes/${HOME_A}/copilot/conversations/${CONV}/messages$`));
    expect(JSON.parse(init.body)).toMatchObject({ content: "¿Cuánto gasté?", period_from: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/), period_to: expect.any(String) });
    const list = await screen.findByRole("list", { name: "Mensajes" }, { timeout: 3000 });
    const item = (await within(list).findByText(/Tu última factura fue de/)).closest("li")!;
    expect(within(item).getByText("320 kWh").closest("strong")).not.toBeNull();
    expect(within(item).getByRole("link", { name: "tus facturas" })).toHaveAttribute("href", "/bills");
    expect(within(item).queryByRole("link", { name: "este sitio" })).toBeNull();
    expect(item.querySelector("script")).toBeNull();
    expect(item).toHaveTextContent("<script>alert(1)</script>");
    fireEvent.click(within(item).getByText("Fuentes consultadas (2)"));
    expect(within(item).getByRole("link", { name: "Factura 01/08/2026–31/08/2026" })).toHaveAttribute("href", "/bills/11111111-1111-4111-8111-111111111111");
    expect(within(item).getByText("ESTIMADO")).toBeInTheDocument();
    expect(within(item).getByText("REAL")).toBeInTheDocument();
  });

  it("detiene la respuesta, conserva lo recibido y permite reintentar", async () => {
    const fetchMock = vi.fn().mockImplementation(async (_url: string, init: RequestInit) => {
      const { response, controller } = sseResponse([["start", {}], ["delta", { text: "Respuesta parcial" }]], { hold: true });
      // Como el fetch real: abortar hace fallar la lectura del cuerpo.
      init.signal?.addEventListener("abort", () => controller.error(new DOMException("aborted", "AbortError")));
      return response;
    });
    vi.stubGlobal("fetch", fetchMock);
    renderWithApp(<CopilotPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "¿Cuánto pagaré?" }));
    expect(await screen.findByText("Respuesta parcial")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Detener respuesta" }));
    expect(await screen.findByText("Respuesta cancelada.")).toBeInTheDocument();
    expect(screen.getByText("Respuesta parcial")).toBeInTheDocument();
    const retry = screen.getByRole("button", { name: "Reintentar" });
    fetchMock.mockResolvedValueOnce(sseResponse([["start", {}], ["done", { message: answer({ content: "Listo" }), warnings: [] }]]).response);
    fireEvent.click(retry);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).content).toMatch(/^¿Cuánto pagaré aproximadamente/);
  });

  it("explica el límite diario sin mostrar texto de la API", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ detail: "detalle interno", code: "copilot_limit" }), { status: 429, headers: { "Retry-After": "3600" } })));
    renderWithApp(<CopilotPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "¿Cómo puedo ahorrar?" }));
    expect(await screen.findByText("Alcanzaste el límite diario del Copilot. Vuelve a intentarlo mañana.")).toBeInTheDocument();
    expect(screen.queryByText(/detalle interno/)).toBeNull();
  });

  it("muestra el rechazo y el fallo del proveedor con mensajes propios", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(sseResponse([["start", {}], ["error", { code: "provider_error", message: "El Copilot no pudo responder ahora. Intenta de nuevo en unos minutos.", message_id: MSG }]]).response));
    renderWithApp(<CopilotPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "Analiza mi factura" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("El Copilot no pudo responder ahora.");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeEnabled();
  });

  it("sin conexión desactiva el envío y lo explica", async () => {
    vi.spyOn(navigator, "onLine", "get").mockReturnValue(false);
    renderWithApp(<CopilotPage />, HOME_A);
    expect(await screen.findByText("Sin conexión: podrás preguntar cuando vuelva internet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "¿Cuánto pagaré?" })).toBeDisabled();
    expect(screen.getByLabelText("Tu pregunta")).toBeDisabled();
  });

  it("si el Copilot está apagado no muestra el compositor", async () => {
    vi.spyOn(getApi(), "getCopilotUsage").mockResolvedValue({ day: "2026-10-14", enabled: false, limited: false, messages_used: 0, messages_limit: 40, tokens_used: 0, tokens_limit: 1 } as never);
    renderWithApp(<CopilotPage />, HOME_A);
    expect(await screen.findByText("El Copilot no está disponible en este entorno por ahora.")).toBeInTheDocument();
    expect(screen.queryByLabelText("Tu pregunta")).toBeNull();
  });

  it("renombra y borra conversaciones (con confirmación) y valora respuestas", async () => {
    vi.spyOn(getApi(), "listCopilotConversations").mockResolvedValue([conversation] as never);
    vi.spyOn(getApi(), "listCopilotMessages").mockResolvedValue([answer()] as never);
    const rename = vi.spyOn(getApi(), "renameCopilotConversation").mockResolvedValue({ ...conversation, title: "Septiembre" } as never);
    const remove = vi.spyOn(getApi(), "deleteCopilotConversation").mockResolvedValue(undefined as never);
    const feedback = vi.spyOn(getApi(), "setCopilotFeedback").mockResolvedValue(answer({ feedback: 1 }) as never);
    renderWithApp(<CopilotPage />, HOME_A);
    fireEvent.click(await screen.findByRole("button", { name: "¿Cuánto gasté?" }));
    fireEvent.click(await screen.findByRole("button", { name: "Útil" }));
    await waitFor(() => expect(feedback).toHaveBeenCalledWith(HOME_A, CONV, MSG, 1));
    fireEvent.click(screen.getByRole("button", { name: "Renombrar «¿Cuánto gasté?»" }));
    fireEvent.change(screen.getByLabelText("Nuevo título"), { target: { value: "Septiembre" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    await waitFor(() => expect(rename).toHaveBeenCalledWith(HOME_A, CONV, "Septiembre"));
    fireEvent.click(screen.getByRole("button", { name: "Borrar «¿Cuánto gasté?»" }));
    const dialog = await screen.findByRole("dialog", { name: "Borrar conversación" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Borrar" }));
    await waitFor(() => expect(remove).toHaveBeenCalledWith(HOME_A, CONV));
  });
});
