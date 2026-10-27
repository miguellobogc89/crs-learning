# Document classifier: isolated contract

A closed module that runs on the **base reading** (see `base-reading.md`), before the vision reading and before any targeted extraction. It decides **what** each part of each document is and where it belongs, so a later extraction step can go straight to the data that matters for that kind of document. It extracts no values (no amounts, names, dates or records) and never modifies the reading.

Pipeline: base reading (no vision model) → **classification** → vision reading (to become targeted extraction) → verification → structure discovery / Engine.

The full reading is kept on purpose: classification can be wrong, and a misclassified document can be reclassified and re-extracted without reading the PDF again; data irrelevant today (a fax number) stays available to Knowledge.

## Input

The completed base reading of the batch, one call per file. The model sees each page's blocks numbered: one block per visual line for PDFs; tables as `cell | cell` rows for spreadsheets. Files with no legible text (e.g. image pages without OCR credentials) are not sent to the model and get an explicit incident. Blocks longer than 600 characters are shortened with an explicit `[…]` marker; a file whose input exceeds 150,000 characters fails explicitly instead of being truncated.

The previous classifier (`intake-v1`, Engine/Knowledge/hybrid on the old flattened text) is untouched and disconnected; its destination decision is now one field of this module.

## Output

```json
{ "module": "document_classifier", "version": 1, "loteId": "…",
  "archivos": [{ "archivoId": "…", "archivo": "…", "incidencias": [],
    "partes": [{ "id": "p1", "bloques": [{ "pagina": 1, "desde": 1, "hasta": 9 }],
      "familia": "transaccion", "tipo": "factura", "subtipo": "factura_simplificada", "descripcion": "",
      "destino": "engine", "contieneTablas": true, "confianza": "alta",
      "evidencia": [{ "pagina": 1, "bloque": 5, "texto": "Factura Simplificada: 3831-016-607330" }],
      "motivo": "Ticket con líneas de artículos, IVA y total" }] }] }
```

- **Parts, not files.** A PDF may hold several documents (two tickets), or a document plus legal conditions, or a recipe book plus procedures. Every block of every page belongs to exactly one part: no gaps, no overlaps (checked by code).
- **Taxonomy as data** (`lib/knowledge/intake/classifier/taxonomy.ts`): families `transaccion`, `maestro`, `operacion`, `contrato`, `informe`, `texto`, `otro`, each with types and optional subtypes. Extend it there without touching the module. `tipo: "otro"` (or `subtipo: "otro"`) is always valid with a `descripcion`; `subtipo: null` when undetermined. Sector neutral: no supplier or customer names.
- **Evidence** (1–3 short quotes per part) must appear literally in a block of that same part (whitespace- and Unicode-form-insensitive); checked by code, not by the model. Recoverable slips never fail the batch: a quote cited with the wrong block number is re-pointed to the block of the part that contains it; a quote found nowhere in the part is dropped with an incident; a part left without evidence gets `confianza: "baja"`; blocks the model left out become an explicit `otro` part with low confidence; a block assigned twice stays with its first part. Ranges that do not exist in the reading still fail.
- **Confidence** in three levels (`alta`, `media`, `baja`), not a number: model self-reported percentages are not calibrated.
- **Destination**: `engine` (structured business data), `knowledge` (text to consult), `hibrido` (inseparable mix).

Later, each type will be linked to global catalog types to know which fields to extract, so extraction grows with the catalog instead of a fixed per-type prompt.

## Persistence and execution

No migration. Checkpoint in `proposal_json.clasificacion` of the extractor batch, next to (never inside) the reading and the verification. `GET/POST /api/knowledge/intake/:id/classification`, owner and active-workspace write access required. POST requires the completed base reading and never runs while the vision reading holds the batch: modules write the same payload with optimistic whole-payload checks, so they run one after another, never at once. The vision reading waits for this module to finish (completed or failed). Atomic claim, six-minute lease, 202 + Next `after`.

Each classified file is saved before the next; a retry continues after the last saved file. A new `CLASSIFIER_REVISION` reclassifies everything. Model: `OPENAI_DOCUMENT_CLASSIFIER_MODEL`, otherwise `OPENAI_KNOWLEDGE_IMPORT_MODEL`; strict JSON schema, 120 s timeout, no hidden retries, 8,000-token cap; incomplete responses are rejected. Errors are stored and shown; the client never retries automatically.

The upload modal and the app queue run base reading → classification → vision reading → verification and shows a plain-language list of parts per file (type, destination, confidence, reason and one quote). "Copiar todo" includes the classification.

## Checks

`npm run test:knowledge:classifier`. Tests use synthetic readings and a mocked model: block coverage (gaps, overlaps, nonexistent ranges), literal evidence from the same part (including table cells), taxonomy and "otro", shortened long blocks, one strict call per file without retries, rejection of incomplete output, file-by-file persistence and resume, untouched reading and verification, non-overwriting concurrent changes, and waiting for the verification. Whether the chosen types are semantically right needs real documents.
