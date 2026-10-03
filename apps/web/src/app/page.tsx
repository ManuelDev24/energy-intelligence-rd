import { Card, CardDescription, CardTitle } from "@/components/ui/card";

export default function HomePage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col justify-center gap-6 px-6 py-12">
      <h1 className="text-3xl font-bold">⚡ Energy RD</h1>
      <Card>
        <CardTitle>Foundation web</CardTitle>
        <CardDescription>
          Base de la aplicación web. Autenticación y vistas de datos llegarán en tickets posteriores.
        </CardDescription>
      </Card>
    </main>
  );
}
