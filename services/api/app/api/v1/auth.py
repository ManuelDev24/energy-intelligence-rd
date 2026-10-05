from fastapi import APIRouter, BackgroundTasks, Depends, Request, Response
from sqlalchemy.orm import Session

from app.api.auth_deps import auth_required, current_user
from app.api.auth_abuse import forgot_budget, login_budget, register_budget, refresh_budget, reset_budget
from app.database import get_db
from app.schemas.auth import (AccountDeletionIn, Credentials, PasswordForgotAccepted, PasswordForgotIn, PasswordResetIn,
                              RefreshIn, RegisterIn, TokensOut, UserOut)
from app.services import account, auth, email, password_recovery

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(auth_required)])


@router.post("/register", response_model=TokensOut, status_code=201, dependencies=[Depends(register_budget)])
def register(payload: RegisterIn, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return auth.register(db, payload)


@router.post("/login", response_model=TokensOut, dependencies=[Depends(login_budget)])
def login(payload: Credentials, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return auth.login(db, payload)


@router.post("/refresh", response_model=TokensOut, dependencies=[Depends(refresh_budget)])
def refresh(payload: RefreshIn, response: Response, db: Session = Depends(get_db)):
    response.headers["Cache-Control"] = "no-store"
    return auth.refresh_or_logout(db, payload.refresh_token)


@router.post("/logout", status_code=204)
def logout(payload: RefreshIn, db: Session = Depends(get_db)):
    auth.refresh_or_logout(db, payload.refresh_token, logout=True)
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


@router.get("/me", response_model=UserOut)
def me(response: Response, user=Depends(current_user)):
    response.headers["Cache-Control"] = "no-store"
    return user


# Reautenticación con contraseña; los intentos consumen el mismo presupuesto que /login, pero solo
# después de validar el token: una petición sin sesión no puede agotar el /login de esa IP.
def _authenticated_login_budget(user=Depends(current_user), _=Depends(login_budget)):
    return user


@router.delete("/me", status_code=204)
def delete_me(payload: AccountDeletionIn, user=Depends(_authenticated_login_budget), db: Session = Depends(get_db)):
    account.delete_account(db, user, payload.password.get_secret_value())
    return Response(status_code=204, headers={"Cache-Control": "no-store"})


# ERD-AUTH-05: recuperación de contraseña. Respuesta 202 idéntica exista o no la cuenta; el correo se
# entrega en segundo plano DESPUÉS de enviar la respuesta, así su latencia o fallo no la delata.
@router.post("/password/forgot", status_code=202, response_model=PasswordForgotAccepted,
             dependencies=[Depends(forgot_budget)])
def forgot_password(payload: PasswordForgotIn, request: Request, background: BackgroundTasks, response: Response,
                    db: Session = Depends(get_db)):
    peer = request.client.host if request.client else "unknown-peer"
    message = password_recovery.request_reset(db, payload.email, peer)
    if message is not None:
        background.add_task(email.deliver, message)
    response.headers["Cache-Control"] = "no-store"
    return PasswordForgotAccepted(status="accepted")


@router.post("/password/reset", status_code=204, dependencies=[Depends(reset_budget)])
def reset_password(payload: PasswordResetIn, db: Session = Depends(get_db)):
    password_recovery.reset_password(db, payload.token, payload.new_password.get_secret_value())
    return Response(status_code=204, headers={"Cache-Control": "no-store"})
