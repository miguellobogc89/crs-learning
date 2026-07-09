// app/(app)/knowledge/new/page.tsx
import Link from "next/link";

import { createKnowledgeAction } from "@/app/actions/knowledge";
import { PageTitle } from "@/components/app/page-title";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";

type Props = {
  searchParams: Promise<{
    library?: string;
  }>;
};

export default async function NewKnowledgePage({ searchParams }: Props) {
  const { library } = await searchParams;

  console.log("LIBRARY PARAM:", library);

  return (
    <div className="min-h-full bg-background px-6 py-6">
      <div className="mb-8 flex items-center justify-between gap-4">
        <PageTitle
          title="Nuevo knowledge"
          subtitle="Crea una fuente de conocimiento para generar cursos después."
        />

        <Button asChild variant="secondary">
          <Link href="/knowledge">
            Volver
          </Link>
        </Button>
      </div>

      <Card className="mx-auto max-w-3xl border-border bg-card">
        <CardContent className="p-6">
          <form action={createKnowledgeAction} className="space-y-6">

            <input
              type="hidden"
              name="libraryId"
              value={library ?? ""}
            />

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Nombre
              </label>

              <Input
                name="title"
                placeholder="Ej. Procedimiento de altas SAP"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Descripción
              </label>

              <Textarea
                name="description"
                placeholder="Resume qué contiene esta fuente y para qué se usará."
                className="min-h-24"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">
                Visibilidad
              </label>

              <select
                name="visibility"
                defaultValue="private"
                className="h-10 w-full rounded-md border border-border bg-background px-3 text-sm text-foreground"
              >
                <option value="private">Privado</option>
                <option value="public">Público</option>
              </select>

              <p className="text-xs text-muted-foreground">
                De momento lo privado solo lo verá el propietario. Más adelante añadiremos acceso por usuarios o equipos.
              </p>
            </div>

            <div className="flex gap-3">
              <Button type="submit">
                Crear knowledge
              </Button>

              <Button asChild type="button" variant="secondary">
                <Link href="/knowledge">
                  Cancelar
                </Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}