-- Noticias del módulo de trading y consumo de IA. Aditiva; aplicar después de 20261110080000_trading.

CREATE TABLE "news_items" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "url" TEXT NOT NULL,
    "title_key" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "feed" TEXT NOT NULL,
    "publisher" TEXT,
    "title" TEXT NOT NULL,
    "snippet" TEXT,
    "published_at" TIMESTAMPTZ(6) NOT NULL,
    "fetched_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "hints" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pendiente',
    "relevant" BOOLEAN NOT NULL DEFAULT false,
    "symbols" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "category" TEXT,
    "sentiment" INTEGER,
    "impact" INTEGER,
    "summary" TEXT,
    "model" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "classified_at" TIMESTAMPTZ(6),
    CONSTRAINT "news_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "news_feed_state" (
    "feed" TEXT NOT NULL,
    "last_run_at" TIMESTAMPTZ(6),
    "last_ok_at" TIMESTAMPTZ(6),
    "last_error" TEXT,
    "last_count" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "news_feed_state_pkey" PRIMARY KEY ("feed")
);

CREATE TABLE "trading_ai_usage" (
    "day" DATE NOT NULL,
    "purpose" TEXT NOT NULL,
    "calls" INTEGER NOT NULL DEFAULT 0,
    "input_tokens" INTEGER NOT NULL DEFAULT 0,
    "output_tokens" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "trading_ai_usage_pkey" PRIMARY KEY ("day", "purpose")
);

CREATE UNIQUE INDEX "news_items_url_key" ON "news_items"("url");
CREATE UNIQUE INDEX "news_items_market_title_key_key" ON "news_items"("market", "title_key");
CREATE INDEX "news_items_status_published_at_idx" ON "news_items"("status", "published_at");
CREATE INDEX "news_items_published_at_idx" ON "news_items"("published_at");
CREATE INDEX "news_items_symbols_idx" ON "news_items" USING GIN ("symbols");
