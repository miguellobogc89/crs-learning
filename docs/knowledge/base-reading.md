# Base reading: isolated contract

The **first** module after upload. It reads every file **without the vision model** and gives the rest of the pipeline a cheap, complete and positioned reading.

Pipeline (orchestrated by `components/knowledge/import/advance-intake.ts`, used by the upload modal and by the app-level queue):

1. **Base reading** (this module) — `GET/POST /api/knowledge/intake/:id/base-reading`
2. **Classification** on the base reading — `/classification`
3. **Vision reading** (visual extractor), only after 1 and 2 — `POST /api/knowledge/intake/:id`
4. **Verification** of the vision reading against the base reading — `/verification`

Next step (planned): the vision reading becomes a **targeted extraction** using the classification and the reviewed field sets (`extraction-field-sets.md`), so the vision model stops transcribing footers, social links and legal boilerplate. The base reading keeps all the text for Knowledge and search.

## What it reads

- **PDF**: positioned words per page — the PDF's own text layer; Google Cloud Vision OCR for image pages and for scans whose embedded text is a third-party OCR (see `reading-verifier.md`). Without `GOOGLE_CLOUD_VISION_API_KEY`, image pages are explicitly unread (`sin_referencia`), never silently empty.
- **Spreadsheets (XLSX/CSV)**: native cells (existing extractor path, no AI).
- **Other supported formats**: native text (existing extractor path, no AI).

## Output

`{module:"base_reading",version:1,loteId,archivos:[{archivoId,archivo,metodo:"pdf"|"hoja_nativa"|"texto_nativo",referencias:PageReference[],paginas:Page[]}]}`

- `referencias`: positioned words (normalised 0..1 coordinates) per PDF page, with their source (`capa_texto`, `ocr`, `sin_referencia`). Reused by the verification: **Google Vision is paid once per page**.
- `paginas`: the same text in the reading contract shape used by the classifier: **one text block per visual line** (left to right), so the classifier can cut a part exactly where a document starts (two tickets on one page). Rotated text (margin notes) becomes a final block. Layout only, no interpretation.

The `GET` endpoint returns only the text blocks and per-page sources; positioned words stay server-side (the verification exposes them to the batch owner for diagnosis).

## Persistence and execution

No migration. Checkpoint in `proposal_json.lecturaBase` of the batch. Atomic claim (whole-payload equality), six-minute lease, 202 + Next `after`. It never runs while the vision reading holds the batch (`intake_running`), and the vision reading never starts before the base reading is completed and the classification is finished (completed or failed), so modules never write the batch at once. The vision extractor carries the earlier checkpoints over when it saves.

Each file is saved as soon as it is read; a retry continues after finished files (no second OCR call). Errors are stored and shown; the client never retries automatically.

## Checks

`npm run test:knowledge:base-reading`: line blocks and rotated text, OCR and unread pages, PDF vs native formats (never the vision model), file-by-file persistence and resume, untouched checkpoints, non-overwriting concurrent changes, stage gates, and the app queue advancing every stage. The verifier and classifier suites cover reuse of the base reading.
