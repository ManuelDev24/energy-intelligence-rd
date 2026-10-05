from fastapi import APIRouter, Depends, Response
from sqlalchemy.orm import Session

from app.api.auth_deps import auth_required, current_user
from app.api.auth_abuse import login_budget, register_budget, refresh_budget
from app.database import get_db
from app.schemas.auth import Credentials, RefreshIn, TokensOut, UserOut
from app.services import auth

router = APIRouter(prefix="/auth", tags=["auth"], dependencies=[Depends(auth_required)])


@router.post("/register", response_model=TokensOut, status_code=201, dependencies=[Depends(register_budget)])
def register(payload: Credentials, response: Response, db: Session = Depends(get_db)):
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
