-- CRS Finance: gastos previstos (categoría y movimiento real con el que se cumplen).
ALTER TABLE "finance_forecast_items" ADD COLUMN "category" TEXT;
ALTER TABLE "finance_forecast_items" ADD COLUMN "matched_tx_id" UUID;
-- El origen «previsto» (gastos añadidos a mano con «Añadir gasto») también es válido.
ALTER TABLE "finance_forecast_items" DROP CONSTRAINT IF EXISTS "finance_forecast_items_source_check";
ALTER TABLE "finance_forecast_items" ADD CONSTRAINT "finance_forecast_items_source_check" CHECK ("source" = ANY (ARRAY['manual'::text, 'suggested'::text, 'previsto'::text]));
