"""ERD-AI-CHAT: proveedores del Copilot detrás de una interfaz mínima (un turno del modelo, en streaming).

- `AnthropicProvider`: Claude API con el SDK oficial. Modelo `COPILOT_MODEL` (por defecto `claude-opus-5-5`), pensamiento adaptativo,
  esfuerzo configurable y `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`): si un clasificador de seguridad rechaza la
  petición, la API la reintenta en el modelo recomendado dentro de la misma llamada. La clave sale de ANTHROPIC_API_KEY (entorno).
- `FakeProvider`: determinista y sin red, SOLO desarrollo/E2E (la configuración lo prohíbe fuera de development). Llama a una
  herramienta según palabras clave y después resume lo que devolvió; con marcadores de prueba simula lentitud, rechazo o fallo.

Ninguno devuelve texto de error del proveedor hacia la persona: el motor traduce todo a mensajes propios."""
from __future__ import annotations

import json
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Iterator, Protocol

from app.config import settings

FALLBACK_BETA = "server-side-fallback-2026-07-01"


class ProviderError(Exception):
    """Fallo del proveedor (red, 5xx, límite, credenciales). El texto nunca llega a la persona."""


@dataclass
class TextDelta:
    text: str


@dataclass
class TurnResult:
    content: list[dict[str, Any]]  # bloques tal como hay que reenviarlos en el siguiente turno de herramientas
    stop_reason: str | None
    model: str
    input_tokens: int = 0
    output_tokens: int = 0
    tool_uses: list[dict[str, Any]] = field(default_factory=list)  # [{id, name, input}]


class Provider(Protocol):
    def stream_turn(self, *, system: str, messages: list[dict], tools: list[dict]) -> Iterator[TextDelta | TurnResult]: ...


