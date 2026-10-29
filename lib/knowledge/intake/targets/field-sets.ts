import { TAXONOMY, type Family } from "../classifier/taxonomy";

/**
 * WHAT to extract from each kind of document. DATA, not logic: reviewed by people, extended over time with
 * approved proposals. Values are always taken as printed (no conversions, no computed values); the extraction
 * never assigns record ids. Fields are grouped by ENTITY with a ROLE so that, in the later relational phase,
 * each group becomes a record of its catalog type and each role a relation (invoice → issuer → company).
 *
 * `catalogType` names follow the standard global catalog (lib/engine/catalog/standard-catalog.ts), and
 * FIELD_SET_MAPPING there says in which catalog field each extracted field is stored (a test keeps both aligned).
 */

export type FieldType = "text" | "long_text" | "integer" | "decimal" | "boolean" | "date" | "enum";
export type FieldDef = {
  key: string; name: string; type: FieldType; required: boolean; description: string;
  /** Matching key for reconciliation with existing records (tax id, supply point, product reference). */
  identifier?: true;
};
export type EntityDef = {
  role: string; name: string; catalogType: string; catalogo: "existente" | "propuesto";
  cardinality: "one" | "many"; required: boolean; fields: FieldDef[];
  /** Child entities of each record of this entity (e.g. the lines of each ticket). */
  children?: EntityDef[];
  /** Check against the workspace's own company (the business uploading is usually the recipient). */
  matchesWorkspaceCompany?: true;
};
export type FieldSet = {
  id: string; name: string; version: number;
  appliesTo: { familia: Family; tipo: string; subtipos: (string | null)[] };
  /** Field sets whose entities this one includes first (composition, not copy). */
  extends?: string[];
  entities: EntityDef[];
};

/** Never extracted unless an approved field asks for it: layout and boilerplate, not business data. */
export const EXCLUDED_CONTENT = [
  "fax", "página web", "correo electrónico y teléfonos de atención o contacto", "redes sociales y aplicaciones",
  "datos del Registro Mercantil", "textos legales, de protección de datos y de condiciones generales", "publicidad y promociones",
  "números de página", "logos y sellos", "códigos internos de impresión o de documento",
] as const;

const f = (key: string, name: string, type: FieldType, required: boolean, description: string, identifier?: true): FieldDef =>
  ({ key, name, type, required, description, ...(identifier ? { identifier } : {}) });

const organization = (role: string, name: string, required: boolean, taxIdRequired: boolean, extra: Partial<EntityDef> = {}): EntityDef => ({
  role, name, catalogType: "company", catalogo: "existente", cardinality: "one", required, ...extra,
  fields: [
    f("legal_name", "Razón social", "text", required, "Nombre o razón social tal como aparece."),
    f("tax_id", "NIF/CIF", "text", taxIdRequired, "Identificador fiscal tal como aparece; clave para reconocer la empresa en otros documentos.", true),
    f("address", "Dirección", "long_text", false, "Domicilio fiscal o de la tienda tal como aparece."),
  ],
});

const taxBreakdown: EntityDef = {
  role: "tax_breakdown", name: "Desglose de impuestos", catalogType: "invoice_tax_line", catalogo: "propuesto", cardinality: "many", required: true,
  fields: [
    f("tax_rate", "Tipo de impuesto", "text", true, "Porcentaje o tipo tal como aparece (21 %, 4 %, IGIC…)."),
    f("taxable_base", "Base imponible", "decimal", false, "Base de ese tipo, tal como aparece."),
    f("tax_amount", "Cuota", "decimal", true, "Importe del impuesto de ese tipo, tal como aparece."),
  ],
};

