/** Workspace, User and Membership (docs/architecture.md §2 and §5). */
import { z } from "zod";
import { IdSchema, NonEmptyString } from "./common.js";

export const WorkspaceSettingsSchema = z
  .object({
    fourEyes: z.boolean(),
    /** The LLM labeller is opt-in per workspace and off by default (ADR 0014). */
    llmOptIn: z.boolean().default(false),
    quotas: z.record(z.string(), z.number().int().nonnegative()).default({}),
  })
  .readonly();

export const WorkspaceSchema = z
  .object({
    id: IdSchema,
    name: NonEmptyString,
    settings: WorkspaceSettingsSchema,
    isSandbox: z.boolean(),
    createdAt: z.date(),
  })
  .readonly();
export type Workspace = z.infer<typeof WorkspaceSchema>;

/** Credentials (argon2id hash) belong to the identity module, not to the domain entity. */
export const UserSchema = z
  .object({
    id: IdSchema,
    email: z.email(),
    createdAt: z.date(),
  })
  .readonly();
export type User = z.infer<typeof UserSchema>;

export const MEMBERSHIP_ROLES = ["owner", "reviewer"] as const;
export const MembershipRoleSchema = z.enum(MEMBERSHIP_ROLES);
export type MembershipRole = z.infer<typeof MembershipRoleSchema>;

export const MembershipSchema = z
  .object({
    workspaceId: IdSchema,
    userId: IdSchema,
    role: MembershipRoleSchema,
  })
  .readonly();
export type Membership = z.infer<typeof MembershipSchema>;
