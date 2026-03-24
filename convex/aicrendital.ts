import { v } from "convex/values";
import { internal } from "./_generated/api";
import { httpAction, internalQuery, mutation } from "./_generated/server";
import { decrypt, encrypt } from "./lib/encryption";

const providerValidator = v.union(
  v.literal("openai-codex"),
  v.literal("anthropic"),
  v.literal("github-copilot"),
  v.literal("google-gemini-cli"),
);

export const createCredential = mutation({
  args: {
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
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Unauthenticated");
    }

    const userId = identity.subject;
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
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
        q.eq("userId", userId).eq("provider", args.provider),
      )
      .first();

    const payload = {
      userId,
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

    const credentialId = await ctx.db.insert("aicrendital", payload);

    return credentialId;
  },
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
