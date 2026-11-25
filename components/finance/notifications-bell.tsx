"use client";
// Campana de avisos en la cabecera (25/11/2026): los avisos que piden actuar (renovar el acceso al banco y cobros
// después de cancelar). Con punto rojo si hay alguno; al tocarla, una hoja inferior con la lista para descartarlos.
import { useState } from "react";
import { AlertTriangle, Bell, BellRing, Info, X } from "lucide-react";
import type { overview } from "@/lib/finance/service";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { fapi, useFinance } from "./api";

type Overview = Awaited<ReturnType<typeof overview>>;
const actionable = (key: string) => key.startsWith("consent:") || key.startsWith("zombi:");

export function NotificationsBell() {
  const { data } = useFinance<Overview>("overview");
  const [open, setOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const alerts = (data?.alerts ?? []).filter((a) => actionable(a.key) && !hidden.has(a.key));
  const dismiss = async (key: string) => {
    setHidden((h) => new Set(h).add(key));
    await fapi("dismiss", { key }).catch(() => undefined);
  };
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} aria-label={alerts.length ? `Avisos: ${alerts.length}` : "Avisos"}
        className="relative flex h-11 w-11 items-center justify-center rounded-xl text-slate-700 active:bg-slate-100">
        <Bell className="h-5 w-5" />
        {alerts.length > 0 && <span aria-hidden="true" className="absolute right-2.5 top-2.5 h-2.5 w-2.5 rounded-full bg-rose-500 ring-2 ring-white" />}
      </button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent side="bottom" className="mx-auto max-h-[80dvh] w-full max-w-xl gap-0 overflow-y-auto rounded-t-3xl pb-[max(1rem,env(safe-area-inset-bottom))]">
          <SheetHeader className="px-5 pb-2 pt-5">
            <SheetTitle>Avisos</SheetTitle>
            <SheetDescription>{alerts.length ? "Cosas que piden que hagas algo." : "No tienes avisos."}</SheetDescription>
          </SheetHeader>
          <ul className="divide-y divide-slate-100 px-3">
            {alerts.map((a) => {
              const Icon = a.level === "importante" ? AlertTriangle : a.level === "aviso" ? BellRing : Info;
              const tone = a.level === "importante" ? "text-red-600" : a.level === "aviso" ? "text-amber-600" : "text-blue-600";
              return (
                <li key={a.key} className="flex items-start gap-3 px-2 py-3">
                  <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${tone}`} aria-hidden="true" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-900">{a.title}</p>
                    <p className="mt-0.5 text-sm text-slate-600">{a.body}</p>
                  </div>
                  <button type="button" onClick={() => void dismiss(a.key)} aria-label="Descartar" className="-mr-1 rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700"><X className="h-4 w-4" /></button>
                </li>
              );
            })}
          </ul>
        </SheetContent>
      </Sheet>
    </>
  );
}
