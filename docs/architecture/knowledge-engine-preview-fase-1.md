# Knowledge → Engine · Fase 1: extracción verificable (solo vista previa)

## Qué hace

Para los documentos que la revisión conjunta marca como `structuredCandidate`
(por **segmento lógico**, no por archivo):

1. **Esquema común** — una llamada (`DISCOVERY_OUTPUT_FORMAT`, strict). Sin citas.
   Identidad declarada por tabla (`identityFields`), con alcance opcional
   (`identityScope`: p. ej. número de factura dentro de su emisor) y pertenencia
   (`ownedBy`: líneas, componentes). Validación: `validateDiscoveredSchema`.
2. **Extracción** — una llamada por segmento, con Structured Output derivado del
   esquema (`extractionOutputFormat`) y las líneas numeradas del segmento.
3. **Verificación determinista** — `validateSegmentExtraction`: cada valor con su
   propia cita (`{line, endLine, text}`), comprobada contra la fuente y contra el
   valor. Sin auditoría por LLM.
4. **Lote** — `reconcileBatch`: registros únicos por identidad declarada;
   conflictos de valores visibles, nunca resueltos en silencio.

Nada se escribe en tablas, catálogo ni registros de Engine. La confirmación de
la importación guarda solo Knowledge.

## Contrato de evidencia

- Normalización declarada y única: NFKC, comillas/guiones tipográficos y espacios.
  Nunca mayúsculas, letras, dígitos ni búsqueda fuera de las líneas citadas.
- Se guarda el texto **original** de la fuente, no el que escribió el modelo.
- Números: se acepta si el valor coincide con alguna lectura (coma o punto
  decimal) de un número escrito en la cita. Sumas y cálculos no se aceptan.
- Fechas numéricas: día primero (dd/mm/aaaa). ISO y meses escritos también.
- Esquema: sin citas. Un campo, tabla o relación nueva sin instancias verificadas
  aparece «sin respaldo».
- Vínculos: mismo documento + cita del **rol** cuando dos relaciones unen el mismo
  par de tablas (emisor/cliente). La pertenencia de líneas no necesita cita.

Límite conocido: una cita literal no prueba el rol de un valor (un teléfono también
está en la fuente). Por eso la UI muestra cada valor con su línea.

## Ejecución y reanudación

- Se lanza con botón; abrir la propuesta no llama al modelo.
- Un análisis por importación (lease en `engine_import_plans.review_json`).
- Cada documento se guarda al verificarse. Un fallo afecta solo a su documento.
  «Continuar» procesa pendientes y fallidos; «Reintentar este documento», solo ese.
- Cerrar el modal o «Detener» aborta las llamadas en curso.
- Telemetría por llamada (duración, tokens, estado) y respuesta cruda completa.

## Validar con los documentos reales

1. Importa las 4 facturas y el procedimiento; en «Propuesta», pulsa
   «Analizar documentos estructurados».
2. Criterios: 4/4 verificadas; un único cliente por CIF con 4 apariciones como
   Cliente; 4 emisores distintos; el procedimiento no aparece en Engine.
3. Exporta la ejecución para repetirla sin modelo:
   `DATABASE_URL=… npm run engine:export-preview-fixture -- <importId>`
   y `npm run test:engine:knowledge-preview`. Los fixtures van a
   `tests/fixtures/private/` (ignorado por git).

## Código

- `lib/engine/knowledge-preview/` — evidence, schema, extraction, reconcile,
  prompts, preview.service, types.
- `app/api/knowledge/import/[importId]/engine-preview/route.ts` — GET estado, POST
  ejecución NDJSON (`continue` · `retry_document` · `restart`).
- `components/knowledge/import/modal/engine-preview-panel.tsx`.
- Legacy pendiente de fase 4: `commitPreparedEngine` y `validateEngineBatchPlan`
  (`knowledge-engine-import.service.ts`, `knowledge-engine-plan.ts`), ya sin uso
  desde la confirmación.
