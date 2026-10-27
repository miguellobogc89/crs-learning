# Reading verifier: isolated contract

A closed, deterministic module that runs **after** the document extractor and **before** any classification or structure discovery. It checks the extractor's JSON against an independent reading of the original document and reports where they disagree. It uses no AI for its decisions, never rewrites the extraction and blocks nothing: its output is a separate report.

Why: the visual extractor transcribes layout well, but it can silently alter literals (`Alfonso` → `Alfons`, `Fdo.` → `Pdo.`, `https` → `http`, `productos` → `producto`), drop labels or text, or place an amount under the wrong column. Its own validation only checks shape. Without an independent witness, those errors reach every later phase.

## Input

For **targeted** batches the verifier checks only the extracted values (see `targeted-extraction.md`, `verifier/values.ts`); the comparison below applies to full visual readings (older or unclassified batches) and is reused value by value.

Since the pipeline reorganisation, the independent reading comes from the **base reading** module (`base-reading.md`), stored once per batch: the verifier reuses its positioned words and never reads the PDF or calls Google Vision again. Only older batches without a base reading read the originals here.


- The completed extractor result stored in the batch (`proposal_json.resultado`, `module: "document_extractor"`).
- The original files from private storage (only `pdf_visual` files are read).

## Independent reading (`reference.ts`)

Per PDF page:

- **Text layer** (`capa_texto`): PDFs generated digitally (Excel, invoicing software…) embed every character with its position. Read with `unpdf`, no external service. Exact characters, so a mismatch is a `probable_error`.
- **OCR** (`ocr`): image-only pages (scans, photos, flattened PDFs such as the Mercadona invoices) are read with **Google Cloud Vision** `files:annotate` / `DOCUMENT_TEXT_DETECTION`, language hint `es`, 5 pages per request, 90 s timeout, no hidden retries. OCR can also misread (`4%` → `4`), so its findings are `revisar`, not verdicts.
- **No reference** (`sin_referencia`): an image page when `GOOGLE_CLOUD_VISION_API_KEY` is not configured. Reported explicitly per page; never treated as verified.

All coordinates are normalised to the page (0..1, top-left origin) so both sources are comparable.

## Comparison (`compare.ts`, pure)

For every value of the extraction (each line of a text block, each table header and cell):

1. **Literals** — the value must exist in the reference on word boundaries (`12,000` does not pass inside `12,0000`). If its words exist but in another reading order, it passes. Otherwise the closest text is reported with character differences (`estado: "distinto"`) or `no_encontrado`.
2. **Columns** — for numeric cells, the horizontal position in the document must fall under its own column: by the column header when one is located (also when the header was transcribed as a row; this is reported as a notice), or by alignment with the other numeric cells of the column. Cells are searched within their row's vertical band.
3. **Omissions** — reference text not covered by any extracted value (lost titles, footers, margin text).

Revision 2 (after the first real Google Vision run on an image invoice):
- Rotated text (tall, narrow words such as a registry note printed vertically in the margin) never belongs to a row band; before, it captured cells of every row it crossed.
- Header cells are located as one row anchored on the longest label, so labels repeated elsewhere on the page ("IVA" inside "Cuota IVA" or in a later breakdown) do not take the wrong occurrence.
- The approximate search prefers document text not yet matched to another value, so an anchor misread by OCR ("P6" as "Pб") does not land on a similar row elsewhere.
- Long sentences report the specific differing words ("http://www." vs "https://www.") instead of a character diff; words under four characters are reported as absent rather than paired with an arbitrary closest match.
- Values with no letters or digits that are not found as text (radio buttons, ticks) are notices, not findings; printed symbols such as "€" or "-" are still checked.

Revision 3 (replayed on the stored Google Vision words of a real run):
- Table rows are located in printed order, header included, and each row is searched first just below the previous one. Identical rows of two similar tables (the same product in two tickets) are no longer swapped, also when the reading places pre-header lines inside the table.
- The words of one value must be close together (same or next line); text already matched to another value is reused only as a last resort.
- Values of three characters or fewer are never paired by similarity ("2" inside "0,7200").
- OCR look-alike letters of other alphabets ("Pб" for "P6") are compared as what they look like.

