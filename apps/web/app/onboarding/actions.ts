"use server";

import { getWorkOS } from "@workos-inc/authkit-nextjs";
import { fetchMutation } from "convex/nextjs";
import { api } from "../../../../convex/_generated/api";
import type { Id } from "../../../../convex/_generated/dataModel";

export type CreateOrgResult =
	| { success: true; orgId: string }
	| { success: false; error: string; fatal?: boolean };

// ---------------------------------------------------------------------------
// Retry helper — exponential backoff, no jitter needed at this scale
// ---------------------------------------------------------------------------

async function withRetry<T>(
	fn: () => Promise<T>,
	maxAttempts = 3,
	baseDelayMs = 300,
): Promise<T> {
	let lastErr: unknown;
	for (let attempt = 1; attempt <= maxAttempts; attempt++) {
		try {
			return await fn();
		} catch (err) {
			lastErr = err;
			if (attempt < maxAttempts) {
				await new Promise((r) =>
					setTimeout(r, baseDelayMs * 2 ** (attempt - 1)),
				);
			}
		}
	}
	throw lastErr;
}

// ---------------------------------------------------------------------------
// Server action
// ---------------------------------------------------------------------------

export async function createOrganisationAction(
	userId: string,
	orgName: string,
): Promise<CreateOrgResult> {
	const trimmed = orgName.trim();

	if (!trimmed || trimmed.length < 2) {
		return {
			success: false,
			error: "Organisation name must be at least 2 characters.",
		};
	}

	if (trimmed.length > 80) {
		return {
			success: false,
			error: "Organisation name must be 80 characters or fewer.",
		};
	}

	// ── Step 1: Create the Convex org + add user as admin ──────────────────────
	// userId comes from the authenticated session in the calling page — we do
	// NOT pass it to Convex; the mutation reads it from ctx.auth instead.
	let orgId: Id<"organisation">;
	let memberId: Id<"organizationMembers">;

	try {
		const result = await fetchMutation(api.org.createOrgAndAddAdmin, {
			name: trimmed,
		});
		orgId = result.orgId;
		memberId = result.memberId;
	} catch (err) {
		console.error("[onboarding] Convex createOrgAndAddAdmin failed:", err);
		return {
			success: false,
			error: "Failed to create your workspace. Please try again.",
		};
	}

	// ── Step 2: Create the matching WorkOS organisation ────────────────────────
	let workosOrgId: string;

	try {
		const workos = getWorkOS();
		const workosOrg = await workos.organizations.createOrganization({
			name: trimmed,
			externalId: orgId,
		});
		workosOrgId = workosOrg.id;
	} catch (err) {
		console.error("[onboarding] WorkOS createOrganization failed:", err);
		return {
			success: false,
			error:
				"Failed to register your organisation with the auth provider. Please try again.",
		};
	}

	// ── Step 3: Add the user to the WorkOS org (with retry + fatal error) ──────
	try {
		const workos = getWorkOS();
		await withRetry(() =>
			workos.userManagement.createOrganizationMembership({
				userId,
				organizationId: workosOrgId,
				roleSlug: "admin",
			}),
		);
	} catch (err) {
		console.error(
			"[onboarding] createOrganizationMembership failed after retries:",
			err,
		);
		// This is a fatal error — the user's org exists but WorkOS membership
		// could not be established even after retries. Show the contact screen.
		return {
			success: false,
			fatal: true,
			error:
				"We could not complete your account setup. Please contact support at harshith10295032@gmail.com and we will resolve this for you.",
		};
	}

	// ── Step 4: Write the WorkOS org ID back onto the Convex record ────────────
	try {
		await fetchMutation(api.org.patchWorkosOrgId, {
			orgId,
			workosOrgId,
		});
	} catch (err) {
		// Non-fatal: the org + member records exist and are usable. Log and move on.
		console.error("[onboarding] patchWorkosOrgId failed (non-fatal):", err);
	}

	void memberId; // used implicitly via createOrgAndAddAdmin — silence linter

	return { success: true, orgId };
}
