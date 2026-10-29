# Validación de compras

Todo vive en `lib/purchases/` (y su interfaz en `components/purchases/`, `app/api/purchases/`). Fuera solo hay cuatro enganches:
`lib/analytics/data.ts` carga las respuestas, `lib/analytics/compute.ts` añade las columnas a «Productos comprados»,
`app/api/assistant/route.ts` recibe las respuestas escritas y `components/chat/floating-chat.tsx` muestra la conversación.

## Parte automática (`rules.ts`, pura, tests en `tests/purchases/rules.test.mjs`)
Cada línea debe cumplir **cantidad × precio − descuento = importe**. Si no, casi siempre es la importación la que no
entendió la factura. Si una explicación cuadra **al céntimo**, se corrige sola, sin preguntar:
- el descuento es un %; el importe lleva IVA;
- la cantidad son envases y el precio va por kilo/litro (o al revés);
- la cantidad se leyó mal (solo si el precio leído es el habitual del producto).
También se resuelven solas: las unidades de regalo (sin importe; se valoran con el precio pagado del mismo producto)
y las cifras que faltan pero se deducen de las otras. Lo leído en la factura nunca se cambia: son cifras calculadas.

## Parte para la persona (`questions.ts`, `answers.ts`, `conversation.service.ts`)
Solo lo que nada explica, como una conversación del asistente: «Preguntas sobre tus facturas», una por persona y
espacio de trabajo. Se crea (o continúa) al abrir el chat, se abre sola la primera vez y queda en la lista con un
aviso mientras haya preguntas pendientes. Cada pregunta es un mensaje sencillo, sin tablas, con la factura a mano;
se contesta escribiendo: un número («12», «18,50»), «no lo sé» (la línea se queda como viene y no se vuelve a
preguntar) o «saltar». Una pregunta de verdad («¿por qué me preguntas esto?») la contesta el asistente normal.
Las respuestas se guardan en `purchase_line_reviews` (`scripts/neon/20261029_purchase_line_reviews.sql`) y mandan
sobre lo calculado. Enganches: `app/api/assistant/route.ts` (pasa el mensaje a `answerQuestion`) y
`components/chat/floating-chat.tsx` (con `components/purchases/purchase-questions.tsx`).

## En Analítica
«Productos comprados» añade: Tipo (Compra/Regalo), Cantidad real, Ud., Dto. %, Precio final, Ahorro (regalo),
Por confirmar y Detalle (qué se corrigió). Las líneas por confirmar salen en amarillo.
