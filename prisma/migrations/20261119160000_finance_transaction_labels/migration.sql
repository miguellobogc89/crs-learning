-- El concepto original del banco se conserva siempre.
ALTER TABLE "finance_transactions"
  ADD COLUMN "alias" TEXT,
  ADD COLUMN "subcategory" TEXT;

-- Los alias y las subcategorías también pueden aprenderse por comercio.
ALTER TABLE "finance_rules"
  ADD COLUMN "alias" TEXT,
  ADD COLUMN "subcategory" TEXT;
