// app/test/home/page.tsx

"use client";

import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Clock3,
  FileText,
  FolderOpen,
  MessageSquareText,
  MoreHorizontal,
  Plus,
  Search,
  Sparkles,
  TrendingUp,
  Users,
  Zap,
} from "lucide-react";

const recentItems = [
  {
    title: "Procedimiento gestión de incidencias",
    location: "Operaciones / Procedimientos",
    type: "Documento",
    updated: "Hace 12 min",
    icon: FileText,
    color: "#2869e8",
    bg: "#edf3ff",
  },
  {
    title: "Manual de atención al cliente",
    location: "Customer Service",
    type: "Documento",
    updated: "Hace 1 h",
    icon: BookOpen,
    color: "#8b5cf6",
    bg: "#f4efff",
  },
  {
    title: "Políticas internas",
    location: "Recursos Humanos",
    type: "Carpeta",
    updated: "Ayer",
    icon: FolderOpen,
    color: "#18a66a",
    bg: "#eafaf2",
  },
];

const activity = [
  {
    text: "Ana actualizó",
    strong: "Procedimiento de incidencias",
    time: "10:42",
    icon: FileText,
    color: "#2869e8",
    bg: "#edf3ff",
  },
  {
    text: "CRS AI procesó",
    strong: "Manual técnico v3.pdf",
    time: "09:18",
    icon: Sparkles,
    color: "#8b5cf6",
    bg: "#f4efff",
  },
  {
    text: "Carlos creó",
    strong: "Formación nuevos empleados",
    time: "Ayer",
    icon: FolderOpen,
    color: "#18a66a",
    bg: "#eafaf2",
  },
  {
    text: "Lucía consultó",
    strong: "Política de gastos",
    time: "Ayer",
    icon: MessageSquareText,
    color: "#ef9c3c",
    bg: "#fff5e9",
  },
];

const quickActions = [
  {
    title: "Subir documento",
    description: "Añade conocimiento al workspace",
    icon: Plus,
    color: "#2869e8",
    bg: "#edf3ff",
  },
  {
    title: "Preguntar a CRS AI",
    description: "Consulta todo el conocimiento",
    icon: Sparkles,
    color: "#8b5cf6",
    bg: "#f4efff",
  },
  {
    title: "Crear carpeta",
    description: "Organiza la documentación",
    icon: FolderOpen,
    color: "#18a66a",
    bg: "#eafaf2",
  },
];

