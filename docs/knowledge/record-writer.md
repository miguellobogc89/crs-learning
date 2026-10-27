# Record writer: isolated contract

Stage 6, the last of the intake pipeline: base reading → classification → targeted extraction → value verification → reconciliation → **saving records**. It turns a reconciled targeted extraction into Engine records and relations in the batch's workspace. It never runs on its own: the person reviews the plan and presses "Guardar en mis datos".

## Two parts

1. **Plan** (`writer/plan.ts`, pure): `buildWritePlan(extraction, reconciliation, decisions)`.
   - One record per reconciled entity (company, invoice, supply point, telecom line), merged across documents (first printed value wins; later mentions are evidence), plus one record per detail row (invoice lines, tax lines, power, consumption, meter readings) under its invoice.
   - Each extracted field goes to its catalog field through `FIELD_SET_MAPPING` (`docs/engine/standard-catalog.md`); a field may land on another entity of the part (the billed period printed with the supply → invoice).
   - **Conversion** (`writer/convert.ts`) of printed text to the catalog type: decimals as exact strings ("31,4049 €" → "31.4049"; "55.061" → "55061" only in comma-decimal documents), dates as ISO ("04 de Enero de 2026" → "2026-01-04"; a date without year takes it from the invoice date and says so). What cannot be read without guessing is **not converted**: the field stays empty and is listed (`noConvertidos`). Identifiers are stored in their comparable form ("B 84818442" → "B84818442").
   - **Evidence**: every stored value keeps its printed text, file, page and origin.
   - **Actions** from the reconciliation: new → create; existing → reuse (a repeated invoice is reused and its lines are not added again); ambiguous, without identifier, unchecked, invalid or probably misread tax id → **blocked** until the person decides: `unir` (join to the suggested entity; its relations move there), `tal_cual` (save as it is) or `omitir` (leave out; its relations are dropped).
   - **Relations**, owner → owned as the catalog defines them: `invoice_issuer`, `invoice_customer`, `invoice_supply_point`, `invoice_telecom_lines`, `invoice_lines`, `invoice_tax_lines`, `invoice_contracted_power`, `invoice_energy_consumption`, `invoice_meter_readings`, and the recipient as holder of supply points and lines (`supply_point_holder`, `telecom_line_holder`).
2. **Commit** (`writer/commit.ts`), one transaction:
   - Refuses a plan with pending decisions.
   - Binds only the catalog types and relations the plan uses to the workspace (local table, fields, binding, relation definitions), the same way as the Engine importer.
   - Creates records (`draft`, revision 1, its revision snapshot, evidence in `engine_record_provenance` with locator `intake:<batch>/<file>/p<page>/<role>.<field>`), reuses existing ones, and checks again by external key inside the transaction (no duplicated masters on a concurrent or repeated save).
   - Creates relations, enforcing one owner for one-to-many relations (an invoice has one issuer).
   - Never modifies an existing record. Any failure rolls everything back.

## Execution

`GET /api/knowledge/intake/:id/writing` returns the plan (never writes) or the saved result. `POST` with `{decisiones:{[ref]:"unir"|"tal_cual"|"omitir"}}` claims the batch (exact previous payload, so a double click or another tab cannot save twice) and writes, all in one transaction; the result is stored in `proposal_json.escritura`. A failure stores the error and the decisions; nothing is written.

The orchestrator stops at this step even in automatic mode. The modal shows the plan (counts per type, decisions to take, values not converted, details) and a single "Guardar en mis datos" action, enabled once every decision is taken.

## Known limits

- Products are not created from line references yet (`product_invoice_lines` is ready in the catalog).
- `company.is_own_company` is not set automatically.
- Records are created as `draft`, like the existing Engine importer.
- Evidence is stored with `origin_type: "integration"`: the database only accepts `document` evidence linked to a Knowledge file, and the originals are still files of the intake batch. The locator keeps batch, file, page and field; it can be linked to the Knowledge file once the originals are published to Knowledge.

## Checks

`npm run test:knowledge:writer`: conversions (amounts, thousands, ambiguous dots, dates, missing years), plan (typed values with evidence, details under their invoice, relations, blocked entities and the three decisions, repeated invoices), commit on an in-memory transaction double (pending decisions refused, records + revisions + evidence + relations, only the used types bound, workspace lock, re-save reuses by external key), and the route and orchestrator guards.
