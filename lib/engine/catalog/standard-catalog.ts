/**
 * Standard global catalog: business tables almost every workspace needs (companies, products, supplier catalogs,
 * invoices and their lines, delivery notes, orders, supplies, bank data…). DATA, not logic. Global definitions,
 * public to every workspace; each workspace stores its own records once it binds a type (on first write).
 *
 * The SQL that publishes it (`scripts/neon/20261027_standard_catalog.sql`) is GENERATED from this file
 * (`npm run engine:standard-catalog-sql`) and is idempotent: types that already exist only receive the fields
 * they lack, in a new published version; nothing is renamed, retyped or removed; no record is touched.
 *
 * Relations go from owner to owned ("one_to_many": one company issues many invoices), as the Engine expects.
 */
export type CatalogFieldType = "text" | "long_text" | "integer" | "decimal" | "date" | "boolean";
export type CatalogField = { key: string; name: string; type: CatalogFieldType; description?: string; required?: true; unique?: true };
export type CatalogType = { key: string; name: string; description: string; fields: CatalogField[] };
export type CatalogRelation = { key: string; name: string; from: string; to: string; cardinality: "one_to_one" | "one_to_many" | "many_to_many"; description: string };

/** Bump when this file changes: the SQL records it in the version notes. */
export const STANDARD_CATALOG_REVISION = "2026-10-27.3";

const f = (key: string, name: string, type: CatalogFieldType, description?: string, extra: { required?: true; unique?: true } = {}): CatalogField =>
  ({ key, name, type, ...(description ? { description } : {}), ...extra });

const party = [
  f("legal_name", "Razón social", "text", "Nombre legal completo.", { required: true }),
  f("trade_name", "Nombre comercial", "text"),
  f("tax_identifier", "NIF/CIF", "text", "Identificador fiscal; clave para reconocer la empresa.", { unique: true }),
  f("legal_form", "Forma jurídica", "text", "S.L., S.A., autónomo, cooperativa…"),
  f("address", "Dirección", "long_text"), f("postal_code", "Código postal", "text"), f("city", "Población", "text"),
  f("region", "Provincia o región", "text"), f("country", "País", "text"),
  f("email", "Correo electrónico", "text"), f("phone", "Teléfono", "text"), f("website", "Web", "text"),
  f("notes", "Notas", "long_text"),
];

const documentLine = [
  f("line_number", "Nº de línea", "integer"),
  f("product_reference", "Referencia del producto", "text", "Referencia o código tal como aparece; enlaza con el producto."),
  f("description", "Descripción", "long_text", undefined, { required: true }),
  f("quantity", "Cantidad", "decimal"), f("unit", "Unidad", "text"),
  f("unit_price", "Precio unitario", "decimal"), f("discount_amount", "Descuento", "decimal"),
  f("tax_rate", "Tipo de impuesto (%)", "decimal"), f("line_total", "Importe de la línea", "decimal"),
];

