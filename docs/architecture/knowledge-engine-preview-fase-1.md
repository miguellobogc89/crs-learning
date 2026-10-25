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
- Vínculos: mismo documento + cita de la relación; cita del **rol** cuando dos
  relaciones unen el mismo par de tablas (emisor/cliente). La pertenencia de
  líneas no necesita cita. Compartir segmento no demuestra una relación.

Límite conocido: una cita literal no prueba el rol de un valor (un teléfono también
está en la fuente). Por eso la UI muestra cada valor con su línea.

## Ejecución y reanudación

- Tras iniciar el lote, el modal genera la propuesta y ejecuta Engine automáticamente.
  Las ventanas sucesivas continúan únicamente checkpoints pendientes con progreso;
  los errores y los documentos que requieren revisión se reintentan explícitamente.
- Un análisis por importación (lease en `engine_import_plans.review_json`).
- Cada documento se guarda al verificarse. Un fallo afecta solo a su documento.
  «Continuar» procesa pendientes y fallidos; «Reintentar este documento», solo ese.
- Cerrar el modal o «Detener» aborta las llamadas en curso.
- Telemetría por llamada (duración, tokens, estado) y respuesta cruda completa.

## Validar con los documentos reales

1. Selecciona las 4 facturas y el procedimiento e inicia el proceso. Debe llegar
   a Engine sin pulsar botones entre fases. Cada fase muestra un informe de texto
   seleccionable con «Copiar fase»; los informes anteriores permanecen en el modal.
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

## Entrega incremental: modal automático y revisión del lote

- Se conserva la línea de fase 1: inventario/revisión existentes, descubrimiento
  conjunto, extracción por segmento, validación determinista y checkpoints.
- El esquema lee todos los segmentos estructurados. Por encima de 120.000
  caracteres se pide dividir el lote, sin muestreo ni truncamiento silencioso.
  La división automática de descubrimiento y su fusión quedan pendientes.
- Las relaciones distintas de la pertenencia de detalles requieren una cita que
  respalde su significado, aunque no haya dos roles entre las mismas tablas.
  No se exige una cita contigua que reúna ambas identidades. Los checkpoints
  anteriores sin esa evidencia se muestran para revisión sin volver a llamar
  al modelo; el reintento individual puede reemplazarlos.
- Conflictos, identidades sin resolver y valores privados en definiciones impiden
  el estado global «Todo verificado», aunque cada documento pase sus citas.
- Reabrir no reinicia la selección ni duplica una ejecución con lease activo.
  Una conexión cortada sin evento final muestra un error recuperable.
- La acción final es «Importar solo en Knowledge» y resume documentos, artículos,
  actualizaciones y carpetas. Se deshabilita durante el análisis de Engine;
  un fallo de Engine permite conservar Knowledge. No escribe en Engine ni publica
  cambios del catálogo global.
- Se conservaron las rutas antiguas. `validateEngineBatchPlan` sigue siendo
  consumidor del servicio antiguo y de sus pruebas; `commitPreparedEngine` no
  tiene consumidores externos al servicio en la búsqueda del repositorio.

Los informes incluyen entrada, estado, regla de validación, valores, archivo,
segmento, líneas y fragmento original, identidades, roles e incidencias. Las
llamadas de Engine muestran latencia y tokens por fase y documento; la suma de
duraciones de llamadas no equivale al tiempo de pared (hay concurrencia). No se
ha medido una mejora de consumo o velocidad respecto a una ejecución real previa.

Limitaciones conservadas: las citas no certifican por sí solas la corrección
semántica de roles; pertenencia de detalles depende de la interpretación del
modelo. El contrato actual rechaza valores calculados, incluidas sumas de bases
y cuotas: incorporar cálculos con operandos citados sigue pendiente. También
quedan pendientes partición de salidas demasiado largas y guardado de Engine.

Validación de esta entrega: TypeScript completo y build de producción ejecutados;
el build requirió acceso de red para las fuentes de Google. Las pruebas del
extractor usan textos sintéticos y modelo/base de datos simulados. El replay real
se omite por ausencia de fixtures privados. No se ha validado de extremo a extremo
el lote de los cinco PDF con modelo, base de datos y navegador reales.
