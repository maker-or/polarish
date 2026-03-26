/**
 * convex/console.ts
 *
 * Convex backend for the Developer Console — CRUD for OAuth applications.
 * All WorkOS Connect REST calls are made via raw fetch since the WorkOS Node
 * SDK does not expose typed methods for the Connect API.
 *
 * WorkOS Connect REST API base: https://api.workos.com/connect
 *
 * Debug client-secret flows (Convex dashboard logs): set env
 * `CONSOLE_DEBUG_CLIENT_SECRETS=1` on the deployment. Never logs raw secret
 * strings — only ids, last-four, timings, and overlap warnings.
 */

import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const WORKOS_API_BASE = "https://api.workos.com";

/** Fail before Convex action limits; avoids hanging forever on stalled TCP. */
const WORKOS_FETCH_TIMEOUT_MS = 45_000;

function debugClientSecretsEnabled(): boolean {
  return process.env.CONSOLE_DEBUG_CLIENT_SECRETS === "1";
}

/** Safe ids for logs — never log full secrets. */
function shortId(id: string, len = 12): string {
  return id.length <= len ? id : `${id.slice(0, len)}…`;
}

function debugClientSecretsLog(
  phase: string,
  payload: Record<string, string | number | boolean | undefined>,
): void {
  if (!debugClientSecretsEnabled()) return;
  console.log(
    `[console][clientSecrets🔒] ${phase}`,
    JSON.stringify({ ...payload, ts: Date.now() }),
  );
}

/** In-process overlap detector (best-effort; helps spot duplicate concurrent calls). */
const debugInFlight = new Map<string, number>();

function debugLockEnter(lockKey: string, op: string): void {
  if (!debugClientSecretsEnabled()) return;
  const n = (debugInFlight.get(lockKey) ?? 0) + 1;
  debugInFlight.set(lockKey, n);
  if (n > 1) {
    console.warn(
      `[console][clientSecrets🔒] concurrent_${op}`,
      JSON.stringify({ lockKey, depth: n, ts: Date.now() }),
    );
  }
}

function debugLockLeave(lockKey: string): void {
  if (!debugClientSecretsEnabled()) return;
  const n = (debugInFlight.get(lockKey) ?? 1) - 1;
  if (n <= 0) debugInFlight.delete(lockKey);
  else debugInFlight.set(lockKey, n);
}

interface WorkOSApp {
  object: string;
  id: string;
  client_id: string;
  name: string;
  application_type: string;
  redirect_uris: Array<{ uri: string; default: boolean }>;
  uses_pkce: boolean;
  is_first_party: boolean;
  was_dynamically_registered: boolean;
  organization_id?: string;
  scopes?: string[];
  created_at: string;
  updated_at: string;
}

interface WorkOSClientSecret {
  id: string;
  client_id: string;
  name: string;
  secret?: string; // only present on creation
  last_four: string;
  created_at: string;
}

/** WorkOS list endpoints may return `{ data: [...] }`, `{ client_secrets: [...] }`, or a bare array. */
function parseWorkOSClientSecretList(result: unknown): WorkOSClientSecret[] {
  if (Array.isArray(result)) return result;
  if (result && typeof result === "object") {
    const o = result as Record<string, unknown>;
    if (Array.isArray(o.data)) return o.data as WorkOSClientSecret[];
    if (Array.isArray(o.client_secrets))
      return o.client_secrets as WorkOSClientSecret[];
    if (Array.isArray(o.items)) return o.items as WorkOSClientSecret[];
  }
  return [];
}

