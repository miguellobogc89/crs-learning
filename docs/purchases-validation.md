# Validación de compras

Todo vive en `lib/purchases/` (y su interfaz en `components/purchases/`, `app/api/purchases/`). Fuera solo hay tres enganches:
`lib/analytics/data.ts` carga las respuestas, `lib/analytics/compute.ts` añade las columnas a «Productos comprados» y
`components/chat/floating-chat.tsx` muestra las preguntas.

## Parte automática (`rules.ts`, pura, tests en `tests/purchases/rules.test.mjs`)
Cada línea debe cumplir **cantidad × precio − descuento = importe**. Si no, casi siempre es la importación la que no
entendió la factura. Si una explicación cuadra **al céntimo**, se corrige sola, sin preguntar:
- el descuento es un %; el importe lleva IVA;
- la cantidad son envases y el precio va por kilo/litro (o al revés);
- la cantidad se leyó mal (solo si el precio leído es el habitual del producto).
También se resuelven solas: las unidades de regalo (sin importe; se valoran con el precio pagado del mismo producto)
y las cifras que faltan pero se deducen de las otras. Lo leído en la factura nunca se cambia: son cifras calculadas.

## Parte para la persona (`questions.ts` + `components/purchases/purchase-questions.tsx`)
Solo lo que nada explica. Preguntas de una en una, sin tablas: «¿Cuántas cajas de «…» compraste?», con la factura a
mano y respuestas probables para pulsar; «No lo sé» deja la línea como viene y no se vuelve a preguntar.
Las respuestas se guardan en `purchase_line_reviews` (`scripts/neon/20261029_purchase_line_reviews.sql`) y mandan
sobre lo calculado.

## En Analítica
«Productos comprados» añade: Tipo (Compra/Regalo), Cantidad real, Ud., Dto. %, Precio final, Ahorro (regalo),
Por confirmar y Detalle (qué se corrigió). Las líneas por confirmar salen en amarillo.
