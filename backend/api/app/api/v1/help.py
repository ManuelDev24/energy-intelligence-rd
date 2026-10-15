from fastapi import APIRouter, HTTPException, Query, Response

from app.schemas.help import HelpArticle, HelpIndex
from app.services import help_content, help_search

# Público a propósito (como /legal): contenido editorial sin datos de personas; solo GET.
router = APIRouter(prefix="/help", tags=["help"])


@router.get("", response_model=HelpIndex)
def help_index(response: Response, q: str | None = Query(None, max_length=help_search.MAX_QUERY),
               category: str | None = Query(None, max_length=40)):
    response.headers["Cache-Control"] = "public, max-age=300"
    return help_search.build_index(q, category)


@router.get("/articles/{article_id}", response_model=HelpArticle)
def help_article(article_id: str, response: Response):
    article = help_content.get_article(article_id)
    if article is None:
        raise HTTPException(status_code=404, detail="Artículo no encontrado")
    response.headers["Cache-Control"] = "public, max-age=300"
    return HelpArticle(id=article.id, category=article.category, title=article.title, summary=article.summary,
                       body=list(article.body), tags=list(article.tags))
