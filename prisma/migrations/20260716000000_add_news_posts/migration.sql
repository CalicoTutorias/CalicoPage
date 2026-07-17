CREATE TABLE "news_posts" (
  "id" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "content" TEXT NOT NULL,
  "image_url" TEXT,
  "is_published" BOOLEAN NOT NULL DEFAULT false,
  "is_pinned" BOOLEAN NOT NULL DEFAULT false,
  "published_at" TIMESTAMP(3),
  "author_id" TEXT NOT NULL,
  "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "news_posts_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "news_posts_author_id_fkey"
    FOREIGN KEY ("author_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE INDEX "news_posts_is_published_is_pinned_published_at_idx"
  ON "news_posts"("is_published", "is_pinned", "published_at" DESC);
