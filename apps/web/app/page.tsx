"use client";

import { AuthenticatedLayout } from "@/components/authenticated-layout";
import LandingPage from "@/components/landing";
import { Button } from "@/components/ui/button";
import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, Unauthenticated } from "convex/react";
import { ArrowRight } from "lucide-react";
import Link from "next/link";

export default function Home() {
	return (
		<>
			<Unauthenticated>
				<LandingPage />
			</Unauthenticated>
			<Authenticated>
				<AuthenticatedLayout>
					<DashboardHome />
				</AuthenticatedLayout>
			</Authenticated>
		</>
	);
}

function DashboardHome() {
	const { user, signOut } = useAuth();

	const quickLinks = [
		{
			label: "API KEY",
			href: "/api-keys",
			description: "Generate and manage secret keys for your integrations.",
			accentColor: "#7A7A7A",
		},
		{
			label: "Console",
			href: "/console",
			description: "Inspect traffic, test endpoints, and monitor usage.",
			accentColor: "#7A7A7A",
		},
		{
			label: "settings",
			href: "/settings",
			description: "Configure your account and preferences.",
			accentColor: "#7A7A7A",
		},
	];

	return (
		<main className="w-full px-10 py-10">
			{/* Header row */}
			<div className="flex items-start justify-between mb-16">
				<div>
					<p
						className="text-xs tracking-[0.25em] uppercase mb-3"
						style={{
							color: "#7A7A7A",
							fontFamily: "var(--font-geist-mono), monospace",
						}}
					>
						dashboard
					</p>
					<h1
						className="text-5xl font-normal leading-tight"
						style={{ color: "#FFFFFF" }}
					>
						{user?.firstName ? `Hello, ${user.firstName}.` : "Welcome back."}
					</h1>
					<p
						className="mt-3 text-sm"
						style={{
							color: "#7A7A7A",
							fontFamily: "var(--font-geist-mono), monospace",
						}}
					>
						{user?.email}
					</p>
				</div>

				<Button
					variant="outline"
					size="sm"
					onClick={() => signOut()}
					className="cursor-pointer mt-1"
					style={{
						backgroundColor: "transparent",
						borderColor: "#7A7A7A",
						color: "#7A7A7A",
						fontFamily: "var(--font-geist-mono), monospace",
						fontSize: "12px",
						letterSpacing: "0.05em",
					}}
				>
					sign out
				</Button>
			</div>

			{/* Divider */}
			<div
				className="mb-14"
				style={{ height: "1px", backgroundColor: "#7A7A7A", opacity: 0.3 }}
			/>

			{/* Quick navigation cards */}
			<div>
				<p
					className="text-xs tracking-[0.25em] uppercase mb-8"
					style={{
						color: "#7A7A7A",
						fontFamily: "var(--font-geist-mono), monospace",
					}}
				>
					navigate
				</p>

				<div className="grid grid-cols-1 md:grid-cols-3 gap-px">
					{quickLinks.map((link) => (
						<Link
							key={link.href}
							href={link.href}
							className="group block p-8 transition-colors"
							style={{
								backgroundColor: "#121108",
								border: "1px solid #2a2a2a",
								textDecoration: "none",
							}}
							onMouseEnter={(e) => {
								(e.currentTarget as HTMLElement).style.backgroundColor =
									"#1a1a10";
							}}
							onMouseLeave={(e) => {
								(e.currentTarget as HTMLElement).style.backgroundColor =
									"#121108";
							}}
						>
							<div className="flex items-start justify-between">
								<h2
									className="text-2xl font-normal"
									style={{
										color: "#FFFFFF",
										fontFamily:
											"var(--font-geist-mono), 'Geist Mono', monospace",
										letterSpacing: "-0.03em",
									}}
								>
									{link.label}
								</h2>
								<ArrowRight
									className="size-4 mt-1 opacity-0 group-hover:opacity-100 transition-opacity"
									style={{ color: "#7A7A7A" }}
								/>
							</div>
							<p
								className="mt-4 text-xs leading-relaxed"
								style={{
									color: "#7A7A7A",
									fontFamily: "var(--font-geist-mono), monospace",
								}}
							>
								{link.description}
							</p>
						</Link>
					))}
				</div>
			</div>
		</main>
	);
}
