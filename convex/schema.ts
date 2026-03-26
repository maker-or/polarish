import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const providerValidator = v.union(
  v.literal("openai-codex"),
  v.literal("anthropic"),
  v.literal("github-copilot"),
  v.literal("google-gemini-cli"),
);

export default defineSchema({
  organisation: defineTable({
    name: v.string(),
    dodocustomerId: v.optional(v.string()),
    workosOrgId: v.optional(v.string()),
    updatedAt: v.number(),
  })
    .index("by_workosOrgId", ["workosOrgId"])
    .index("by_dodocustomerId", ["dodocustomerId"]),

  organizationMembers: defineTable({
    orgId: v.id("organisation"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_orgId_userId", ["orgId", "userId"]),

  secretkey: defineTable({
    orgId: v.id("organisation"),
    userId: v.string(),
    name: v.string(),
    prefix: v.string(),
    hashedKey: v.string(),
    publicId: v.string(),
    revokedAt: v.optional(v.number()),
  })
    .index("by_publicId", ["publicId"])
    .index("by_userId", ["userId"]),

  consoleApp: defineTable({
    workosAppId: v.string(),
    workosClientId: v.string(),
    name: v.string(),
    /** Allowed frontend origins (browser) for this app — Convex-only; not synced to WorkOS. */
    domains: v.optional(v.array(v.string())),
    redirectUri: v.array(
      v.object({
        uri: v.string(),
        default: v.boolean(),
      }),
    ),
    userId: v.string(),
    updatedAt: v.number(),
    orgId: v.id("organisation"),
  })
    .index("by_userId", ["userId"])
    .index("by_orgId", ["orgId"])
    .index("by_workosAppId", ["workosAppId"])
    .index("by_workosClientId", ["workosClientId"]),

  aicrendital: defineTable({
    userId: v.string(),
    orgId: v.id("organisation"),
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
    updatedAt: v.number(),
  })
    .index("by_userId", ["userId"])
    .index("by_userId_provider", ["userId", "provider"])
    .index("by_orgId_provider", ["orgId", "provider"]),

  desktopSessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    secretHash: v.string(),
    encryptedRefreshToken: v.string(),
    organizationId: v.optional(v.string()),
    lastAccessTokenExpiresAt: v.optional(v.number()),
    revokedAt: v.optional(v.number()),
    deviceName: v.optional(v.string()),
    platform: v.optional(v.string()),
    createdAt: v.number(),
    lastUsedAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"]),

  // still think this is temporary because we can use the normal ts file for the limits
  planconfig: defineTable({
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("plus")),
    price_usd_cents: v.number(),
    monthly_limit: v.number(),
    four_hrs_limit: v.number(),
    dodo_productId: v.string(),
    dodo_seatAddonId: v.string(),
    updatedAt: v.optional(v.number()),
  }),

  subscription: defineTable({
    orgId: v.id("organisation"),
    plan: v.union(v.literal("starter"), v.literal("pro"), v.literal("plus")),
    status: v.union(
      v.literal("active"),
      v.literal("cancelled"),
      v.literal("on_hold"),
      v.literal("expired"),
      v.literal("failed"),
      v.literal("pending"),
    ),
    cycle_startedAt: v.number(),
    cycle_endedAt: v.number(),
    seatCount: v.number(),
    dodo_subscriptionId: v.string(),
    dodo_customerId: v.string(),
    updatedAt: v.optional(v.number()),
  })
    .index("by_orgId", ["orgId"])
    .index("by_dodo_subscriptionId", ["dodo_subscriptionId"])
    .index("by_dodo_customerId", ["dodo_customerId"])
    .index("by_seatCount", ["seatCount"])
    .index("by_status", ["status"]),

  // this is incomplete i haven't thought about the flow
  invitation: defineTable({
    orgId: v.id("organisation"),
    invitedBy: v.string(), // userId
    email: v.string(),
    role: v.string(),
  }),

  member_credits: defineTable({
    orgId: v.id("organisation"),
    subscriptionId: v.id("subscription"),
    userId: v.string(),
    monthly_credits: v.number(),
    used_credits: v.number(),
    reserved_credits: v.number(),
  }),
});
