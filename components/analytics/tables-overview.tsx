import Link from "next/link";
import { AlertTriangle, ArrowRight, CheckCircle2, FileQuestion, FileStack, Sparkles, Table2, Wand2 } from "lucide-react";
import type { ReviewItem, TableCard } from "@/lib/analytics/tables-overview";
import { cn } from "@/lib/utils";

const TONE = {
  amber: { tile: "bg-amber-50 text-amber-600", Icon: FileQuestion },
  rose: { tile: "bg-rose-50 text-rose-600", Icon: AlertTriangle },
  blue: { tile: "bg-[#0A58FF]/10 text-[#0A58FF]", Icon: Sparkles },
} as const;
const card = "rounded-2xl border border-slate-200/80 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)]";
const n = (v: number) => v.toLocaleString("es-ES");

/** Analítica → Tablas, with no table chosen: a few figures, what needs a look, and every table. */
export function TablesOverview({ tables, review }: { tables: TableCard[]; review: ReviewItem[] }) {
  const rows = tables.reduce((s, t) => s + t.rows, 0);
  const own = tables.filter(t => t.origin !== "base").length;
  return <div className="space-y-6 pt-4">
    <dl className={cn(card, "grid grid-cols-3 divide-x divide-slate-100")}>
      {([["Tablas", tables.length, own ? `${n(own)} creadas por ti` : "con tus datos"], ["Filas", rows, "en todas las tablas"],
        ["Por revisar", review.length, review.length ? "avisos abiertos" : "todo al día"]] as const).map(([k, v, hint]) =>
        <div key={k} className="px-6 py-4">
          <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">{k}</dt>
          <dd className={cn("mt-1 text-2xl font-semibold tabular-nums", k === "Por revisar" && v ? "text-amber-600" : "text-slate-900")}>{n(v)}</dd>
          <p className="text-xs text-slate-500">{hint}</p>
        </div>)}
    </dl>

    <section>
      <h2 className="mb-2.5 text-sm font-semibold text-slate-900">Necesita revisión</h2>
      {review.length ? <ul className={cn(card, "divide-y divide-slate-100 overflow-hidden")}>
        {review.map(item => {
          const { tile, Icon } = TONE[item.tone];
          return <li key={item.key}><Link href={item.href} className="group flex items-center gap-4 px-5 py-3.5 transition-colors hover:bg-slate-50/70">
            <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-xl", tile)}><Icon className="size-[18px]" /></span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium text-slate-900">{item.title}</span>
              <span className="block truncate text-xs text-slate-500">{item.detail}</span>
            </span>
            <span className="inline-flex shrink-0 items-center gap-1 text-xs font-medium text-[#0A58FF] group-hover:underline">{item.action}<ArrowRight className="size-3.5" /></span>
          </Link></li>;
        })}
      </ul> : <div className={cn(card, "flex items-center gap-3 px-5 py-4 text-sm text-slate-600")}>
        <CheckCircle2 className="size-5 text-emerald-600" />Todo al día: no hay documentos sin tabla ni datos por revisar.</div>}
    </section>

    <section>
      <h2 className="mb-2.5 text-sm font-semibold text-slate-900">Todas las tablas</h2>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {tables.map(t => <li key={t.key}>
          <Link href={`/analytics?view=tablas&table=${encodeURIComponent(t.key)}`}
            className={cn(card, "group flex h-full flex-col gap-3 p-5 transition-all hover:border-[#0A58FF]/40 hover:shadow-[0_6px_20px_-8px_rgba(10,88,255,0.25)]")}>
            <div className="flex items-start gap-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-[#0A58FF]/10 text-[#0A58FF]">{t.origin === "documentos" ? <FileStack className="size-[18px]" /> : t.origin === "asistente" ? <Wand2 className="size-[18px]" /> : <Table2 className="size-[18px]" />}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold text-slate-900 group-hover:text-[#0A58FF]">{t.label}</p>
                <p className="text-xs text-slate-500">{t.origin === "documentos" ? "De tus documentos" : t.origin === "asistente" ? "Creada con el asistente" : "Tabla base"}</p>
              </div>
              <ArrowRight className="size-4 shrink-0 text-slate-300 transition-transform group-hover:translate-x-0.5 group-hover:text-[#0A58FF]" />
            </div>
            <p className="line-clamp-2 flex-1 text-xs leading-relaxed text-slate-500">{t.description}</p>
            <p className="text-xs font-medium tabular-nums text-slate-700">{n(t.rows)} {t.rows === 1 ? "fila" : "filas"}</p>
          </Link>
        </li>)}
      </ul>
    </section>
  </div>;
}