interface WorkOSOrganization {
  id: string;
  name: string;
  external_id?: string;
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function workosHeaders(): Record<string, string> {
  const apiKey = process.env.WORKOS_API_KEY;
  if (!apiKey)
    throw new Error("WORKOS_API_KEY environment variable is not set");
  return {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };
}

async function workosRequest<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const url = `${WORKOS_API_BASE}${path}`;
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), WORKOS_FETCH_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(url, {
      ...options,
      signal: controller.signal,
      headers: {
        ...workosHeaders(),
        ...(options.headers as Record<string, string> | undefined),
      },
    });
  } catch (e) {
    if (e instanceof Error && e.name === "AbortError") {
      throw new ConvexError({
        code: "WORKOS_TIMEOUT",
        message: `WorkOS API request timed out after ${WORKOS_FETCH_TIMEOUT_MS / 1000}s`,
      });
    }
    throw e;
  } finally {
    clearTimeout(timeoutId);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { message?: string; error?: string };
      detail = body.message ?? body.error ?? JSON.stringify(body);
    } catch {
      detail = await res.text();
    }
    throw new ConvexError({
      code: "WORKOS_API_ERROR",
      status: res.status,
      message: `WorkOS API error (${res.status}): ${detail}`,
    });
  }

  if (res.status === 204) return undefined as T;

  return res.json() as Promise<T>;
}

/** Normalize user-entered domain/origin to a stable origin string (http/https only). */
function normalizeAllowedOrigin(raw: string): string {
  const s = raw.trim();
  if (!s) throw new ConvexError({ code: "INVALID_DOMAIN", message: "Domain cannot be empty" });
  let url: URL;
  try {
    url = new URL(s.includes("://") ? s : `https://${s}`);
  } catch {
    throw new ConvexError({
      code: "INVALID_DOMAIN",
      message: `Invalid domain or origin: ${raw}`,
    });
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new ConvexError({
      code: "INVALID_DOMAIN",
      message: "Domain must use http or https",
    });
  }
  return url.origin;
}

function normalizeDomainList(domains: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const d of domains) {
    const o = normalizeAllowedOrigin(d);
    if (!seen.has(o)) {
      seen.add(o);
      out.push(o);
    }
  }
  return out;
}

async function ensureWorkosOrg(
  orgId: string,
  orgName: string,
): Promise<string> {
  const created = await workosRequest<WorkOSOrganization>("/organizations", {
    method: "POST",
    body: JSON.stringify({ name: orgName, external_id: orgId }),
  });
  return created.id;
}

// ---------------------------------------------------------------------------
// Queries
// ---------------------------------------------------------------------------

/** List all console apps for the authenticated user's org. */
export const listApps = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership)
      throw new Error("User does not belong to any organisation");

    const apps = await ctx.db
      .query("consoleApp")
      .withIndex("by_orgId", (q) => q.eq("orgId", membership.orgId))
      .collect();

    return apps.map((a) => ({
      _id: a._id,
      workosAppId: a.workosAppId,
      workosClientId: a.workosClientId,
      name: a.name,
      domains: a.domains ?? [],
      redirectUri: a.redirectUri,
      createdAt: a._creationTime,
      updatedAt: a.updatedAt,
    }));
  },
});

/** Get a single console app by its Convex ID. */
export const getApp = query({
  args: { appId: v.id("consoleApp") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    if (!membership)
      throw new Error("User does not belong to any organisation");
    const app = await ctx.db.get("consoleApp", args.appId);
    if (!app) return null;
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    return {
      _id: app._id,
      workosAppId: app.workosAppId,
      workosClientId: app.workosClientId,
      name: app.name,
      domains: app.domains ?? [],
      redirectUri: app.redirectUri,
      createdAt: app._creationTime,
      updatedAt: app.updatedAt,
      orgId: app.orgId,
    };
  },
});

// ---------------------------------------------------------------------------
// Mutations (Convex record writes — called from actions after WorkOS API)
// ---------------------------------------------------------------------------

