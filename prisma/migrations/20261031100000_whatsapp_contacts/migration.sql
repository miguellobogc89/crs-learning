-- Additive WhatsApp prospects and bulk sends; apply after 20261030080000_whatsapp.

CREATE TABLE "whatsapp_contacts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "external_key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT,
    "specialty" TEXT,
    "city" TEXT,
    "province" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "website" TEXT,
    "maps_url" TEXT,
    "rating" DOUBLE PRECISION,
    "classification" TEXT,
    "stage" TEXT NOT NULL DEFAULT 'Sin contactar',
    "do_not_contact" BOOLEAN NOT NULL DEFAULT false,
    "consent" BOOLEAN NOT NULL DEFAULT false,
    "consent_source" TEXT,
    "consent_at" TIMESTAMPTZ(6),
    "notes" TEXT,
    "attributes" JSONB NOT NULL DEFAULT '{}',
    "import_id" UUID,
    "last_contacted_at" TIMESTAMPTZ(6),
    "last_reply_at" TIMESTAMPTZ(6),
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_contact_imports" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "file_name" TEXT NOT NULL,
    "mapping" JSONB NOT NULL,
    "total" INTEGER NOT NULL,
    "created" INTEGER NOT NULL,
    "updated" INTEGER NOT NULL,
    "skipped" INTEGER NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_contact_imports_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_campaigns" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "template_id" UUID NOT NULL,
    "template_name" TEXT NOT NULL,
    "variables" JSONB NOT NULL,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_campaigns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "whatsapp_campaign_recipients" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "campaign_id" UUID NOT NULL,
    "contact_id" UUID NOT NULL,
    "phone" TEXT,
    "parameters" JSONB NOT NULL,
    "status" TEXT NOT NULL,
    "reason" TEXT,
    "error" TEXT,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "whatsapp_campaign_recipients_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "whatsapp_contacts_workspace_id_external_key_key" ON "whatsapp_contacts"("workspace_id", "external_key");
CREATE UNIQUE INDEX "whatsapp_contacts_workspace_id_id_key" ON "whatsapp_contacts"("workspace_id", "id");
CREATE INDEX "whatsapp_contacts_workspace_id_phone_idx" ON "whatsapp_contacts"("workspace_id", "phone");
CREATE INDEX "whatsapp_contacts_workspace_id_name_idx" ON "whatsapp_contacts"("workspace_id", "name");
CREATE INDEX "whatsapp_contact_imports_workspace_id_created_at_idx" ON "whatsapp_contact_imports"("workspace_id", "created_at" DESC);
CREATE UNIQUE INDEX "whatsapp_campaigns_workspace_id_id_key" ON "whatsapp_campaigns"("workspace_id", "id");
CREATE INDEX "whatsapp_campaigns_workspace_id_created_at_idx" ON "whatsapp_campaigns"("workspace_id", "created_at" DESC);
CREATE UNIQUE INDEX "whatsapp_campaign_recipients_campaign_id_contact_id_key" ON "whatsapp_campaign_recipients"("campaign_id", "contact_id");
CREATE INDEX "whatsapp_campaign_recipients_workspace_id_campaign_id_status_idx" ON "whatsapp_campaign_recipients"("workspace_id", "campaign_id", "status");
CREATE INDEX "whatsapp_campaign_recipients_workspace_id_contact_id_idx" ON "whatsapp_campaign_recipients"("workspace_id", "contact_id");

ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_contact_imports" ADD CONSTRAINT "whatsapp_contact_imports_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_campaigns" ADD CONSTRAINT "whatsapp_campaigns_account_fk" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "whatsapp_accounts"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_campaign_fk" FOREIGN KEY ("workspace_id", "campaign_id") REFERENCES "whatsapp_campaigns"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_campaign_recipients" ADD CONSTRAINT "whatsapp_campaign_recipients_contact_fk" FOREIGN KEY ("workspace_id", "contact_id") REFERENCES "whatsapp_contacts"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_contacts" ADD CONSTRAINT "whatsapp_contacts_rating_range" CHECK ("rating" IS NULL OR ("rating" >= 0 AND "rating" <= 5));
