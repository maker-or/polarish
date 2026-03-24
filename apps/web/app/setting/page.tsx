"use client";

import { Authenticated } from "convex/react";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function SettingsPage() {
	return (
		<Authenticated>
			<AuthenticatedLayout>
				<main className="w-full px-10 py-10">
					<Card className="max-w-4xl">
						<CardHeader>
							<CardTitle>Settings</CardTitle>
							<CardDescription>
								Manage your account settings and preferences.
							</CardDescription>
						</CardHeader>
						<CardContent>
							<p className="text-muted-foreground">
								Settings page coming soon...
							</p>
						</CardContent>
					</Card>
				</main>
			</AuthenticatedLayout>
		</Authenticated>
	);
}
