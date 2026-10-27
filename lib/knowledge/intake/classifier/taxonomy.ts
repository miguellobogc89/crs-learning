/**
 * Document taxonomy for the classifier. DATA, not logic: extend it here without touching the module.
 * family → type → subtypes. Every family also accepts type "otro" with a free description, and a type
 * without listed subtypes is classified with subtipo = null. Business-sector neutral: types describe what a
 * document is, never a specific supplier or customer.
 */
export const TAXONOMY = {
  transaccion: {
    factura: ["suministro_electricidad", "suministro_gas", "suministro_agua", "telecomunicaciones", "compra_articulos",
      "servicios_profesionales", "alquiler", "factura_simplificada", "rectificativa_abono"],
    albaran: [],
    pedido: [],
    presupuesto: [],
    recibo_pago: [],
    extracto_bancario: [],
    nomina: [],
    nota_gastos: [],
    declaracion_impuestos: [],
    cierre_caja: [],
  },
  maestro: {
    catalogo_tarifa_proveedor: [],
    listado_productos: [],
    inventario: [],
    listado_clientes: [],
    listado_proveedores: [],
    listado_empleados: [],
    listado_contactos: [],
  },
  operacion: {
    receta_escandallo: [],
    ficha_tecnica: [],
    alergenos: [],
    registro_appcc: [],
    trazabilidad_lotes: [],
    mermas: [],
    cuadrante_turnos: [],
  },
  contrato: {
    contrato: ["alquiler", "prestamo_leasing", "seguro", "suministro", "laboral", "servicios"],
  },
  informe: {
    ventas: [],
    presupuesto_anual: [],
    cuadro_mando: [],
  },
  texto: {
    procedimiento: [],
    politica: [],
    manual: [],
    comunicacion: [],
    condiciones_legales: [],
  },
  otro: {},
} as const satisfies Record<string, Record<string, readonly string[]>>;

export type Family = keyof typeof TAXONOMY;
export const FAMILIES = Object.keys(TAXONOMY) as Family[];

/** Plain-text description of the taxonomy for the model instructions. */
export function describeTaxonomy() {
  return FAMILIES.map(family => {
    const types = Object.entries(TAXONOMY[family] as Record<string, readonly string[]>)
      .map(([type, subtypes]) => subtypes.length ? `${type} (${subtypes.join(", ")})` : type);
    return `- ${family}: ${[...types, "otro"].join("; ")}`;
  }).join("\n");
}

/** Whether a classification fits the taxonomy. "otro" is valid in every family and requires a description. */
export function checkTaxonomy(familia: string, tipo: string, subtipo: string | null, descripcion: string): string | null {
  if (!(familia in TAXONOMY)) return `familia desconocida «${familia}»`;
  const types = TAXONOMY[familia as Family] as Record<string, readonly string[]>;
  if (tipo === "otro") return descripcion.trim() ? (subtipo === null ? null : "un tipo «otro» no lleva subtipo") : "un tipo «otro» requiere descripción";
  if (!(tipo in types)) return `tipo «${tipo}» no existe en la familia «${familia}»`;
  const subtypes = types[tipo];
  if (subtipo === null) return null;
  if (subtipo === "otro") return descripcion.trim() ? null : "un subtipo «otro» requiere descripción";
  return subtypes.includes(subtipo) ? null : `subtipo «${subtipo}» no existe para «${tipo}»`;
}
