"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Bell,
  Check,
  ChevronRight,
  CircleHelp,
  House,
  LayoutGrid,
  Menu,
  MousePointer2,
  Search,
  SlidersHorizontal,
  Type,
  X,
} from "lucide-react";

import { ActionBar } from "@/components/platform/action-bar";
import { AdaptiveSelect } from "@/components/platform/adaptive-select";
import { MobileAppHeader } from "@/components/platform/mobile-app-header";
import { AppNotificationButton } from "@/components/platform/notification-button";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { SearchInput } from "@/components/ui/search-input";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { TableToolbar, type ToolbarSort, type ToolbarViewMode } from "@/components/ui/table-toolbar";
import { Textarea } from "@/components/ui/textarea";

type SectionId = "inicio" | "inputs" | "botones" | "toolbars";
type SecondaryScreen = "detalle" | "avisos" | null;

const SECTIONS = [
  { id: "inicio", label: "Inicio", icon: House, description: "La estructura común de la app" },
  { id: "inputs", label: "Inputs", icon: Type, description: "Campos, selectores y estados" },
  { id: "botones", label: "Botones", icon: MousePointer2, description: "Acciones y confirmaciones" },
  { id: "toolbars", label: "Toolbars", icon: SlidersHorizontal, description: "Buscar, filtrar, ordenar y agrupar" },
] as const;

const CATEGORY_OPTIONS = [
  { value: "alimentacion", label: "Alimentación" },
  { value: "compras", label: "Compras" },
  { value: "educacion", label: "Educación" },
  { value: "hogar", label: "Hogar" },
  { value: "ocio", label: "Ocio" },
  { value: "salud", label: "Salud" },
  { value: "servicios", label: "Servicios" },
  { value: "suscripciones", label: "Suscripciones" },
  { value: "transporte", label: "Transporte" },
  { value: "viajes", label: "Viajes" },
  { value: "videojuegos", label: "Videojuegos" },
];

const PERIOD_OPTIONS = [
  { value: "puntual", label: "Puntual" },
  { value: "semanal", label: "Semanal" },
  { value: "mensual", label: "Mensual" },
  { value: "anual", label: "Anual" },
];

type ExampleRow = { id: string; name: string; type: "ingreso" | "gasto"; category: string; amount: number };

const EXAMPLE_ROWS: ExampleRow[] = [
  { id: "1", name: "Nómina", type: "ingreso", category: "Ingresos", amount: 2600 },
  { id: "2", name: "Supermercado", type: "gasto", category: "Alimentación", amount: 85.4 },
  { id: "3", name: "Alquiler", type: "gasto", category: "Hogar", amount: 750 },
  { id: "4", name: "Reembolso", type: "ingreso", category: "Ingresos", amount: 42.9 },
  { id: "5", name: "Videojuegos", type: "gasto", category: "Videojuegos", amount: 34.99 },
];

const euros = (value: number) =>
  new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR" }).format(value);

function DemoCard({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="min-w-0 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
      <h2 className="text-[16px] font-semibold text-slate-950">{title}</h2>
      {description && <p className="mt-1 text-sm leading-6 text-slate-500">{description}</p>}
      <div className="mt-5 min-w-0">{children}</div>
    </section>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <div className="min-w-0 space-y-2">
      <p className="text-sm font-medium text-slate-700">{label}</p>
      {children}
      {hint && <p className="text-xs text-slate-400">{hint}</p>}
    </div>
  );
}

