# Validación de compras

Todo vive en `lib/purchases/`. Fuera solo hay dos enganches: `lib/analytics/compute.ts` añade sus columnas a
«Productos comprados» y la tabla (`components/analytics/data-table.tsx`) resalta en amarillo las filas con `_attention`.

## `rules.ts` (pura, tests en `tests/purchases/rules.test.mjs`)
Cada línea debe cumplir **cantidad × precio − descuento = importe**. Si una explicación cuadra **al céntimo**, se
corrige sola: el descuento es un %; el importe lleva IVA; la cantidad son envases y el precio va por kilo/litro (o al
revés); la cantidad se leyó mal (solo si el precio leído es el habitual del producto). Las unidades sin importe son
regalos (valorados con el precio pagado del mismo producto) y las cifras que faltan pero se deducen se rellenan.
Lo que nada explica se deja como viene y se marca («No cuadra»). Lo leído en la factura nunca se cambia.

## `analytics.ts`
Lee las compras de Analítica (con el contenido del envase del catálogo enlazado, o del nombre) y da las columnas:
Tipo (Compra/Regalo), Cantidad real, Ud., Dto. %, Precio final, Ahorro (regalo), No cuadra y Detalle.
