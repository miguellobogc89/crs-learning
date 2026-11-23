-- CRS Finance: mes al que se imputa un gasto (si no es el del cargo).
ALTER TABLE "finance_transactions" ADD COLUMN "imputed_date" DATE;
