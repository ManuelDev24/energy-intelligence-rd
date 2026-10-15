"""ERD-AI-ADMIN-WEB: supervisión del Copilot. SOLO LECTURA y solo agregados.

`copilot_messages` está bajo RLS; la lectura pasa por `admin_copilot_stats` (SECURITY DEFINER, 0040), que no devuelve texto de conversaciones, títulos,
fuentes ni viviendas. Las personas salen como identificador (seudónimo). El costo se ESTIMA solo si hay precios configurados (nada inventado).
Qué NO hay: «conversaciones marcadas» (no existe ese concepto en el producto) ni lectura del contenido de una conversación (requeriría un flujo
de autorización y auditoría propio)."""
import json
from decimal import ROUND_HALF_UP, Decimal

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.config import settings
from app.services import admin

_CENT = Decimal("0.0001")


def estimate_cost(input_tokens: int, output_tokens: int, input_price: Decimal | None, output_price: Decimal | None) -> dict:
    """Función pura. Si falta cualquiera de los dos precios no se estima el total (un costo parcial engañaría)."""
    if input_price is None or output_price is None:
        return {"configured": False, "input_usd": None, "output_usd": None, "total_usd": None}
    cost_in = (Decimal(input_tokens) / Decimal(1_000_000) * input_price).quantize(_CENT, ROUND_HALF_UP)
    cost_out = (Decimal(output_tokens) / Decimal(1_000_000) * output_price).quantize(_CENT, ROUND_HALF_UP)
    return {"configured": True, "input_usd": cost_in, "output_usd": cost_out, "total_usd": cost_in + cost_out}


def usage(db: Session, *, actor_user_id, request_id, days: int) -> dict:
    row = db.execute(text("SELECT admin_copilot_stats(:d)"), {"d": days}).scalar_one()
    data = row if isinstance(row, dict) else json.loads(row)
    data["cost"] = estimate_cost(int(data["input_tokens"]), int(data["output_tokens"]),
                                 settings.COPILOT_PRICE_INPUT_USD_PER_MTOK, settings.COPILOT_PRICE_OUTPUT_USD_PER_MTOK)
    data["limits"] = {"provider": settings.COPILOT_PROVIDER, "model": settings.COPILOT_MODEL,
                      "daily_messages_per_user": settings.COPILOT_DAILY_MESSAGES_PER_USER,
                      "daily_tokens_per_user": settings.COPILOT_DAILY_TOKENS_PER_USER,
                      "max_conversations_per_user": settings.COPILOT_MAX_CONVERSATIONS_PER_USER}
    admin.record_audit(db, actor_user_id=actor_user_id, action="ai.usage", resource="copilot", scope_used="admin.ai.read", reason=None,
                       result="success", request_id=request_id, metadata={"days": data["days"]})
    db.commit()
    return data
