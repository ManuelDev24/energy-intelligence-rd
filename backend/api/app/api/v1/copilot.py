import uuid

from fastapi import APIRouter, Depends, Query, Response, status
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.auth_deps import current_user
from app.database import get_db
from app.schemas.copilot import (ConversationIn, ConversationOut, ConversationRename, CopilotMessageOut, CopilotUsageOut, FeedbackIn,
                                 MessageIn)
from app.services.copilot import engine
from app.services.copilot.provider import get_provider

router = APIRouter(prefix="/homes/{home_id}/copilot", tags=["copilot"])
_NO_STORE = {"Cache-Control": "no-store"}


def _ctx(home_id: uuid.UUID, user) -> engine.Context:
    return engine.Context(user_id=user.id if user else None, home_id=home_id)


@router.get("/usage", response_model=CopilotUsageOut)
def get_usage(home_id: uuid.UUID, response: Response, user=Depends(current_user), db: Session = Depends(get_db)):
    response.headers.update(_NO_STORE)
    return engine.usage(db, _ctx(home_id, user))


@router.get("/conversations", response_model=list[ConversationOut])
def list_conversations(home_id: uuid.UUID, response: Response, limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0, le=10_000),
                       user=Depends(current_user), db: Session = Depends(get_db)):
    response.headers.update(_NO_STORE)
    return engine.list_conversations(db, _ctx(home_id, user), limit=limit, offset=offset)


@router.post("/conversations", response_model=ConversationOut, status_code=status.HTTP_201_CREATED)
def create_conversation(home_id: uuid.UUID, payload: ConversationIn, user=Depends(current_user), db: Session = Depends(get_db)):
    return engine.create_conversation(db, _ctx(home_id, user), payload.title)


@router.patch("/conversations/{conversation_id}", response_model=ConversationOut)
def rename_conversation(home_id: uuid.UUID, conversation_id: uuid.UUID, payload: ConversationRename, user=Depends(current_user),
                        db: Session = Depends(get_db)):
    return engine.rename_conversation(db, _ctx(home_id, user), conversation_id, payload.title)


@router.delete("/conversations/{conversation_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_conversation(home_id: uuid.UUID, conversation_id: uuid.UUID, user=Depends(current_user), db: Session = Depends(get_db)):
    engine.delete_conversation(db, _ctx(home_id, user), conversation_id)
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/conversations/{conversation_id}/messages", response_model=list[CopilotMessageOut])
def list_messages(home_id: uuid.UUID, conversation_id: uuid.UUID, response: Response, user=Depends(current_user),
                  db: Session = Depends(get_db)):
    response.headers.update(_NO_STORE)
    return [engine.message_out(m) for m in engine.list_messages(db, _ctx(home_id, user), conversation_id)]


@router.post("/conversations/{conversation_id}/messages", response_class=StreamingResponse,
             responses={200: {"content": {"text/event-stream": {}}, "description": "Eventos start, tool, delta, refused, error y done"}})
def send_message(home_id: uuid.UUID, conversation_id: uuid.UUID, payload: MessageIn, user=Depends(current_user),
                 db: Session = Depends(get_db)):
    """Pregunta al Copilot. La cuota, la conversación y la pregunta se validan y guardan ANTES de abrir el stream (errores HTTP normales);
    la respuesta llega como Server-Sent Events y se guarda al terminar, también si se cancela."""
    ctx = _ctx(home_id, user)
    engine.start_turn(db, ctx, conversation_id, payload.content)
    provider = get_provider()
    if provider is None:  # carrera improbable: la configuración cambió entre la validación y aquí
        raise engine.CopilotDisabled("El Copilot no está disponible en este entorno")
    period = (payload.period_from, payload.period_to) if payload.period_from and payload.period_to else None
    stream = engine.run_turn(db.get_bind(), ctx, conversation_id, provider, period=period)
    return StreamingResponse(stream, media_type="text/event-stream",
                             headers={"Cache-Control": "no-store", "X-Accel-Buffering": "no", "X-Content-Type-Options": "nosniff"})


@router.put("/conversations/{conversation_id}/messages/{message_id}/feedback", response_model=CopilotMessageOut)
def put_feedback(home_id: uuid.UUID, conversation_id: uuid.UUID, message_id: uuid.UUID, payload: FeedbackIn, user=Depends(current_user),
                 db: Session = Depends(get_db)):
    return engine.message_out(engine.set_feedback(db, _ctx(home_id, user), conversation_id, message_id, payload.value))
