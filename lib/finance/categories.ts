// lib/finance/categories.ts
// Categorías y «significado económico» (kind) de CRS Finance. Sin dependencias: lo usan servidor y cliente.

/**
 * Significado económico de un movimiento:
 * - gasto: dinero que sale de verdad (cuenta para el gasto y el presupuesto).
 * - ingreso: ingreso ordinario (nómina, intereses…).
 * - regalo: dinero recibido que no es un ingreso ordinario (se muestra aparte y no se proyecta).
 * - devolucion: reembolso de un gasto; resta del gasto de su categoría.
 * - interna: entre cuentas propias (recarga de Revolut, traspaso para la hipoteca…). No es gasto ni ingreso.
 * - ahorro: aportación a ahorro o inversión (bróker, exchange, fondo). Es ahorro, no gasto.
 */
export const KINDS = ["gasto", "ingreso", "regalo", "devolucion", "interna", "ahorro"] as const;
export type Kind = (typeof KINDS)[number];

export const KIND_LABEL: Record<Kind, string> = {
  gasto: "Gasto",
  ingreso: "Ingreso",
  regalo: "Regalo recibido",
  devolucion: "Devolución",
  interna: "Entre mis cuentas",
  ahorro: "Ahorro / inversión",
};

export type CategoryDef = { key: string; label: string; kind: Kind; color: string; family: string; hint: string };

/**
 * Árbol de categorías (23/11/2026): familias como ayuda para encontrar la categoría (no son los grupos de Mi plan)
 * y, dentro, categorías descriptivas con una pista de lo que entra. Las claves antiguas se conservan (algunas con
 * otro nombre: «vivienda» es «Alquiler o hipoteca», «ocio» es «Otros de ocio»…) para no tocar lo ya guardado.
 * `color` es el tono de la familia (pastillas y gráficos); `tab`, la pestaña del selector.
 */
export type FamilyDef = { key: string; label: string; color: string; tab: "gasto" | "ingreso" | "no_computable"; cats: { key: string; label: string; hint: string; kind?: Kind }[] };

export const FAMILIES: FamilyDef[] = [
  { key: "casa", label: "Casa", color: "blue", tab: "gasto", cats: [
    { key: "vivienda", label: "Alquiler o hipoteca", hint: "Cuota de tu vivienda, garaje o trastero." },
    { key: "comunidad", label: "Comunidad", hint: "Cuota de la comunidad de vecinos." },
    { key: "seguro_hogar", label: "Seguro del hogar", hint: "Multirriesgo, alarma…" },
    { key: "mantenimiento_hogar", label: "Mantenimiento del hogar", hint: "Fontanero, electricista, reformas, jardín…" },
    { key: "limpieza_hogar", label: "Limpieza del hogar", hint: "Asistenta, productos de limpieza, tintorería…" },
    { key: "muebles_decoracion", label: "Muebles y decoración", hint: "Ikea, menaje, textil del hogar…" },
  ] },
  { key: "suministros", label: "Suministros", color: "teal", tab: "gasto", cats: [
    { key: "luz", label: "Luz", hint: "Factura de la electricidad." },
    { key: "gas", label: "Gas", hint: "Gas natural, butano…" },
    { key: "agua", label: "Agua", hint: "Factura del agua." },
    { key: "internet_fijo", label: "Internet y teléfono", hint: "Fibra, fijo y paquetes con móvil." },
    { key: "movil", label: "Móvil", hint: "Facturas y recargas del móvil." },
    { key: "suministros", label: "Otros suministros", hint: "Lo que no encaja en lo anterior." },
  ] },
  { key: "alimentacion", label: "Alimentación", color: "green", tab: "gasto", cats: [
    { key: "alimentacion", label: "Supermercado", hint: "La compra de casa, mercado, panadería…" },
    { key: "comida_domicilio", label: "Comida a domicilio", hint: "Glovo, Just Eat, Uber Eats…" },
  ] },
  { key: "ocio", label: "Ocio", color: "orange", tab: "gasto", cats: [
    { key: "restaurantes", label: "Restaurantes", hint: "Comidas y cenas fuera, cafeterías." },
    { key: "bares_copas", label: "Bares y copas", hint: "Cañas, copas, discotecas…" },
    { key: "conciertos_espectaculos", label: "Conciertos y espectáculos", hint: "Cine, teatro, conciertos, partidos…" },
    { key: "viajes", label: "Escapadas y viajes", hint: "Hoteles, vuelos, apartamentos…" },
    { key: "hobbies", label: "Hobbies", hint: "Libros, música, manualidades, fotografía…" },
    { key: "videojuegos", label: "Videojuegos", hint: "Juegos, consolas y suscripciones de juego." },
    { key: "ocio", label: "Otros de ocio", hint: "Lo que no encaja en lo anterior." },
  ] },
  { key: "transporte", label: "Transporte", color: "indigo", tab: "gasto", cats: [
    { key: "gasolina", label: "Gasolina", hint: "Y diésel, recarga eléctrica…" },
    { key: "transporte", label: "Transporte público y taxi", hint: "Bus, metro, tren, taxi, VTC…" },
    { key: "parking_peaje", label: "Parking y peaje", hint: "Aparcamientos, zona azul, autopistas…" },
    { key: "mantenimiento_vehiculo", label: "Mantenimiento del vehículo", hint: "ITV, taller, lavado, neumáticos…" },
    { key: "seguro_coche", label: "Seguro del coche", hint: "Seguro de coche o moto." },
  ] },
  { key: "compras", label: "Compras", color: "pink", tab: "gasto", cats: [
    { key: "moda", label: "Moda", hint: "Ropa, calzado y complementos." },
    { key: "electronica", label: "Electrónica", hint: "Móviles, ordenadores, gadgets…" },
    { key: "regalos", label: "Regalos", hint: "Lo que compras para otras personas." },
    { key: "compras", label: "Otras compras", hint: "Amazon, bazar y demás." },
  ] },
  { key: "salud", label: "Salud y cuidado", color: "red", tab: "gasto", cats: [
    { key: "farmacia", label: "Farmacia", hint: "Y parafarmacia, herbolario…" },
    { key: "salud", label: "Médico, dentista u óptica", hint: "Consultas, gafas, ortodoncia, fisio…" },
    { key: "deporte", label: "Deporte y gimnasio", hint: "Cuotas, clases, material deportivo…" },
    { key: "cuidado_personal", label: "Cuidado personal", hint: "Peluquería, estética, perfumería…" },
  ] },
  { key: "servicios", label: "Servicios", color: "purple", tab: "gasto", cats: [
    { key: "suscripciones", label: "Suscripciones", hint: "Netflix, Spotify, apps, la nube…" },
    { key: "educacion", label: "Educación", hint: "Colegio, cursos, academias…" },
    { key: "mascotas", label: "Mascotas", hint: "Veterinario, pienso, accesorios…" },
    { key: "hijos", label: "Hijos", hint: "Guardería, canguro, extraescolares…" },
  ] },
  { key: "finanzas", label: "Finanzas", color: "sky", tab: "gasto", cats: [
    { key: "prestamos", label: "Préstamos", hint: "Cuotas de préstamos y tarjetas." },
    { key: "comisiones", label: "Comisiones", hint: "Las que te cobra el banco." },
    { key: "impuestos", label: "Impuestos", hint: "IBI, IRPF, multas, tasas…" },
    { key: "seguros", label: "Otros seguros", hint: "Vida, salud, decesos…" },
    { key: "efectivo", label: "Efectivo", hint: "Lo que sacas del cajero." },
  ] },
  { key: "otros", label: "Otros", color: "gray", tab: "gasto", cats: [
    { key: "solidaridad", label: "Solidaridad", hint: "ONG, donaciones…" },
    { key: "otros_gastos", label: "Otros gastos", hint: "¿Seguro que no encaja en otra?" },
  ] },
  { key: "ingresos", label: "Ingresos", color: "emerald", tab: "ingreso", cats: [
    { key: "nomina", label: "Nómina", hint: "Tu sueldo.", kind: "ingreso" },
    { key: "intereses", label: "Intereses y rendimientos", hint: "Intereses, dividendos…", kind: "ingreso" },
    { key: "otros_ingresos", label: "Otros ingresos", hint: "Ventas, alquileres, trabajos extra…", kind: "ingreso" },
    { key: "regalo_recibido", label: "Regalo recibido", hint: "Dinero que te regalan.", kind: "regalo" },
  ] },
  { key: "no_computable", label: "Ni gasto ni ingreso", color: "slate", tab: "no_computable", cats: [
    { key: "transferencia_interna", label: "Entre mis cuentas", hint: "Traspasos entre tus cuentas.", kind: "interna" },
    { key: "ahorro_inversion", label: "Ahorro e inversión", hint: "Aportaciones a ahorro, fondos, bróker…", kind: "ahorro" },
  ] },
];

