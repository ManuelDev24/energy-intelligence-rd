import re
import unicodedata

from app.config import settings
from app.schemas.help import HelpArticleSummary, HelpCategory, HelpContact, HelpIndex
from app.services import help_content as content

MIN_QUERY = 2
MAX_QUERY = 80
MAX_RESULTS = 20


def _fold(text: str) -> str:
    """Minúsculas y sin acentos: «Contraseña» encuentra «contrasena»."""
    return "".join(c for c in unicodedata.normalize("NFD", text.lower()) if unicodedata.category(c) != "Mn")


def _terms(query: str) -> list[str]:
    return [t for t in re.split(r"\W+", _fold(query)) if len(t) >= MIN_QUERY][:6]


def score(article: content.Article, terms: list[str]) -> int:
    """Título pesa más que etiquetas, etiquetas más que resumen y cuerpo. Todos los términos deben aparecer en algún campo."""
    title, tags = _fold(article.title), [_fold(t) for t in article.tags]
    summary, body = _fold(article.summary), _fold(" ".join(article.body))
    total = 0
    for term in terms:
        points = (10 if term in title else 0) + (6 if any(term in t for t in tags) else 0) + (3 if term in summary else 0) + (1 if term in body else 0)
        if points == 0:
            return 0
        total += points
    return total


def contact() -> HelpContact:
    email = settings.SUPPORT_EMAIL.strip() or None
    note = ("Si no encuentras la respuesta, escríbenos y cuéntanos qué pasó. No incluyas contraseñas ni números completos de tarjeta."
            if email else "El correo de soporte aún no está configurado en este entorno.")
    return HelpContact(email=email, note=note)


def build_index(query: str | None = None, category: str | None = None) -> HelpIndex:
    articles = list(content.ARTICLES)
    if category:
        articles = [a for a in articles if a.category == category]
    q = (query or "").strip()[:MAX_QUERY]
    if q:
        terms = _terms(q)
        ranked = sorted(((score(a, terms), a) for a in articles), key=lambda x: (-x[0], x[1].title)) if terms else []
        articles = [a for s, a in ranked if s > 0][:MAX_RESULTS]
    return HelpIndex(
        content_version=content.CONTENT_VERSION, categories=[HelpCategory(id=k, label=v) for k, v in content.CATEGORIES.items()],
        articles=[HelpArticleSummary(id=a.id, category=a.category, title=a.title, summary=a.summary) for a in articles],
        contact=contact(), query=q or None)
