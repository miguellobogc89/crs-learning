# Standard global catalog

Business tables almost every workspace needs, defined once in the **global** Engine catalog and public to every workspace. Each workspace keeps its own records: a type is bound to the workspace (local table + fields) the first time records of that type are written.

Source of truth: `lib/engine/catalog/standard-catalog.ts` (data). The SQL that publishes it, `scripts/neon/20261027_standard_catalog.sql`, is generated from it with `npm run engine:standard-catalog-sql`; a test fails if the committed SQL is not the generated one.

## Running it

Paste the SQL file in the Neon SQL Editor and run it. It is idempotent and safe to re-run:

- **Missing types** are created with a published version 1.
- **Existing types** (invoice, invoice_line, product, contact, payment) only receive the fields they lack, in a new published version that clones the previous one unchanged. A field that exists with another data type stops the script without changing anything. Workspaces already using the type receive the new optional fields and move to the new version.
- **Relations** are created when missing. An existing relation with other endpoints is reported (`NO se cambia`) and left as it is.
- It never renames, retypes or removes anything, never touches `engine_records` or their history, and leaves other types (`organization`, `sales_order`…) as they are.

Messages (`NOTICE`) list what was created, extended or left unchanged; the final query lists every type with its latest version.

Checked on a local PostgreSQL 16 copy of the catalog tables seeded like the production catalog (invoice v2 bound to a workspace with records, organization, product, an existing `invoice_issuer` relation from organization): the first run creates and extends, the second run changes nothing, the bound workspace gets the new invoice fields and v3, records untouched.

## Types (26)

| Key | Name | Fields |
|---|---|---|
| `company` | Empresas | legal_name, trade_name, tax_identifier, legal_form, address, postal_code, city, region, country, email, phone, website, notes, is_own_company |
| `contact` | Contactos | full_name, first_name, last_name, email, phone, role |
| `site` | Locales y centros | name, address, postal_code, city, site_type, notes |
| `employee` | Empleados | full_name, national_id, job_title, start_date, end_date, email, phone |
| `product` | Productos | sku, name, description, kind, unit, base_price, tax_rate, barcode, brand, category, status |
| `supplier_catalog` | Catálogos y tarifas de proveedor | name, reference, valid_from, valid_until, currency, notes |
| `supplier_catalog_item` | Artículos de catálogo de proveedor | supplier_reference, description, unit, pack_size, unit_price, price_basis, tax_rate, min_quantity, valid_from |
| `bank_account` | Cuentas bancarias | iban, bank_name, holder_name, currency |
| `invoice` | Facturas | invoice_number, issue_date, due_date, currency, net_amount, tax_amount, total_amount, payment_terms, reference, notes, payment_method, payment_account, order_reference, invoice_kind, direction, period_start, period_end |
| `invoice_line` | Líneas de factura | line_number, product_reference, description, quantity, unit, unit_price, discount_amount, tax_rate, line_total, unit_price_basis, line_total_basis, calculation_detail, source_ticket_number, source_ticket_date |
| `invoice_tax_line` | Desglose de impuestos | tax_type, tax_rate, taxable_base, tax_amount |
| `delivery_note` | Albaranes | delivery_note_number, issue_date, order_reference, total_amount, notes |
| `delivery_note_line` | Líneas de albarán | line_number, product_reference, description, quantity, unit, unit_price, discount_amount, tax_rate, line_total, lot_number, expiry_date |
| `purchase_order` | Pedidos a proveedor | order_number, order_date, expected_date, status, currency, net_amount, tax_amount, total_amount, notes |
| `purchase_order_line` | Líneas de pedido a proveedor | line_number, product_reference, description, quantity, unit, unit_price, discount_amount, tax_rate, line_total |
| `quote` | Presupuestos | quote_number, issue_date, valid_until, currency, net_amount, tax_amount, total_amount, status, notes |
| `quote_line` | Líneas de presupuesto | line_number, product_reference, description, quantity, unit, unit_price, discount_amount, tax_rate, line_total |
| `payment` | Pagos y cobros | payment_reference, payment_date, amount, currency, method, status, notes |
| `bank_transaction` | Movimientos bancarios | transaction_date, value_date, description, amount, balance, currency, reference |
| `cash_closing` | Cierres de caja | closing_date, opening_balance, cash_sales, card_sales, other_sales, total_sales, cash_counted, difference, notes |
| `contract` | Contratos | contract_number, contract_type, start_date, end_date, amount, periodicity, notes |
| `supply_point` | Puntos de suministro | supply_point_id, supply_type, address, tariff, contract_number, contract_end_date |
| `telecom_line` | Líneas de teléfono e internet | number, service, plan |
| `contracted_power` | Potencias contratadas | period, power_kw |
| `energy_consumption` | Consumos de energía | period, energy_kwh |
| `meter_reading` | Lecturas de contador | meter_number, period, reading_date, previous_reading, current_reading, reading_type |

