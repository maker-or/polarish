/**
 * convex/console.ts
 *
 * Convex backend for the Developer Console — CRUD for OAuth applications.
 * All WorkOS Connect REST calls are made via raw fetch since the WorkOS Node
 * SDK does not expose typed methods for the Connect API.
 *
 * WorkOS Connect REST API base: https://api.workos.com/connect
 */

import { ConvexError, v } from "convex/values";
import { api } from "./_generated/api";
import { action, mutation, query } from "./_generated/server";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

const WORKOS_API_BASE = "https://api.workos.com";

interface WorkOSApp {
  object: string;
  id: string;
  client_id: string;
  name: string;
  description?: string;
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
  const res = await fetch(url, {
    ...options,
    headers: {
      ...workosHeaders(),
      ...(options.headers as Record<string, string> | undefined),
    },
  });

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
      description: a.description,
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
    console.log("the app id is ", args.appId);
    const app = await ctx.db.get("consoleApp", args.appId);
    if (!app) return null;
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    return {
      _id: app._id,
      workosAppId: app.workosAppId,
      workosClientId: app.workosClientId,
      name: app.name,
      description: app.description,
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
    description: v.optional(v.string()),
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
      description: args.description,
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
    description: v.optional(v.string()),
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
    if (fields.description !== undefined)
      patch.description = fields.description;
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
    description: v.optional(v.string()),
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

    const redirectUriObjects = args.redirectUris.map((uri, i) => ({
      uri,
      default: i === 0,
    }));

    const workosApp = await workosRequest<WorkOSApp>("/connect/applications", {
      method: "POST",
      body: JSON.stringify({
        name: args.name,
        application_type: "oauth",
        description: args.description,
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
      description: args.description,
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
    description: v.optional(v.string()),
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

    const workosPayload: Record<string, unknown> = {};
    if (args.name) workosPayload.name = args.name;
    if (args.description !== undefined)
      workosPayload.description = args.description;
    if (args.redirectUris) {
      workosPayload.redirect_uris = args.redirectUris.map((uri, i) => ({
        uri,
        default: i === 0,
      }));
    }

    const updated = await workosRequest<WorkOSApp>(
      `/connect/applications/${app.workosAppId}`,
      { method: "PUT", body: JSON.stringify(workosPayload) },
    );

    await ctx.runMutation(api.console._patchApp, {
      appId: args.appId,
      name: updated.name,
      description: args.description,
      redirectUri: updated.redirect_uris,
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
  ): Promise<{ secretId: string; secret: string; lastFour: string }> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");
    if (membership.role !== "admin")
      throw new Error("Only admins can create secrets");

    const app = await ctx.runQuery(api.console.getApp, { appId: args.appId });
    if (!app) throw new Error("App not found");
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    const secret = await workosRequest<WorkOSClientSecret>(
      `/connect/applications/${app.workosAppId}/client_secrets`,
      { method: "POST", body: JSON.stringify({ name: args.name }) },
    );

    if (!secret.secret) {
      throw new ConvexError({
        code: "MISSING_SECRET",
        message: "WorkOS did not return the secret value",
      });
    }

    return {
      secretId: secret.id,
      secret: secret.secret,
      lastFour: secret.last_four,
    };
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
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");

    const app = await ctx.runQuery(api.console.getApp, { appId: args.appId });
    if (!app) throw new Error("App not found");
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    const result = await workosRequest<{ data: WorkOSClientSecret[] }>(
      `/connect/applications/${app.workosAppId}/client_secrets`,
    );

    return result.data.map((s) => ({
      id: s.id,
      name: s.name,
      lastFour: s.last_four,
      createdAt: s.created_at,
    }));
  },
});

/** Revoke (delete) a client secret by its WorkOS secret ID. */
export const revokeClientSecret = action({
  args: {
    appId: v.id("consoleApp"),
    secretId: v.string(),
  },
  handler: async (ctx, args): Promise<void> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const membership = await ctx.runQuery(api.org.getMyMembership);
    if (!membership)
      throw new Error("User does not belong to any organisation");
    if (membership.role !== "admin")
      throw new Error("Only admins can revoke secrets");

    const app = await ctx.runQuery(api.console.getApp, { appId: args.appId });
    if (!app) throw new Error("App not found");
    if (app.orgId !== membership.orgId) throw new Error("Unauthorized");

    await workosRequest(`/connect/client_secrets/${args.secretId}`, {
      method: "DELETE",
    });
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
