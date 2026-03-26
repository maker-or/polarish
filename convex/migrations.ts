/**
 * One-off data migrations. Run with:
 * `npx convex run migrations:stripLegacyConsoleAppDescription`
 * after removing `description` from the `consoleApp` schema.
 */
import { v } from "convex/values";
import { internalMutation } from "./_generated/server";

export const stripLegacyConsoleAppDescription = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const apps = await ctx.db.query("consoleApp").collect();
    for (const a of apps) {
      const legacy = a as typeof a & { description?: string };
      if (legacy.description === undefined) continue;
      await ctx.db.replace(a._id, {
        workosAppId: a.workosAppId,
        workosClientId: a.workosClientId,
        name: a.name,
        domains: a.domains ?? [],
        redirectUri: a.redirectUri,
        userId: a.userId,
        updatedAt: Date.now(),
        orgId: a.orgId,
      });
    }
    return null;
  },
});
