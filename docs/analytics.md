# Analítica

Sección `/analytics` (menú «Analítica»). Lee los registros ya guardados del espacio de trabajo; no usa IA ni modifica nada.

## Módulos

| Pieza | Qué hace |
|---|---|
| `lib/analytics/data.ts` | Carga (solo lectura) facturas, líneas, empresas, suministros, consumos y líneas de teléfono (máx. 5000 por tabla, avisa si hay más) y las relaciones que las unen. |
| `lib/analytics/compute.ts` | Cálculo puro y testeable: panel (`computeDashboard`) y tablas útiles (`buildTable`). |
| `components/analytics/*` | Gráfico de barras agrupadas (SVG, leyenda, tooltip, vista tabla), rankings, tabla, navegación. |
| `app/(app)/analytics/page.tsx` | Página: `?view=panel` (por defecto) o `?view=tablas&table=…`. |

## Panel

- **Gasto por mes y categoría**: barras agrupadas, una por categoría de gasto (`expense_category` de la factura: suministros, compras, servicios, alquiler, rectificativas, otros). Importe = `total_amount` o, si falta, `net_amount`. Mes = `issue_date`. Últimos 12 meses con datos, sin saltarse meses vacíos. Las facturas emitidas (`direction` = emitida/venta) no son gasto.
- **KPIs**: gasto del periodo, media mensual, último mes frente al anterior, nº de facturas y de proveedores.
- **Proveedores con más gasto** (relación `invoice_issuer`).
- **Productos con más gasto**: líneas de factura que no son de suministros, agrupadas por descripción; fecha = `source_ticket_date` o la de la factura; importe con impuestos si existe.
- **Consumo eléctrico**: kWh por mes de fin de periodo; si la factura imprime un total se usa ese, si no la suma de periodos.

Las facturas sin fecha o importe no se inventan: se cuentan y se avisa debajo del gráfico.

## Tablas

Solo tablas de utilidad, con nombres legibles y los nombres de las relaciones ya resueltos: Facturas, Productos comprados, Proveedores, Suministros, Consumo eléctrico. No se muestran tablas de relaciones ni de impuestos.

## Colores

Paleta categórica fija (el color sigue a la categoría, nunca a su posición): suministros #2a78d6, compras #eb6834, servicios #1baf7a, alquiler #eda100, rectificativas #e87ba4, otros #008300.

## Tests

`npm run test:analytics` (datos sintéticos).

## Ingresos y «Mi empresa» (2026-10-27)

Una factura es **ingreso** si está marcada «emitida», **gasto** si está marcada «recibida» y, si no está marcada, ingreso
cuando su emisor es una empresa con «Mi empresa» (`company.is_own_company`). Se corrige desde Tablas:

- **Empresas**: corregir el nombre (`legal_name`) y marcar «Mi empresa».
- **Facturas**: «Tipo» (Gasto/Ingreso → `invoice.direction`) y «Categoría» (`expense_category`).

Solo esos campos (`lib/analytics/edit.ts`); cada cambio es una revisión nueva del registro (`updateEngineRecord`).
Las tablas de facturas y compras enlazan al **documento original** (`GET /api/knowledge/intake/files/<id>`, a partir de
la evidencia `intake:<lote>/<archivo>/…` de la factura).

## Pestañas del panel

`?tab=general|costes|ingresos|productos` y `?periodo=<año>|12m`.
- **Visión general**: ingresos, gastos, resultado y margen; ingresos y gastos por mes; gasto por categoría; proveedores; últimas facturas.
- **Costes**: gasto por mes y categoría, reparto, detalle por tipo (subcategoría), proveedores, consumo eléctrico, últimos gastos.
- **Ingresos**: por mes, clientes, ingresos frente a gastos, últimas facturas emitidas.
- **Productos**: más gasto, más unidades, cambios de precio unitario (primera y última compra), a quién se compra.

## Unir empresas duplicadas

Tablas → Empresas → «Unir con…» en la duplicada (`lib/analytics/merge.ts`, una transacción con el mismo bloqueo que el
guardado de importaciones): sus relaciones (facturas como emisor o cliente, suministros…) pasan a la que se queda; las
repetidas o entre ambas se descartan; la que se queda conserva sus valores y recibe solo los que le faltan; la duplicada
se **archiva** (no se borra: conserva historial y evidencias). Si el resultado daría dos dueños a algo que admite uno, no se hace nada.

## Corregir emisor y receptor, y líneas leídas dos veces

- Tablas → Facturas: «Emisor» y «Receptor» son desplegables con las empresas guardadas, «— Ninguna» y «+ Nueva
  empresa…» (nombre y NIF/CIF opcional; si el NIF ya existe se reutiliza esa empresa). Cambia la relación
  `invoice_issuer`/`invoice_customer` (`lib/analytics/parties.ts`).
- Facturas cuyas líneas suman exactamente el doble de la base, todas por parejas (original y copia en el mismo PDF):
  aviso arriba de Facturas y Productos comprados, y «Quitar las copias» archiva la segunda de cada pareja (se recalcula
  en el servidor). Al importar, `writer/duplicates.ts` ya no guarda la mitad repetida (con subtotal: si suman el doble;
  sin subtotal: solo con 4 líneas o más).

## Tablas: buscar, filtrar, ordenar y páginas

`components/analytics/data-table.tsx` + `lib/analytics/table-query.ts` (puro, con tests), en el navegador:
- **Buscador**: busca en todo lo visible, sin tildes, todas las palabras («telefonica 01/2026», «1.234,50»).
- **Filtros** en las columnas marcadas `filter: true` (Facturas: emisor, receptor, tipo, categoría; Productos:
  proveedor; Empresas: mi empresa; Suministros: tipo), con buscador si hay más de 8 valores.
- **Ordenar** pulsando la cabecera (asc → desc → sin orden; los vacíos siempre al final).
- **Páginas** de 25, 50 o 100 filas.
- Todos los desplegables usan `components/ui/combobox.tsx` (Popover de Radix, mismo estilo que los menús), con
  buscador opcional y lista corta («escribe para afinar»). Emisor/receptor y «Es la misma que…» lo usan con buscador.