const articleLines = (required: boolean): EntityDef => ({
  role: "lines", name: "Líneas de artículos", catalogType: "invoice_line", catalogo: "existente", cardinality: "many", required,
  fields: [
    f("description", "Descripción", "long_text", true, "Artículo o concepto de la línea."),
    f("product_reference", "Referencia", "text", false, "Código o referencia del producto; clave para reconocer el producto.", true),
    f("quantity", "Cantidad", "decimal", true, "Cantidad tal como aparece. Si la factura tiene una columna de envases (cajas, sacos, bultos) y otra de unidades o kilos por envase («UN/KG», «Uds/caja»), la cantidad es la de envases; lo que trae cada envase va en «Contenido por envase»."),
    f("package_count", "Envases", "decimal", false, "Número de envases, cajas, sacos o bultos, solo si la factura tiene esa columna («Envases», «Bultos», «Cajas», «Cj.»)."),
    f("package_content", "Contenido por envase", "decimal", false, "Unidades, kilos o litros que trae cada envase, tal como aparecen: de su columna («UN/KG», «Uds/caja», «Formato») o, si no la hay, del nombre del producto («S/25 KGS» → 25; «CJ/180 U.» → 180; «B/1,25 KGS» → 1,25; «BT/1 LT» → 1). Vacío si no se indica."),
    f("package_unit", "Unidad del contenido", "enum", false, "Unidad del contenido por envase: «kg», «l» o «ud»."),
    f("unit", "Unidad", "text", false, "Unidad de venta (ud., kg, m…)."),
    f("unit_price", "Precio unitario", "decimal", false, "Precio unitario tal como aparece; si hay dos columnas de precio (sin y con impuestos), el SIN impuestos."),
    f("unit_price_with_tax", "Precio unitario con impuestos", "decimal", false, "Solo si el documento imprime OTRA columna de precio unitario con impuestos (PVP, TTI, IVA incl.)."),
    f("unit_price_basis", "Precio unitario con o sin impuestos", "enum", false, "«sin_impuestos» o «con_impuestos» según indique la columna; vacío si no se indica."),
    f("discount", "Descuento en euros", "decimal", false, "Descuento de la línea en euros, solo si se imprime como importe."),
    f("discount_percent", "Descuento (%)", "decimal", false, "Porcentaje de descuento de la línea (columna «Dto.», «% Dto.»…), sin el símbolo %. Si la columna de descuento es un porcentaje, va aquí y no en «Descuento en euros»."),
    f("tax_rate", "Tipo de impuesto", "text", false, "Tipo de la línea tal como aparece."),
    f("line_total", "Importe de la línea", "decimal", true, "Importe total de la línea tal como aparece; si hay dos columnas de importe (sin y con impuestos), el SIN impuestos."),
    f("line_total_with_tax", "Importe de la línea con impuestos", "decimal", false, "Solo si el documento imprime OTRA columna de importe de la línea con impuestos (Importe TTI, Total IVA incl.)."),
    f("line_total_basis", "Importe con o sin impuestos", "enum", false, "«sin_impuestos» o «con_impuestos» según indique la columna; vacío si no se indica."),
    // An invoice may group several tickets: each line keeps the ticket it comes from and that ticket's date
    // (the date of the purchase, needed e.g. for monthly spend per product).
    f("source_ticket_number", "Ticket de origen", "text", false, "Número del ticket o factura simplificada al que pertenece la línea, si la factura agrupa varios.", true),
    f("source_ticket_date", "Fecha del ticket de origen", "date", false, "Fecha del ticket o factura simplificada al que pertenece la línea, tal como aparece."),
  ],
});