export const _insertApp = mutation({
  args: {
    workosAppId: v.string(),
    workosClientId: v.string(),
    name: v.string(),
    domains: v.array(v.string()),
    redirectUri: v.array(v.object({ uri: v.string(), default: v.boolean() })),
    orgId: v.id("organisation"),
    userId: v.string(),
  },
  returns: v.id("consoleApp"),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    return await ctx.db.insert("consoleApp", {
      workosAppId: args.workosAppId,
      workosClientId: args.workosClientId,
      name: args.name,
      domains: args.domains,
      redirectUri: args.redirectUri,
      orgId: args.orgId,
      userId: args.userId,
      updatedAt: Date.now(),
    });
  },
});

export const _patchApp = mutation({
  args: {
    appId: v.id("consoleApp"),
    name: v.optional(v.string()),
    domains: v.optional(v.array(v.string())),
    redirectUri: v.optional(
      v.array(v.object({ uri: v.string(), default: v.boolean() })),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const { appId, ...fields } = args;
    const patch: Record<string, unknown> = { updatedAt: Date.now() };
    if (fields.name !== undefined) patch.name = fields.name;
    if (fields.domains !== undefined) patch.domains = fields.domains;
    if (fields.redirectUri !== undefined)
      patch.redirectUri = fields.redirectUri;
    await ctx.db.patch(appId, patch);
    return null;
  },
});

export const _deleteApp = mutation({
  args: { appId: v.id("consoleApp") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    await ctx.db.delete(args.appId);
    return null;
  },
});

// ---------------------------------------------------------------------------
// Actions — each action does its own auth + DB lookups via ctx.runQuery
// to avoid cross-module circular references before codegen
// ---------------------------------------------------------------------------

/** Create a new OAuth application in WorkOS and record it in Convex. */
export const createApp = action({
  args: {
    name: v.string(),
    domains: v.array(v.string()),
    redirectUris: v.array(v.string()),
  },
  handler: async (ctx, args): Promise<{ appId: string; clientId: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");
    const userId = identity.subject;

    // Inline membership + org lookup (avoids circular api.console refs)
    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");
    if (membership.role !== "admin")
      throw new Error("Only admins can create apps");

    const orgRecord = await ctx.runQuery(api.console.getOrgRecord, {
      orgId: membership.orgId,
    });
    if (!orgRecord) throw new Error("Organisation not found");

    let workosOrgId = orgRecord.workosOrgId;
    if (!workosOrgId) {
      workosOrgId = await ensureWorkosOrg(membership.orgId, orgRecord.name);
      await ctx.runMutation(api.org.patchWorkosOrgId, {
        orgId: membership.orgId,
        workosOrgId,
      });
    }

    const normalizedDomains = normalizeDomainList(args.domains);

    const redirectUriObjects = args.redirectUris.map((uri, i) => ({
      uri,
      default: i === 0,
    }));

    const workosApp = await workosRequest<WorkOSApp>("/connect/applications", {
      method: "POST",
      body: JSON.stringify({
        name: args.name,
        application_type: "oauth",
        redirect_uris: redirectUriObjects,
        uses_pkce: false,
        is_first_party: false,
        organization_id: workosOrgId,
      }),
    });

    const convexAppId: string = await ctx.runMutation(api.console._insertApp, {
      workosAppId: workosApp.id,
      workosClientId: workosApp.client_id,
      name: workosApp.name,
      domains: normalizedDomains,
      redirectUri: workosApp.redirect_uris,
      orgId: membership.orgId,
      userId,
    });

    return { appId: convexAppId, clientId: workosApp.client_id };
  },
});

/** Update an existing OAuth application's metadata. */
export const updateApp = action({
  args: {
    appId: v.id("consoleApp"),
    name: v.optional(v.string()),
    domains: v.optional(v.array(v.string())),
    redirectUris: v.optional(v.array(v.string())),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");
    if (membership.role !== "admin")
      throw new Error("Only admins can update apps");

    const app = await ctx.runQuery(api.console.getApp, { appId: args.appId });
    if (!app) throw new Error("App not found");
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    const normalizedDomains =
      args.domains !== undefined
        ? normalizeDomainList(args.domains)
        : undefined;

    const workosPayload: Record<string, unknown> = {};
    if (args.name !== undefined) workosPayload.name = args.name;
    if (args.redirectUris !== undefined) {
      workosPayload.redirect_uris = args.redirectUris.map((uri, i) => ({
        uri,
        default: i === 0,
      }));
    }

    let nextName = app.name;
    let nextRedirectUri = app.redirectUri;

    if (Object.keys(workosPayload).length > 0) {
      const updated = await workosRequest<WorkOSApp>(
        `/connect/applications/${app.workosAppId}`,
        { method: "PUT", body: JSON.stringify(workosPayload) },
      );
      nextName = updated.name;
      nextRedirectUri = updated.redirect_uris;
    }

    const hasConvexPatch =
      Object.keys(workosPayload).length > 0 ||
      normalizedDomains !== undefined;
    if (!hasConvexPatch) {
      throw new ConvexError({
        code: "NOTHING_TO_UPDATE",
        message: "No fields to update",
      });
    }

    await ctx.runMutation(api.console._patchApp, {
      appId: args.appId,
      ...(Object.keys(workosPayload).length > 0
        ? { name: nextName, redirectUri: nextRedirectUri }
        : {}),
      ...(normalizedDomains !== undefined
        ? { domains: normalizedDomains }
        : {}),
    });
  },
});

/** Delete an OAuth application from WorkOS and Convex. */
export const deleteApp = action({
  args: { appId: v.id("consoleApp") },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");
    if (membership.role !== "admin")
      throw new Error("Only admins can delete apps");

    const app = await ctx.runQuery(api.console.getApp, { appId: args.appId });
    if (!app) throw new Error("App not found");
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    await workosRequest(`/connect/applications/${app.workosAppId}`, {
      method: "DELETE",
    });

    await ctx.runMutation(api.console._deleteApp, { appId: args.appId });
  },
});

