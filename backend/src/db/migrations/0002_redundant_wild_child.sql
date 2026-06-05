CREATE TABLE "instagram_imports" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"ig_media_id" text NOT NULL,
	"ig_permalink" text,
	"post_id" integer NOT NULL,
	"imported_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "instagram_imports" ADD CONSTRAINT "instagram_imports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "instagram_imports" ADD CONSTRAINT "instagram_imports_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "instagram_imports_user_media_uniq" ON "instagram_imports" USING btree ("user_id","ig_media_id");