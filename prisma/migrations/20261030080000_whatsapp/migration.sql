-- Additive WhatsApp tables; apply after the existing CRS schema.

-- CreateTable
CREATE TABLE "whatsapp_accounts" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "phone_number_id" TEXT NOT NULL,
    "waba_id" TEXT NOT NULL,
    "display_phone" TEXT NOT NULL,
    "verified_name" TEXT,
    "token_enc" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_conversations" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "contact_phone" TEXT NOT NULL,
    "contact_name" TEXT,
    "unread_count" INTEGER NOT NULL DEFAULT 0,
    "last_message_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "last_inbound_at" TIMESTAMPTZ(6),

    CONSTRAINT "whatsapp_conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "conversation_id" UUID NOT NULL,
    "provider_id" TEXT,
    "request_id" UUID,
    "direction" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "error" TEXT,
    "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_templates" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "workspace_id" UUID NOT NULL,
    "account_id" UUID NOT NULL,
    "provider_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "language" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "components" JSONB NOT NULL,
    "is_favorite" BOOLEAN NOT NULL DEFAULT false,
    "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_phone_number_id_key" ON "whatsapp_accounts"("phone_number_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_accounts_workspace_id_id_key" ON "whatsapp_accounts"("workspace_id", "id");

-- CreateIndex
CREATE INDEX "whatsapp_conversations_workspace_id_account_id_last_message_idx" ON "whatsapp_conversations"("workspace_id", "account_id", "last_message_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_account_id_contact_phone_key" ON "whatsapp_conversations"("account_id", "contact_phone");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_conversations_workspace_id_id_key" ON "whatsapp_conversations"("workspace_id", "id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_provider_id_key" ON "whatsapp_messages"("provider_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_workspace_id_conversation_id_created_at_idx" ON "whatsapp_messages"("workspace_id", "conversation_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_messages_workspace_id_request_id_key" ON "whatsapp_messages"("workspace_id", "request_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_account_id_provider_id_key" ON "whatsapp_templates"("account_id", "provider_id");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_templates_workspace_id_id_key" ON "whatsapp_templates"("workspace_id", "id");
ALTER TABLE "whatsapp_accounts" ADD CONSTRAINT "whatsapp_accounts_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_workspace_fk" FOREIGN KEY ("workspace_id") REFERENCES "workspaces"("id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_conversations_account_fk" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "whatsapp_accounts"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_templates" ADD CONSTRAINT "whatsapp_templates_account_fk" FOREIGN KEY ("workspace_id", "account_id") REFERENCES "whatsapp_accounts"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_conversation_fk" FOREIGN KEY ("workspace_id", "conversation_id") REFERENCES "whatsapp_conversations"("workspace_id", "id") ON DELETE CASCADE;
ALTER TABLE "whatsapp_conversations" ADD CONSTRAINT "whatsapp_unread_nonnegative" CHECK ("unread_count" >= 0);
