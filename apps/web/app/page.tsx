"use client";

import { useAuth } from "@workos-inc/authkit-nextjs/components";
import { Authenticated, Unauthenticated } from "convex/react";
import { ArrowRight, Code, Key, Shield, Zap } from "lucide-react";
import Link from "next/link";
import { AuthenticatedLayout } from "@/components/authenticated-layout";
import { Button } from "@/components/ui/button";

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

function LandingPage() {
	return (
		<div className="min-h-screen grid grid-cols-1 lg:grid-cols-2">
			<div className="hidden lg:flex flex-col justify-center items-center bg-sidebar p-12">
				<div className="max-w-md">
					<svg
						viewBox="0 0 400 300"
						fill="none"
						xmlns="http://www.w3.org/2000/svg"
						className="w-full h-auto"
					>
						<rect
							x="50"
							y="50"
							width="300"
							height="200"
							rx="12"
							className="fill-card stroke-border"
							strokeWidth="2"
						/>
						<rect
							x="70"
							y="80"
							width="260"
							height="40"
							rx="6"
							className="fill-muted stroke-border"
							strokeWidth="1"
						/>
						<rect
							x="90"
							y="95"
							width="180"
							height="10"
							rx="2"
							className="fill-foreground/20"
						/>
						<rect
							x="280"
							y="95"
							width="30"
							height="10"
							rx="2"
							className="fill-primary"
						/>
						<rect
							x="70"
							y="140"
							width="120"
							height="90"
							rx="6"
							className="fill-muted stroke-border"
							strokeWidth="1"
						/>
						<rect
							x="200"
							y="140"
							width="130"
							height="90"
							rx="6"
							className="fill-muted stroke-border"
							strokeWidth="1"
						/>
						<rect
							x="85"
							y="155"
							width="80"
							height="8"
							rx="2"
							className="fill-foreground/30"
						/>
						<rect
							x="85"
							y="170"
							width="60"
							height="6"
							rx="1"
							className="fill-foreground/20"
						/>
						<rect
							x="85"
							y="185"
							width="70"
							height="6"
							rx="1"
							className="fill-foreground/20"
						/>
						<rect
							x="85"
							y="200"
							width="90"
							height="20"
							rx="4"
							className="fill-primary"
						/>
						<rect
							x="215"
							y="155"
							width="100"
							height="8"
							rx="2"
							className="fill-foreground/30"
						/>
						<rect
							x="215"
							y="170"
							width="80"
							height="6"
							rx="1"
							className="fill-foreground/20"
						/>
						<rect
							x="215"
							y="185"
							width="90"
							height="6"
							rx="1"
							className="fill-foreground/20"
						/>
						<circle cx="265" cy="210" r="15" className="fill-primary" />
						<path
							d="M258 210 L263 215 L273 205"
							className="stroke-primary-foreground"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						/>
						<rect
							x="120"
							y="20"
							width="40"
							height="40"
							rx="8"
							className="fill-primary/20"
						/>
						<rect
							x="240"
							y="20"
							width="40"
							height="40"
							rx="8"
							className="fill-primary/20"
						/>
					</svg>
					<div className="mt-12 space-y-6">
						<div className="flex items-start gap-4">
							<div className="flex h-10 w-10 items-center justify-center rounded-none bg-primary/10">
								<Key className="h-5 w-5 text-primary" />
							</div>
							<div>
								<h3 className="font-medium">API Key Management</h3>
								<p className="text-sm text-muted-foreground">
									Generate and manage secure API keys for your applications
								</p>
							</div>
						</div>
						<div className="flex items-start gap-4">
							<div className="flex h-10 w-10 items-center justify-center rounded-none bg-primary/10">
								<Shield className="h-5 w-5 text-primary" />
							</div>
							<div>
								<h3 className="font-medium">Secure Authentication</h3>
								<p className="text-sm text-muted-foreground">
									Enterprise-grade security with WorkOS authentication
								</p>
							</div>
						</div>
						<div className="flex items-start gap-4">
							<div className="flex h-10 w-10 items-center justify-center rounded-none bg-primary/10">
								<Zap className="h-5 w-5 text-primary" />
							</div>
							<div>
								<h3 className="font-medium">Lightning Fast</h3>
								<p className="text-sm text-muted-foreground">
									Powered by Convex for real-time data synchronization
								</p>
							</div>
						</div>
					</div>
				</div>
			</div>
			<div className="flex flex-col justify-center items-center p-12">
				<div className="w-full max-w-sm space-y-8">
					<div className="text-center space-y-2">
						<div className="flex justify-center mb-6">
							<div className="flex h-14 w-14 items-center justify-center rounded-none bg-primary">
								<Code className="h-7 w-7 text-primary-foreground" />
							</div>
						</div>
						<h1 className="text-3xl font-bold">API Key Manager</h1>
						<p className="text-muted-foreground">
							Securely manage your API keys and integrate with your applications
						</p>
					</div>
					<div className="space-y-4">
						<a href="/sign-in" className="block">
							<Button className="w-full cursor-pointer" size="lg">
								Sign in
							</Button>
						</a>
						<a href="/sign-up" className="block">
							<Button
								variant="outline"
								className="w-full cursor-pointer"
								size="lg"
							>
								Create an account
							</Button>
						</a>
					</div>
					<p className="text-center text-xs text-muted-foreground">
						By continuing, you agree to our Terms of Service and Privacy Policy
					</p>
				</div>
			</div>
		</div>
	);
}
