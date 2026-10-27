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
