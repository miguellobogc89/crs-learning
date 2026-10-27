# Reconciliation: isolated contract

Stage 5 of the intake pipeline: base reading → classification → targeted extraction → value verification → **reconciliation**. It answers, for each entity of a targeted extraction, "does this already exist in the workspace's data?". It is deterministic (no AI) and **read-only**: it never creates, merges or links Engine records. Writing records and relations is the next module, and it starts from this output.

## Input

- The completed targeted extraction stored in the batch (`proposal_json.resultado`, `module: "targeted_extraction"`). Full visual readings (older batches) are not reconciled.
- The Engine records of the workspace that owns the batch's library (read only, archived records ignored).

## What is reconciled

| Role in the extraction | Entity | Identity |
|---|---|---|
| issuer, recipient | `organization` | tax id |
| invoice | `invoice` | issuer tax id + invoice number (two suppliers may use the same number) |
| supply | `supply_point` | supply point id (CUPS, line, service id) |
| lines_service | `telecom_line` | line number (digits) |

Lines, charges, tax rows, power, consumption and meter readings are **details of their invoice**: they are counted with it (`detalles`) and never reconciled on their own. Knowledge parts are skipped.

Identity comes **only from printed identifiers**, never from names: the same tax id under several printed names is one company; different tax ids are never merged by name.

## Steps

1. **Group** (`groupEntities`, pure): every mention of the batch is grouped by type + normalised identifier. The same supplier in two invoices, or the recipient of every invoice, is one entity with several mentions and all its printed names.
2. **Normalise**: tax ids drop spaces, dots, dashes and an `ES` VAT prefix; lines keep digits; other ids drop whitespace and are upper-cased.
3. **Validate** Spanish tax ids (DNI/NIF, NIE, CIF check character). A failing check is a notice ("probable error de lectura"), e.g. a `B` read as `8`. Foreign ids are not judged. A tax id that is not valid but is one look-alike character away (`8`/`B`, `0`/`O`, `5`/`S`…) from a valid company of the batch gets a notice naming that company ("872378581 … probablemente es B72378581"); it is never merged automatically. Nine bare digits are flagged as a letter probably read as a number (revision 2, first real run).
4. **Look up** (`loadLookups`): records of the workspace's object type with the same key (`organization`, `invoice`, …), matched on any field that may hold the identifier (`tax_id`, `nif`, `cif`, `vat_number`…; `invoice_number`, `numero_factura`…; `cups`…) or the record's `external_key`.
5. **State per entity**: `nueva` (no record), `existente` (exactly one), `ambigua` (several: a person decides), `sin_identificador` (nothing to match on: review), `tipo_no_definido` (the workspace has no such object type yet, e.g. proposed catalog types), `no_comprobada` (the scan exceeded its bound of 2,000 records, so absence cannot be proven). An invoice that already exists is flagged as a possible repeated document.
6. **Plan relations**: invoice → issuer, recipient, supply point, telecom lines, using the entity refs (`organization:B…`). Record ids are only those of existing matches; new records get ids when they are written, never here.

## Output

`{module:"reconciliation",version:1,loteId,soloLectura:true,resumen:{entidades,nuevas,existentes,ambiguas,sinIdentificador,noComprobadas,avisos},entidades:[{ref,tipo,clave,nombres,menciones,estado,registros,avisos}],relaciones:[{desde,relacion,hacia}],detalles:[{factura,rol,filas}],avisos}`

## Persistence and execution

Checkpoint in `proposal_json.conciliacion`. `GET/POST /api/knowledge/intake/:id/reconciliation`. POST requires a completed targeted extraction and runs inline (reads only, no AI): the batch is written once, conditional on the exact previous payload. The orchestrator runs it only after the verification has finished (completed or failed), so two modules never write the batch at once. A new `RECONCILIATION_REVISION` recomputes it.

The upload modal shows a plain-language list (entity, printed names, state, where it appears, notices), the planned relations, and "Copiar todo" includes the result.

## Known limits

- The workspace's own company has no stored tax id yet, so the recipient cannot be checked against it; it is reconciled like any organization.
- Invoices are matched on their number only; the issuer half of the identity will be checked through the issuer relation once records are written.
- Field naming of older Engine records varies; only the identifier fields listed above are recognised.

## Checks

`npm run test:knowledge:reconciliation`: tax id check characters and normalisation, grouping across documents, invoice identity, details kept with their invoice, knowledge parts skipped, existing/ambiguous/new/undefined-type/unchecked states, workspace scoping, no writes, and the orchestrator running it only after the verification and only for targeted extractions.
