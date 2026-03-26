import { redirect } from "next/navigation";

/** Old URL — client secrets live on the app overview. */
export default async function CredentialsRedirectPage({
	params,
}: {
	params: Promise<{ appId: string }>;
}) {
	const { appId } = await params;
	redirect(`/console/apps/${appId}#client-secrets`);
}
