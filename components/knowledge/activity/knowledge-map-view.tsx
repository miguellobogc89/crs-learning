// components/knowledge/activity/knowledge-map-view.tsx

import Link from "next/link";
import {
  Activity,
  Map,
} from "lucide-react";

import { KnowledgeJsonDownload } from "@/components/knowledge/activity/knowledge-json-download";
import {
  KnowledgeStatusMap,
  type KnowledgeStatusLibrary,
} from "@/components/knowledge/activity/knowledge-status-map";

type KnowledgeMapViewProps = {
  knowledgeStatus: unknown;
};

export function KnowledgeMapView({
  knowledgeStatus,
}: KnowledgeMapViewProps) {
  const libraries =
    knowledgeStatus as KnowledgeStatusLibrary[];

  return (
    <>
      <div className="flex flex-col gap-5 border-b border-border pb-5 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-3xl font-semibold">
            Centro de control
          </h1>

          <p className="mt-2 text-sm text-muted-foreground">
            Consulta la actividad y la
            estructura completa del
            conocimiento visible para ti.
          </p>
        </div>

        <nav className="flex w-fit rounded-lg border border-border bg-muted/40 p-1">
          <Link
            href="/knowledge/activity?view=activity"
            className="flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            <Activity className="h-4 w-4" />
            Actividad
          </Link>

          <Link
            href="/knowledge/activity?view=status"
            className="flex items-center gap-2 rounded-md bg-background px-3 py-2 text-sm font-medium text-foreground shadow-sm"
          >
            <Map className="h-4 w-4" />
            Mapa del conocimiento
          </Link>
        </nav>
      </div>

      <div className="mt-8">
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h2 className="text-xl font-semibold">
              Mapa del conocimiento
            </h2>

            <p className="mt-1 text-sm text-muted-foreground">
              Estructura actual de
              carpetas, artículos y
              documentos dentro de tu
              ámbito de visibilidad.
            </p>
          </div>

          <KnowledgeJsonDownload
            data={{
              exportedAt:
                new Date().toISOString(),
              type: "knowledge-status",
              libraries,
            }}
            fileName={`knowledge-status-${new Date()
              .toISOString()
              .slice(0, 10)}.json`}
            label="Descargar JSON"
          />
        </div>

        <KnowledgeStatusMap
          libraries={libraries}
        />
      </div>
    </>
  );
}