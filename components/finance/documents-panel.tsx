"use client";

import { useState } from "react";
import { AlertCircle, BarChart3, CheckCircle2, ChevronDown, ChevronUp, FileText } from "lucide-react";
import type { Payslip, PayslipItem, payslipsView } from "@/lib/finance/payslips";
import { card, eur, flat } from "@/components/trading/format";
import { CardHeader, ErrorNote, SectionTitle } from "@/components/trading/ui";
import { SkeletonList } from "@/components/trading/skeletons";
import { useFinance } from "./api";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type View = Awaited<ReturnType<typeof payslipsView>>;

function monthLabel(year: number, month: number) {
  const label = new Intl.DateTimeFormat("es-ES", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(Date.UTC(year, month - 1, 1)));
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function Money({ value, className = "" }: { value: number; className?: string }) {
  return <span className={`amount whitespace-nowrap tabular-nums ${className}`}>{eur(value, 2)}</span>;
}

function Metric({ label, value, note }: { label: string; value: number; note?: string }) {
  return (
    <div className="min-w-0 rounded-xl bg-slate-50 px-3 py-3">
      <p className="text-[11px] font-medium text-slate-500">{label}</p>
      <p className="mt-1 text-sm font-semibold text-slate-900 sm:text-base"><Money value={value} /></p>
      {note && <p className="amount mt-1 text-[11px] text-slate-400">{note}</p>}
    </div>
  );
}

function LatestPayslip({ latest, payslips, selectedId, onSelect }: {
  latest: Payslip;
  payslips: Payslip[];
  selectedId: string;
  onSelect: (id: string) => void;
}) {
  const [all, setAll] = useState(false);
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader actions={payslips.length > 1 ? (
        <button type="button" onClick={() => setAll((v) => !v)} aria-expanded={all} className="flex items-center gap-1.5 text-sm font-medium text-blue-700 hover:text-blue-800">
          {all ? "Ocultar" : "Ver todas"}
          {all ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ) : undefined}>
        <SectionTitle icon={FileText} tint="blue" size="base">Última nómina</SectionTitle>
      </CardHeader>
      <div className="space-y-4 px-4 pb-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3 rounded-xl bg-blue-50/70 p-4">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">{monthLabel(latest.year, latest.month)}</p>
            <p className="mt-1 text-xs text-slate-500">{latest.employer}</p>
          </div>
          <div className="text-right">
            <p className="text-[11px] text-slate-500">Líquido a percibir</p>
            <p className="mt-1 text-2xl font-bold tracking-tight text-slate-950"><Money value={latest.net} /></p>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          <Metric label="Devengos" value={latest.gross} />
          <Metric label="Deducciones" value={latest.deductions} />
          <Metric label="IRPF" value={latest.irpfTotal} note={latest.irpfRate !== null ? `Tipo: ${new Intl.NumberFormat("es-ES", { maximumFractionDigits: 2 }).format(latest.irpfRate)} %` : undefined} />
          <Metric label="Seguridad Social" value={latest.ssEmployee} note="A cargo del trabajador" />
          <Metric label="Pagas extra" value={latest.extraPay} />
          <Metric label="Bonos y variables" value={latest.bonuses} />
          {latest.advances !== 0 && <Metric label="Anticipos descontados" value={latest.advances} />}
          {latest.arrears !== 0 && <Metric label="Atrasos / ajustes" value={latest.arrears} />}
        </div>
        {latest.arrears !== 0 && <p className="text-xs text-slate-500">Los atrasos se suman o restan por separado: líquido = devengos − deducciones + atrasos.</p>}
      </div>

      {all && (
        <div className="border-t border-slate-100 px-3 pb-3 pt-3 sm:px-5">
          <p className="px-2 pb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Histórico · {payslips.length} nóminas</p>
          <ul className="divide-y divide-slate-100">
            {payslips.map((p) => (
              <li key={p.id}>
                <button type="button" aria-pressed={selectedId === p.id} onClick={() => onSelect(p.id)} className={`flex w-full items-center justify-between gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-slate-50 ${selectedId === p.id ? "bg-blue-50/70" : ""}`}>
                  <span className="min-w-0">
                    <span className={`block text-sm font-semibold ${selectedId === p.id ? "text-blue-700" : "text-slate-800"}`}>{monthLabel(p.year, p.month)}</span>
                    <span className="mt-0.5 block truncate text-xs text-slate-500">{p.employer}</span>
                  </span>
                  <Money value={p.net} className="shrink-0 text-sm font-semibold text-slate-900" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function ItemBars({ items, section }: { items: PayslipItem[]; section: PayslipItem["section"] }) {
  const rows = items.filter((i) => i.section === section).map((item) => ({
    ...item,
    value: section === "employee" ? item.earnings - item.deductions + item.arrears
      : section === "employer_social_security" ? item.employerAmount ?? 0
      : item.informativeAmount ?? 0,
  }));
  if (!rows.length) return null;
  const max = Math.max(...rows.map((r) => Math.abs(r.value)), 1);
  return (
    <div className="space-y-4">
      {rows.map((item) => {
        const negative = item.value < 0;
        const color = section === "employer_social_security" ? "bg-blue-500" : section === "informative" ? "bg-slate-400" : negative ? "bg-rose-500" : "bg-emerald-500";
        return (
          <div key={item.position} className="min-w-0">
            <div className="mb-1.5 flex items-start justify-between gap-3 text-xs sm:text-sm">
              <span className="min-w-0 text-slate-700" title={item.description}>{item.description}</span>
              <span className={`amount shrink-0 font-semibold tabular-nums ${negative ? "text-rose-700" : "text-slate-900"}`}>{item.value > 0 && section === "employee" ? "+" : ""}{eur(item.value, 2)}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${item.value === 0 ? 0 : Math.max(2, Math.abs(item.value) / max * 100)}%` }} />
            </div>
            {section === "employee" && item.arrears !== 0 && <p className="mt-1 text-[11px] text-amber-700">Incluye atrasos o ajustes: <Money value={item.arrears} /></p>}
          </div>
        );
      })}
    </div>
  );
}

function PayslipBreakdown({ payslip }: { payslip: Payslip }) {
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader>
        <SectionTitle icon={BarChart3} tint="emerald" size="base">Desglose por conceptos</SectionTitle>
      </CardHeader>
      <div className="space-y-6 px-4 pb-6 sm:px-6">
        <p className="text-sm text-slate-500">{monthLabel(payslip.year, payslip.month)} · Importes de la nómina original</p>
        <div>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-sm font-semibold text-slate-900">Devengos y deducciones</h3>
            <span className="text-[11px] text-slate-500">Verde: a favor · Rojo: descuentos</span>
          </div>
          <ItemBars items={payslip.items} section="employee" />
        </div>
        {payslip.items.some((i) => i.section === "employer_social_security") && (
          <div className="border-t border-slate-100 pt-5">
            <div className="mb-4 flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-semibold text-slate-900">Cotizaciones de la empresa</h3>
                <p className="mt-1 text-xs text-slate-500">Informativas; no se descuentan de tu líquido.</p>
              </div>
              <Money value={payslip.ssEmployer} className="text-sm font-semibold text-slate-800" />
            </div>
            <ItemBars items={payslip.items} section="employer_social_security" />
          </div>
        )}
        {payslip.items.some((i) => i.section === "informative") && (
          <div className="border-t border-slate-100 pt-5">
            <h3 className="mb-1 text-sm font-semibold text-slate-900">Otros conceptos informativos</h3>
            <p className="mb-4 text-xs text-slate-500">Bases, beneficios y aportaciones informadas por la empresa; no son cobros adicionales.</p>
            <ItemBars items={payslip.items} section="informative" />
          </div>
        )}
      </div>
    </section>
  );
}

function Anomalies({ payslip }: { payslip: Payslip }) {
  return (
    <section className={`${card} ${flat}`}>
      <CardHeader>
        <SectionTitle icon={payslip.anomalies.length ? AlertCircle : CheckCircle2} tint={payslip.anomalies.length ? "amber" : "emerald"} size="base">Anomalías detectadas</SectionTitle>
      </CardHeader>
      <div className="px-4 pb-5 sm:px-6">
        {payslip.anomalies.length ? (
          <ul className="space-y-2 text-sm text-amber-800">{payslip.anomalies.map((a) => <li key={a}>• {a}</li>)}</ul>
        ) : (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm font-medium text-emerald-800"><CheckCircle2 className="h-4 w-4 shrink-0" />Todo OK. No se han detectado descuadres.</div>
        )}
        <p className="mt-3 text-xs text-slate-500">Se comprueba que el desglose y los totales cuadran. No es una revisión fiscal o laboral.</p>
      </div>
    </section>
  );
}

export function DocumentsPanel() {
  const { data, error } = useFinance<View>("payslips");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  if (error && !data) return <ErrorNote>{error}</ErrorNote>;
  if (!data) return <SkeletonList rows={7} />;
  const payslips = data.payslips;
  const latest = payslips[0];
  const selected = payslips.find((p) => p.id === selectedId) ?? latest;

  return (
    <div className="space-y-4 pb-4">
      <div className="flex items-center justify-between gap-3">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button type="button" aria-label="Tipo de documento" className="inline-flex min-w-44 items-center justify-between gap-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-semibold text-slate-800 shadow-sm hover:bg-slate-50">
              <span className="flex items-center gap-2"><FileText className="h-4 w-4 text-blue-600" /> Nóminas</span>
              <ChevronDown className="h-4 w-4 text-slate-400" />
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-44"><DropdownMenuItem>Nóminas</DropdownMenuItem></DropdownMenuContent>
        </DropdownMenu>
      </div>

      {!latest ? (
        <section className={`${card} p-8 text-center`}>
          <FileText className="mx-auto h-8 w-8 text-slate-300" />
          <p className="mt-3 text-sm font-medium text-slate-800">No hay nóminas guardadas.</p>
        </section>
      ) : (
        <>
          <LatestPayslip latest={latest} payslips={payslips} selectedId={selected.id} onSelect={setSelectedId} />
          <PayslipBreakdown payslip={selected} />
          <Anomalies payslip={selected} />
        </>
      )}
    </div>
  );
}
