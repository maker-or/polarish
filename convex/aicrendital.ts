import { v } from "convex/values";
import { internal } from "./_generated/api";
import {
  httpAction,
  internalMutation,
  internalQuery,
  mutation,
} from "./_generated/server";
import { decrypt, encrypt } from "./lib/encryption";

const providerValidator = v.union(
  v.literal("openai-codex"),
  v.literal("anthropic"),
  v.literal("github-copilot"),
  v.literal("google-gemini-cli"),
);

/**
 * This schema is the shape of the provider credential payload that we store for one user.
 */
const createCredentialArgsValidator = {
  provider: providerValidator,
  provider_subscriptionType: v.optional(v.string()),
  provider_user_id: v.optional(v.string()),
  provider_account_id: v.optional(v.string()),
  provider_sub_active_start: v.optional(v.string()),
  provider_sub_active_until: v.optional(v.string()),
  accessToken: v.string(),
  token_id: v.optional(v.string()),
  refresh_token: v.optional(v.string()),
  expiresAt: v.optional(v.number()),
};

/**
 * This schema is the shape of the internal upsert request used by the HTTP route.
 */
const internalCreateCredentialArgsValidator = {
  userId: v.string(),
  ...createCredentialArgsValidator,
};

export const createCredential = mutation({
  args: createCredentialArgsValidator,
  handler: async (ctx, args): Promise<string> => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const userId = identity.subject;
    const credentialId: string = await ctx.runMutation(
      internal.aicrendital.upsertCredentialForUser,
      {
      ...args,
      userId,
      },
    );
    return credentialId;
  },
});

/**
 * This function writes or updates one provider credential for one user.
 * This is the shape of the request that we are expecting: user id, generic provider metadata, access token, optional refresh token, optional token id, and optional expiry.
 */
export const upsertCredentialForUser = internalMutation({
  args: internalCreateCredentialArgsValidator,
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!membership) {
      throw new Error("User does not belong to any organisation");
    }

    const [encryptedAccessToken, encryptedTokenId, encryptedRefreshToken] =
      await Promise.all([
        encrypt(args.accessToken),
        args.token_id ? encrypt(args.token_id) : Promise.resolve(undefined),
        args.refresh_token
          ? encrypt(args.refresh_token)
          : Promise.resolve(undefined),
      ]);

    const existing = await ctx.db
      .query("aicrendital")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .first();

    const payload = {
      userId: args.userId,
      orgId: membership.orgId,
      provider: args.provider,
      provider_subscriptionType: args.provider_subscriptionType,
      provider_user_id: args.provider_user_id,
      provider_account_id: args.provider_account_id,
      provider_sub_active_start: args.provider_sub_active_start,
      provider_sub_active_until: args.provider_sub_active_until,
      accessToken: encryptedAccessToken,
      token_id: encryptedTokenId,
      refresh_token: encryptedRefreshToken,
      expiresAt: args.expiresAt,
      updatedAt: Date.now(),
    };

    if (existing) {
      await ctx.db.patch(existing._id, payload);
      return existing._id;
    }

    return await ctx.db.insert("aicrendital", payload);
  },
});

/**
 * This function stores one provider credential through Convex HTTP for the authenticated CLI user.
 * This is the shape of the request that we are expecting: the same generic provider payload used by the desktop app.
 */
export const createCredentialHttp = httpAction(async (ctx, request) => {
  if (request.method !== "POST") {
    return Response.json({ error: "Method not allowed" }, { status: 405 });
  }

  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    return Response.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const body = (await request.json().catch(() => null)) as
    | {
        provider?: "openai-codex" | "anthropic" | "github-copilot" | "google-gemini-cli";
        provider_subscriptionType?: string;
        provider_user_id?: string;
        provider_account_id?: string;
        provider_sub_active_start?: string;
        provider_sub_active_until?: string;
        accessToken?: string;
        token_id?: string;
        refresh_token?: string;
        expiresAt?: number;
      }
    | null;
  if (!body?.provider || !body.accessToken) {
    return Response.json(
      { error: "Missing required fields: provider, accessToken" },
      { status: 400 },
    );
  }

  try {
    const credentialInput = {
      provider: body.provider,
      provider_subscriptionType: body.provider_subscriptionType,
      provider_user_id: body.provider_user_id,
      provider_account_id: body.provider_account_id,
      provider_sub_active_start: body.provider_sub_active_start,
      provider_sub_active_until: body.provider_sub_active_until,
      accessToken: body.accessToken,
      token_id: body.token_id,
      refresh_token: body.refresh_token,
      expiresAt: body.expiresAt,
      userId: identity.subject,
    };
    const credentialId = await ctx.runMutation(
      internal.aicrendital.upsertCredentialForUser,
      credentialInput,
    );
    return Response.json({ ok: true, credentialId });
  } catch (error) {
    return Response.json(
      { error: error instanceof Error ? error.message : String(error) },
      { status: 400 },
    );
  }
});

export const getCredential = httpAction(async (ctx, request) => {
  const url = new URL(request.url);
  const userId = url.searchParams.get("userId");
  const provider = url.searchParams.get("provider") as
    | "openai-codex"
    | "anthropic"
    | "github-copilot"
    | "google-gemini-cli"
    | null;

  if (!userId || !provider) {
    return Response.json(
      { error: "Missing required query params: userId, provider" },
      { status: 400 },
    );
  }

  const credential = await ctx.runQuery(internal.aicrendital.getinfo, {
    userId,
    provider,
  });
  console.log("this is afeter the credential");
  if (!credential) {
    return Response.json(null, { status: 200 });
  }

  const [accessToken, refresh_token] = await Promise.all([
    decrypt(credential.accessToken),
    credential.refresh_token ? decrypt(credential.refresh_token) : undefined,
  ]);

  return Response.json({
    ...credential,
    accessToken,
    refresh_token,
  });
});

export const getinfo = internalQuery({
  args: {
    userId: v.string(),
    provider: providerValidator,
  },
  handler: async (ctx, args) => {
    const res = await ctx.db
      .query("aicrendital")
      .withIndex("by_userId_provider", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider),
      )
      .unique();
    return res;
  },
});
