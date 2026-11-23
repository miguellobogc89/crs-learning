import Link from "next/link";
import {
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bot,
  ChartCandlestick,
  Check,
  ChevronRight,
  FileText,
  FolderOpen,
  Landmark,
  Layers3,
  LineChart,
  MessageSquareText,
  Plug,
  ShieldCheck,
  Sparkles,
  Wallet,
} from "lucide-react";

import { ModuleLogo } from "@/components/ui/module-logo";

type Props = { isAuthenticated: boolean };

const capabilities = [
  {
    number: "01",
    icon: FolderOpen,
    title: "Información en orden",
    detail: "Centraliza documentos y conocimiento para que la información de tu negocio deje de estar dispersa.",
  },
  {
    number: "02",
    icon: BarChart3,
    title: "Datos que se entienden",
    detail: "Consulta indicadores y analiza la actividad de tu empresa con una visión más clara.",
  },
  {
    number: "03",
    icon: MessageSquareText,
    title: "Asistencia con IA",
    detail: "Haz preguntas sobre tu información y encuentra respuestas útiles en tu espacio de trabajo.",
  },
] as const;

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="grid size-10 place-items-center rounded-xl border border-slate-200 bg-white shadow-sm">
        <ModuleLogo module="business" className="size-7" />
      </span>
      <span className="font-semibold tracking-[-0.055em] text-slate-950">
        {compact ? "CRUSSADER" : "Crussader"}
      </span>
    </span>
  );
}

function SiteHeader({ isAuthenticated }: Props) {
  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/90 backdrop-blur-xl">
      <div className="mx-auto flex h-[76px] max-w-7xl items-center justify-between gap-5 px-5 sm:px-8 lg:px-10">
        <Link href="/" aria-label="Crussader, inicio" className="text-[21px]">
          <Wordmark />
        </Link>

        <nav className="hidden items-center gap-8 text-[13px] font-medium text-slate-600 md:flex" aria-label="Navegación principal">
          <a href="#business" className="transition hover:text-slate-950">Business</a>
          <a href="#ecosistema" className="transition hover:text-slate-950">Finance</a>
          <a href="#ecosistema" className="transition hover:text-slate-950">Trading</a>
        </nav>

        <div className="flex shrink-0 items-center gap-3">
          <Link
            href={isAuthenticated ? "/inicio" : "/login"}
            className="hidden text-[13px] font-semibold text-slate-700 transition hover:text-blue-600 sm:inline-flex"
          >
            {isAuthenticated ? "Mi espacio" : "Iniciar sesión"}
          </Link>
          <Link
            href={isAuthenticated ? "/inicio" : "/login"}
            className="inline-flex min-h-10 items-center gap-2 rounded-xl bg-[#0A58FF] px-4 text-[13px] font-semibold text-white shadow-[0_8px_16px_-8px_rgba(10,88,255,0.45)] transition hover:bg-[#0749d8]"
          >
            {isAuthenticated ? "Ir a mi espacio" : "Acceder"}
            <ArrowUpRight className="size-4" strokeWidth={1.9} />
          </Link>
        </div>
      </div>
    </header>
  );
}

