# Revisión de compras

Cada línea de compra debe cuadrar consigo misma: **cantidad × precio − descuento = importe**.

`lib/purchases/review.ts` (puro, con tests en `tests/purchases/review.test.mjs`) clasifica cada línea:

| Estado | Caso | Qué significa |
|---|---|---|
| OK | cuadra | Está bien. |
| Corrección propuesta | descuento_pct | El descuento es un % que se guardó como euros. |
| | con_iva | El importe leído lleva IVA. |
| | envases | La cantidad son envases y el precio va por kilo/litro: cantidad real = cantidad × contenido. |
| | precio_por_envase | Al revés: la cantidad va en kilos/litros y el precio por envase. |
| | cantidad_mal_leida | El importe indica otra cantidad (un número entero de unidades). |
| Regalo | regalo | Cantidad sin importe: se valora con el precio pagado del mismo producto (mejor de la misma factura) y su ahorro va aparte. |
| Faltan datos | faltan_datos | Falta cantidad, precio o importe. |
| Duda | duda | Ninguna explicación encaja: se pregunta a la persona. |

El contenido de cada unidad sale del catálogo enlazado desde «compras» (columna `envase` y `unidad`) o, si no, del nombre del producto.
Si en una línea de un producto hubo que multiplicar por el contenido, el precio de ese producto se entiende por kilo/litro en todas sus líneas.

- **Analítica › Productos comprados** muestra la revisión (columnas Revisión, Tipo, Cantidad real, Dto. %, Precio final, Ahorro en regalos, Detalle) y resalta en amarillo las dudas y los datos que faltan. Se recalcula en vivo, también para las facturas nuevas.
- **Nada se guarda sin la persona**: el asistente propone `revisar_compras` (aceptar correcciones, o la respuesta a una duda con `ajustes`: contenido, descuento, precio final fijado) y se aplica con «Sí». Se guarda en `purchase_line_reviews` (script `scripts/neon/20261029_purchase_line_reviews.sql`), nunca encima de lo leído en la factura, y se puede deshacer.
- **Chat**: al abrirse vacío, si hay correcciones o dudas, muestra el aviso «He revisado tus compras…» (`/api/assistant/review-summary`).