export default function TestHomePage() {
  return (
    <div
      className="min-h-screen font-sans text-[#202b42]"
      style={{
        background:
          "radial-gradient(ellipse 65% 55% at 5% 0%, #eaf0ff 0%, transparent 75%), radial-gradient(ellipse 55% 50% at 100% 5%, #eaf3ff 0%, transparent 75%), radial-gradient(ellipse 60% 50% at 50% 100%, #f0efff 0%, transparent 75%), #f7f9ff",
      }}
    >
      <div className="mx-auto max-w-[1600px] px-6 py-7 2xl:px-9">
        {/* TOP BAR */}

        <header className="mb-10 flex items-center gap-5">
          <div>
            <p className="text-[12px] font-medium text-[#8290a7]">
              Miércoles, 24 de septiembre
            </p>

            <h1 className="mt-1 text-[28px] font-semibold tracking-[-1px] text-[#17233d]">
              Buenos días, Miguel
            </h1>
          </div>

          <div className="ml-auto hidden w-full max-w-[420px] md:block">
            <div className="flex h-11 items-center gap-3 rounded-[15px] border border-white bg-white/75 px-4 shadow-[0_5px_20px_rgba(40,80,150,0.035)] backdrop-blur-xl">
              <Search size={17} className="text-slate-400" />

              <input
                placeholder="Buscar en CRS LAB..."
                className="min-w-0 flex-1 bg-transparent text-[12px] outline-none placeholder:text-slate-400"
              />
            </div>
          </div>
        </header>

        {/* HERO */}

        <section className="relative mb-6 overflow-hidden rounded-[28px] border border-white/90 bg-white/80 p-7 shadow-[0_12px_45px_rgba(50,85,155,0.05)] backdrop-blur-xl lg:p-9">
          <div
            className="pointer-events-none absolute -right-28 -top-36 h-[360px] w-[360px] rounded-full opacity-70 blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(92,140,255,.24), transparent 68%)",
            }}
          />

          <div
            className="pointer-events-none absolute bottom-[-180px] left-[25%] h-[330px] w-[330px] rounded-full blur-3xl"
            style={{
              background:
                "radial-gradient(circle, rgba(156,112,255,.13), transparent 68%)",
            }}
          />

          <div className="relative z-10 grid gap-8 lg:grid-cols-[1fr_360px] lg:items-center">
            <div>
              <div className="mb-5 inline-flex items-center gap-2 rounded-full border border-[#dce7ff] bg-[#edf3ff] px-3 py-1.5 text-[11px] font-medium text-[#2869e8]">
                <Sparkles size={13} />
                CRS AI
              </div>

              <h2 className="max-w-[650px] text-[29px] font-semibold leading-[1.2] tracking-[-1.1px] text-[#17233d] lg:text-[34px]">
                El conocimiento de tu empresa,
                <br />
                listo para trabajar contigo.
              </h2>

              <p className="mt-4 max-w-[620px] text-[13px] leading-6 text-[#74839b]">
                Consulta procedimientos, encuentra información y continúa
                trabajando desde el punto exacto donde lo dejaste.
              </p>

              <div className="mt-7 flex flex-wrap gap-3">
                <button className="flex h-11 items-center gap-2 rounded-[13px] bg-gradient-to-r from-[#2869e8] to-[#5488ee] px-5 text-[12px] font-medium text-white shadow-[0_6px_16px_rgba(40,105,232,0.20)]">
                  <Sparkles size={16} />
                  Preguntar a CRS AI
                </button>

                <button className="flex h-11 items-center gap-2 rounded-[13px] border border-[#e4eaf5] bg-white/80 px-5 text-[12px] font-medium text-[#526078]">
                  <Plus size={16} />
                  Añadir contenido
                </button>
              </div>
            </div>

            {/* AI PROMPT */}

            <div className="rounded-[22px] border border-white bg-white/70 p-5 shadow-[0_10px_35px_rgba(48,82,145,0.06)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-[13px] bg-gradient-to-br from-[#edf3ff] to-[#e4eaff] text-[#2869e8]">
                  <Bot size={19} />
                </div>

                <div>
                  <div className="text-[12px] font-semibold">
                    ¿Qué necesitas saber?
                  </div>
                  <div className="mt-0.5 text-[10px] text-slate-400">
                    Pregunta sobre tu organización
                  </div>
                </div>
              </div>

              <div className="mt-5 rounded-[14px] border border-[#e9edf6] bg-white px-4 py-3">
                <div className="flex gap-3">
                  <input
                    placeholder="Ej. ¿Cómo gestiono una incidencia...?"
                    className="min-w-0 flex-1 bg-transparent text-[11px] outline-none placeholder:text-slate-400"
                  />

                  <button className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[9px] bg-[#2869e8] text-white">
                    <ArrowRight size={15} />
                  </button>
                </div>
              </div>

              <div className="mt-4 flex flex-wrap gap-2">
                {[
                  "Política de gastos",
                  "Incidencias",
                  "Vacaciones",
                ].map((item) => (
                  <button
                    key={item}
                    className="rounded-full bg-[#f3f6fc] px-3 py-1.5 text-[9px] text-[#718096]"
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* STATS */}

        <div className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
          {[
            {
              label: "Documentos",
              value: "1,248",
              info: "+18 este mes",
              icon: FileText,
              color: "#2869e8",
              bg: "#edf3ff",
            },
            {
              label: "Consultas IA",
              value: "4.2K",
              info: "+22% este mes",
              icon: Sparkles,
              color: "#8b5cf6",
              bg: "#f4efff",
            },
            {
              label: "Miembros",
              value: "38",
              info: "34 activos",
              icon: Users,
              color: "#18a66a",
              bg: "#eafaf2",
            },
            {
              label: "Conocimiento activo",
              value: "92%",
              info: "Estado saludable",
              icon: TrendingUp,
              color: "#ef9c3c",
              bg: "#fff5e9",
            },
          ].map((item) => {
            const Icon = item.icon;

            return (
              <div
                key={item.label}
                className="rounded-[21px] border border-white bg-white/80 p-5 shadow-[0_8px_30px_rgba(50,85,155,0.035)] backdrop-blur-xl"
              >
                <div className="flex items-start justify-between">
                  <div
                    className="flex h-10 w-10 items-center justify-center rounded-[13px]"
                    style={{
                      background: item.bg,
                      color: item.color,
                    }}
                  >
                    <Icon size={18} />
                  </div>

                  <MoreHorizontal size={17} className="text-slate-300" />
                </div>

                <div className="mt-5 text-[25px] font-semibold tracking-[-1px] text-[#17233d]">
                  {item.value}
                </div>

                <div className="mt-1 text-[11px] font-medium text-[#536178]">
                  {item.label}
                </div>

                <div className="mt-2 text-[10px] text-slate-400">
                  {item.info}
                </div>
              </div>
            );
          })}
        </div>

        {/* MAIN CONTENT */}

        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
          <div className="space-y-6">
            {/* CONTINUE WORKING */}

            <section className="rounded-[24px] border border-white bg-white/80 p-6 shadow-[0_10px_40px_rgba(50,85,155,0.035)] backdrop-blur-xl">
              <div className="mb-6 flex items-center justify-between">
                <div>
                  <h2 className="text-[15px] font-semibold tracking-[-0.3px]">
                    Continuar trabajando
                  </h2>

                  <p className="mt-1 text-[10px] text-slate-400">
                    Accede rápidamente a tu actividad reciente
                  </p>
                </div>

                <button className="flex items-center gap-1 text-[10px] font-medium text-[#2869e8]">
                  Ver todo
                  <ArrowRight size={12} />
                </button>
              </div>

              <div className="grid gap-3 lg:grid-cols-3">
                {recentItems.map((item) => {
                  const Icon = item.icon;

                  return (
                    <button
                      key={item.title}
                      className="group rounded-[17px] border border-[#edf1f7] bg-white/70 p-4 text-left transition hover:-translate-y-0.5 hover:border-[#dce6fb] hover:shadow-[0_8px_20px_rgba(50,85,155,0.06)]"
                    >
                      <div className="flex items-start justify-between">
                        <div
                          className="flex h-10 w-10 items-center justify-center rounded-[12px]"
                          style={{
                            background: item.bg,
                            color: item.color,
                          }}
                        >
                          <Icon size={18} />
                        </div>

                        <MoreHorizontal
                          size={16}
                          className="text-slate-300"
                        />
                      </div>

                      <div className="mt-5 line-clamp-2 text-[11px] font-semibold leading-5 text-[#344158]">
                        {item.title}
                      </div>

                      <div className="mt-1 truncate text-[9px] text-slate-400">
                        {item.location}
                      </div>

                      <div className="mt-5 flex items-center justify-between border-t border-[#f0f2f7] pt-3">
                        <span className="text-[9px] text-slate-400">
                          {item.type}
                        </span>

                        <span className="flex items-center gap-1 text-[9px] text-slate-400">
                          <Clock3 size={10} />
                          {item.updated}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </section>

            {/* AI INSIGHT */}

            <section className="relative overflow-hidden rounded-[24px] border border-[#dce7ff] bg-gradient-to-br from-[#edf3ff] via-[#f5f7ff] to-white p-6 shadow-[0_10px_35px_rgba(60,90,160,0.04)]">
              <div
                className="absolute -right-16 -top-20 h-52 w-52 rounded-full blur-3xl"
                style={{
                  background: "rgba(77,126,238,.13)",
                }}
              />

              <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[15px] bg-white text-[#2869e8] shadow-sm">
                  <Sparkles size={21} />
                </div>

                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2">
                    <span className="text-[12px] font-semibold">
                      CRS AI ha encontrado algo
                    </span>

                    <span className="rounded-full bg-[#dce8ff] px-2 py-1 text-[8px] font-semibold uppercase tracking-wide text-[#2869e8]">
                      Insight
                    </span>
                  </div>

                  <p className="max-w-[700px] text-[11px] leading-5 text-[#718096]">
                    Se están realizando varias consultas sobre el procedimiento
                    de devolución de material, pero la documentación disponible
                    no parece cubrir todos los casos.
                  </p>
                </div>

                <button className="flex h-9 shrink-0 items-center gap-2 rounded-[11px] border border-[#dce6fa] bg-white px-4 text-[10px] font-medium text-[#2869e8]">
                  Revisar
                  <ArrowRight size={12} />
                </button>
              </div>
            </section>
          </div>

          {/* RIGHT COLUMN */}

          <aside className="space-y-6">
            {/* QUICK ACTIONS */}

            <section className="rounded-[24px] border border-white bg-white/80 p-5 shadow-[0_10px_40px_rgba(50,85,155,0.035)] backdrop-blur-xl">
              <h2 className="text-[13px] font-semibold">Acciones rápidas</h2>

              <div className="mt-5 space-y-2">
                {quickActions.map((action) => {
                  const Icon = action.icon;

                  return (
                    <button
                      key={action.title}
                      className="flex w-full items-center gap-3 rounded-[14px] p-3 text-left transition hover:bg-[#f7f9fe]"
                    >
                      <div
                        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[11px]"
                        style={{
                          background: action.bg,
                          color: action.color,
                        }}
                      >
                        <Icon size={16} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <div className="text-[10px] font-semibold">
                          {action.title}
                        </div>

                        <div className="mt-1 text-[9px] text-slate-400">
                          {action.description}
                        </div>
                      </div>

                      <ArrowRight size={13} className="text-slate-300" />
                    </button>
                  );
                })}
              </div>
            </section>

            {/* ACTIVITY */}

            <section className="rounded-[24px] border border-white bg-white/80 p-5 shadow-[0_10px_40px_rgba(50,85,155,0.035)] backdrop-blur-xl">
              <div className="flex items-center justify-between">
                <h2 className="text-[13px] font-semibold">
                  Actividad reciente
                </h2>

                <button className="text-[9px] font-medium text-[#2869e8]">
                  Ver todo
                </button>
              </div>

              <div className="mt-5 space-y-5">
                {activity.map((item) => {
                  const Icon = item.icon;

                  return (
                    <div key={item.strong} className="flex gap-3">
                      <div
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[10px]"
                        style={{
                          background: item.bg,
                          color: item.color,
                        }}
                      >
                        <Icon size={14} />
                      </div>

                      <div className="min-w-0 flex-1">
                        <p className="text-[9px] leading-4 text-slate-500">
                          {item.text}{" "}
                          <span className="font-medium text-[#344158]">
                            {item.strong}
                          </span>
                        </p>

                        <span className="mt-1 block text-[8px] text-slate-400">
                          {item.time}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            {/* SYSTEM STATUS */}

            <section className="rounded-[24px] border border-white bg-white/80 p-5 shadow-[0_10px_40px_rgba(50,85,155,0.035)] backdrop-blur-xl">
              <div className="flex items-center gap-3">
                <div className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-[#eafaf2] text-[#18a66a]">
                  <CheckCircle2 size={17} />
                </div>

                <div>
                  <div className="text-[10px] font-semibold">
                    Todo funcionando
                  </div>
                  <div className="mt-1 text-[9px] text-slate-400">
                    CRS AI y procesamiento disponibles
                  </div>
                </div>
              </div>
            </section>
          </aside>
        </div>
      </div>
    </div>
  );
}