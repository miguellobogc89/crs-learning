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

## Proponer cambios (crear tablas, columnas, filas y enlaces)

Segunda herramienta, `proponer_cambios`. El asistente **propone** y la persona **aplica** con un botón; nada se escribe
sin esa confirmación.

- Operaciones (`lib/assistant/changes/plan.ts`): `crear_tabla`, `añadir_columnas` (también de tipo `enlace`, que apunta
  a filas de otra tabla), `crear_filas` y `volcar_consulta` (con `clave`: si la fila ya existe se actualiza; así se
  refresca un catálogo sin duplicar), `actualizar_filas`, `enlazar` (por pares de nombres o por coincidencia de
  columnas, sin distinguir mayúsculas ni tildes) y `borrar_filas`.
- Solo las tablas creadas con el asistente admiten filas y columnas normales; a las de documentos y a las base solo se
  les pueden añadir columnas de enlace.
- El plan es una simulación pura contra las tablas actuales: errores (que el modelo corrige), avisos (filas sin
  pareja…), cifras y un ejemplo por paso. Se guarda con el mensaje (`sources_json.proposals`) y el chat lo muestra
  como tarjeta (`components/chat/proposal-card.tsx`) con «Aplicar» / «Descartar».
- Aplicar (`POST /api/assistant/proposals`, solo propietario o administrador) vuelve a calcular el plan con datos
  frescos y lo ejecuta en una transacción (`apply.ts`): tipos de objeto con `settings.origen = "asistente"`, columnas,
  relaciones `enlace:<tipo>:<columna>` (de la fila enlazada a las que apuntan, `one_to_many`), filas y enlaces. Cada
  cambio de fila es una revisión nueva.
- «Deshacer» usa el registro guardado al aplicar: filas como estaban (nueva revisión), enlaces restaurados, filas
  nuevas archivadas, tablas/columnas/relaciones retiradas (su clave se renombra para poder volver a crearlas).
- Analítica muestra estas tablas en Tablas («Creada con el asistente») y las columnas de enlace en cualquier tabla.

Ejemplo: «crea un catálogo con el último precio de cada producto por proveedor y enlaza los ingredientes de las
recetas con él» → `crear_tabla` + `volcar_consulta` (agrupar por producto y proveedor, `ultimo` precio según fecha)
+ `añadir_columnas` (enlace en Recetas) + `enlazar` por nombre. Después, el coste de una receta es una consulta con
`formulas` (cantidad × precio) cruzando con el catálogo.

## Seguridad

- Consultas de solo lectura. Los cambios solo se escriben al pulsar «Aplicar» (propietario o administrador) y se pueden deshacer.
- Solo el espacio de trabajo activo del usuario (mismo alcance que Analítica).
- No se exponen identificadores internos ni enlaces a ficheros al modelo.

## Tests

`npm run test:assistant`