/** Visual conceptual: no muestra datos de clientes ni simula métricas reales. */
function BusinessPreview() {
  return (
    <div className="relative mx-auto w-full max-w-[570px]">
      <div className="absolute -inset-7 rounded-[42px] bg-[radial-gradient(ellipse_at_50%_45%,rgba(10,88,255,0.13),transparent_70%)] blur-lg" aria-hidden="true" />

      <div className="relative overflow-hidden rounded-[26px] border border-slate-200 bg-white shadow-[0_32px_90px_-34px_rgba(15,23,42,0.28)]">
        <div className="flex items-center justify-between border-b border-slate-100 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="grid size-9 place-items-center rounded-xl bg-slate-950">
              <span className="font-semibold text-sm text-white">C.</span>
            </span>
            <div>
              <p className="text-[12px] font-semibold text-slate-950">Business</p>
              <p className="text-[10px] text-slate-400">Espacio de trabajo</p>
            </div>
          </div>
          <span className="rounded-full border border-blue-100 bg-blue-50 px-2.5 py-1 text-[10px] font-semibold text-blue-700">
            Vista conceptual
          </span>
        </div>

        <div className="bg-[#fafbfe] p-5 sm:p-6">
          <div className="mb-5">
            <p className="text-[11px] font-medium text-slate-500">Visión general</p>
            <h3 className="mt-1 text-xl font-semibold tracking-tight text-slate-900">Todo lo importante, conectado.</h3>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-xl bg-blue-50 text-[#0A58FF]">
                <FileText className="size-4.5" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-slate-900">Documentos</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Información accesible y organizada</p>
              <div className="mt-4 flex items-center gap-1.5" aria-hidden="true">
                <span className="h-1.5 w-3/5 rounded-full bg-blue-100" />
                <span className="h-1.5 w-1/4 rounded-full bg-blue-200" />
              </div>
            </div>
            <div className="rounded-2xl border border-slate-200/90 bg-white p-4 shadow-sm">
              <span className="flex size-9 items-center justify-center rounded-xl bg-slate-100 text-slate-700">
                <BarChart3 className="size-4.5" />
              </span>
              <p className="mt-3 text-[13px] font-semibold text-slate-900">Analítica</p>
              <p className="mt-1 text-[11px] leading-relaxed text-slate-500">Una lectura clara de tu actividad</p>
              <div className="mt-4 flex h-5 items-end gap-1" aria-hidden="true">
                <span className="h-2 w-3 rounded-sm bg-blue-100" />
                <span className="h-3 w-3 rounded-sm bg-blue-200" />
                <span className="h-4 w-3 rounded-sm bg-[#0A58FF]" />
                <span className="h-3.5 w-3 rounded-sm bg-blue-300" />
                <span className="h-5 w-3 rounded-sm bg-[#0A58FF]" />
              </div>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-blue-100 bg-white p-4 shadow-sm">
            <div className="flex items-center gap-2 text-[12px] font-semibold text-slate-900">
              <span className="grid size-7 place-items-center rounded-lg bg-[#0A58FF] text-white">
                <Sparkles className="size-3.5" />
              </span>
              Asistente de IA
            </div>
            <div className="mt-3 rounded-xl bg-slate-50 px-3.5 py-2.5 text-[12px] text-slate-700">
              ¿Qué información tenemos sobre este proveedor?
            </div>
            <div className="mt-3 flex items-start gap-2">
              <span className="mt-1 grid size-5 shrink-0 place-items-center rounded-full bg-blue-50 text-blue-600">
                <Check className="size-3" strokeWidth={2.5} />
              </span>
              <p className="text-[11px] leading-5 text-slate-500">Consulta el conocimiento disponible en tu empresa sin buscar archivo por archivo.</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between border-t border-slate-100 bg-white px-5 py-3.5 text-[10px] font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-1.5 rounded-full bg-emerald-500" />
            Tus herramientas, en un mismo lugar
          </span>
          <span className="text-[#0A58FF]">Crussader Business</span>
        </div>
      </div>

      <div className="absolute -bottom-6 -left-6 hidden items-center gap-2 rounded-2xl border border-slate-200 bg-white px-4 py-3 shadow-lg sm:flex">
        <Plug className="size-4 text-[#0A58FF]" />
        <span className="text-xs font-medium text-slate-700">Conocimiento · Análisis · IA</span>
      </div>
    </div>
  );
}

export function MarketingLanding({ isAuthenticated }: Props) {
  const accessHref = isAuthenticated ? "/inicio" : "/login";

  return (
    <div className="min-h-screen bg-white text-slate-950">
      <SiteHeader isAuthenticated={isAuthenticated} />

      <main>
        <section className="relative isolate overflow-hidden bg-[#fbfcff]">
          <div className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_22%_12%,rgba(10,88,255,0.07),transparent_40%)]" aria-hidden="true" />
          <div className="mx-auto grid max-w-7xl items-center gap-16 px-5 pb-28 pt-20 sm:px-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,0.95fr)] lg:gap-12 lg:px-10 lg:pb-32 lg:pt-28">
            <div className="max-w-[630px]">
              <div className="inline-flex items-center gap-2 rounded-full border border-blue-100 bg-white px-3.5 py-2 text-[11px] font-semibold text-[#0A58FF] shadow-sm">
                <span className="size-1.5 rounded-full bg-[#0A58FF]" />
                CRUSSADER BUSINESS
                <ChevronRight className="size-3.5" />
              </div>
              <h1 className="mt-8 text-[clamp(2.7rem,5vw,4.4rem)] font-semibold leading-[1.09] tracking-[-0.065em] text-slate-950">
                Más claridad para tu negocio.
                <span className="mt-2 block text-[#0A58FF]">Más tiempo para ti.</span>
              </h1>
              <p className="mt-7 max-w-[540px] text-base leading-8 text-slate-600 sm:text-lg">
                Organiza la información de tu empresa, entiende mejor tus datos y trabaja con ayuda de la IA. Una forma más sencilla de llevar el día a día.
              </p>
              <div className="mt-9 flex flex-wrap items-center gap-3">
                <a
                  href="#business"
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-[#0A58FF] px-5 text-[14px] font-semibold text-white shadow-[0_12px_22px_-13px_rgba(10,88,255,0.55)] transition hover:bg-[#0749d8]"
                >
                  Descubrir Business <ArrowRight className="size-4" />
                </a>
                <Link
                  href={accessHref}
                  className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-slate-200 bg-white px-5 text-[14px] font-semibold text-slate-800 transition hover:border-slate-300 hover:bg-slate-50"
                >
                  {isAuthenticated ? "Ir a mi espacio" : "Ya tengo una cuenta"}
                  <ArrowUpRight className="size-4" />
                </Link>
              </div>
              <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-3 text-[12px] font-medium text-slate-500">
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-[#0A58FF]" /> Documentación</span>
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-[#0A58FF]" /> Analítica</span>
                <span className="inline-flex items-center gap-2"><Check className="size-4 text-[#0A58FF]" /> IA aplicada</span>
              </div>
            </div>
            <BusinessPreview />
          </div>
        </section>

        <section id="business" className="scroll-mt-24 border-t border-slate-100 bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="max-w-2xl">
              <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.19em] text-[#0A58FF]">
                <Layers3 className="size-4" /> Pensado para el negocio
              </div>
              <h2 className="mt-5 text-3xl font-semibold leading-tight tracking-[-0.052em] text-slate-950 sm:text-[42px]">
                Tu información tiene valor. <span className="text-slate-400">Hazla útil.</span>
              </h2>
              <p className="mt-5 text-base leading-8 text-slate-600">
                Business reúne capacidades de conocimiento, análisis y asistencia para ayudarte a trabajar con más contexto y menos fricción.
              </p>
            </div>

            <div className="mt-12 grid gap-4 md:grid-cols-3">
              {capabilities.map(({ number, icon: Icon, title, detail }) => (
                <article key={number} className="group rounded-[22px] border border-slate-200 bg-white p-7 transition hover:-translate-y-0.5 hover:border-blue-200 hover:shadow-[0_18px_40px_-25px_rgba(10,88,255,0.25)]">
                  <div className="flex items-start justify-between">
                    <span className="grid size-12 place-items-center rounded-2xl bg-blue-50 text-[#0A58FF]">
                      <Icon className="size-5.5" strokeWidth={1.8} />
                    </span>
                    <span className="text-xs font-semibold tabular-nums text-slate-300">{number}</span>
                  </div>
                  <h3 className="mt-8 text-lg font-semibold tracking-tight text-slate-950">{title}</h3>
                  <p className="mt-3 text-sm leading-7 text-slate-500">{detail}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="ecosistema" className="scroll-mt-24 border-t border-slate-100 bg-[#f8fafd] py-24 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="flex flex-col justify-between gap-5 lg:flex-row lg:items-end">
              <div className="max-w-2xl">
                <p className="text-[11px] font-bold uppercase tracking-[0.19em] text-[#0A58FF]">Un ecosistema, tres herramientas</p>
                <h2 className="mt-5 text-3xl font-semibold tracking-[-0.052em] sm:text-[42px]">
                  También para tus decisiones personales.
                </h2>
                <p className="mt-4 max-w-[570px] text-base leading-8 text-slate-600">
                  Además de Business, Crussader incorpora dos espacios especializados para tus finanzas y el seguimiento de tus inversiones.
                </p>
              </div>
              <span className="inline-flex items-center gap-2 text-xs font-medium text-slate-500">
                <ShieldCheck className="size-4 text-[#0A58FF]" /> Una cuenta, accesos especializados
              </span>
            </div>

            <div className="mt-12 grid gap-5 lg:grid-cols-2">
              <article className="relative overflow-hidden rounded-[26px] border border-emerald-100 bg-white p-7 shadow-sm sm:p-9">
                <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-emerald-100/50 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl border border-emerald-100 bg-emerald-50">
                      <ModuleLogo module="finance" className="size-8" />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-emerald-700">FINANZAS PERSONALES</p>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em]">Finance</h3>
                    </div>
                  </div>
                  <p className="mt-6 max-w-md text-[15px] leading-7 text-slate-600">
                    Tus cuentas, movimientos y presupuestos en un mismo lugar, con un copiloto para entender mejor tu dinero.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-2">
                    {["Cuentas", "Movimientos", "Plan de gastos", "Copiloto"].map((label) => (
                      <span key={label} className="rounded-full border border-emerald-100 bg-emerald-50/70 px-3 py-1.5 text-[11px] font-medium text-emerald-800">{label}</span>
                    ))}
                  </div>
                  <Link href="https://finance.crussader.com/home" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-emerald-700 transition hover:text-emerald-900">
                    Abrir Finance <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </article>

              <article className="relative overflow-hidden rounded-[26px] border border-rose-100 bg-white p-7 shadow-sm sm:p-9">
                <div className="pointer-events-none absolute -right-20 -top-24 size-64 rounded-full bg-rose-100/50 blur-3xl" aria-hidden="true" />
                <div className="relative">
                  <div className="flex items-center gap-3">
                    <span className="grid size-12 place-items-center rounded-2xl border border-rose-100 bg-rose-50">
                      <ModuleLogo module="trading" className="size-8" />
                    </span>
                    <div>
                      <p className="text-xs font-medium text-rose-700">MERCADOS E INVERSIÓN</p>
                      <h3 className="text-2xl font-semibold tracking-[-0.04em]">Trading</h3>
                    </div>
                  </div>
                  <p className="mt-6 max-w-md text-[15px] leading-7 text-slate-600">
                    Sigue mercados, analiza oportunidades y consulta tu cartera con herramientas de seguimiento y agentes de IA.
                  </p>
                  <div className="mt-8 flex flex-wrap gap-2">
                    {["Mercados", "Carteras", "Oportunidades", "Agentes IA"].map((label) => (
                      <span key={label} className="rounded-full border border-rose-100 bg-rose-50/70 px-3 py-1.5 text-[11px] font-medium text-rose-800">{label}</span>
                    ))}
                  </div>
                  <Link href="https://trading.crussader.com/home" className="mt-10 inline-flex items-center gap-2 text-sm font-semibold text-rose-700 transition hover:text-rose-900">
                    Abrir Trading <ArrowUpRight className="size-4" />
                  </Link>
                </div>
              </article>
            </div>
            <p className="mt-5 text-xs leading-6 text-slate-500">
              Trading ofrece herramientas de análisis y seguimiento; las inversiones conllevan riesgos y sus resultados no están garantizados.
            </p>
          </div>
        </section>

        <section className="bg-white py-24 sm:py-28">
          <div className="mx-auto max-w-7xl px-5 sm:px-8 lg:px-10">
            <div className="relative overflow-hidden rounded-[28px] bg-slate-950 px-7 py-14 text-white sm:px-12 sm:py-16 lg:px-16">
              <div className="pointer-events-none absolute -right-16 -top-32 size-96 rounded-full bg-[#0A58FF]/25 blur-[85px]" aria-hidden="true" />
              <div className="relative max-w-2xl">
                <div className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.16em] text-blue-300">
                  <Sparkles className="size-4" /> CRUSSADER
                </div>
                <h2 className="mt-6 text-3xl font-semibold leading-tight tracking-[-0.05em] sm:text-[43px]">
                  Tecnología útil para lo que de verdad importa.
                </h2>
                <p className="mt-5 text-base leading-8 text-slate-300">
                  Empieza por tu negocio y descubre un ecosistema diseñado para trabajar y decidir con más información.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <Link href={accessHref} className="inline-flex min-h-12 items-center gap-2 rounded-xl bg-white px-5 text-sm font-semibold text-slate-950 transition hover:bg-blue-50">
                    {isAuthenticated ? "Ir a mi espacio" : "Acceder a Crussader"} <ArrowRight className="size-4" />
                  </Link>
                  <a href="#business" className="inline-flex min-h-12 items-center gap-2 rounded-xl border border-white/25 px-5 text-sm font-semibold text-white transition hover:bg-white/10">
                    Conocer Business <ChevronRight className="size-4" />
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200 bg-white">
        <div className="mx-auto flex max-w-7xl flex-col items-start justify-between gap-6 px-5 py-9 sm:px-8 md:flex-row md:items-center lg:px-10">
          <div>
            <Link href="/" aria-label="Crussader, inicio" className="text-lg">
              <Wordmark compact />
            </Link>
            <p className="mt-2 text-xs text-slate-500">© 2026 Crussader. Business · Finance · Trading.</p>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-[12px] font-medium text-slate-500">
            <a href="#business" className="hover:text-slate-900">Business</a>
            <a href="#ecosistema" className="hover:text-slate-900">Finance y Trading</a>
            <Link href={accessHref} className="hover:text-slate-900">{isAuthenticated ? "Mi espacio" : "Acceso"}</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
