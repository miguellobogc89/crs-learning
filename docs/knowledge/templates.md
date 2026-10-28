# Plantillas: tablas para tipos de documento sin conjunto de campos

Los tipos con conjunto de campos revisado (facturas, tickets) se extraen y guardan en el flujo normal. El resto
(nóminas, recibos, cargos bancarios, modelos de impuestos…) se leía y clasificaba pero **no guardaba datos**. Ahora:

1. **Pendientes** (`GET /api/knowledge/intake/templates`, `templates/pending.ts`): partes clasificadas de las
   importaciones del espacio de trabajo que no tienen conjunto de campos (ni son de consulta), agrupadas por
   familia/tipo/subtipo, con el estado de cada documento frente a su plantilla.
2. **Propuesta** (`POST …/templates/propose`, `templates/propose.ts`): la IA lee el texto (lectura base) de hasta 3
   documentos del tipo y propone nombre, columnas (texto, texto largo, importe, fecha, entero), cuáles identifican un
   registro, si un documento trae varios, y cómo suma en Analítica (categoría, importe y fecha). Solo es una propuesta.
3. **Revisión y alta** (`POST …/templates`): la persona la edita (componente `TemplateManager`) y la acepta. Se crea
   `intake_templates` y una tabla del espacio de trabajo (`engine_object_types` con clave `doc_<nombre>`,
   `settings.template_id`).
4. **Proceso** (`POST …/templates/<id>/documents {importId, importFileId, accion}`), documento a documento, desde el
   original guardado: misma llamada visual que la extracción dirigida (`extractWithPlans`, con reintentos de red y de
   espacio), valores tipados (`templates/contract.ts`), evidencia por campo y una clave por registro (columnas que
   identifican, o documento+parte+fila) para no duplicar al reprocesar. «No guardar» marca el documento como ignorado.
   Cada resultado queda en `intake_template_documents` (por versión de plantilla).
5. Con la página abierta, los documentos nuevos de un tipo con plantilla se procesan solos.

En Drive, los documentos importados sin datos aparecen como **«Sin datos (sin tabla)»**. En Analítica, las tablas de
plantillas salen en «De tus documentos» y, si suman como gasto, entran en los paneles con su categoría (nuevas:
**Personal** e **Impuestos**).

Neon: `scripts/neon/20261028_intake_templates.sql` y `npx prisma generate`.
