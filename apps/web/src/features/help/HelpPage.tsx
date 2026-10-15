"use client";

import { LifeBuoy, Search } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { QueryState } from "@/components/query-state";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { useHelp, useHelpArticle } from "@/lib/api/hooks";

function useDebounced(value: string, ms = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => { const timer = setTimeout(() => setDebounced(value), ms); return () => clearTimeout(timer); }, [value, ms]);
  return debounced;
}

function Article({ id, title, summary }: { id: string; title: string; summary: string }) {
  const [open, setOpen] = useState(false);
  const article = useHelpArticle(id, open);
  return (
    <li>
      <details className="rounded-lg border border-border p-3" onToggle={event => setOpen((event.currentTarget as HTMLDetailsElement).open)}>
        <summary className="cursor-pointer py-1 font-medium">{title}</summary>
        <p className="mt-1 text-sm text-muted-foreground">{summary}</p>
        {open ? (
          <QueryState isLoading={article.isLoading} error={article.error} onRetry={() => void article.refetch()}>
            {article.data ? <div className="mt-2 flex flex-col gap-2 text-sm">{article.data.body.map(paragraph => <p key={paragraph}>{paragraph}</p>)}</div> : null}
          </QueryState>
        ) : null}
      </details>
    </li>
  );
}

/** ERD-HELP-01: centro de ayuda — búsqueda, categorías, artículos desplegables y vía de contacto (sin inventar correos). */
export default function HelpPage() {
  const searchId = useId();
  const [text, setText] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const q = useDebounced(text.trim());
  const { data, isLoading, error, refetch } = useHelp(q, category);
  const searching = q.length >= 2;

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h1 className="flex items-center gap-2 text-2xl font-bold"><LifeBuoy className="h-6 w-6 text-primary" aria-hidden /> Ayuda</h1>
        <p className="text-pretty text-sm text-muted-foreground">Respuestas a las dudas más comunes sobre facturas, datos, ahorro y tu cuenta.</p>
      </header>
      <form role="search" aria-label="Buscar en la ayuda" className="flex flex-col gap-1" onSubmit={event => event.preventDefault()}>
        <label htmlFor={searchId} className="text-sm font-medium">Buscar</label>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input id={searchId} type="search" value={text} maxLength={80} onChange={event => setText(event.target.value)} placeholder="Por ejemplo: contraseña, factura, estimado"
            className="min-h-11 w-full rounded-lg border border-border bg-background pl-9 pr-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary" />
        </div>
      </form>
      <QueryState isLoading={isLoading} error={error} onRetry={() => void refetch()}>
        {data ? (
          <>
            <div role="group" aria-label="Categorías" className="flex flex-wrap gap-2">
              <Button size="sm" variant={category === null ? "primary" : "outline"} aria-pressed={category === null} onClick={() => setCategory(null)}>Todas</Button>
              {data.categories.map(c => (
                <Button key={c.id} size="sm" variant={category === c.id ? "primary" : "outline"} aria-pressed={category === c.id} onClick={() => setCategory(c.id)}>{c.label}</Button>
              ))}
            </div>
            <p role="status" className="text-sm text-muted-foreground">
              {searching ? `${data.articles.length} resultado(s) para «${q}»` : `${data.articles.length} artículo(s)`}
            </p>
            {data.articles.length ? (
              <ul className="flex flex-col gap-2" aria-label="Artículos de ayuda">
                {data.articles.map(a => <Article key={a.id} id={a.id} title={a.title} summary={a.summary} />)}
              </ul>
            ) : <Card><p className="text-sm">No encontramos nada con esa búsqueda. Prueba con otra palabra o escribe a soporte.</p></Card>}
            <Card role="region" aria-label="Contacto" data-testid="help-contact">
              <h2 className="text-base font-semibold">¿No encontraste la respuesta?</h2>
              <p className="mt-1 text-sm text-muted-foreground">{data.contact.note}</p>
              {data.contact.email ? <p className="mt-2 text-sm"><a className="font-medium text-primary underline" href={`mailto:${data.contact.email}`}>{data.contact.email}</a></p> : null}
              <p className="mt-2 text-xs text-muted-foreground">Contenido de ayuda versión {data.content_version}.</p>
            </Card>
          </>
        ) : null}
      </QueryState>
    </div>
  );
}
