-- Add user_id to media. Backfill from posts.user_id where postId is set;
-- delete orphan media (postId IS NULL) since they have no resolvable owner.
-- Run as a single transaction so a failure doesn't leave the column nullable
-- in production.

ALTER TABLE "media" ADD COLUMN "user_id" integer;--> statement-breakpoint

UPDATE "media" SET "user_id" = "posts"."user_id"
  FROM "posts"
  WHERE "media"."post_id" = "posts"."id";--> statement-breakpoint

DELETE FROM "media" WHERE "user_id" IS NULL;--> statement-breakpoint

ALTER TABLE "media" ALTER COLUMN "user_id" SET NOT NULL;--> statement-breakpoint

ALTER TABLE "media" ADD CONSTRAINT "media_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
