"use client";

import type { ReactNode } from "react";
import { TopNav } from "@/components/top-nav";

export function AuthenticatedLayout({ children }: { children: ReactNode }) {
	return (
		<div
			className="h-svh w-svw grid grid-rows-[auto_1fr] overflow-hidden"
			style={{ backgroundColor: "#0E0D02" }}
		>
			<TopNav />
			<div className="overflow-y-auto">{children}</div>
		</div>
	);
}
