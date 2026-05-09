CREATE TABLE "media" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer,
	"original_key" text NOT NULL,
	"watermarked_key" text,
	"media_type" text NOT NULL,
	"mime_type" text NOT NULL,
	"file_size" integer,
	"sort_order" integer DEFAULT 0,
	"processing_status" text DEFAULT 'pending',
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "platform_accounts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"platform" text NOT NULL,
	"account_name" text,
	"account_id" text NOT NULL,
	"access_token" text NOT NULL,
	"refresh_token" text,
	"token_expires" timestamp,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "post_platforms" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer NOT NULL,
	"platform_account_id" integer NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"platform_post_id" text,
	"error_message" text,
	"published_at" timestamp
);
--> statement-breakpoint
CREATE TABLE "posts" (
	"id" serial PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"caption" text,
	"scheduled_at" timestamp NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "publish_logs" (
	"id" serial PRIMARY KEY NOT NULL,
	"post_id" integer,
	"platform" text,
	"level" text DEFAULT 'info',
	"message" text NOT NULL,
	"details" text,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" serial PRIMARY KEY NOT NULL,
	"email" text NOT NULL,
	"password_hash" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "media" ADD CONSTRAINT "media_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_accounts" ADD CONSTRAINT "platform_accounts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_platforms" ADD CONSTRAINT "post_platforms_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "post_platforms" ADD CONSTRAINT "post_platforms_platform_account_id_platform_accounts_id_fk" FOREIGN KEY ("platform_account_id") REFERENCES "public"."platform_accounts"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "posts" ADD CONSTRAINT "posts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "publish_logs" ADD CONSTRAINT "publish_logs_post_id_posts_id_fk" FOREIGN KEY ("post_id") REFERENCES "public"."posts"("id") ON DELETE no action ON UPDATE no action;