CREATE TYPE "public"."agent_role" AS ENUM('agent', 'admin');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('referral', 'web', 'phone', 'cold');--> statement-breakpoint
CREATE TYPE "public"."lead_status" AS ENUM('new', 'in_progress', 'contacted', 'closed');--> statement-breakpoint
CREATE TABLE "agents" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "agents_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"role" "agent_role" DEFAULT 'agent' NOT NULL
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "leads_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"name" text NOT NULL,
	"phone" text NOT NULL,
	"status" "lead_status" DEFAULT 'new' NOT NULL,
	"agent_id" integer,
	"is_new_customer" boolean,
	"interest" smallint,
	"source" "lead_source",
	"rating_new_customer" double precision NOT NULL,
	"rating_interest" double precision NOT NULL,
	"rating_source" double precision NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "leads_interest_range" CHECK ("leads"."interest" BETWEEN 1 AND 10),
	CONSTRAINT "leads_ratings_range" CHECK ("leads"."rating_new_customer" BETWEEN 0 AND 100 AND "leads"."rating_interest" BETWEEN 0 AND 100 AND "leads"."rating_source" BETWEEN 0 AND 100)
);
--> statement-breakpoint
CREATE TABLE "weights" (
	"id" boolean PRIMARY KEY DEFAULT true NOT NULL,
	"new_customer" smallint NOT NULL,
	"interest" smallint NOT NULL,
	"source" smallint NOT NULL,
	"age" smallint NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "weights_singleton" CHECK ("weights"."id"),
	CONSTRAINT "weights_non_negative" CHECK ("weights"."new_customer" >= 0 AND "weights"."interest" >= 0 AND "weights"."source" >= 0 AND "weights"."age" >= 0),
	CONSTRAINT "weights_sum_100" CHECK ("weights"."new_customer" + "weights"."interest" + "weights"."source" + "weights"."age" = 100)
);
--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_agent_id_agents_id_fk" FOREIGN KEY ("agent_id") REFERENCES "public"."agents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "leads_status_idx" ON "leads" USING btree ("status");--> statement-breakpoint
CREATE INDEX "leads_agent_idx" ON "leads" USING btree ("agent_id");--> statement-breakpoint
CREATE INDEX "leads_name_trgm_idx" ON "leads" USING gin ("name" gin_trgm_ops);--> statement-breakpoint
CREATE INDEX "leads_phone_trgm_idx" ON "leads" USING gin ("phone" gin_trgm_ops);