Companies are `company` (more specific than `organization`, which stays for other uses). `company.is_own_company` marks the workspace's own company, so the recipient of purchase invoices can be checked.

## Relations (38)

From owner to owned (`one_to_many`: one company issues many invoices), as the Engine expects.

| Key | From → to | Cardinality |
|---|---|---|
| `invoice_issuer` | company → invoice | one_to_many |
| `invoice_customer` | company → invoice | one_to_many |
| `invoice_lines` | invoice → invoice_line | one_to_many |
| `invoice_tax_lines` | invoice → invoice_tax_line | one_to_many |
| `invoice_line_product` | product → invoice_line | one_to_many |
| `invoice_supply_point` | supply_point → invoice | one_to_many |
| `invoice_telecom_lines` | telecom_line → invoice | many_to_many |
| `invoice_contracted_power` | invoice → contracted_power | one_to_many |
| `invoice_energy_consumption` | invoice → energy_consumption | one_to_many |
| `invoice_meter_readings` | invoice → meter_reading | one_to_many |
| `invoice_delivery_notes` | invoice → delivery_note | one_to_many |
| `invoice_payments` | invoice → payment | one_to_many |
| `invoice_site` | site → invoice | one_to_many |
| `supply_point_holder` | company → supply_point | one_to_many |
| `supply_point_site` | site → supply_point | one_to_many |
| `telecom_line_holder` | company → telecom_line | one_to_many |
| `company_contacts` | company → contact | one_to_many |
| `company_sites` | company → site | one_to_many |
| `company_employees` | company → employee | one_to_many |
| `company_bank_accounts` | company → bank_account | one_to_many |
| `bank_account_transactions` | bank_account → bank_transaction | one_to_many |
| `supplier_catalog_supplier` | company → supplier_catalog | one_to_many |
| `supplier_catalog_items` | supplier_catalog → supplier_catalog_item | one_to_many |
| `supplier_catalog_item_product` | product → supplier_catalog_item | one_to_many |
| `delivery_note_supplier` | company → delivery_note | one_to_many |
| `delivery_note_customer` | company → delivery_note | one_to_many |
| `delivery_note_lines` | delivery_note → delivery_note_line | one_to_many |
| `delivery_note_line_product` | product → delivery_note_line | one_to_many |
| `purchase_order_supplier` | company → purchase_order | one_to_many |
| `purchase_order_lines` | purchase_order → purchase_order_line | one_to_many |
| `purchase_order_line_product` | product → purchase_order_line | one_to_many |
| `quote_issuer` | company → quote | one_to_many |
| `quote_customer` | company → quote | one_to_many |
| `quote_lines` | quote → quote_line | one_to_many |
| `cash_closing_site` | site → cash_closing | one_to_many |
| `contract_provider` | company → contract | one_to_many |
| `contract_customer` | company → contract | one_to_many |
| `contract_supply_point` | supply_point → contract | one_to_many |

## Extraction mapping

`FIELD_SET_MAPPING` says where each field of the extraction field sets is stored: `issuer.tax_id` → `company.tax_identifier`, `invoice.subtotal` → `invoice.net_amount`, `lines.discount` → `invoice_line.discount_amount`, `supply.period_start` → `invoice.period_start` (the billed period belongs to the invoice)… A test checks that every extracted field has a catalog field. Values are extracted as printed; converting them to dates and numbers (keeping the printed original) is the job of the record-writing module.

## Checks

`npm run test:engine:catalog`: well-formed types and relations, existing published fields kept with their type, every extracted field mapped, committed SQL = generated SQL, no destructive statements.
