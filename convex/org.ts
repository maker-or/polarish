import { ConvexError, v } from "convex/values";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
} from "./_generated/server";

/**
 * Add a member to an organisation. Only callable internally (e.g. from
 * onboarding actions via Convex internal mutations) — not exposed publicly so
 * callers cannot arbitrarily add themselves or others to orgs.
 */
export const addMember = internalMutation({
  args: {
    orgId: v.id("organisation"),
    userId: v.string(),
    role: v.union(v.literal("admin"), v.literal("member")),
  },
  returns: v.id("organizationMembers"),
  handler: async (ctx, args) => {
    const member = await ctx.db.insert("organizationMembers", {
      orgId: args.orgId,
      userId: args.userId,
      role: args.role,
      updatedAt: Date.now(),
    });
    return member;
  },
});

/**
 * Look up the caller's own membership. Only returns the membership for the
 * authenticated user — callers cannot query membership for arbitrary user IDs.
 */
export const getMyMembership = query({
  args: {},
  returns: v.union(
    v.object({
      _id: v.id("organizationMembers"),
      _creationTime: v.number(),
      orgId: v.id("organisation"),
      userId: v.string(),
      role: v.union(v.literal("admin"), v.literal("member")),
      updatedAt: v.number(),
    }),
    v.null(),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const userId = identity.subject;

    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();
    return membership ?? null;
  },
});

/**
 * Check whether a userId has a membership — used by the server-side auth
 * callback (route.ts) to decide whether to send the user to /onboarding.
 * Returns only a boolean so no sensitive org data is leaked.
 */
export const hasMembership = query({
  args: {
    userId: v.string(),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();
    return membership !== null;
  },
});

/**
 * Step 1 of onboarding: create the Convex org record and immediately add the
 * caller (from ctx.auth) as admin. Returns the new Convex org ID so the
 * caller can create the matching WorkOS organisation using that ID as
 * externalId, then patch it back.
 */
export const createOrgAndAddAdmin = mutation({
  args: {
    name: v.string(),
  },
  returns: v.object({
    orgId: v.id("organisation"),
    memberId: v.id("organizationMembers"),
  }),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const userId = identity.subject;

    // Guard: a user should only ever have one org in the MVP
    const existing = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      throw new ConvexError({
        code: "ALREADY_EXISTS",
        message: "User already belongs to an organisation",
      });
    }

    const orgId = await ctx.db.insert("organisation", {
      name: args.name,
      updatedAt: Date.now(),
    });

    const memberId = await ctx.db.insert("organizationMembers", {
      orgId,
      userId,
      role: "admin",
      updatedAt: Date.now(),
    });

    return { orgId, memberId };
  },
});

/**
 * Step 2 of onboarding: write the WorkOS organisation ID back onto the Convex
 * org record after the WorkOS org has been created server-side.
 * Only the admin of the org may call this.
 */
export const patchWorkosOrgId = mutation({
  args: {
    orgId: v.id("organisation"),
    workosOrgId: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("Unauthenticated");

    const userId = identity.subject;

    // Verify the caller is an admin member of the target org
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_orgId_userId", (q) =>
        q.eq("orgId", args.orgId).eq("userId", userId),
      )
      .first();

    if (!membership) {
      throw new ConvexError({
        code: "UNAUTHORIZED",
        message: "You are not a member of this organisation",
      });
    }

    if (membership.role !== "admin") {
      throw new ConvexError({
        code: "FORBIDDEN",
        message: "Only admins can update the WorkOS org ID",
      });
    }

    const org = await ctx.db.get(args.orgId);

    if (!org) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Organisation not found",
      });
    }

    await ctx.db.patch(args.orgId, {
      workosOrgId: args.workosOrgId,
      updatedAt: Date.now(),
    });

    return null;
  },
});

export const getOrganisationByUserId = internalQuery({
  args: {
    userId: v.string(),
  },
  returns: v.union(
    v.object({
      organisation: v.object({
        _id: v.id("organisation"),
        _creationTime: v.number(),
        name: v.string(),
        dodocustomerId: v.optional(v.string()),
        workosOrgId: v.optional(v.string()),
        updatedAt: v.number(),
      }),
      membership: v.object({
        _id: v.id("organizationMembers"),
        _creationTime: v.number(),
        orgId: v.id("organisation"),
        userId: v.string(),
        role: v.union(v.literal("admin"), v.literal("member")),
        updatedAt: v.number(),
      }),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    const membership = await ctx.db
      .query("organizationMembers")
      .withIndex("by_userId", (q) => q.eq("userId", args.userId))
      .first();

    if (!membership) return null;

    const organisation = await ctx.db.get(membership.orgId);
    if (!organisation) return null;

    return {
      organisation,
      membership,
    };
  },
});