Revision 4 (nine more real documents: telecom, utility, legal-services and retail invoices; text layers, vector-drawn text, phone scans):
- **Page order.** Each page of the reading is matched to the PDF page it actually transcribes (shared words). A reading that reorders pages (e.g. by the printed "Página 1 de 4" when the PDF's physical order differs) is reported (`paginaDocumento`, `resumen.paginasDesordenadas`) and each page is compared with the page it transcribes.
- **Scans with an embedded OCR layer** (scanner apps such as Adobe Scan: a full-page image plus invisible text, render mode 3) are not trusted as a text layer; they are read with Google Vision like any image page. A page with a background image and visible text is still a text layer.
- **Rotated text in the text layer** (registry notes printed vertically in the margin) gets its real rotated box and is flagged `r`; it never joins a row, and its words are chained along their own direction.
- **Normalisation before comparing** (both sides): Unicode compatibility forms (ligature "ﬁ", "…", "O₂", "º"), dot leaders of any length ("SUBTOTAL………120€"), list markers ("•", "-", which OCR also misreads).
- **Severity of absence.** A value absent from a text layer is `revisar` (it may be inside a logo or icon); a contradiction stays `probable_error`. Identical text only inside a much longer word ("IGNIS" in "IGNIS_260022559") counts as absent.
- **Headers.** Header labels may be found on other lines (stacked headers). Headers are trusted only if they are left-to-right and agree with where their columns' values sit; otherwise columns are checked by the values' alignment, with a notice. Columns without a located header use alignment too; a single notice per table replaces one per cell. Equal values in one row are matched left to right.

Known remaining limits seen in this set: white text (invisible machine markers) appears as an omission; glyphs from symbol fonts in logos can produce text-layer garbage ("lπ" for the O2 logo).

To check a change against real output without uploading again or paying for OCR, copy everything from the modal ("Copiar todo") into a file outside the repository and run `npm run knowledge:replay-verification -- bundle.json`.

Known limits, stated rather than hidden: it does not judge how text is grouped into blocks (two adjacent boxes merged into one table), does not read checkbox/radio states, cannot check columns of tables without a header or several numeric columns, and a PDF text layer may contain text hidden by clipping (reported as omissions).

## Output

`{module:"reading_verifier",version:1,loteId,lecturaModificada:false,resumen:{literales,columnas,omisiones,paginasSinReferencia,probablesErrores,aRevisar},archivos:[{archivoId,archivo,metodo,paginas:[{numero,referencia,literales,columnas,omisiones,avisos}]}]}`

Native spreadsheet reads (`hoja_nativa`) need no visual check; other native text formats are reported as not visually verifiable.

## Persistence and execution

No migration. The module's checkpoint lives in `proposal_json.verificacion` of the extractor batch, next to (never inside) the extraction. `GET/POST /api/knowledge/intake/:id/verification`, owner and active-workspace write access required. POST requires a completed extraction, claims atomically (whole-payload equality, six-minute lease), returns 202 and runs with Next `after`. Writes are conditional on the exact previous payload, so concurrent changes are never overwritten.

Independent readings (`referencias`) are persisted as soon as each file is read, before the comparison. A retry after an error, or a new comparison revision (`VERIFIER_REVISION`), recomputes the report from stored readings **without another OCR call**. Errors are stored and shown; the client does not retry automatically. Repeat POST to retry.

The upload modal reads the extraction, then requests the verification and shows a plain-language summary, the unchanged extraction JSON, and the report JSON. A verification failure never hides the extraction. Copy buttons (no server calls) copy the reading, the report, or everything at once including the stored independent readings (`GET` returns `referencias` to the batch owner for diagnosis).

## Configuration

`GOOGLE_CLOUD_VISION_API_KEY`: an API key of a Google Cloud project with the **Cloud Vision API** enabled and billing active. Restrict the key to the Cloud Vision API. It is sent in the `X-Goog-Api-Key` header, never in the URL. Pricing at the time of writing: first 1,000 pages per month free, then about USD 1.50 per 1,000 pages; only image pages are sent.

## Checks

`node --test tests/knowledge/reading-verifier.test.mjs tests/knowledge/intake-upload-flow.test.mjs`. Tests use synthetic layouts and mocked Vision/storage/database; they cover faithful readings, altered literals, truncated numbers, column shifts, omissions, OCR severity, headers in rows, missing credentials, Vision errors, reuse of stored readings and non-overwriting concurrent changes. The algorithm was also checked against the real Toldos (text layer) and Mercadona (image) invoices outside the repository; those documents are not committed because they contain customer data.