export const STANDARD_TYPES: CatalogType[] = [
  // ---------- masters ----------
  { key: "company", name: "Empresas", description: "Empresas y autónomos con los que se relaciona el negocio: proveedores, clientes, suministradoras… y el propio negocio.", fields: [
    ...party,
    f("is_own_company", "Es mi empresa", "boolean", "Marca la empresa del propio espacio de trabajo (receptora habitual de las facturas de compra)."),
  ] },
  { key: "contact", name: "Contactos", description: "Personas de contacto.", fields: [
    f("full_name", "Nombre completo", "text"), f("first_name", "Nombre", "text"), f("last_name", "Apellidos", "text"),
    f("email", "Correo electrónico", "text"), f("phone", "Teléfono", "text"), f("role", "Cargo o función", "text"),
  ] },
  { key: "site", name: "Locales y centros", description: "Locales, tiendas, obradores o almacenes del negocio.", fields: [
    f("name", "Nombre", "text", undefined, { required: true }), f("address", "Dirección", "long_text"), f("postal_code", "Código postal", "text"),
    f("city", "Población", "text"), f("site_type", "Tipo", "text", "Tienda, obrador, almacén, oficina…"), f("notes", "Notas", "long_text"),
  ] },
  { key: "employee", name: "Empleados", description: "Personas que trabajan en el negocio.", fields: [
    f("full_name", "Nombre completo", "text", undefined, { required: true }), f("national_id", "DNI/NIE", "text", undefined, { unique: true }),
    f("job_title", "Puesto", "text"), f("start_date", "Fecha de alta", "date"), f("end_date", "Fecha de baja", "date"),
    f("email", "Correo electrónico", "text"), f("phone", "Teléfono", "text"),
  ] },
  { key: "product", name: "Productos", description: "Artículos, materias primas y servicios que se compran o venden.", fields: [
    f("sku", "Referencia (SKU)", "text", "Referencia interna o del proveedor."), f("name", "Nombre", "text"),
    f("description", "Descripción", "long_text"), f("kind", "Tipo", "text", "Materia prima, mercancía, servicio, consumible…"),
    f("unit", "Unidad", "text"), f("base_price", "Precio base", "decimal"), f("tax_rate", "Tipo de impuesto (%)", "decimal"),
    f("barcode", "Código de barras (EAN)", "text", undefined, { unique: true }), f("brand", "Marca", "text"),
    f("category", "Categoría", "text", "Lácteos, limpieza, ferretería…"), f("status", "Estado", "text", "Activo o descatalogado."),
  ] },
  { key: "supplier_catalog", name: "Catálogos y tarifas de proveedor", description: "Listas de precios o catálogos que envía un proveedor.", fields: [
    f("name", "Nombre", "text", undefined, { required: true }), f("reference", "Referencia", "text"),
    f("valid_from", "Válida desde", "date"), f("valid_until", "Válida hasta", "date"), f("currency", "Moneda", "text"), f("notes", "Notas", "long_text"),
  ] },
  { key: "supplier_catalog_item", name: "Artículos de catálogo de proveedor", description: "Cada artículo y precio de un catálogo o tarifa de proveedor.", fields: [
    f("supplier_reference", "Referencia del proveedor", "text"), f("description", "Descripción", "long_text", undefined, { required: true }),
    f("unit", "Unidad", "text"), f("pack_size", "Formato o envase", "text", "Caja de 6, saco de 25 kg…"),
    f("unit_price", "Precio unitario", "decimal"), f("price_basis", "Precio con o sin impuestos", "text", "«sin_impuestos» o «con_impuestos»."),
    f("tax_rate", "Tipo de impuesto (%)", "decimal"), f("min_quantity", "Cantidad mínima", "decimal"), f("valid_from", "Precio válido desde", "date"),
  ] },
  { key: "bank_account", name: "Cuentas bancarias", description: "Cuentas bancarias propias o de terceros.", fields: [
    f("iban", "IBAN o número de cuenta", "text", "Tal como aparece (puede venir enmascarado).", { required: true }),
    f("bank_name", "Entidad", "text"), f("holder_name", "Titular", "text"), f("currency", "Moneda", "text"),
  ] },
  // ---------- transactions ----------
  { key: "invoice", name: "Facturas", description: "Facturas emitidas o recibidas, incluidas las simplificadas (tickets) y las rectificativas.", fields: [
    f("invoice_number", "Número de factura", "text", undefined, { required: true }), f("issue_date", "Fecha de emisión", "date"),
    f("due_date", "Vencimiento o fecha de cargo", "date"), f("currency", "Moneda", "text"),
    f("net_amount", "Base imponible", "decimal"), f("tax_amount", "Total impuestos", "decimal"), f("total_amount", "Total", "decimal"),
    f("payment_terms", "Condiciones de pago", "text"), f("reference", "Referencia", "text"), f("notes", "Notas", "long_text"),
    f("payment_method", "Forma de pago", "text"),
    f("payment_account", "Cuenta de pago", "text", "IBAN o cuenta de cobro o cargo tal como aparece."),
    f("order_reference", "Pedido o ticket de origen", "text", "Número de pedido o ticket de caja del que procede la factura."),
    f("invoice_kind", "Clase de factura", "text", "Ordinaria, simplificada (ticket) o rectificativa."),
    f("direction", "Sentido", "text", "Recibida (compra o gasto) o emitida (venta)."),
    f("period_start", "Inicio del periodo facturado", "date"), f("period_end", "Fin del periodo facturado", "date"),
  ] },
  { key: "invoice_line", name: "Líneas de factura", description: "Artículos o conceptos de una factura.", fields: [
    ...documentLine,
    f("unit_price_with_tax", "Precio unitario con impuestos", "decimal", "Cuando el documento imprime ambos precios."),
    f("line_total_with_tax", "Importe con impuestos", "decimal", "Cuando el documento imprime ambos importes."),
    f("unit_price_basis", "Precio unitario con o sin impuestos", "text", "«sin_impuestos» o «con_impuestos»."),
    f("line_total_basis", "Importe con o sin impuestos", "text", "«sin_impuestos» o «con_impuestos»."),
    f("calculation_detail", "Detalle del cálculo", "long_text", "Cantidades y precios del cálculo tal como aparecen (12 kW x 31 días…)."),
    f("source_ticket_number", "Ticket de origen", "text", "Ticket o factura simplificada de la que procede la línea, si la factura agrupa varios."),
    f("source_ticket_date", "Fecha del ticket de origen", "date", "Fecha de compra de la línea (gasto por producto y mes)."),
  ] },
  { key: "invoice_tax_line", name: "Desglose de impuestos", description: "Base, tipo y cuota de cada impuesto de una factura.", fields: [
    f("tax_type", "Impuesto", "text", "IVA, IGIC, recargo de equivalencia, IRPF…"), f("tax_rate", "Tipo (%)", "decimal"),
    f("taxable_base", "Base imponible", "decimal"), f("tax_amount", "Cuota", "decimal"),
  ] },
  { key: "delivery_note", name: "Albaranes", description: "Albaranes de entrega de mercancía.", fields: [
    f("delivery_note_number", "Número de albarán", "text", undefined, { required: true }), f("issue_date", "Fecha", "date"),
    f("order_reference", "Pedido", "text"), f("total_amount", "Total", "decimal"), f("notes", "Notas", "long_text"),
  ] },
  { key: "delivery_note_line", name: "Líneas de albarán", description: "Artículos entregados en un albarán.", fields: [
    ...documentLine, f("lot_number", "Lote", "text"), f("expiry_date", "Fecha de caducidad", "date"),
  ] },
  { key: "purchase_order", name: "Pedidos a proveedor", description: "Pedidos de compra enviados a proveedores.", fields: [
    f("order_number", "Número de pedido", "text", undefined, { required: true }), f("order_date", "Fecha", "date"),
    f("expected_date", "Fecha prevista de entrega", "date"), f("status", "Estado", "text"), f("currency", "Moneda", "text"),
    f("net_amount", "Base imponible", "decimal"), f("tax_amount", "Impuestos", "decimal"), f("total_amount", "Total", "decimal"), f("notes", "Notas", "long_text"),
  ] },
  { key: "purchase_order_line", name: "Líneas de pedido a proveedor", description: "Artículos de un pedido de compra.", fields: documentLine },
  { key: "quote", name: "Presupuestos", description: "Presupuestos recibidos o emitidos.", fields: [
    f("quote_number", "Número de presupuesto", "text"), f("issue_date", "Fecha", "date"), f("valid_until", "Válido hasta", "date"),
    f("currency", "Moneda", "text"), f("net_amount", "Base imponible", "decimal"), f("tax_amount", "Impuestos", "decimal"),
    f("total_amount", "Total", "decimal"), f("status", "Estado", "text"), f("notes", "Notas", "long_text"),
  ] },
  { key: "quote_line", name: "Líneas de presupuesto", description: "Conceptos de un presupuesto.", fields: documentLine },
  { key: "payment", name: "Pagos y cobros", description: "Pagos realizados o cobros recibidos.", fields: [
    f("payment_reference", "Referencia", "text"), f("payment_date", "Fecha", "date"), f("amount", "Importe", "decimal"),
    f("currency", "Moneda", "text"), f("method", "Medio de pago", "text"), f("status", "Estado", "text"), f("notes", "Notas", "long_text"),
  ] },
  { key: "bank_transaction", name: "Movimientos bancarios", description: "Movimientos de un extracto bancario.", fields: [
    f("transaction_date", "Fecha", "date", undefined, { required: true }), f("value_date", "Fecha valor", "date"),
    f("description", "Concepto", "long_text"), f("amount", "Importe", "decimal", "Negativo si es un cargo."),
    f("balance", "Saldo", "decimal"), f("currency", "Moneda", "text"), f("reference", "Referencia", "text"),
  ] },
  { key: "cash_closing", name: "Cierres de caja", description: "Cierre diario de caja de un local.", fields: [
    f("closing_date", "Fecha", "date", undefined, { required: true }), f("opening_balance", "Fondo inicial", "decimal"),
    f("cash_sales", "Ventas en efectivo", "decimal"), f("card_sales", "Ventas con tarjeta", "decimal"), f("other_sales", "Otras ventas", "decimal"),
    f("total_sales", "Total ventas", "decimal"), f("cash_counted", "Efectivo contado", "decimal"), f("difference", "Descuadre", "decimal"),
    f("notes", "Notas", "long_text"),
  ] },
  { key: "contract", name: "Contratos", description: "Contratos de alquiler, suministro, servicios, seguros, préstamos…", fields: [
    f("contract_number", "Número de contrato", "text"), f("contract_type", "Tipo", "text"), f("start_date", "Inicio", "date"),
    f("end_date", "Fin", "date"), f("amount", "Importe", "decimal"), f("periodicity", "Periodicidad", "text", "Mensual, anual…"), f("notes", "Notas", "long_text"),
  ] },
  // ---------- supplies ----------
  { key: "supply_point", name: "Puntos de suministro", description: "Suministros contratados: luz (CUPS), gas, agua, teléfono e internet.", fields: [
    f("supply_point_id", "Identificador del suministro", "text", "CUPS, identificador de acceso o de servicio; clave para reconocerlo.", { required: true, unique: true }),
    f("supply_type", "Tipo de suministro", "text", "Electricidad, gas, agua, telecomunicaciones."), f("address", "Dirección del suministro", "long_text"),
    f("tariff", "Tarifa o plan", "text"), f("contract_number", "Número de contrato o de cliente", "text"), f("contract_end_date", "Fin de contrato", "date"),
  ] },
  { key: "telecom_line", name: "Líneas de teléfono e internet", description: "Líneas fijas, móviles o de datos.", fields: [
    f("number", "Número de línea", "text", undefined, { required: true, unique: true }), f("service", "Servicio", "text", "Fijo, móvil, fibra…"), f("plan", "Tarifa", "text"),
  ] },
  { key: "contracted_power", name: "Potencias contratadas", description: "Potencia contratada por periodo tarifario en una factura de electricidad.", fields: [
    f("period", "Periodo", "text", "P1, P2…", { required: true }), f("power_kw", "Potencia (kW)", "decimal"),
  ] },
  { key: "energy_consumption", name: "Consumos de energía", description: "Consumo por periodo tarifario en una factura.", fields: [
    f("period", "Periodo", "text", "P1, P2… o total", { required: true }), f("energy_kwh", "Energía (kWh)", "decimal"),
  ] },
  { key: "meter_reading", name: "Lecturas de contador", description: "Lecturas anterior y actual del contador en una factura.", fields: [
    f("meter_number", "Número de contador", "text"), f("period", "Periodo", "text"), f("reading_date", "Fecha de lectura", "date"),
    f("previous_reading", "Lectura anterior", "decimal"), f("current_reading", "Lectura actual", "decimal"), f("reading_type", "Tipo de lectura", "text", "Real o estimada."),
  ] },
];

