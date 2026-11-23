"use client";
// Laboratorio · selector de categorías con el árbol nuevo (borrador aprobado el 23/11/2026). Mockup: no toca la
// clasificación real. Familias = solo ayuda para orientarse; cada categoría lleva una pista de lo que entra.
// «Sugeridas» arriba: lo que encaja con el comercio del movimiento de ejemplo.
import { useMemo, useState } from "react";
import type { CSSProperties, ComponentType, ReactNode } from "react";
import {
  ArrowDownLeft, ArrowLeftRight, Baby, Banknote, Beer, Bike, BookOpen, Briefcase, Bus, Car, Check, Droplets, Dumbbell, Flame,
  Fuel, Gamepad2, Gift, GraduationCap, HandCoins, HandHeart, HeartPulse, Home, Hotel, Landmark, Laptop, Lightbulb, Music,
  PaintBucket, ParkingCircle, PawPrint, Percent, PiggyBank, Pill, Receipt, Repeat, RotateCcw, Scissors, Search, Shield,
  ShieldCheck, Shirt, ShoppingBag, ShoppingCart, Smartphone, Sofa, Stethoscope, TrendingUp, UtensilsCrossed, Wallet, Wifi, Wrench,
} from "lucide-react";

type Icon = ComponentType<{ className?: string; style?: CSSProperties; strokeWidth?: number }>;
type Cat = { key: string; label: string; hint: string; icon: Icon; words?: string[] };
type Family = { key: string; label: string; color: string; cats: Cat[] };
type Tab = "gasto" | "ingreso" | "no_computable";

