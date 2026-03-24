"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated } from "convex/react";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@/components/ui/card";

export default function ProfilePage() {
	const { user } = useAuth();

	return (
		<Authenticated>
			<AuthenticatedLayout>
				<main className="w-full px-10 py-10">
					<Card className="max-w-4xl">
						<CardHeader>
							<div className="flex items-center gap-4">
								<Avatar className="size-16 rounded-none">
									<AvatarImage
										src={user?.profilePictureUrl ?? undefined}
										alt={user?.email}
									/>
									<AvatarFallback className="rounded-none text-lg">
										{user?.email?.slice(0, 2).toUpperCase() || "U"}
									</AvatarFallback>
								</Avatar>
								<div>
									<CardTitle>
										{user?.firstName && user?.lastName
											? `${user.firstName} ${user.lastName}`
											: user?.email || "User"}
									</CardTitle>
									<CardDescription>{user?.email}</CardDescription>
								</div>
							</div>
						</CardHeader>
						<CardContent>
							<div className="space-y-4">
								<div>
									<p className="text-sm font-medium">Email</p>
									<p className="text-muted-foreground">{user?.email}</p>
								</div>
								{user?.firstName && (
									<div>
										<p className="text-sm font-medium">First Name</p>
										<p className="text-muted-foreground">{user.firstName}</p>
									</div>
								)}
								{user?.lastName && (
									<div>
										<p className="text-sm font-medium">Last Name</p>
										<p className="text-muted-foreground">{user.lastName}</p>
									</div>
								)}
							</div>
						</CardContent>
					</Card>
				</main>
			</AuthenticatedLayout>
		</Authenticated>
	);
}