export const FIELD_SETS: FieldSet[] = [
  {
    id: "factura_nucleo", name: "Núcleo común de factura", version: 1,
    // Every invoice except simplified ones (tickets), which have their own set.
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: [null, ...TAXONOMY.transaccion.factura.filter(s => s !== "factura_simplificada")] },
    entities: [
      { role: "invoice", name: "Factura", catalogType: "invoice", catalogo: "existente", cardinality: "one", required: true, fields: [
        f("invoice_number", "Número de factura", "text", true, "Número o serie y número tal como aparece.", true),
        f("issue_date", "Fecha de emisión", "date", true, "Fecha de la factura tal como aparece."),
        f("subtotal", "Base imponible", "decimal", true, "Base imponible total tal como aparece."),
        f("tax_amount", "Total impuestos", "decimal", false, "Suma de cuotas si aparece impresa; no se calcula."),
        f("total_amount", "Total", "decimal", true, "Total a pagar o total de la factura tal como aparece."),
        f("currency", "Moneda", "text", false, "Solo si aparece impresa (€, EUR…); no se deduce."),
        f("due_date", "Vencimiento o fecha de cargo", "date", false, "Fecha de vencimiento, de cargo o de pago tal como aparece."),
        f("payment_method", "Forma de pago", "text", false, "Medio: transferencia, tarjeta, efectivo, domiciliación…"),
        f("payment_terms", "Condiciones de pago", "text", false, "Plazo o condición: al contado, a 30 días…"),
        f("payment_account", "Cuenta de pago", "text", false, "IBAN o cuenta de cobro o de cargo tal como aparece."),
      ] },
      organization("issuer", "Emisor", true, true),
      organization("recipient", "Receptor", true, false, { matchesWorkspaceCompany: true }),
      taxBreakdown,
    ],
  },
  {
    id: "factura_suministro", name: "Factura de suministro", version: 1, extends: ["factura_nucleo"],
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: ["suministro_electricidad", "suministro_gas", "suministro_agua", "telecomunicaciones"] },
    entities: [
      { role: "supply", name: "Suministro facturado", catalogType: "supply_point", catalogo: "propuesto", cardinality: "one", required: true, fields: [
        f("supply_point_id", "Punto de suministro", "text", true, "CUPS, número de línea o identificador del servicio; clave para reconocer el suministro.", true),
        f("period_start", "Inicio del periodo", "date", true, "Primer día del periodo facturado."),
        f("period_end", "Fin del periodo", "date", true, "Último día del periodo facturado."),
        f("contract_number", "Número de contrato o de cliente", "text", false, "Contrato o código de cliente en la comercializadora."),
        f("plan", "Tarifa o plan", "text", false, "Tarifa de acceso o plan contratado tal como aparece."),
      ] },
      { role: "charges", name: "Conceptos facturados", catalogType: "invoice_line", catalogo: "existente", cardinality: "many", required: true, fields: [
        f("description", "Concepto", "long_text", true, "Concepto facturado (potencia, energía, cuota mensual, alquiler de equipos…)."),
        f("calculation", "Detalle del cálculo", "long_text", false, "Cantidades y precios del cálculo tal como aparecen (12 kW x 31 días x 0,08 €…)."),
        f("line_total", "Importe", "decimal", true, "Importe del concepto tal como aparece."),
      ] },
    ],
  },
  {
    id: "factura_electricidad", name: "Datos específicos de electricidad", version: 1, extends: ["factura_suministro"],
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: ["suministro_electricidad"] },
    entities: [
      { role: "power", name: "Potencia contratada", catalogType: "contracted_power", catalogo: "propuesto", cardinality: "many", required: false, fields: [
        f("period", "Periodo", "text", true, "Periodo tarifario (P1, P2…)."),
        f("power_kw", "Potencia (kW)", "decimal", true, "Potencia contratada en ese periodo."),
      ] },
      { role: "consumption", name: "Consumo", catalogType: "energy_consumption", catalogo: "propuesto", cardinality: "many", required: false, fields: [
        f("period", "Periodo", "text", true, "Periodo tarifario (P1, P2…) o total."),
        f("energy_kwh", "Energía (kWh)", "decimal", true, "Consumo de ese periodo."),
      ] },
      { role: "meter_readings", name: "Lecturas del contador", catalogType: "meter_reading", catalogo: "propuesto", cardinality: "many", required: false, fields: [
        f("period", "Periodo", "text", false, "Periodo tarifario de la lectura."),
        f("previous_reading", "Lectura anterior", "decimal", false, "Lectura anterior tal como aparece."),
        f("current_reading", "Lectura actual", "decimal", false, "Lectura actual tal como aparece."),
        f("reading_type", "Tipo de lectura", "text", false, "Real o estimada, si se indica."),
      ] },
    ],
  },
  {
    id: "factura_telecomunicaciones", name: "Datos específicos de telecomunicaciones", version: 1, extends: ["factura_suministro"],
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: ["telecomunicaciones"] },
    entities: [
      { role: "lines_service", name: "Líneas incluidas", catalogType: "telecom_line", catalogo: "propuesto", cardinality: "many", required: false, fields: [
        f("number", "Número de línea", "text", true, "Número de teléfono o identificador de la línea.", true),
        f("service", "Servicio", "text", false, "Fijo, móvil, fibra… tal como aparece."),
      ] },
    ],
  },
  {
    id: "factura_compra_articulos", name: "Factura de compra de artículos", version: 2, extends: ["factura_nucleo"],
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: ["compra_articulos"] },
    entities: [
      articleLines(true),
      // Adds a field to the core invoice entity (same role): merged, never duplicated.
      { role: "invoice", name: "Factura", catalogType: "invoice", catalogo: "existente", cardinality: "one", required: true, fields: [
        f("order_or_ticket_number", "Pedido o ticket de caja", "text", false, "Número de pedido o del ticket de caja del que procede la factura."),
      ] },
    ],
  },
  {
    // A PDF may group several tickets in one invoice: each ticket is a classified part extracted with this set,
    // and the grouping invoice part keeps its own number, date and total.
    id: "ticket", name: "Ticket o factura simplificada", version: 2,
    appliesTo: { familia: "transaccion", tipo: "factura", subtipos: ["factura_simplificada"] },
    entities: [
      { role: "invoice", name: "Ticket", catalogType: "invoice", catalogo: "existente", cardinality: "one", required: true, fields: [
        f("invoice_number", "Número de ticket", "text", true, "Número de la factura simplificada o ticket.", true),
        f("issue_date", "Fecha", "date", true, "Fecha del ticket tal como aparece."),
        f("total_amount", "Total", "decimal", true, "Total del ticket tal como aparece."),
        f("subtotal", "Base imponible", "decimal", false, "Base imponible si aparece."),
        f("payment_method", "Forma de pago", "text", false, "Tarjeta, efectivo…"),
      ] },
      organization("issuer", "Tienda emisora", true, false),
      organization("recipient", "Receptor", false, false, { matchesWorkspaceCompany: true }),
      articleLines(true),
      { ...taxBreakdown, required: false },
    ],
  },
];