export default function TradingComponentsPage() {
  const [section, setSection] = useState<SectionId>("inicio");
  const [screen, setScreen] = useState<SecondaryScreen>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [notes, setNotes] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [period, setPeriod] = useState<string | null>("mensual");
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [quickSearch, setQuickSearch] = useState("");
  const [draft, setDraft] = useState("Ejemplo de operación");
  const [savedDraft, setSavedDraft] = useState(draft);
  const [feedback, setFeedback] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("all");
  const [sort, setSort] = useState<ToolbarSort>({ key: "name", dir: 1 });
  const [group, setGroup] = useState("none");
  const [view, setView] = useState<ToolbarViewMode>("list");
  const [selectedRow, setSelectedRow] = useState<ExampleRow | null>(null);

  const visibleRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("es");
    const rows = EXAMPLE_ROWS.filter((row) =>
      (typeFilter === "all" || row.type === typeFilter) &&
      `${row.name} ${row.category}`.toLocaleLowerCase("es").includes(query),
    );
    if (sort) {
      rows.sort((a, b) => {
        const comparison = sort.key === "amount" ? a.amount - b.amount : a.name.localeCompare(b.name, "es");
        return comparison * sort.dir;
      });
    }
    return rows;
  }, [search, typeFilter, sort]);

  const groups = group === "type"
    ? (["ingreso", "gasto"] as const).map((type) => ({
        title: type === "ingreso" ? "Ingresos" : "Gastos",
        rows: visibleRows.filter((row) => row.type === type),
      })).filter((entry) => entry.rows.length > 0)
    : [{ title: "", rows: visibleRows }];

  const current = SECTIONS.find((item) => item.id === section) ?? SECTIONS[0];
  const title = screen === "avisos" ? "Notificaciones" : screen === "detalle" ? "Detalle" : current.label;

  function navigate(next: SectionId) {
    setSection(next);
    setScreen(null);
    setMenuOpen(false);
    setFeedback("");
  }

  function openRow(row?: ExampleRow) {
    setSelectedRow(row ?? null);
    setScreen("detalle");
  }

  function notificationButton() {
    return <AppNotificationButton unread={0} onClick={() => setScreen("avisos")} />;
  }

  return (
    <div className="flex h-dvh min-h-0 w-full overflow-hidden bg-[#F8FAFC] text-slate-900">
      <aside className="hidden w-64 shrink-0 flex-col border-r border-slate-200 bg-white px-4 py-6 md:flex">
        <Link href="/apps" className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-semibold text-slate-900 hover:bg-slate-50">
          <ArrowLeft className="size-4 text-slate-500" /> CRS
        </Link>
        <div className="mt-9 px-3">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0A58FF]">Trading</p>
          <p className="mt-1 text-lg font-semibold">Componentes</p>
          <p className="mt-1 text-xs leading-5 text-slate-400">Laboratorio visual compartido</p>
        </div>
        <nav aria-label="Componentes" className="mt-7 space-y-1">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => navigate(item.id)}
                aria-current={section === item.id && !screen ? "page" : undefined}
                className={`flex h-11 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium transition-colors ${section === item.id && !screen ? "bg-blue-50 text-[#0A58FF]" : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"}`}
              >
                <Icon className="size-5" /> {item.label}
              </button>
            );
          })}
        </nav>
        <p className="mt-auto px-3 text-xs leading-5 text-slate-400">Vista de estructura · Sin datos ni autenticación</p>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <MobileAppHeader
          title={title}
          primary={!screen}
          onMenuClick={() => setMenuOpen(true)}
          onBackClick={() => setScreen(null)}
          right={notificationButton()}
        />
        <header className="hidden h-20 shrink-0 grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-3 border-b border-slate-200 bg-white px-6 md:grid lg:px-10">
          <button
            type="button"
            onClick={() => screen ? setScreen(null) : setMenuOpen(true)}
            aria-label={screen ? "Volver" : "Abrir menú"}
            className="flex size-11 items-center justify-center rounded-xl text-slate-600 hover:bg-slate-50"
          >
            {screen ? <ArrowLeft className="size-5" /> : <Menu className="size-5" />}
          </button>
          <h1 className="truncate text-center text-xl font-semibold tracking-tight">{title}</h1>
          {notificationButton()}
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-6 sm:px-6 md:pb-10 md:pt-8 lg:px-10">
          <div className="mx-auto max-w-5xl space-y-6">
            {screen === "avisos" ? (
              <DemoCard title="Notificaciones" description="Pantalla secundaria con flecha atrás y título centrado.">
                <div className="flex flex-col items-center gap-3 py-10 text-center">
                  <span className="flex size-14 items-center justify-center rounded-2xl bg-blue-50 text-[#0A58FF]"><Bell className="size-6" /></span>
                  <p className="font-medium">Todo al día</p>
                  <p className="text-sm text-slate-400">Los avisos reales se conectarán cuando migremos cada módulo.</p>
                </div>
              </DemoCard>
            ) : screen === "detalle" ? (
              <DemoCard title={selectedRow?.name ?? "Pantalla secundaria"} description="Ejemplo del patrón de navegación para fichas y detalles.">
                <div className="space-y-3 rounded-xl bg-slate-50 p-4 text-sm">
                  <p><span className="text-slate-500">Sección:</span> Trading</p>
                  <p><span className="text-slate-500">Elemento:</span> {selectedRow?.category ?? "Ejemplo visual"}</p>
                  {selectedRow && <p><span className="text-slate-500">Importe:</span> {euros(selectedRow.amount)}</p>}
                </div>
                <div className="mt-5"><Button type="button" variant="outline" className="h-10 rounded-xl" onClick={() => setScreen(null)}>Volver</Button></div>
              </DemoCard>
            ) : section === "inicio" ? (
              <>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[#0A58FF]">CRS · Trading</p>
                  <h2 className="mt-2 text-2xl font-semibold tracking-tight sm:text-3xl">Biblioteca de componentes</h2>
                  <p className="mt-3 max-w-2xl text-sm leading-6 text-slate-500">Este interior es una maqueta interactiva. Las mismas piezas se reutilizarán en todos los módulos, sin duplicar estilos ni lógica.</p>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {SECTIONS.filter((item) => item.id !== "inicio").map((item) => {
                    const Icon = item.icon;
                    return (
                      <button key={item.id} type="button" onClick={() => navigate(item.id)} className="group rounded-2xl border border-slate-200 bg-white p-5 text-left shadow-sm transition-colors hover:border-blue-200 hover:bg-blue-50/30">
                        <span className="flex size-11 items-center justify-center rounded-xl bg-blue-50 text-[#0A58FF]"><Icon className="size-5" /></span>
                        <span className="mt-5 flex items-center justify-between font-semibold">{item.label}<ChevronRight className="size-4 text-slate-400 group-hover:text-[#0A58FF]" /></span>
                        <span className="mt-1 block text-sm leading-5 text-slate-500">{item.description}</span>
                      </button>
                    );
                  })}
                </div>
                <DemoCard title="Cabecera unificada" description="En la pantalla principal: menú, título centrado y notificaciones. En las secundarias: volver, título y notificaciones.">
                  <div className="overflow-hidden rounded-2xl border border-slate-200">
                    <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center gap-2 bg-white px-2">
                      <Menu className="mx-auto size-5 text-slate-600" /><span className="text-center font-semibold">Trading</span><Bell className="mx-auto size-5 text-slate-600" />
                    </div>
                    <div className="grid h-14 grid-cols-[44px_1fr_44px] items-center gap-2 border-t border-slate-100 bg-slate-50 px-2">
                      <ArrowLeft className="mx-auto size-5 text-slate-600" /><span className="text-center font-semibold">Detalle de agente</span><Bell className="mx-auto size-5 text-slate-600" />
                    </div>
                  </div>
                  <Button type="button" variant="outline" className="mt-4 h-10 rounded-xl" onClick={() => openRow()}>Probar pantalla secundaria <ChevronRight className="size-4" /></Button>
                </DemoCard>
              </>
            ) : section === "inputs" ? (
              <>
                <div><h2 className="text-2xl font-semibold tracking-tight">Inputs</h2><p className="mt-2 text-sm text-slate-500">Campos y listas desplegables reutilizables, con sus diferentes estados.</p></div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <DemoCard title="Campos de texto" description="Altura táctil cómoda, ayuda y validación.">
                    <div className="space-y-5">
                      <Field label="Nombre"><Input className="h-11 rounded-xl bg-white" placeholder="Escribe un nombre" value={name} onChange={(event) => setName(event.target.value)} /></Field>
                      <Field label="Correo electrónico" hint={email && !email.includes("@") ? "Introduce una dirección válida." : "Ejemplo de validación del campo."}>
                        <Input type="email" aria-invalid={Boolean(email && !email.includes("@"))} className="h-11 rounded-xl bg-white" placeholder="nombre@empresa.com" value={email} onChange={(event) => setEmail(event.target.value)} />
                      </Field>
                      <Field label="Observaciones"><Textarea className="min-h-28 rounded-xl bg-white" placeholder="Añade una descripción…" value={notes} onChange={(event) => setNotes(event.target.value)} /></Field>
                    </div>
                  </DemoCard>
                  <DemoCard title="Listas desplegables" description="En móvil se abre una hoja desde abajo; en escritorio, una lista flotante.">
                    <div className="space-y-5">
                      <Field label="Categoría (con búsqueda)"><AdaptiveSelect label="Categoría" value={category} options={CATEGORY_OPTIONS} onChange={setCategory} searchable placeholder="Selecciona una categoría" /></Field>
                      <Field label="Periodicidad"><AdaptiveSelect label="Periodicidad" value={period} options={PERIOD_OPTIONS} onChange={setPeriod} /></Field>
                      <Field label="Selector deshabilitado"><AdaptiveSelect label="Selector deshabilitado" value={null} options={PERIOD_OPTIONS} onChange={() => undefined} disabled placeholder="No disponible" /></Field>
                    </div>
                  </DemoCard>
                  <DemoCard title="Búsqueda y selección" description="Buscador con limpieza rápida y control de selección.">
                    <div className="space-y-5">
                      <Field label="Buscar"><SearchInput value={quickSearch} onChange={setQuickSearch} placeholder="Buscar elementos…" /></Field>
                      <label className="flex items-center gap-3 text-sm text-slate-700">
                        <Checkbox checked={notificationsEnabled} onCheckedChange={(next) => setNotificationsEnabled(next === true)} />
                        Recibir notificaciones
                      </label>
                    </div>
                  </DemoCard>
                  <DemoCard title="Estado inactivo" description="Un campo muteado mantiene su estructura pero no permite edición.">
                    <Field label="Referencia bloqueada"><Input disabled value="Referencia automática" className="h-11 rounded-xl bg-slate-50" readOnly /></Field>
                  </DemoCard>
                </div>
              </>
            ) : section === "botones" ? (
              <>
                <div><h2 className="text-2xl font-semibold tracking-tight">Botones</h2><p className="mt-2 text-sm text-slate-500">Jerarquía de acciones, estados y pies de formulario.</p></div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <DemoCard title="Acciones" description="Confirmar, cancelar, acción secundaria y acción destructiva.">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="corporate" className="h-11 rounded-xl" onClick={() => setFeedback("Acción confirmada (demo)")}><Check className="size-4" />Confirmar</Button>
                      <Button type="button" variant="outline" className="h-11 rounded-xl" onClick={() => setFeedback("Acción cancelada (demo)")}>Cancelar</Button>
                      <Button type="button" variant="secondary" className="h-11 rounded-xl" onClick={() => setFeedback("Acción secundaria (demo)")}>Secundario</Button>
                      <Button type="button" variant="ghost" className="h-11 rounded-xl" onClick={() => setFeedback("Acción discreta (demo)")}>Muteado</Button>
                      <Button type="button" variant="destructive" className="h-11 rounded-xl" onClick={() => setFeedback("Acción destructiva simulada")}>Quitar</Button>
                    </div>
                    {feedback && <p role="status" className="mt-4 rounded-xl bg-blue-50 px-3 py-2 text-sm text-blue-700">{feedback}</p>}
                  </DemoCard>
                  <DemoCard title="Estados" description="Deshabilitado, guardando y botón de icono.">
                    <div className="flex flex-wrap items-center gap-3">
                      <Button type="button" variant="corporate" disabled className="h-11 rounded-xl">Guardar</Button>
                      <Button type="button" variant="corporate" disabled className="h-11 rounded-xl"><span className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />Guardando</Button>
                      <Button type="button" variant="outline" size="icon-lg" className="h-11 w-11 rounded-xl" aria-label="Ayuda" onClick={() => setFeedback("Botón de ayuda (demo)")}><CircleHelp className="size-5" /></Button>
                    </div>
                  </DemoCard>
                  <div className="lg:col-span-2">
                    <DemoCard title="Pie de formulario" description="Guardar comienza deshabilitado, se activa al modificar el contenido y vuelve a deshabilitarse al guardarlo.">
                      <div className="max-w-xl space-y-5">
                        <Field label="Nombre del elemento"><Input className="h-11 rounded-xl bg-white" value={draft} onChange={(event) => setDraft(event.target.value)} /></Field>
                        <ActionBar
                          disabled={draft === savedDraft || !draft.trim()}
                          onCancel={() => { setDraft(savedDraft); setFeedback("Cambios descartados"); }}
                          onConfirm={() => { setSavedDraft(draft); setFeedback("Guardado en memoria (solo demostración)"); }}
                        />
                        {feedback && <p role="status" className="text-xs text-slate-500">{feedback}</p>}
                      </div>
                    </DemoCard>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div><h2 className="text-2xl font-semibold tracking-tight">Toolbars</h2><p className="mt-2 text-sm text-slate-500">El mismo componente de búsqueda, filtros, agrupación y orden utilizado en Trading.</p></div>
                <DemoCard title="Lista interactiva" description="Datos ficticios para probar el comportamiento de la barra.">
                  <TableToolbar
                    search={search}
                    onSearchChange={setSearch}
                    searchPlaceholder="Buscar movimientos…"
                    filters={{
                      groups: [{ key: "type", label: "Tipo", value: typeFilter, allLabel: "Todos", options: [{ value: "ingreso", label: "Ingresos" }, { value: "gasto", label: "Gastos" }] }],
                      onChange: (_key, value) => setTypeFilter(value),
                      onClear: () => setTypeFilter("all"),
                    }}
                    sort={{
                      value: sort,
                      options: [
                        { label: "Nombre A-Z", value: { key: "name", dir: 1 } },
                        { label: "Nombre Z-A", value: { key: "name", dir: -1 } },
                        { label: "Mayor importe", value: { key: "amount", dir: -1 } },
                        { label: "Menor importe", value: { key: "amount", dir: 1 } },
                      ],
                      onChange: setSort,
                      textKeys: ["name"],
                    }}
                    group={{
                      value: group,
                      options: [{ value: "none", label: "Sin agrupar" }, { value: "type", label: "Tipo" }],
                      onChange: setGroup,
                    }}
                    view={{ value: view, onChange: setView }}
                  />
                  <p className="mt-5 text-xs font-medium text-slate-400">{visibleRows.length} movimientos de ejemplo</p>
                  {visibleRows.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-slate-400"><Search className="size-6" /><span className="text-sm">Sin resultados</span></div>
                  ) : (
                    <div className="mt-3 space-y-5">
                      {groups.map((entry) => (
                        <div key={entry.title || "all"}>
                          {entry.title && <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-400">{entry.title}</h3>}
                          <div className={view === "grid" ? "grid gap-2 sm:grid-cols-2" : "overflow-hidden rounded-xl border border-slate-100"}>
                            {entry.rows.map((row) => (
                              <button
                                key={row.id}
                                type="button"
                                onClick={() => openRow(row)}
                                className={`flex min-w-0 items-center gap-3 bg-white px-3 py-3 text-left transition-colors hover:bg-slate-50 ${view === "grid" ? "rounded-xl border border-slate-200" : "w-full border-b border-slate-100 last:border-0"}`}
                              >
                                <span className={`flex size-9 shrink-0 items-center justify-center rounded-xl ${row.type === "ingreso" ? "bg-emerald-50 text-emerald-600" : "bg-slate-100 text-slate-500"}`}>
                                  {row.type === "ingreso" ? "+" : "−"}
                                </span>
                                <span className="min-w-0 flex-1"><span className="block truncate text-sm font-medium">{row.name}</span><span className="text-xs text-slate-400">{row.category}</span></span>
                                <span className={`whitespace-nowrap text-sm font-semibold ${row.type === "ingreso" ? "text-emerald-600" : "text-slate-900"}`}>{row.type === "ingreso" ? "+" : "−"}{euros(row.amount)}</span>
                                <ChevronRight className="size-4 shrink-0 text-slate-300" />
                              </button>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </DemoCard>
                <div className="rounded-xl border border-blue-100 bg-blue-50 p-4 text-sm leading-6 text-blue-800">Los filtros son reales dentro de esta maqueta. Ninguna operación consulta ni modifica una base de datos.</div>
              </>
            )}
          </div>
        </main>
      </div>

      {!screen && (
        <nav aria-label="Secciones del laboratorio" className="fixed inset-x-0 bottom-0 z-40 flex border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden">
          {SECTIONS.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" onClick={() => navigate(item.id)} aria-current={section === item.id ? "page" : undefined} aria-label={item.label} className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-1 ${section === item.id ? "text-[#0A58FF]" : "text-slate-400"}`}>
                <Icon className="size-[22px]" strokeWidth={section === item.id ? 2.4 : 2} />
                <span className="text-[10px] font-medium">{item.label}</span>
              </button>
            );
          })}
        </nav>
      )}

      <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
        <SheetContent side="left" showCloseButton={false} className="gap-0 p-0 data-[side=left]:w-full data-[side=left]:sm:max-w-sm">
          <div className="flex h-16 shrink-0 items-center justify-between border-b border-slate-100 px-5">
            <SheetTitle className="font-semibold">CRS · Trading</SheetTitle>
            <button type="button" onClick={() => setMenuOpen(false)} aria-label="Cerrar menú" className="flex size-10 items-center justify-center rounded-xl text-slate-500"><X className="size-5" /></button>
          </div>
          <nav aria-label="Menú del laboratorio" className="min-h-0 flex-1 space-y-1 overflow-y-auto p-4">
            {SECTIONS.map((item) => {
              const Icon = item.icon;
              return <button key={item.id} type="button" onClick={() => navigate(item.id)} className={`flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm ${section === item.id && !screen ? "bg-blue-50 font-semibold text-[#0A58FF]" : "text-slate-700"}`}><Icon className="size-5" />{item.label}</button>;
            })}
          </nav>
          <Link href="/apps" className="flex h-14 items-center gap-3 border-t border-slate-100 px-6 text-sm text-slate-500"><LayoutGrid className="size-5" />Todas las aplicaciones</Link>
        </SheetContent>
      </Sheet>
    </div>
  );
}
