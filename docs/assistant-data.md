# Asistente: consultar y cruzar datos

El asistente (chat flotante y `/assistant`) puede leer las tablas del espacio de trabajo — las mismas de Analítica:
Facturas, Productos comprados, Empresas, Suministros, Consumo eléctrico y las creadas desde tus documentos — además
del conocimiento documental de siempre.

## Cómo funciona

1. `/api/assistant` carga las tablas del espacio activo (`lib/assistant/data/tools.ts → loadWorkspaceTables`, solo
   lectura) y añade al prompt un **catálogo**: cada tabla con sus columnas, tipos y algunos valores reales.
2. El modelo dispone de una herramienta, `consultar_datos`, con una consulta estructurada (no SQL):
   `tabla`, `cruzar` (otra tabla y las columnas que deben coincidir, sin distinguir mayúsculas ni tildes),
   `filtros` (`=`, `contiene`, `>`, `entre`, `en`, `vacio`…), `agrupar_por` (también `fecha:mes`, `:trimestre`,
   `:año`), `calcular` (suma, media, cuenta, distintos, mín., máx.), `ordenar`, `limite` (máx. 500).
3. La consulta se ejecuta en memoria (`lib/assistant/data/query.ts`, puro y testeado). Los errores vuelven al modelo
   como texto para que corrija la consulta. Hasta 6 rondas de consultas por mensaje.
4. Si el modelo pide `mostrar`, el resultado se guarda con el mensaje (`chat_messages.sources_json.dataBlocks`, hasta
   200 filas) y el chat lo pinta como tabla bajo la respuesta (`components/chat/data-block.tsx`): importes y fechas
   en formato español, descarga CSV y enlace a la tabla en Analítica. El historial menciona los datos mostrados para
   que las preguntas de seguimiento tengan contexto.

Las respuestas basadas en datos no llevan citas `[F…]`; por eso no pasan por la «reparación de citas» del
conocimiento documental.

## Seguridad

- Solo lectura: no hay ninguna operación de escritura en la herramienta.
- Solo el espacio de trabajo activo del usuario (mismo alcance que Analítica).
- No se exponen identificadores internos ni enlaces a ficheros al modelo.

## Tests

`npm run test:assistant`
