import type { ReactNode } from "react";

/**
 * Console sub-application layout.
 * Intentionally standalone — no sidebar, no AuthenticatedLayout chrome.
 * All /console/* routes share this isolated shell.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-[#0a0a0a] text-[#e8e8e8] font-mono">
			{children}
		</div>
	);
}