/** Create a new client secret for an app. Returns the secret once — store it. */
export const createClientSecret = action({
  args: {
    appId: v.id("consoleApp"),
    name: v.string(),
  },
  handler: async (
    ctx,
    args,
  ): Promise<{
    secretId: string;
    secret: string;
    lastFour: string;
    name: string;
    createdAt: string;
  }> => {
    const t0 = Date.now();
    const lockKey = `create:${args.appId}`;
    debugLockEnter(lockKey, "create");
    try {
      debugClientSecretsLog("create_start", {
        appId: shortId(String(args.appId)),
        label: args.name,
      });

      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthenticated");

      const [membership, app] = await Promise.all([
        ctx.runQuery(api.org.getMyMembership),
        ctx.runQuery(api.console.getApp, { appId: args.appId }),
      ]);
      if (!membership)
        throw new Error("User does not belong to any organisation");
      if (membership.role !== "admin")
        throw new Error("Only admins can create secrets");
      if (!app) throw new Error("App not found");
      if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

      const secret = await workosRequest<WorkOSClientSecret>(
        `/connect/applications/${app.workosAppId}/client_secrets`,
        { method: "POST", body: JSON.stringify({ name: args.name }) },
      );

      if (!secret.secret) {
        debugClientSecretsLog("create_missing_secret_body", {
          durationMs: Date.now() - t0,
          workosReturnedId: shortId(secret.id),
        });
        throw new ConvexError({
          code: "MISSING_SECRET",
          message: "WorkOS did not return the secret value",
        });
      }

      debugClientSecretsLog("create_ok", {
        secretId: shortId(secret.id),
        lastFour: secret.last_four,
        hasSecretValue: true,
        durationMs: Date.now() - t0,
      });

      return {
        secretId: secret.id,
        secret: secret.secret,
        lastFour: secret.last_four,
        name: secret.name,
        createdAt: secret.created_at ?? new Date().toISOString(),
      };
    } catch (e) {
      debugClientSecretsLog("create_fail", {
        message: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
      });
      throw e;
    } finally {
      debugLockLeave(lockKey);
    }
  },
});

