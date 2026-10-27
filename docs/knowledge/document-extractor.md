# Document extractor: isolated contract

Since the pipeline reorganisation this module is the **full visual reading**: the extraction stage starts only after the base reading and the classification (see `base-reading.md`); classified batches use the targeted extraction instead (`targeted-extraction.md`), which calls this full reading only for parts without a field set or with low confidence. The stage carries earlier checkpoints over when it saves. The new document classifier (`document-classifier.md`) runs before it; the legacy `intake-v1` classification and the global schema discovery remain disconnected from upload execution. The modal retains one processing action and shows the reading JSON (plus classification and verification) or the actual error.

## Input

Original bytes and filename from private storage; authenticated owner and active-workspace write access are required by upload/status/start routes. Each batch contains one or more documents. PDF extraction always sends the original PDF as a native `input_file` to a vision-capable OpenAI model: `OPENAI_DOCUMENT_EXTRACTION_MODEL` if set, otherwise the existing `OPENAI_KNOWLEDGE_IMPORT_MODEL`. No text-length heuristic or plain-text fallback is used for PDF in this flow.

## Output

`{module:"document_extractor",version:1,loteId,archivos:[{archivoId,archivo,metodo,paginas:[{numero,bloques,incidencias}]}]}`

- Text blocks: `{tipo:"texto",texto}` in visual reading order, grouped by the actual section.
- Documentary tables: `{tipo:"tabla",columnas:string[],filas:(string|null)[][]}`. Exactly one cell per column, including empty columns; multiline descriptions remain one cell.
- All printed numbers and identifiers remain strings. `""` means a visibly empty cell; `null` means unreadable content and requires an explicit incident.
- Page numbering and count are checked against the actual PDF parser. Missing pages, malformed tables, numeric coercion, unfinished model responses and database-schema payloads are rejected. This validates structure, not the model's semantic completeness.
- Blank template rows are not business rows; merged cells are transcribed once and explained when necessary.

There are no business entities, database tables, relationships, classifications or insertions in this result. Header/party/payment details are text blocks or documentary tables, not normalized business records.

## Persistence and scope

No migration: use existing import staging with discriminator `intake-extractor-v1`. Each source is extracted once per persisted batch. A parent-lease claim guards transactional file/result writes. A failed later source does not erase earlier document JSON. Final output is published only after all sources succeed. No Engine catalogue, business records or Knowledge articles are read or modified. Existing classification/discovery checkpoints remain untouched on older batches.

The app-level queue advances extractor staging while the app is open. Closing all tabs pauses scheduling of subsequent files; the current server extraction can finish. This is not an external worker. Model calls have a 120-second timeout, no hidden retries and a 24,000-token output cap. Each PDF is currently limited to 20 MB. The original stays in private storage. Failed output is surfaced rather than silently falling back to flattened text.

XLSX/CSV use native sheet/cell extraction. Other already-supported formats retain native text extraction, explicitly marked `texto_nativo` with a notice that visual layout has not been verified. They are not advertised as visually validated PDFs.

## Acceptance reference

For the supplied Toldos invoice, visual review establishes a single detail row with four columns: quantity `2`, full multiline description, **blank unit price**, line total `789,26` plus its currency symbol as printed. Emitter, customer, totals, IVA percentage/amount and payment details must remain in their respective sections. Values must not be inferred (for example by dividing the total by quantity).

Automated tests validate original-PDF transmission, complete-page contracts, preservation of empty cells, no schema execution, staging, failures and stale leases. They mock the model and do not prove its reading of the invoice. A real visual-model run cannot be performed in this workspace because OpenAI credentials/model and database credentials are not configured. The next real test is a fresh upload, ending at this extractor JSON.

## Table summary association

Summary/footer/subtotal rows aligned under a table's columns must stay inside that table, including the empty cells under columns that have no summary value. The visual prompt explicitly distinguishes these from independent text sections; it also prohibits normalizing printed labels or URL schemes.

A local review trigger detects the observed failure pattern: numeric rows flattened into a text block immediately following a table. It is generic (no invoice or retailer keywords) and is not an exhaustive detector of visual layout errors. Only when triggered, one additional visual correction receives the original PDF, the draft and suspicious block references. It cannot infer column meanings from the flattened value order. Before acceptance the service checks that the original table columns/detail rows remain, each suspicious numeric row's values appear in separate cells of its original table, and the detected flattening no longer remains. It never repairs values through string splitting and guessed column assignments. Failure is surfaced without a loop; at most two visual calls, each with a 120-second timeout, fit the route's 300-second limit. Shape/value-preservation checks do not prove the model chose semantically correct columns; the next fresh upload validates the actual visual result.

Regression cases cover the two Mercadona summary rows (104,31 / 4,57 / 108,88 and 41,21 / 2,53 / 43,74), preserving all seven detail lines and four-place decimals, already-correct tables without an extra call, and rejected corrections that discard rows/totals. Model responses are mocked in automated tests; no live OpenAI credentials are available here.
