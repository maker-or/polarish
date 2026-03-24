import type { Metadata } from "next";
import { Geist, Geist_Mono, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ConvexClientProvider } from "@/components/ConvexClientProvider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

const jetbrainsMono = JetBrains_Mono({subsets:['latin'],variable:'--font-mono'});

const geistSans = Geist({
	variable: "--font-geist-sans",
	subsets: ["latin"],
});

const geistMono = Geist_Mono({
	variable: "--font-geist-mono",
	subsets: ["latin"],
});

export const metadata: Metadata = {
	title: "API Key Management",
	description: "Manage your API keys",
	icons: {
		icon: "/convex.svg",
	},
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en" className={cn("dark", "font-mono", jetbrainsMono.variable)}>
			<body
				className={`${geistSans.variable} ${geistMono.variable} antialiased`}
			>
				<ConvexClientProvider>
					<TooltipProvider>{children}</TooltipProvider>
				</ConvexClientProvider>
			</body>
		</html>
	);
}
