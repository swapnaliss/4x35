// Identity module (architecture §5): workspaces, users, memberships, invites, sessions, API tokens.
import { MEMBERSHIP_ROLES } from "@4x35/core";
import { sql } from "drizzle-orm";
import { boolean, index, jsonb, pgTable, primaryKey, text, uuid } from "drizzle-orm/pg-core";
import { citext, enumCheck, timestamptz } from "./columns.js";

/** The stored `workspaces.settings` (camelCase, like the core `WorkspaceSettings`). */
export interface WorkspaceSettingsJson {
  fourEyes: boolean;
  llmOptIn: boolean;
  quotas: Record<string, number>;
}

export const workspaces = pgTable("workspaces", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  settings: jsonb("settings")
    .$type<WorkspaceSettingsJson>()
    .notNull()
    .default({ fourEyes: false, llmOptIn: false, quotas: {} }),
  isSandbox: boolean("is_sandbox").notNull().default(false),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: citext("email").notNull().unique("users_email_unique"),
  /** argon2id (ADR 0013); null until the invite is accepted. Written by M1-03. */
  passwordHash: text("password_hash"),
  createdAt: timestamptz("created_at").notNull().defaultNow(),
});

export const memberships = pgTable(
  "memberships",
  {
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    role: text("role").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ name: "memberships_pkey", columns: [t.workspaceId, t.userId] }),
    index("memberships_user_idx").on(t.userId),
    enumCheck("memberships", t.role, "role", MEMBERSHIP_ROLES),
  ],
);

export const invites = pgTable(
  "invites",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    email: citext("email").notNull(),
    role: text("role").notNull(),
    /** SHA-256 of the one-time token; the token itself is never stored. */
    tokenHash: text("token_hash").notNull().unique("invites_token_hash_unique"),
    expiresAt: timestamptz("expires_at").notNull(),
    usedAt: timestamptz("used_at"),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [
    index("invites_workspace_idx").on(t.workspaceId),
    enumCheck("invites", t.role, "role", MEMBERSHIP_ROLES),
  ],
);

export const sessions = pgTable(
  "sessions",
  {
    /** Keyed SHA-256 of the session id (M1-03); the id itself is never stored. */
    idHash: text("id_hash").primaryKey(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    csrfSecret: text("csrf_secret").notNull(),
    expiresAt: timestamptz("expires_at").notNull(),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const apiTokens = pgTable(
  "api_tokens",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workspaceId: uuid("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    /** The visible `4x35_…` prefix, for listing; the secret part is only stored hashed. */
    prefix: text("prefix").notNull(),
    tokenHash: text("token_hash").notNull().unique("api_tokens_token_hash_unique"),
    scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
    expiresAt: timestamptz("expires_at"),
    revokedAt: timestamptz("revoked_at"),
    createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
    createdAt: timestamptz("created_at").notNull().defaultNow(),
  },
  (t) => [index("api_tokens_workspace_idx").on(t.workspaceId)],
);
