CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"action" text NOT NULL,
	"subject" text NOT NULL,
	"data_hash" text NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "audit_events_actor_kind_check" CHECK ("audit_events"."actor_kind" IN ('session', 'token')),
	CONSTRAINT "audit_events_data_hash_check" CHECK ("audit_events"."data_hash" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "batches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"format" text NOT NULL,
	"original" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"encoding" text NOT NULL,
	"delimiter" text,
	"eol" text,
	"column_map" jsonb,
	"pack_id" text NOT NULL,
	"pack_version" text NOT NULL,
	"form" text NOT NULL,
	"status" text DEFAULT 'uploaded' NOT NULL,
	"failure_reason" text,
	"locked" boolean DEFAULT false NOT NULL,
	"created_by" uuid NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	"purge_after" timestamp (3) with time zone DEFAULT now() + interval '30 days' NOT NULL,
	CONSTRAINT "batches_kind_check" CHECK ("batches"."kind" IN ('master_list', 'payment_file')),
	CONSTRAINT "batches_format_check" CHECK ("batches"."format" IN ('csv', 'xlsx', 'pain001', 'mt101')),
	CONSTRAINT "batches_form_check" CHECK ("batches"."form" IN ('structured', 'hybrid')),
	CONSTRAINT "batches_status_check" CHECK ("batches"."status" IN ('uploaded', 'parsing', 'parsed', 'structuring', 'ready_for_review', 'reviewed', 'exported', 'failed', 'purged')),
	CONSTRAINT "batches_eol_check" CHECK ("batches"."eol" IN ('lf', 'crlf', 'cr')),
	CONSTRAINT "batches_sha256_check" CHECK ("batches"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"location" jsonb NOT NULL,
	"party_role" text NOT NULL,
	"name" text,
	"original_lines" text[] NOT NULL,
	"country_hint" text,
	"status" text DEFAULT 'pending' NOT NULL,
	"version" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "records_status_check" CHECK ("records"."status" IN ('pending', 'proposed', 'auto_approvable', 'needs_review', 'already_valid', 'approved', 'edited', 'unknown')),
	CONSTRAINT "records_version_check" CHECK ("records"."version" >= 0)
);
--> statement-breakpoint
CREATE TABLE "exports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"bytes" "bytea" NOT NULL,
	"sha256" text NOT NULL,
	"actor_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "exports_actor_kind_check" CHECK ("exports"."actor_kind" IN ('session', 'token')),
	CONSTRAINT "exports_sha256_check" CHECK ("exports"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
CREATE TABLE "api_tokens" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"prefix" text NOT NULL,
	"token_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"expires_at" timestamp (3) with time zone,
	"revoked_at" timestamp (3) with time zone,
	"created_by" uuid,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "api_tokens_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "invites" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"workspace_id" uuid NOT NULL,
	"email" "citext" NOT NULL,
	"role" text NOT NULL,
	"token_hash" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"used_at" timestamp (3) with time zone,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "invites_token_hash_unique" UNIQUE("token_hash"),
	CONSTRAINT "invites_role_check" CHECK ("invites"."role" IN ('owner', 'reviewer'))
);
--> statement-breakpoint
CREATE TABLE "memberships" (
	"workspace_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"role" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "memberships_pkey" PRIMARY KEY("workspace_id","user_id"),
	CONSTRAINT "memberships_role_check" CHECK ("memberships"."role" IN ('owner', 'reviewer'))
);
--> statement-breakpoint
CREATE TABLE "sessions" (
	"id_hash" text PRIMARY KEY NOT NULL,
	"user_id" uuid NOT NULL,
	"csrf_secret" text NOT NULL,
	"expires_at" timestamp (3) with time zone NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" "citext" NOT NULL,
	"password_hash" text,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "workspaces" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"settings" jsonb DEFAULT '{"fourEyes":false,"llmOptIn":false,"quotas":{}}'::jsonb NOT NULL,
	"is_sandbox" boolean DEFAULT false NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "payment_file_links" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"payment_batch_id" uuid NOT NULL,
	"party_location" jsonb NOT NULL,
	"master_record_id" uuid,
	"match_key" text NOT NULL,
	"status" text NOT NULL,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "payment_file_links_status_check" CHECK ("payment_file_links"."status" IN ('matched', 'ambiguous', 'none'))
);
--> statement-breakpoint
CREATE TABLE "idempotency_keys" (
	"workspace_id" uuid NOT NULL,
	"key" text NOT NULL,
	"request_hash" text NOT NULL,
	"response" jsonb NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "idempotency_keys_pkey" PRIMARY KEY("workspace_id","key")
);
--> statement-breakpoint
CREATE TABLE "job_timings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"batch_id" uuid,
	"chunk" integer,
	"ms" integer NOT NULL,
	"outcome" text NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_timings_outcome_check" CHECK ("job_timings"."outcome" IN ('completed', 'failed', 'dead_letter')),
	CONSTRAINT "job_timings_ms_check" CHECK ("job_timings"."ms" >= 0)
);
--> statement-breakpoint
CREATE TABLE "preflight_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"batch_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"pack_version" text NOT NULL,
	"results" jsonb NOT NULL,
	"summary" jsonb NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"proposal_id" uuid NOT NULL,
	"action" text NOT NULL,
	"fields" jsonb,
	"actor_id" uuid NOT NULL,
	"actor_kind" text NOT NULL,
	"at" timestamp (3) with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "decisions_action_check" CHECK ("decisions"."action" IN ('approve', 'edit', 'unknown', 'reopen')),
	CONSTRAINT "decisions_actor_kind_check" CHECK ("decisions"."actor_kind" IN ('session', 'token'))
);
--> statement-breakpoint
CREATE TABLE "proposals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"record_id" uuid NOT NULL,
	"pack_id" text NOT NULL,
	"pack_version" text NOT NULL,
	"fields" jsonb NOT NULL,
	"findings" jsonb NOT NULL,
	"rejected" jsonb NOT NULL,
	"confidence" double precision,
	"created_at" timestamp (3) with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "batches" ADD CONSTRAINT "batches_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "records" ADD CONSTRAINT "records_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "exports" ADD CONSTRAINT "exports_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "api_tokens" ADD CONSTRAINT "api_tokens_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "invites" ADD CONSTRAINT "invites_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sessions" ADD CONSTRAINT "sessions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_file_links" ADD CONSTRAINT "payment_file_links_payment_batch_id_batches_id_fk" FOREIGN KEY ("payment_batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payment_file_links" ADD CONSTRAINT "payment_file_links_master_record_id_records_id_fk" FOREIGN KEY ("master_record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "idempotency_keys" ADD CONSTRAINT "idempotency_keys_workspace_id_workspaces_id_fk" FOREIGN KEY ("workspace_id") REFERENCES "public"."workspaces"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "preflight_runs" ADD CONSTRAINT "preflight_runs_batch_id_batches_id_fk" FOREIGN KEY ("batch_id") REFERENCES "public"."batches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_proposal_id_proposals_id_fk" FOREIGN KEY ("proposal_id") REFERENCES "public"."proposals"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "proposals" ADD CONSTRAINT "proposals_record_id_records_id_fk" FOREIGN KEY ("record_id") REFERENCES "public"."records"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_workspace_at_idx" ON "audit_events" USING btree ("workspace_id","at");--> statement-breakpoint
CREATE UNIQUE INDEX "batches_dedup_key" ON "batches" USING btree ("workspace_id","sha256","pack_id","pack_version","form");--> statement-breakpoint
CREATE INDEX "batches_purge_after_idx" ON "batches" USING btree ("purge_after");--> statement-breakpoint
CREATE INDEX "records_batch_status_idx" ON "records" USING btree ("batch_id","status");--> statement-breakpoint
CREATE INDEX "exports_batch_at_idx" ON "exports" USING btree ("batch_id","at");--> statement-breakpoint
CREATE INDEX "api_tokens_workspace_idx" ON "api_tokens" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "invites_workspace_idx" ON "invites" USING btree ("workspace_id");--> statement-breakpoint
CREATE INDEX "memberships_user_idx" ON "memberships" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "sessions_user_idx" ON "sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "payment_file_links_batch_idx" ON "payment_file_links" USING btree ("payment_batch_id");--> statement-breakpoint
CREATE INDEX "payment_file_links_master_idx" ON "payment_file_links" USING btree ("master_record_id");--> statement-breakpoint
CREATE INDEX "idempotency_keys_at_idx" ON "idempotency_keys" USING btree ("at");--> statement-breakpoint
CREATE INDEX "job_timings_job_idx" ON "job_timings" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "job_timings_kind_at_idx" ON "job_timings" USING btree ("kind","at");--> statement-breakpoint
CREATE INDEX "preflight_runs_batch_at_idx" ON "preflight_runs" USING btree ("batch_id","at");--> statement-breakpoint
CREATE INDEX "decisions_record_at_idx" ON "decisions" USING btree ("record_id","at");--> statement-breakpoint
CREATE INDEX "decisions_proposal_idx" ON "decisions" USING btree ("proposal_id");--> statement-breakpoint
CREATE INDEX "proposals_record_created_idx" ON "proposals" USING btree ("record_id","created_at");