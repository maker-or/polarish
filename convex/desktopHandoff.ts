import { v } from "convex/values";
import { mutation } from "./_generated/server";

const desktopAuthHandoffTtlMs = 60 * 1000;

/**
 * This type is the shape of the desktop auth handoff payload that the web app stores for the CLI.
 */
const desktopAuthHandoffRecordValidator = v.object({
	accessToken: v.string(),
	desktopSecret: v.string(),
	desktopSessionId: v.string(),
	tokenExpiresAt: v.number(),
	userJson: v.string(),
});

/**
 * This function stores a one-time desktop auth handoff code for the CLI.
 * This is the shape of the request that we are expecting: code, access token, desktop secret, desktop session id, token expiry, and user json.
 */
export const createDesktopAuthHandoff = mutation({
	args: {
		code: v.string(),
		accessToken: v.string(),
		desktopSecret: v.string(),
		desktopSessionId: v.string(),
		tokenExpiresAt: v.number(),
		userJson: v.string(),
	},
	returns: v.string(),
	handler: async (ctx, args) => {
		const now = Date.now();
		const existing = await ctx.db
			.query("desktopAuthHandoffs")
			.withIndex("by_code", (q) => q.eq("code", args.code))
			.unique();

		if (existing) {
			await ctx.db.delete(existing._id);
		}

		await ctx.db.insert("desktopAuthHandoffs", {
			...args,
			createdAt: now,
			expiresAt: now + desktopAuthHandoffTtlMs,
		});

		return args.code;
	},
});

/**
 * This function reads and deletes one desktop auth handoff so the CLI can exchange the code once.
 * This is the shape of the request that we are expecting: a single handoff code string.
 */
export const consumeDesktopAuthHandoff = mutation({
	args: {
		code: v.string(),
	},
	returns: v.union(desktopAuthHandoffRecordValidator, v.null()),
	handler: async (ctx, args) => {
		const record = await ctx.db
			.query("desktopAuthHandoffs")
			.withIndex("by_code", (q) => q.eq("code", args.code))
			.unique();

		if (!record) {
			return null;
		}

		await ctx.db.delete(record._id);

		if (record.expiresAt <= Date.now()) {
			return null;
		}

		return {
			accessToken: record.accessToken,
			desktopSecret: record.desktopSecret,
			desktopSessionId: record.desktopSessionId,
			tokenExpiresAt: record.tokenExpiresAt,
			userJson: record.userJson,
		};
	},
});
