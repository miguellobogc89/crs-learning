-- CRS Finance: gastos previstos (categoría y movimiento real con el que se cumplen).
ALTER TABLE "finance_forecast_items" ADD COLUMN "category" TEXT;
ALTER TABLE "finance_forecast_items" ADD COLUMN "matched_tx_id" UUID;