const r = (key: string, name: string, from: string, to: string, cardinality: CatalogRelation["cardinality"], description: string): CatalogRelation =>
  ({ key, name, from, to, cardinality, description });

export const STANDARD_RELATIONS: CatalogRelation[] = [
  r("invoice_issuer", "Emisor de la factura", "company", "invoice", "one_to_many", "Empresa que emite la factura."),
  r("invoice_customer", "Receptor de la factura", "company", "invoice", "one_to_many", "Empresa a la que se factura."),
  r("invoice_lines", "Líneas de la factura", "invoice", "invoice_line", "one_to_many", "Artículos o conceptos de la factura."),
  r("invoice_tax_lines", "Impuestos de la factura", "invoice", "invoice_tax_line", "one_to_many", "Desglose de impuestos de la factura."),
  r("product_invoice_lines", "Producto de la línea", "product", "invoice_line", "one_to_many", "Producto comprado o vendido en la línea."),
  r("invoice_supply_point", "Suministro facturado", "supply_point", "invoice", "one_to_many", "Suministro al que corresponde la factura."),
  r("invoice_telecom_lines", "Líneas facturadas", "telecom_line", "invoice", "many_to_many", "Líneas de teléfono incluidas en la factura."),
  r("invoice_contracted_power", "Potencias de la factura", "invoice", "contracted_power", "one_to_many", "Potencia contratada por periodo en la factura."),
  r("invoice_energy_consumption", "Consumos de la factura", "invoice", "energy_consumption", "one_to_many", "Consumo por periodo en la factura."),
  r("invoice_meter_readings", "Lecturas de la factura", "invoice", "meter_reading", "one_to_many", "Lecturas de contador de la factura."),
  r("invoice_delivery_notes", "Albaranes de la factura", "invoice", "delivery_note", "one_to_many", "Albaranes que agrupa la factura."),
  // Already published as many_to_many: one payment may settle several invoices.
  r("invoice_payments", "Pagos de la factura", "invoice", "payment", "many_to_many", "Pagos o cobros de la factura."),
  r("invoice_site", "Local de la factura", "site", "invoice", "one_to_many", "Local al que se imputa la factura."),
  r("supply_point_holder", "Titular del suministro", "company", "supply_point", "one_to_many", "Empresa titular del suministro."),
  r("supply_point_site", "Local del suministro", "site", "supply_point", "one_to_many", "Local donde está el suministro."),
  r("telecom_line_holder", "Titular de la línea", "company", "telecom_line", "one_to_many", "Empresa titular de la línea."),
  r("company_contacts", "Contactos de la empresa", "company", "contact", "one_to_many", "Personas de contacto de la empresa."),
  r("company_sites", "Locales de la empresa", "company", "site", "one_to_many", "Locales de la empresa."),
  r("company_employees", "Empleados de la empresa", "company", "employee", "one_to_many", "Personas contratadas por la empresa."),
  r("company_bank_accounts", "Cuentas de la empresa", "company", "bank_account", "one_to_many", "Cuentas bancarias de la empresa."),
  r("bank_account_transactions", "Movimientos de la cuenta", "bank_account", "bank_transaction", "one_to_many", "Movimientos del extracto de la cuenta."),
  r("supplier_catalog_supplier", "Proveedor del catálogo", "company", "supplier_catalog", "one_to_many", "Proveedor que emite el catálogo o tarifa."),
  r("supplier_catalog_items", "Artículos del catálogo", "supplier_catalog", "supplier_catalog_item", "one_to_many", "Artículos y precios del catálogo."),
  r("supplier_catalog_item_product", "Producto del artículo", "product", "supplier_catalog_item", "one_to_many", "Producto al que corresponde el artículo del proveedor."),
  r("delivery_note_supplier", "Proveedor del albarán", "company", "delivery_note", "one_to_many", "Empresa que entrega la mercancía."),
  r("delivery_note_customer", "Destinatario del albarán", "company", "delivery_note", "one_to_many", "Empresa que recibe la mercancía."),
  r("delivery_note_lines", "Líneas del albarán", "delivery_note", "delivery_note_line", "one_to_many", "Artículos entregados."),
  r("delivery_note_line_product", "Producto de la línea de albarán", "product", "delivery_note_line", "one_to_many", "Producto entregado."),
  r("purchase_order_supplier", "Proveedor del pedido", "company", "purchase_order", "one_to_many", "Proveedor al que se pide."),
  r("purchase_order_lines", "Líneas del pedido", "purchase_order", "purchase_order_line", "one_to_many", "Artículos pedidos."),
  r("purchase_order_line_product", "Producto de la línea de pedido", "product", "purchase_order_line", "one_to_many", "Producto pedido."),
  r("quote_issuer", "Emisor del presupuesto", "company", "quote", "one_to_many", "Empresa que emite el presupuesto."),
  r("quote_customer", "Destinatario del presupuesto", "company", "quote", "one_to_many", "Empresa a la que se presupuesta."),
  r("quote_lines", "Líneas del presupuesto", "quote", "quote_line", "one_to_many", "Conceptos presupuestados."),
  r("cash_closing_site", "Local del cierre", "site", "cash_closing", "one_to_many", "Local al que pertenece el cierre de caja."),
  r("contract_provider", "Proveedor del contrato", "company", "contract", "one_to_many", "Empresa que presta el servicio o arrienda."),
  r("contract_customer", "Cliente del contrato", "company", "contract", "one_to_many", "Empresa que contrata."),
  r("contract_supply_point", "Suministro del contrato", "supply_point", "contract", "one_to_many", "Suministro al que se refiere el contrato."),
];

