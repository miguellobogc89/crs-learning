-- CRS Finance · Plan: grupos de gasto del usuario (Gastos fijos, Ocio, Moda…). Cada grupo es un conjunto de
-- categorías (una categoría solo en un grupo, lo controla la API) con un objetivo opcional por ciclo.
CREATE TABLE IF NOT EXISTS "finance_plan_groups" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "user_id" UUID NOT NULL,
  "name" TEXT NOT NULL,
  "categories" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "goal" NUMERIC(14,2),
  "position" INTEGER NOT NULL DEFAULT 0,
  "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT now(),
  CONSTRAINT "finance_plan_groups_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "finance_plan_groups_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE NO ACTION,
  CONSTRAINT "finance_plan_groups_goal_check" CHECK ("goal" IS NULL OR "goal" > 0)
);
CREATE INDEX IF NOT EXISTS "finance_plan_groups_user_id_idx" ON "finance_plan_groups"("user_id");