/** Field set for a classified part, composed with the sets it extends (most specific last). Null: no set → full reading. */
export function resolveFieldSet(familia: string, tipo: string, subtipo: string | null): { ids: string[]; entities: EntityDef[] } | null {
  const candidates = FIELD_SETS.filter(s => s.appliesTo.familia === familia && s.appliesTo.tipo === tipo && s.appliesTo.subtipos.includes(subtipo));
  if (!candidates.length) return null;
  // The most specific set is the deepest in the extension chain (ticket: 1; electricity: nucleo → suministro → electricidad).
  const depth = (id: string): number => 1 + Math.max(0, ...(FIELD_SETS.find(s => s.id === id)?.extends ?? []).map(depth));
  const leaf = candidates.reduce((best, s) => depth(s.id) > depth(best.id) ? s : best);
  const ids: string[] = [];
  const visit = (id: string) => {
    if (ids.includes(id)) return;
    const set = FIELD_SETS.find(s => s.id === id);
    if (!set) throw new Error(`Conjunto de campos desconocido: ${id}`);
    (set.extends ?? []).forEach(visit);
    ids.push(id);
  };
  visit(leaf.id);
  const entities: EntityDef[] = [];
  for (const id of ids) for (const entity of FIELD_SETS.find(s => s.id === id)!.entities) {
    const index = entities.findIndex(e => e.role === entity.role);
    if (index < 0) { entities.push(entity); continue; }
    // A more specific set may add fields to an entity of the set it extends; it never removes or retypes them.
    const merged = { ...entities[index], fields: [...entities[index].fields] };
    for (const field of entity.fields) if (!merged.fields.some(x => x.key === field.key)) merged.fields.push(field);
    entities[index] = merged;
  }
  return { ids, entities };
}
