from pydantic import BaseModel


class HelpCategory(BaseModel):
    id: str
    label: str


class HelpArticleSummary(BaseModel):
    id: str
    category: str
    title: str
    summary: str


class HelpArticle(HelpArticleSummary):
    body: list[str]
    tags: list[str]


class HelpContact(BaseModel):
    """Vía de escalación. `email` es null si el entorno no tiene un correo de soporte configurado: la app no inventa uno."""
    email: str | None
    note: str


class HelpIndex(BaseModel):
    content_version: str
    categories: list[HelpCategory]
    articles: list[HelpArticleSummary]
    contact: HelpContact
    query: str | None = None
