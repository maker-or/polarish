import type { ReactNode } from "react";

/**
 * Console sub-application layout.
 * Intentionally standalone — no sidebar, no AuthenticatedLayout chrome.
 * Uses Geist sans + theme tokens (not global html monospace) for a softer product UI.
 */
export default function ConsoleLayout({ children }: { children: ReactNode }) {
	return (
		<div className="min-h-screen bg-background text-foreground antialiased [font-family:var(--font-geist-sans),ui-sans-serif,system-ui,sans-serif]">
			{children}
		</div>
	);
}