export const CATEGORIES: CategoryDef[] = [
  ...FAMILIES.flatMap((f) => f.cats.map((c) => ({ key: c.key, label: c.label, kind: c.kind ?? ("gasto" as Kind), color: f.color, family: f.key, hint: c.hint }))),
  { key: "sin_clasificar", label: "Sin clasificar", kind: "gasto", color: "gray", family: "otros", hint: "" },
];

const BY_KEY = new Map(CATEGORIES.map((c) => [c.key, c]));
const FAMILY_BY_KEY = new Map(FAMILIES.map((f) => [f.key, f]));
export const categoryOf = (key: string): CategoryDef => BY_KEY.get(key) ?? BY_KEY.get("otros_gastos")!;
export const categoryLabel = (key: string) => categoryOf(key).label;
export const familyOf = (key: string) => FAMILY_BY_KEY.get(categoryOf(key).family) ?? FAMILIES[0];
export const isCategory = (key: unknown): key is string => typeof key === "string" && BY_KEY.has(key);
export const isKind = (v: unknown): v is Kind => typeof v === "string" && (KINDS as readonly string[]).includes(v);

/** Opciones compartidas por los selectores de categorías, siempre en orden alfabético. */
export const SELECTABLE_CATEGORIES = CATEGORIES.filter((c) => c.key !== "sin_clasificar")
  .sort((a, b) => a.label.localeCompare(b.label, "es", { sensitivity: "base" }));

/** Categorías de gasto (para presupuestos y devoluciones). */
export const EXPENSE_CATEGORIES = SELECTABLE_CATEGORIES.filter((c) => c.kind === "gasto");

/** Color HEX de cada tono, para los gráficos SVG y los iconos (tonos vivos). */
export const HEX: Record<string, string> = {
  blue: "#3478f6", teal: "#14b8a6", emerald: "#10b981", green: "#22c55e", orange: "#ff8a00", violet: "#8b5cf6", amber: "#f59e0b",
  rose: "#f43f5e", fuchsia: "#d946ef", lime: "#84cc16", slate: "#64748b", red: "#ef4444", stone: "#78716c",
  indigo: "#6366f1", sky: "#0ea5e9", pink: "#ec4899", purple: "#a855f7", zinc: "#71717a", neutral: "#737373",
  gray: "#94a3b8", cyan: "#06b6d4",
};
export const categoryHex = (key: string) => HEX[categoryOf(key).color] ?? HEX.gray;
