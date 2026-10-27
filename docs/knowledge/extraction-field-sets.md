# Extraction field sets (what to extract per document type)

Data file: `lib/knowledge/intake/targets/field-sets.ts`. Reviewed and approved on 2026-10-27 as the starting point; not wired to any extraction yet.

Target pipeline: base reading (text layer or Google OCR, no vision AI) → classification → **targeted extraction using these sets** → verification of extracted values → reconciliation with existing records → tables and relations.

## Principles

- **Data, not logic.** Field sets are reviewed by people and extended with approved proposals; the module code does not change when a field is added.
- **Grouped by entity with a role.** Each group becomes a record of its catalog type in the relational phase, and each role a relation (`invoice.issuer` → `organization`). The extraction never assigns record ids: reconciliation (by identifiers such as the tax id) is done later by code, with ambiguous cases sent to review.
- **Identifiers marked** (`identifier: true`): invoice number, issuer/recipient tax id, supply point (CUPS, line number), product reference, telecom line. They are the keys to recognise existing records.
- **Values as printed.** No conversions, no computed values. Line prices and amounts keep whether they are with or without taxes when the column says so (`*_basis`).
- **Required vs optional.** A missing required field will be a notice; a missing optional field is not.
- **Composition.** A set may extend others; refinements add entities or fields to inherited entities, never remove or retype them. The most specific set for a classified subtype is resolved with `resolveFieldSet`.
- **Excluded content** (`EXCLUDED_CONTENT`): fax, web, contact e-mail and phones, social networks, commercial registry data, legal and data-protection texts, advertising, page numbers, logos, internal print codes.
- **No set → full reading.** Types without a set (and low-confidence or "otro" classifications) keep the full reading until a set exists.

## Sets (version 1)

| Set | Applies to | Entities |
|---|---|---|
| `factura_nucleo` | every invoice subtype except simplified, and undetermined subtype | invoice, issuer (tax id required), recipient (checked against the workspace's company), tax breakdown |
| `factura_suministro` | electricity, gas, water, telecom (extends core) | supply (supply point, period, contract, plan), charges |
| `factura_electricidad` | electricity (extends supply) | contracted power, consumption, meter readings |
| `factura_telecomunicaciones` | telecom (extends supply) | service lines |
| `factura_compra_articulos` | article purchases (extends core) | article lines (with the ticket of origin and its date when an invoice groups several tickets); order or till-ticket number on the invoice |
| `ticket` | simplified invoices / tickets | ticket, shop (issuer), optional recipient, article lines, optional tax breakdown |

A PDF grouping several tickets in one invoice is classified as several parts; each ticket part uses `ticket` and the grouping part keeps its own number, date and total.

## Decisions confirmed

1. The recipient is checked against the workspace's own company (the uploading business is usually the recipient); a mismatch will be a notice.
2. Issuer phone and e-mail are excluded by default.
3. Amounts are stored as printed, stating with or without taxes when indicated; nothing is computed.

## Catalog alignment

Catalog types and field names come from the standard global catalog (`docs/engine/standard-catalog.md`): companies are `company` (`organization` is kept for other uses), and `FIELD_SET_MAPPING` maps each extracted field to its catalog field (e.g. `tax_id` → `tax_identifier`, `subtotal` → `net_amount`; the billed period printed with the supply is stored on the invoice).

## Growth loop (planned)

Extraction fills approved fields and may propose extra fields with literal evidence. Proposals are grouped across documents, compared with existing fields to avoid synonyms ("vencimiento" vs "fecha límite de pago"), and approved or discarded by a person; approved fields enter the next catalog version and are extracted from then on.

## Checks

`node --test tests/knowledge/field-sets.test.mjs`: taxonomy alignment, unique snake_case keys, resolution per subtype, roles and identifiers, no computed values, exclusions, supplier neutrality.