def echo_content(blocks: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Bloques para reenviar al continuar el turno. Tras un respaldo a mitad de salida se omiten los bloques de pensamiento y de uso de
    herramientas anteriores al último bloque `fallback` (regla de la API); el resto se reenvía sin cambios."""
    last = max((i for i, b in enumerate(blocks) if b.get("type") == "fallback"), default=-1)
    skip = {"thinking", "redacted_thinking", "tool_use"}
    return [b for i, b in enumerate(blocks) if not (i < last and b.get("type") in skip)]


class AnthropicProvider:
    def __init__(self, client=None):
        if client is None:
            import anthropic
            client = anthropic.Anthropic(api_key=settings.ANTHROPIC_API_KEY, max_retries=2, timeout=120.0)
        self.client = client

    def stream_turn(self, *, system, messages, tools):
        import anthropic
        try:
            with self.client.beta.messages.stream(
                model=settings.COPILOT_MODEL,
                max_tokens=settings.COPILOT_MAX_OUTPUT_TOKENS,
                system=[{"type": "text", "text": system, "cache_control": {"type": "ephemeral"}}],
                messages=messages,
                tools=tools,
                thinking={"type": "adaptive"},
                output_config={"effort": settings.COPILOT_EFFORT},
                betas=[FALLBACK_BETA],
                fallbacks="default",
            ) as stream:
                for event in stream:
                    if event.type == "content_block_delta" and event.delta.type == "text_delta":
                        yield TextDelta(event.delta.text)
                final = stream.get_final_message()
        except ValueError as exc:  # JSON de entrada de herramienta imposible de interpretar (streaming ansioso)
            raise ProviderError("invalid tool input stream") from exc
        except anthropic.APIError as exc:
            raise ProviderError(exc.__class__.__name__) from exc
        content = [block.model_dump(mode="json", exclude_none=True) for block in final.content]
        tool_uses = [{"id": b.id, "name": b.name, "input": b.input} for b in final.content if b.type == "tool_use"]
        usage = final.usage
        yield TurnResult(content=content, stop_reason=final.stop_reason, model=final.model,
                         input_tokens=(usage.input_tokens or 0) + (getattr(usage, "cache_read_input_tokens", 0) or 0)
                         + (getattr(usage, "cache_creation_input_tokens", 0) or 0),
                         output_tokens=usage.output_tokens or 0, tool_uses=tool_uses)


_KEYWORDS = (("factura", "list_bills"), ("pagar", "get_home_overview"), ("pagaré", "get_home_overview"),
             ("ahorr", "list_recommendations"), ("equipo", "get_equipment_estimate"), ("score", "get_energy_score"),
             ("apag", "get_outage_summary"), ("meta", "get_goal_progress"))


class FakeProvider:
    """Proveedor de pruebas. Marcadores en el mensaje: `[lento]` (pausas entre fragmentos), `[rechazo]` (stop_reason refusal),
    `[falla]` (ProviderError), `[enlace]` (incluye un enlace externo y uno interno para probar el saneado)."""
    model = "fake-copilot"

    def stream_turn(self, *, system, messages, tools):
        last = messages[-1]
        question = _last_user_text(messages)
        if "[falla]" in question:
            raise ProviderError("fake failure")
        if "[rechazo]" in question:
            yield TurnResult(content=[], stop_reason="refusal", model=self.model, input_tokens=10)
            return
        tool_results = [b for b in last["content"] if isinstance(b, dict) and b.get("type") == "tool_result"] \
            if isinstance(last["content"], list) else []
        if not tool_results:
            name = next((tool for word, tool in _KEYWORDS if word in question.lower()), "get_home_overview")
            block = {"type": "tool_use", "id": f"toolu_{uuid.uuid4().hex[:12]}", "name": name, "input": {}}
            yield TurnResult(content=[block], stop_reason="tool_use", model=self.model, input_tokens=120, output_tokens=20,
                             tool_uses=[{"id": block["id"], "name": name, "input": {}}])
            return
        summary = _summarize(tool_results)
        text = f"Según tus datos registrados:\n\n{summary}\n\n**Calidad:** revisa las fuentes de esta respuesta."
        if "[enlace]" in question:
            text += "\n\nMás detalle en [tus facturas](/bills) o en [este sitio](https://example.com)."
        for chunk in _chunks(text):
            if "[lento]" in question:
                time.sleep(0.4)
            yield TextDelta(chunk)
        yield TurnResult(content=[{"type": "text", "text": text}], stop_reason="end_turn", model=self.model,
                         input_tokens=200, output_tokens=len(text) // 4)


def _last_user_text(messages: list[dict]) -> str:
    for message in reversed(messages):
        if message["role"] != "user":
            continue
        content = message["content"]
        if isinstance(content, str):
            return content
        texts = [b.get("text", "") for b in content if isinstance(b, dict) and b.get("type") == "text"]
        if texts:
            return texts[-1]
    return ""


def _summarize(tool_results: list[dict]) -> str:
    lines = []
    for result in tool_results:
        try:
            data = json.loads(result["content"]) if isinstance(result["content"], str) else {}
        except json.JSONDecodeError:
            data = {}
        if result.get("is_error"):
            lines.append("- No pude consultar ese dato.")
        elif "bills" in data:
            lines.append(f"- Tienes **{data['count']}** facturas registradas.")
        elif "recommendations" in data:
            lines.append(f"- Hay **{data['count']}** recomendaciones vigentes.")
        elif "items" in data and "equipment_count" in data:
            lines.append(f"- Tienes **{data['equipment_count']}** equipos declarados.")
        elif "latest_bill" in data:
            bill = data["latest_bill"]
            lines.append(f"- Tu última factura fue de **{bill['kwh']['value']} kWh** (RD$ {bill['amount_dop']['value']}).")
        else:
            lines.append("- No hay datos suficientes para responder con certeza.")
    return "\n".join(lines)


def _chunks(text: str, size: int = 24) -> Iterator[str]:
    for start in range(0, len(text), size):
        yield text[start:start + size]


def get_provider() -> Provider | None:
    if settings.COPILOT_PROVIDER == "anthropic":
        return AnthropicProvider()
    if settings.COPILOT_PROVIDER == "fake" and settings.ENVIRONMENT.lower() == "development":
        return FakeProvider()
    return None
