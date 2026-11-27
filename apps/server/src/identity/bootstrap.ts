// First-owner bootstrap (M1-03), used by `npm run bootstrap:admin -w apps/server`. Idempotent: it
// creates the first workspace if there is none and an owner invite for the bootstrap address if that
// address has neither an owner membership nor a pending (unused, unexpired) invite. Two runs at once
// are serialised by a transaction-scoped advisory lock. The address is never returned or printed.
import { type Database, forWorkspace, identityRepository, withTx } from "@4x35/db";
import { sql } from "drizzle-orm";
import { hashToken, INVITE_TTL_MS, newToken } from "./invites.js";

export const FIRST_WORKSPACE_NAME = "Main workspace";
/** Where the web app accepts an invite; the token rides in the fragment, which no server logs. */
export const INVITE_PATH = "/invite";

export type BootstrapResult =
  | { kind: "invited"; workspaceId: string; url: string }
  | { kind: "pending"; workspaceId: string }
  | { kind: "owner_exists"; workspaceId: string };

/** The one-time invite link: `<base>/invite#token=<token>` (relative when no base is set). */
export function inviteUrl(baseUrl: string | undefined, token: string): string {
  const base = (baseUrl ?? "").replace(/\/+$/, "");
  return `${base}${INVITE_PATH}#token=${token}`;
}

export async function bootstrapAdmin(
  db: Database,
  opts: { email: string; baseUrl?: string | undefined; now?: Date },
): Promise<BootstrapResult> {
  const now = opts.now ?? new Date();
  return withTx(db, async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('4x35:bootstrap-admin'))`);
    const identity = identityRepository(tx);
    const workspace =
      (await identity.firstWorkspace()) ?? (await identity.createWorkspace(FIRST_WORKSPACE_NAME));
    const workspaceId = workspace.id;
    if (await identity.isOwner(workspaceId, opts.email)) return { kind: "owner_exists", workspaceId };
    const repos = forWorkspace({ workspaceId }, tx);
    const pending = (await repos.invites.pendingFor(opts.email)).filter((i) => i.role === "owner");
    if (pending.length > 0) return { kind: "pending", workspaceId };
    const token = newToken();
    await repos.invites.create({
      email: opts.email,
      role: "owner",
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + INVITE_TTL_MS),
    });
    return { kind: "invited", workspaceId, url: inviteUrl(opts.baseUrl, token) };
  });
}
