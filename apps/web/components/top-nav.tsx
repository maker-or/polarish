"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

const tabs = [
	{ label: "Home", href: "/" },
	{ label: "API KEY", href: "/api-keys" },
	{ label: "Console", href: "/console" },
	{ label: "settings", href: "/settings" },
] as const;

function getActiveBorderClass(index: number, total: number): string {
	if (index === 0) return "border-r-2 border-r-[#7A7A7A]";
	if (index === total - 1) return "border-l-2 border-l-[#7A7A7A]";
	return "border-l-2 border-r-2 border-l-[#7A7A7A] border-r-[#7A7A7A]";
}

export function TopNav() {
	const pathname = usePathname();
	const total = tabs.length;

	return (
		<nav
			className="flex w-full"
			style={{
				backgroundColor: "#212121",
				borderBottom: "2px solid #7A7A7A",
			}}
		>
			{tabs.map((tab, index) => {
				const isActive = pathname === tab.href;

				return (
					<Link
						key={tab.href}
						href={tab.href}
						className={cn(
							"flex items-center px-10 py-5",
							"text-sm font-normal tracking-tight",
							"transition-colors duration-150 no-underline",
							isActive
								? cn("text-white", getActiveBorderClass(index, total))
								: "text-[#7A7A7A] hover:text-[#aaaaaa]",
						)}
						style={{
							backgroundColor: isActive ? "#0E0D02" : "#212121",
							fontFamily: isActive
								? "system-ui, sans-serif"
								: "var(--font-geist-mono), 'Geist Mono', monospace",
							letterSpacing: isActive ? undefined : "-0.03em",
						}}
					>
						{tab.label}
					</Link>
				);
			})}
		</nav>
	);
}
