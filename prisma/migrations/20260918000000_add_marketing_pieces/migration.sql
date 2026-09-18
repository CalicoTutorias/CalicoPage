-- CreateTable
CREATE TABLE "marketing_pieces" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "style" TEXT,
    "caption" TEXT NOT NULL DEFAULT '',
    "meta" JSONB NOT NULL DEFAULT '{}',
    "files" JSONB NOT NULL DEFAULT '[]',
    "version" INTEGER NOT NULL DEFAULT 1,
    "created_by_id" TEXT NOT NULL,
    "updated_by_id" TEXT NOT NULL,
    "published_by_id" TEXT,
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "marketing_pieces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "content_creator_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "token_hash" TEXT NOT NULL,
    "last_used_at" TIMESTAMP(3),
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "content_creator_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "marketing_pieces_slug_key" ON "marketing_pieces"("slug");

-- CreateIndex
CREATE INDEX "marketing_pieces_updated_at_idx" ON "marketing_pieces"("updated_at" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "content_creator_tokens_token_hash_key" ON "content_creator_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "content_creator_tokens_user_id_idx" ON "content_creator_tokens"("user_id");

-- AddForeignKey
ALTER TABLE "marketing_pieces" ADD CONSTRAINT "marketing_pieces_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_pieces" ADD CONSTRAINT "marketing_pieces_updated_by_id_fkey" FOREIGN KEY ("updated_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "marketing_pieces" ADD CONSTRAINT "marketing_pieces_published_by_id_fkey" FOREIGN KEY ("published_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "content_creator_tokens" ADD CONSTRAINT "content_creator_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

