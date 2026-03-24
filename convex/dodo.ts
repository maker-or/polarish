// convex/dodo.ts
import {
  DodoPayments,
  type DodoPaymentsClientConfig,
} from "@dodopayments/convex";
import { components, internal } from "./_generated/api";

export const dodo = new DodoPayments(components.dodopayments, {
  // This function maps your Convex user to a Dodo Payments customer
  // Customize it based on your authentication provider and database
  identify: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null; // User is not logged in
    }

    // Use ctx.runQuery() to lookup customer from your database
    const customer = await ctx.runQuery(internal.org.getOrganisationByUserId, {
      userId: identity.subject,
    });

    if (!customer) {
      return null; // Customer not found in database
    }

    return {
      dodoCustomerId: customer.organisation.dodocustomerId, // Replace customer.dodoCustomerId with your field storing Dodo Payments customer ID
    };
  },
  apiKey: process.env.DODO_PAYMENTS_API_KEY,
  environment: process.env.DODO_PAYMENTS_ENVIRONMENT as
    | "test_mode"
    | "live_mode",
} as DodoPaymentsClientConfig);

// Export the API methods for use in your app
export const { checkout, customerPortal } = dodo.api();