/**
 * Where each field of the extraction field sets is stored: role.field → catalog type.field. A field may land on
 * another entity than its role (the billed period printed with the supply belongs to the invoice).
 */
export const FIELD_SET_MAPPING: Record<string, Record<string, { type: string; field: string }>> = {
  invoice: {
    invoice_number: { type: "invoice", field: "invoice_number" }, issue_date: { type: "invoice", field: "issue_date" },
    subtotal: { type: "invoice", field: "net_amount" }, tax_amount: { type: "invoice", field: "tax_amount" },
    total_amount: { type: "invoice", field: "total_amount" }, currency: { type: "invoice", field: "currency" },
    due_date: { type: "invoice", field: "due_date" }, payment_method: { type: "invoice", field: "payment_method" },
    payment_terms: { type: "invoice", field: "payment_terms" }, payment_account: { type: "invoice", field: "payment_account" },
    order_or_ticket_number: { type: "invoice", field: "order_reference" },
  },
  issuer: { legal_name: { type: "company", field: "legal_name" }, tax_id: { type: "company", field: "tax_identifier" }, address: { type: "company", field: "address" } },
  recipient: { legal_name: { type: "company", field: "legal_name" }, tax_id: { type: "company", field: "tax_identifier" }, address: { type: "company", field: "address" } },
  tax_breakdown: { tax_rate: { type: "invoice_tax_line", field: "tax_rate" }, taxable_base: { type: "invoice_tax_line", field: "taxable_base" }, tax_amount: { type: "invoice_tax_line", field: "tax_amount" } },
  supply: {
    supply_point_id: { type: "supply_point", field: "supply_point_id" }, plan: { type: "supply_point", field: "tariff" },
    contract_number: { type: "supply_point", field: "contract_number" },
    period_start: { type: "invoice", field: "period_start" }, period_end: { type: "invoice", field: "period_end" },
  },
  charges: { description: { type: "invoice_line", field: "description" }, calculation: { type: "invoice_line", field: "calculation_detail" }, line_total: { type: "invoice_line", field: "line_total" } },
  lines: {
    description: { type: "invoice_line", field: "description" }, product_reference: { type: "invoice_line", field: "product_reference" },
    quantity: { type: "invoice_line", field: "quantity" }, unit: { type: "invoice_line", field: "unit" }, unit_price: { type: "invoice_line", field: "unit_price" },
    unit_price_basis: { type: "invoice_line", field: "unit_price_basis" }, discount: { type: "invoice_line", field: "discount_amount" },
    tax_rate: { type: "invoice_line", field: "tax_rate" }, line_total: { type: "invoice_line", field: "line_total" },
    unit_price_with_tax: { type: "invoice_line", field: "unit_price_with_tax" }, line_total_with_tax: { type: "invoice_line", field: "line_total_with_tax" },
    line_total_basis: { type: "invoice_line", field: "line_total_basis" }, source_ticket_number: { type: "invoice_line", field: "source_ticket_number" },
    source_ticket_date: { type: "invoice_line", field: "source_ticket_date" },
  },
  power: { period: { type: "contracted_power", field: "period" }, power_kw: { type: "contracted_power", field: "power_kw" } },
  consumption: { period: { type: "energy_consumption", field: "period" }, energy_kwh: { type: "energy_consumption", field: "energy_kwh" } },
  meter_readings: {
    period: { type: "meter_reading", field: "period" }, previous_reading: { type: "meter_reading", field: "previous_reading" },
    current_reading: { type: "meter_reading", field: "current_reading" }, reading_type: { type: "meter_reading", field: "reading_type" },
  },
  lines_service: { number: { type: "telecom_line", field: "number" }, service: { type: "telecom_line", field: "service" } },
};
