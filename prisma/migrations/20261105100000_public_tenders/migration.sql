-- Licitaciones públicas (PLACSP) y su valoración por espacio. Aditiva; aplicar después de 20261031100000_whatsapp_contacts.

CREATE TABLE "public_tenders" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "external_id" TEXT NOT NULL,
    "folder_id" TEXT,
    "title" TEXT NOT NULL,
    "url" TEXT,
    "status" TEXT,
    "kind" TEXT NOT NULL,
    "is_software" BOOLEAN NOT NULL DEFAULT false,
    "contracting_body" TEXT,
    "contract_type" TEXT,
    "procedure_code" TEXT,
    "estimated_amount" DECIMAL(14,2),
    "budget_without_tax" DECIMAL(14,2),
    "budget_with_tax" DECIMAL(14,2),
    "cpv_codes" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "province" TEXT,
    "city" TEXT,
    "deadline" TIMESTAMPTZ(6),
    "source_updated_at" TIMESTAMPTZ(6),
    "summary" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "public_tenders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tender_reviews" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "tender_id" UUID NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'Nueva',
    "notes" TEXT,
    "updated_by" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "tender_reviews_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "tender_sync_state" (
    "feed" TEXT NOT NULL,
    "head_seen_at" TIMESTAMPTZ(6),
    "gap_url" TEXT,
    "gap_until" TIMESTAMPTZ(6),
    "backfill_url" TEXT,
    "backfill_done" BOOLEAN NOT NULL DEFAULT false,
    "last_run_at" TIMESTAMPTZ(6),
    "last_result" JSONB NOT NULL DEFAULT '{}',
    CONSTRAINT "tender_sync_state_pkey" PRIMARY KEY ("feed")
);

CREATE UNIQUE INDEX "public_tenders_external_id_key" ON "public_tenders"("external_id");
CREATE INDEX "public_tenders_status_deadline_idx" ON "public_tenders"("status", "deadline");
CREATE INDEX "public_tenders_kind_is_software_deadline_idx" ON "public_tenders"("kind", "is_software", "deadline");
CREATE UNIQUE INDEX "tender_reviews_workspace_id_tender_id_key" ON "tender_reviews"("workspace_id", "tender_id");
CREATE INDEX "tender_reviews_workspace_id_status_idx" ON "tender_reviews"("workspace_id", "status");
ALTER TABLE "tender_reviews" ADD CONSTRAINT "tender_reviews_tender_id_fkey" FOREIGN KEY ("tender_id") REFERENCES "public_tenders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
