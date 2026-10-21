# Diagnóstico de la simulación de importación

El flujo de cinco fases de Knowledge termina en
`app/api/knowledge/import/[importId]/preview-records/route.ts`.
No usa el importador con persistencia `auto-import-knowledge.service.ts`.

## Causas verificadas

- La quinta fase filtraba los tipos activos por `existingKeys`. Sin coincidencias
  devolvía cero registros sin intentar descubrir estructuras.
- Su prompt prohibía entidades y campos nuevos. Las estructuras de
  `identify-relations` eran descripciones informativas sin campos utilizables.
- Solo se permitían relaciones persistidas en Engine. Una relación descubierta
  con definición todavía ausente nunca podía producir vínculos de registros.
- Solo se enviaba el primer bloque de unos 2.600 caracteres, con topes de
  15 registros y 20 vínculos. Las secciones posteriores quedaban fuera.

## Cambio

La quinta fase reutiliza `analyzeStructuredDocument` con el esquema activo como
contexto. Descubre conjuntamente entidades, campos, definiciones de relaciones,
registros y vínculos, también cuando Engine está vacío. El comportamiento de
los otros consumidores del analizador conserva su límite de 16.000 caracteres
y su prompt anterior; el contexto adicional se usa en esta simulación.

`buildSimulationManifest` proyecta el resultado sin acceso a base de datos.
Conserva las dependencias nuevas como propuestas y distingue campos o relaciones
incompatibles. Comprueba tipos, valores literales, evidencias y extremos de los
vínculos; mantiene los índices originales aunque se rechacen filas intermedias.
Los conflictos y referencias sin resolver se exportan para revisión.

El TXT incluye estructuras y campos, definiciones de relaciones, registros,
vínculos concretos, referencias pendientes y cobertura. Se mantienen las cinco
fases y el botón de descarga. La extracción se inicia para todos los documentos
reconocidos, aunque no haya coincidencias semánticas con tablas existentes.

## Límites y validación

La simulación admite hasta 60.000 caracteres, 150 registros y 300 vínculos por
documento. Un documento mayor produce un error explícito antes de llamar a la IA.
Alcanzar el límite de registros o vínculos marca la cobertura para revisión.
Enviar todo el texto no garantiza exhaustividad semántica de una respuesta de IA.
Identidad y duplicados siguen sin validarse; el TXT no es SQL ejecutable.

Las pruebas de `tests/engine/simulation-manifest.test.mjs` usan respuestas de IA
controladas y una base simulada que rechaza cualquier método de escritura.
Cubren Engine vacío, tipos existentes, campos nuevos e incompatibles, pedidos
con líneas y cantidades, composición recursiva, referencias inválidas, evidencia
inventada, secciones posteriores a 16.000 caracteres, acceso y documentos excesivos.
Estas pruebas no son una evaluación de calidad con IA real ni con documentos de
producción. No se ejecutan importaciones persistentes ni migraciones.
