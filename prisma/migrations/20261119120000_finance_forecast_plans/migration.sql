-- Planes manuales e hipótesis aceptadas: independientes de los movimientos bancarios.
ALTER TABLE public.finance_settings
  ADD COLUMN IF NOT EXISTS savings_frequency TEXT NOT NULL DEFAULT 'mensual';

CREATE TABLE IF NOT EXISTS public.finance_forecast_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('ingreso', 'gasto')),
  amount NUMERIC(14,2) NOT NULL CHECK (amount > 0),
  start_date DATE NOT NULL,
  end_date DATE,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual','suggested')),
  source_key TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT finance_forecast_items_dates CHECK (end_date IS NULL OR end_date >= start_date),
  CONSTRAINT finance_forecast_items_user_source_key UNIQUE (user_id, source_key)
);

CREATE INDEX IF NOT EXISTS finance_forecast_items_user_date_idx
  ON public.finance_forecast_items (user_id, start_date);
