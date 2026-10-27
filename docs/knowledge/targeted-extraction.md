# Targeted extraction: isolated contract

Stage 3 of the intake pipeline: base reading → classification → **targeted extraction** → verification of extracted values. It runs inside the existing extraction stage (`POST /api/knowledge/intake/:id`, same lease and queue) for every **classified** batch; batches without a completed classification (older uploads, or a failed classification) keep the full visual reading as before. The mode is decided once per batch, so a result never mixes both.

Goal: the vision model only reads what matters for each kind of document. Footers, social links, registry data and legal boilerplate are no longer transcribed (fewer tokens, no verification noise); their text stays available in the base reading for Knowledge and search.

## Plan per classified part (`planParts`, pure)

| Part | Mode | Vision model |
|---|---|---|
| destination `knowledge` or family `texto` (communications, legal conditions…) | `knowledge` | not used: the base reading keeps its text |
| type with a reviewed field set (`extraction-field-sets.md`) and confidence alta/media | `dirigida` | only the set's fields |
| no field set yet, or low-confidence classification | `lectura_completa` | full visual reading of that part's pages (the original extractor), for safety |

## Model call

One call per file for all its targeted parts (the PDF is sent once; spreadsheets and other formats send their native base reading as text). The request lists each part with its pages, entities and fields (descriptions from the field set; `*` = required if present) and the excluded content. Strict JSON schema **generated from the field sets**: each field is `{valor, pagina}` — the value exactly as printed (or `null`), and the PDF page where it is seen. Lists (lines, charges, tax breakdown) are one entry per real row. When an invoice groups several tickets, each line carries its ticket number and date (`source_ticket_number`, `source_ticket_date`), needed e.g. for monthly spend per product. The model may add up to five **proposals** per part (relevant data not in the set, with literal value and page) and never assigns record ids. Model: `OPENAI_DOCUMENT_EXTRACTION_MODEL`, otherwise `OPENAI_KNOWLEDGE_IMPORT_MODEL`; 180 s timeout, no hidden retries, 16,000-token cap; incomplete responses are rejected.

## Validation (`validateTargeted`)

Shape errors fail. Recoverable slips are corrected and recorded: a value citing a page outside its part loses the page reference; proposals duplicating a listed field are dropped. Empty (template) rows are dropped. Missing required fields are listed in `faltan` (notices) and never invented.

## Output

`{module:"targeted_extraction",version:1,loteId,archivos:[{archivoId,archivo,incidencias,partes:[{parteId,modo,tipo,subtipo,paginas,conjunto,motivo,entidades?,faltan?,propuestas?,lectura?}]}]}`. Entities are grouped by role (invoice, issuer, recipient, lines…) for the later reconciliation and relational phase. The searchable text stored per file is the complete base reading.

## Verification of extracted values

For targeted batches the verifier (`verifier/values.ts`) checks **only the extracted values**: each one must appear in the base reading of the page it cites (values without a page: any page of their part). Differences are reported with what the document says, e.g. a tax id read as `872378581` where the document prints `B72378581`. Severity follows the base source (text layer: probable error; OCR: review). Short values (≤ 3 characters) are never paired by similarity. Punctuation around a value in the document is not a difference (`A-82018474` from `CIF. A-82018474.`, `21.00 %` from `(21.00 %)`, `Madrid` from `Madrid,`); a leading minus sign and any change inside the value still are (verifier revision 6, seen on the first real targeted run). Revision 7 (five real documents): fields that are classifications rather than printed text (`*_basis`, booleans) are not searched in the document, and a worded value glued to other text by punctuation (`REAL` in `30/11/2025(REAL)`) counts as present. Required fields not found are listed. Report: `{module:"reading_verifier",modo:"valores",resumen:{comprobados,distintos,noEncontrados,faltan,probablesErrores,aRevisar},archivos:[…]}`.

The upload modal shows the extracted data (fields, line tables, missing required fields, proposals), the value verification and the raw JSON; "Copiar todo" includes everything.

## Known limits

The whole PDF is sent even when only some pages belong to targeted parts (splitting would need a PDF library). Column positions of extracted line values are not checked yet (only literal presence on the page). Proposals are recorded but not yet grouped across documents nor offered for approval.

## Checks

`node --test tests/knowledge/targeted-extraction.test.mjs`: plan per part, schema generated from the field set, validation (empty rows, required gaps, page slips, duplicate proposals, broken shapes), one call per file with the PDF once, knowledge parts skipped, full reading only for the parts that need it, non-PDF input, value verification (B read as 8 in a tax id; boilerplate never checked; values without page; non-PDF), and the extraction stage switching to targeted extraction while keeping earlier checkpoints.
