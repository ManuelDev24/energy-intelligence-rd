import type { ReactNode } from "react";

interface QueryStateProps {
  isLoading: boolean;
  error: Error | null;
  children: ReactNode;
}

export function QueryState({ isLoading, error, children }: QueryStateProps) {
  if (isLoading) return <p className="text-sm text-muted-foreground">Cargando…</p>;
  if (error) {
    return (
      <p role="alert" className="text-sm text-red-600">
        {error.message}
      </p>
    );
  }
  return <>{children}</>;
}