const TREE: Record<Tab, Family[]> = {
  gasto: [
    { key: "casa", label: "Casa", color: "#2563eb", cats: [
      { key: "alquiler_hipoteca", label: "Alquiler o hipoteca", hint: "Cuota de tu vivienda, garaje o trastero.", icon: Home },
      { key: "comunidad", label: "Comunidad", hint: "Cuota de la comunidad de vecinos.", icon: Landmark },
      { key: "seguro_hogar", label: "Seguro del hogar", hint: "Multirriesgo, alarma…", icon: ShieldCheck, words: ["mapfre", "allianz"] },
      { key: "mantenimiento_hogar", label: "Mantenimiento del hogar", hint: "Fontanero, electricista, reformas, jardín…", icon: Wrench, words: ["leroy", "bricomart", "bauhaus"] },
      { key: "muebles_decoracion", label: "Muebles y decoración", hint: "Ikea, menaje, textil del hogar…", icon: Sofa, words: ["ikea", "zara home", "maisons"] },
    ] },
    { key: "suministros", label: "Suministros", color: "#0d9488", cats: [
      { key: "luz", label: "Luz", hint: "Factura de la electricidad.", icon: Lightbulb, words: ["iberdrola", "endesa", "naturgy", "holaluz"] },
      { key: "gas", label: "Gas", hint: "Gas natural, butano…", icon: Flame, words: ["naturgy", "repsol gas"] },
      { key: "agua", label: "Agua", hint: "Factura del agua.", icon: Droplets, words: ["canal de isabel", "aguas", "emasesa"] },
      { key: "internet_fijo", label: "Internet y fijo", hint: "Fibra y teléfono fijo.", icon: Wifi, words: ["movistar", "vodafone", "orange", "digi", "o2"] },
      { key: "movil", label: "Móvil", hint: "Facturas y recargas.", icon: Smartphone, words: ["movistar", "vodafone", "orange", "digi", "simyo", "pepephone", "lowi"] },
    ] },
    { key: "alimentacion", label: "Alimentación", color: "#16a34a", cats: [
      { key: "supermercado", label: "Supermercado", hint: "La compra de casa.", icon: ShoppingCart, words: ["mercadona", "carrefour", "lidl", "aldi", "dia", "alcampo", "eroski"] },
      { key: "comida_domicilio", label: "Comida a domicilio", hint: "Glovo, Just Eat, Uber Eats…", icon: Bike, words: ["glovo", "just eat", "uber eats", "telepizza", "domino"] },
    ] },
    { key: "ocio", label: "Ocio", color: "#ea580c", cats: [
      { key: "restaurantes", label: "Restaurantes", hint: "Comidas y cenas fuera, cafeterías.", icon: UtensilsCrossed, words: ["restaurante", "burger", "mcdonald", "starbucks", "vips", "foster"] },
      { key: "bares_copas", label: "Bares y copas", hint: "Cañas, copas, discotecas…", icon: Beer, words: ["bar ", "pub", "cerveceria", "discoteca"] },
      { key: "conciertos_espectaculos", label: "Conciertos y espectáculos", hint: "Cine, teatro, conciertos, partidos…", icon: Music, words: ["ticketmaster", "entradas", "cine", "yelmo", "cinesa", "teatro", "dice.fm", "fever"] },
      { key: "escapadas_viajes", label: "Escapadas y viajes", hint: "Hoteles, vuelos, apartamentos…", icon: Hotel, words: ["booking", "airbnb", "ryanair", "vueling", "iberia", "renfe", "expedia", "hotel"] },
      { key: "hobbies", label: "Hobbies", hint: "Libros, música, manualidades, fotografía…", icon: BookOpen, words: ["casa del libro", "fnac", "amazon kindle"] },
      { key: "videojuegos", label: "Videojuegos", hint: "Juegos, consolas y suscripciones de juego.", icon: Gamepad2, words: ["steam", "playstation", "nintendo", "xbox", "epic games"] },
      { key: "otros_ocio", label: "Otros de ocio", hint: "Lo que no encaja en lo anterior.", icon: PaintBucket },
    ] },
    { key: "transporte", label: "Transporte", color: "#4f46e5", cats: [
      { key: "gasolina", label: "Gasolina", hint: "Y diésel, recarga eléctrica…", icon: Fuel, words: ["repsol", "cepsa", "bp ", "galp", "shell", "ballenoil", "plenoil"] },
      { key: "transporte_publico", label: "Transporte público y taxi", hint: "Bus, metro, tren, taxi, VTC…", icon: Bus, words: ["metro", "emt", "renfe cercanias", "cabify", "uber", "bolt", "taxi"] },
      { key: "parking_peaje", label: "Parking y peaje", hint: "Aparcamientos, zona azul, autopistas…", icon: ParkingCircle, words: ["parking", "aparcamiento", "telpark", "peaje", "autopista", "via-t"] },
      { key: "mantenimiento_vehiculo", label: "Mantenimiento del vehículo", hint: "ITV, taller, lavado, neumáticos…", icon: Car, words: ["itv", "taller", "norauto", "midas", "feu vert"] },
      { key: "seguro_coche", label: "Seguro del coche", hint: "Seguro de coche o moto.", icon: Shield, words: ["linea directa", "mutua", "verti", "genesis"] },
    ] },
    { key: "compras", label: "Compras", color: "#db2777", cats: [
      { key: "moda", label: "Moda", hint: "Ropa, calzado y complementos.", icon: Shirt, words: ["zara", "mango", "primark", "pull bear", "bershka", "h m", "decathlon"] },
      { key: "electronica", label: "Electrónica", hint: "Móviles, ordenadores, gadgets…", icon: Laptop, words: ["mediamarkt", "pccomponentes", "apple store", "worten"] },
      { key: "regalos", label: "Regalos", hint: "Lo que compras para otras personas.", icon: Gift },
      { key: "otras_compras", label: "Otras compras", hint: "Amazon, bazar y demás.", icon: ShoppingBag, words: ["amazon", "aliexpress", "el corte ingles"] },
    ] },
    { key: "salud", label: "Salud y cuidado", color: "#dc2626", cats: [
      { key: "farmacia", label: "Farmacia", hint: "Y parafarmacia, herbolario…", icon: Pill, words: ["farmacia"] },
      { key: "medico", label: "Médico, dentista u óptica", hint: "Consultas, gafas, ortodoncia…", icon: Stethoscope, words: ["clinica", "dental", "optica", "sanitas", "adeslas"] },
      { key: "deporte", label: "Deporte y gimnasio", hint: "Cuotas, clases, material deportivo…", icon: Dumbbell, words: ["gym", "gimnasio", "basic fit", "mcfit", "padel"] },
      { key: "cuidado_personal", label: "Cuidado personal", hint: "Peluquería, estética, perfumería…", icon: Scissors, words: ["peluqueria", "druni", "primor", "sephora"] },
    ] },
    { key: "servicios", label: "Servicios", color: "#7c3aed", cats: [
      { key: "suscripciones", label: "Suscripciones", hint: "Netflix, Spotify, apps, la nube…", icon: Repeat, words: ["netflix", "spotify", "hbo", "disney", "prime video", "icloud", "google one", "youtube"] },
      { key: "educacion", label: "Educación", hint: "Colegio, cursos, academias…", icon: GraduationCap, words: ["academia", "udemy", "colegio", "universidad"] },
      { key: "mascotas", label: "Mascotas", hint: "Veterinario, pienso, accesorios…", icon: PawPrint, words: ["veterinari", "tiendanimal", "kiwoko"] },
      { key: "cuidado_hijos", label: "Hijos", hint: "Guardería, canguro, extraescolares…", icon: Baby },
    ] },
    { key: "finanzas", label: "Finanzas", color: "#475569", cats: [
      { key: "prestamos", label: "Préstamos", hint: "Cuotas de préstamos y tarjetas.", icon: Landmark, words: ["prestamo", "cofidis", "cetelem"] },
      { key: "comisiones", label: "Comisiones", hint: "Las que te cobra el banco.", icon: Percent, words: ["comision"] },
      { key: "impuestos", label: "Impuestos", hint: "IBI, IRPF, multas, tasas…", icon: Receipt, words: ["agencia tributaria", "ayuntamiento", "ibi", "dgt"] },
      { key: "otros_seguros", label: "Otros seguros", hint: "Vida, salud, decesos…", icon: ShieldCheck },
      { key: "efectivo", label: "Efectivo", hint: "Lo que sacas del cajero.", icon: Banknote, words: ["cajero", "reintegro", "atm"] },
    ] },
    { key: "otros", label: "Otros", color: "#64748b", cats: [
      { key: "solidaridad", label: "Solidaridad", hint: "ONG, donaciones…", icon: HandHeart, words: ["unicef", "cruz roja", "medicos sin", "acnur"] },
      { key: "otros_gastos", label: "Otros gastos", hint: "¿Seguro que no encaja en otra?", icon: Wallet },
    ] },
  ],
  ingreso: [
    { key: "ingresos", label: "Ingresos", color: "#059669", cats: [
      { key: "nomina", label: "Nómina", hint: "Tu sueldo.", icon: Briefcase, words: ["nomina"] },
      { key: "intereses", label: "Intereses y rendimientos", hint: "Intereses, dividendos…", icon: TrendingUp, words: ["intereses", "dividendo"] },
      { key: "otros_ingresos", label: "Otros ingresos", hint: "Ventas, alquileres, trabajos extra…", icon: ArrowDownLeft, words: ["wallapop", "vinted"] },
      { key: "regalo_recibido", label: "Regalo recibido", hint: "Dinero que te regalan.", icon: Gift },
      { key: "devolucion", label: "Devolución", hint: "Te devuelven un gasto (resta de su categoría).", icon: RotateCcw, words: ["devolucion", "reembolso", "abono"] },
    ] },
  ],
  no_computable: [
    { key: "no_computable", label: "Ni gasto ni ingreso", color: "#0284c7", cats: [
      { key: "entre_cuentas", label: "Entre mis cuentas", hint: "Traspasos entre tus cuentas.", icon: ArrowLeftRight, words: ["traspaso", "transferencia propia", "revolut"] },
      { key: "ahorro_inversion", label: "Ahorro e inversión", hint: "Aportaciones a ahorro, fondos, bróker…", icon: PiggyBank, words: ["indexa", "myinvestor", "trade republic", "degiro"] },
      { key: "bizum_compartido", label: "Gasto compartido", hint: "Lo que adelantas y te devuelven.", icon: HandCoins, words: ["bizum"] },
    ] },
  ],
};

