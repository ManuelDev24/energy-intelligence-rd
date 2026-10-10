import uuid

from fastapi import APIRouter, BackgroundTasks, Depends, Response, status
from sqlalchemy.orm import Session

from app.api.auth_abuse import login_budget
from app.api.auth_deps import auth_required, current_user, require_home_owner
from app.database import get_db
from app.schemas import HomeOut
from app.schemas.auth import (InvitationAcceptIn, InvitationCreateIn, InvitationOut, MemberOut,
                              OwnershipTransferIn)
from app.services import email, sharing
from app.services.transactions import require_home

# ERD-SHARE-01. Fuera del modo piloto (sin cuentas) estas rutas no existen (404), igual que /auth.
router = APIRouter(prefix="/homes/{home_id}", tags=["sharing"], dependencies=[Depends(auth_required)])
invitations_router = APIRouter(prefix="/invitations", tags=["sharing"], dependencies=[Depends(auth_required)])
NO_STORE = {"Cache-Control": "no-store"}


@router.get("/members", response_model=list[MemberOut], dependencies=[Depends(require_home_owner)])
def list_members(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    response.headers.update(NO_STORE)
    return sharing.list_members(db, home_id)


@router.delete("/members/me", status_code=status.HTTP_204_NO_CONTENT)
def leave_home(home_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(current_user)):
    sharing.leave_home(db, home_id, user)
    return Response(status_code=204, headers=NO_STORE)


@router.delete("/members/{user_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_home_owner)])
def remove_member(home_id: uuid.UUID, user_id: uuid.UUID, db: Session = Depends(get_db), user=Depends(current_user)):
    sharing.remove_member(db, home_id, user.id, user_id)
    return Response(status_code=204, headers=NO_STORE)


@router.get("/invitations", response_model=list[InvitationOut], dependencies=[Depends(require_home_owner)])
def list_invitations(home_id: uuid.UUID, response: Response, db: Session = Depends(get_db)):
    response.headers.update(NO_STORE)
    return sharing.list_invitations(db, home_id)


@router.post("/invitations", response_model=InvitationOut, status_code=status.HTTP_201_CREATED,
             dependencies=[Depends(require_home_owner)])
def create_invitation(home_id: uuid.UUID, payload: InvitationCreateIn, background: BackgroundTasks, response: Response,
                      db: Session = Depends(get_db), user=Depends(current_user)):
    invitation, message = sharing.create_invitation(db, require_home(db, home_id), user, payload.email)
    background.add_task(email.deliver, message)  # tras responder: la latencia del correo no se nota
    response.headers.update(NO_STORE)
    return invitation


@router.delete("/invitations/{invitation_id}", status_code=status.HTTP_204_NO_CONTENT, dependencies=[Depends(require_home_owner)])
def revoke_invitation(home_id: uuid.UUID, invitation_id: uuid.UUID, db: Session = Depends(get_db)):
    sharing.revoke_invitation(db, home_id, invitation_id)
    return Response(status_code=204, headers=NO_STORE)


@router.post("/transfer-ownership", status_code=status.HTTP_204_NO_CONTENT,
             dependencies=[Depends(require_home_owner), Depends(login_budget)])
def transfer_ownership(home_id: uuid.UUID, payload: OwnershipTransferIn, db: Session = Depends(get_db), user=Depends(current_user)):
    sharing.transfer_ownership(db, home_id, user, payload.user_id, payload.password.get_secret_value())
    return Response(status_code=204, headers=NO_STORE)


@invitations_router.post("/accept", response_model=HomeOut)
def accept_invitation(payload: InvitationAcceptIn, response: Response, db: Session = Depends(get_db), user=Depends(current_user)):
    response.headers.update(NO_STORE)
    return sharing.accept_invitation(db, user, payload.token)
