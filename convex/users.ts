import { v } from "convex/values";
import { encrypt } from "./lib/encryption";
import { internalQuery, mutation, query } from "./_generated/server";

export const getByAuthId = internalQuery({
  args: { authId: v.string() },
  handler: async (ctx, { authId }) => {
    return await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", authId))
      .first();
  },
});

export const createDesktopSession = mutation({
  args: {
    sessionId: v.string(),
    userId: v.string(),
    secretHash: v.string(),
    refreshToken: v.string(),
    organizationId: v.optional(v.string()),
    lastAccessTokenExpiresAt: v.optional(v.number()),
    deviceName: v.optional(v.string()),
    platform: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const encryptedRefreshToken = await encrypt(args.refreshToken);
    await ctx.db.insert("desktopSessions", {
      sessionId: args.sessionId,
      userId: args.userId,
      secretHash: args.secretHash,
      encryptedRefreshToken,
      organizationId: args.organizationId,
      lastAccessTokenExpiresAt: args.lastAccessTokenExpiresAt,
      deviceName: args.deviceName,
      platform: args.platform,
      createdAt: Date.now(),
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return args.sessionId;
  },
});

export const getDesktopSessionForTokenBroker = query({
  args: {
    sessionId: v.string(),
    secretHash: v.string(),
  },
  returns: v.union(
    v.object({
      encryptedRefreshToken: v.string(),
      organizationId: v.optional(v.string()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("desktopSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.revokedAt || session.secretHash !== args.secretHash) {
      return null;
    }

    return {
      encryptedRefreshToken: session.encryptedRefreshToken,
      organizationId: session.organizationId,
    };
  },
});

export const rotateDesktopSessionRefreshToken = mutation({
  args: {
    sessionId: v.string(),
    secretHash: v.string(),
    refreshToken: v.string(),
    organizationId: v.optional(v.string()),
    lastAccessTokenExpiresAt: v.optional(v.number()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const session = await ctx.db
      .query("desktopSessions")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .first();

    if (!session || session.revokedAt || session.secretHash !== args.secretHash) {
      throw new Error("Desktop session is invalid.");
    }

    const encryptedRefreshToken = await encrypt(args.refreshToken);
    await ctx.db.patch(session._id, {
      encryptedRefreshToken,
      organizationId: args.organizationId,
      lastAccessTokenExpiresAt: args.lastAccessTokenExpiresAt,
      lastUsedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});