const TABS: { key: Tab; label: string }[] = [
  { key: "gasto", label: "Gasto" }, { key: "ingreso", label: "Ingreso" }, { key: "no_computable", label: "No computable" },
];

/** Movimientos de ejemplo para ver las sugerencias (en la app real, el movimiento que estás editando). */
const EXAMPLES = ["TICKETMASTER ESPANA", "BOOKING.COM HOTEL", "VODAFONE ESPANA", "BAR LA ESQUINA"];

const fold = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

function CatIcon({ icon: I, color }: { icon: Icon; color: string }) {
  return (
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full" style={{ backgroundColor: `${color}17` }} aria-hidden="true">
      <I className="h-5 w-5" style={{ color }} strokeWidth={2} />
    </span>
  );
}

export function LabCategoryPicker() {
  const [tab, setTab] = useState<Tab>("gasto");
  const [q, setQ] = useState("");
  const [example, setExample] = useState(EXAMPLES[0]);
  const [picked, setPicked] = useState<string | null>(null);
  const all = useMemo(() => (Object.keys(TREE) as Tab[]).flatMap((t) => TREE[t].flatMap((f) => f.cats.map((c) => ({ ...c, family: f, tab: t })))), []);
  const suggested = useMemo(() => {
    const text = fold(example);
    return all.filter((c) => c.words?.some((w) => text.includes(fold(w)))).slice(0, 3);
  }, [all, example]);
  const query = fold(q.trim());
  const results = query ? all.filter((c) => fold(`${c.label} ${c.hint} ${c.family.label}`).includes(query)) : null;

  const Row = ({ c, color }: { c: Cat; color: string }) => (
    <li>
      <button type="button" onClick={() => setPicked(c.key)} className="flex w-full items-center gap-3.5 px-4 py-3 text-left hover:bg-slate-50 focus-visible:bg-slate-50 focus-visible:outline-none">
        <CatIcon icon={c.icon} color={color} />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-[15px] text-slate-900">{c.label}</span>
          <span className="block truncate text-[13px] text-slate-500">{c.hint}</span>
        </span>
        {picked === c.key && <Check className="h-5 w-5 shrink-0 text-blue-600" strokeWidth={2.5} />}
      </button>
    </li>
  );
  const Section = ({ title, children }: { title: string; children: ReactNode }) => (
    <section>
      <h3 className="sticky top-0 z-10 bg-slate-50 px-4 py-2 text-[13px] font-semibold text-slate-600">{title}</h3>
      <ul className="divide-y divide-slate-100">{children}</ul>
    </section>
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-xs text-slate-500">Movimiento de ejemplo (para ver las sugerencias):</p>
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {EXAMPLES.map((e) => (
            <button key={e} type="button" onClick={() => setExample(e)} aria-pressed={example === e}
              className={`rounded-full px-3 py-1 text-xs font-medium ${example === e ? "bg-slate-800 text-white" : "bg-slate-100 text-slate-700"}`}>{e}</button>
          ))}
        </div>
      </div>

      {/* Lo que sería la pantalla del selector */}
      <div className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
        <div className="px-4 pb-2 pt-4">
          <p className="text-center text-base font-semibold text-slate-900">Selecciona una categoría</p>
          <label className="mt-3 flex h-11 items-center gap-2 rounded-full bg-slate-100 px-4">
            <Search className="h-4 w-4 shrink-0 text-slate-400" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar categoría" className="min-w-0 flex-1 bg-transparent text-[15px] outline-none placeholder:text-slate-400" />
          </label>
          {!query && (
            <div className="mt-2 grid grid-cols-3" role="tablist">
              {TABS.map((t) => (
                <button key={t.key} type="button" role="tab" aria-selected={tab === t.key} onClick={() => setTab(t.key)}
                  className={`relative py-2.5 text-[15px] font-medium ${tab === t.key ? "text-slate-900" : "text-slate-400"}`}>
                  {t.label}
                  {tab === t.key && <span className="absolute inset-x-6 bottom-0 h-0.5 rounded-full bg-slate-900" />}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="max-h-[70dvh] overflow-y-auto border-t border-slate-100">
          {results ? (
            results.length ? (
              <Section title={`${results.length} ${results.length === 1 ? "resultado" : "resultados"}`}>
                {results.map((c) => <Row key={c.key} c={c} color={c.family.color} />)}
              </Section>
            ) : <p className="px-4 py-8 text-center text-sm text-slate-500">Ninguna categoría con «{q}».</p>
          ) : (
            <>
              {suggested.some((c) => c.tab === tab) && (
                <Section title="Sugeridas para este movimiento">
                  {suggested.filter((c) => c.tab === tab).map((c) => <Row key={`s-${c.key}`} c={c} color={c.family.color} />)}
                </Section>
              )}
              {TREE[tab].map((f) => (
                <Section key={f.key} title={f.label}>
                  {f.cats.map((c) => <Row key={c.key} c={c} color={f.color} />)}
                </Section>
              ))}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
