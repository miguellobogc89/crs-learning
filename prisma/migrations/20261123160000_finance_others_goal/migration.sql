-- CRS Finance: objetivo al mes de «Otros gastos» (lo que no está en ningún grupo).
ALTER TABLE "finance_settings" ADD COLUMN "others_goal" DECIMAL(14,2);