/** List client secrets for an app (metadata only, no secret values). */
export const listClientSecrets = action({
  args: { appId: v.id("consoleApp") },
  handler: async (
    ctx,
    args,
  ): Promise<
    Array<{ id: string; name: string; lastFour: string; createdAt: string }>
  > => {
    const t0 = Date.now();
    const lockKey = `list:${args.appId}`;
    debugLockEnter(lockKey, "list");
    try {
      debugClientSecretsLog("list_start", {
        appId: shortId(String(args.appId)),
      });

      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthenticated");

      const [membership, app] = await Promise.all([
        ctx.runQuery(api.org.getMyMembership),
        ctx.runQuery(api.console.getApp, { appId: args.appId }),
      ]);
      if (!membership)
        throw new Error("User does not belong to any organisation");
      if (!app) throw new Error("App not found");
      if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

      debugClientSecretsLog("list_auth_ok", {
        workosAppId: shortId(app.workosAppId),
      });

      const result = await workosRequest<unknown>(
        `/connect/applications/${app.workosAppId}/client_secrets`,
      );

      const shape =
        result === null || result === undefined
          ? "null"
          : Array.isArray(result)
            ? "array"
            : typeof result === "object"
              ? `keys:${Object.keys(result as object).sort().join(",")}`
              : typeof result;

      const secrets = parseWorkOSClientSecretList(result);
      debugClientSecretsLog("list_parse", {
        responseShape: shape,
        parsedCount: secrets.length,
      });

      const rows = secrets
        .filter(
          (s) =>
            typeof s.id === "string" &&
            s.id.length > 0 &&
            typeof s.name === "string",
        )
        .map((s) => ({
          id: s.id,
          name: s.name,
          lastFour: s.last_four ?? "",
          createdAt: s.created_at ?? "",
        }));

      debugClientSecretsLog("list_ok", {
        rowCount: rows.length,
        durationMs: Date.now() - t0,
      });

      return rows;
    } catch (e) {
      debugClientSecretsLog("list_fail", {
        message: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
      });
      throw e;
    } finally {
      debugLockLeave(lockKey);
    }
  },
});

/** Revoke (delete) a client secret by its WorkOS secret ID. */
export const revokeClientSecret = action({
  args: {
    appId: v.id("consoleApp"),
    secretId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const t0 = Date.now();
    const lockKey = `revoke:${args.appId}:${args.secretId}`;
    debugLockEnter(lockKey, "revoke");
    try {
      debugClientSecretsLog("revoke_start", {
        appId: shortId(String(args.appId)),
        secretId: shortId(args.secretId),
      });

      const identity = await ctx.auth.getUserIdentity();
      if (!identity) throw new Error("Unauthenticated");

      const [membership, app] = await Promise.all([
        ctx.runQuery(api.org.getMyMembership),
        ctx.runQuery(api.console.getApp, { appId: args.appId }),
      ]);
      if (!membership)
        throw new Error("User does not belong to any organisation");
      if (membership.role !== "admin")
        throw new Error("Only admins can revoke secrets");
      if (!app) throw new Error("App not found");
      if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

      await workosRequest(`/connect/client_secrets/${args.secretId}`, {
        method: "DELETE",
      });

      debugClientSecretsLog("revoke_ok", { durationMs: Date.now() - t0 });
    } catch (e) {
      debugClientSecretsLog("revoke_fail", {
        message: e instanceof Error ? e.message : String(e),
        durationMs: Date.now() - t0,
      });
      throw e;
    } finally {
      debugLockLeave(lockKey);
    }
  },
});

// ---------------------------------------------------------------------------
// Helper query — org record for actions (direct DB access within this module)
// ---------------------------------------------------------------------------

export const getOrgRecord = query({
  args: { orgId: v.id("organisation") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const org = await ctx.db.get(args.orgId);
    if (!org) return null;

    return {
      _id: org._id as string,
      name: org.name,
      workosOrgId: org.workosOrgId,
    };
  },
});
