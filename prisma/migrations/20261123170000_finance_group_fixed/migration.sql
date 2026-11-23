-- CRS Finance: grupo inamovible (candado) en Mi plan.
ALTER TABLE "finance_plan_groups" ADD COLUMN "fixed" BOOLEAN NOT NULL DEFAULT false;
