/** Shared Tailwind fragments — no corner radius (sharp edges). */
export const r = {
	main: "rounded-none",
	small: "rounded-none",
} as const;

/** Strong ease-out — snappy UI (design-eng). */
export const easeOutStrong =
	"[transition-timing-function:cubic-bezier(0.23,1,0.32,1)]";

/** Tactile press on buttons / icon buttons (~160ms). */
export const press = `transition-transform duration-[160ms] ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`;

/** Large cards / full-width links — subtler press. */
export const pressSoft = `transition-transform duration-[160ms] ${easeOutStrong} active:scale-[0.99] motion-reduce:active:scale-100`;

/** Icon hit targets — scale from center. */
export const pressIcon = `${press} origin-center inline-flex items-center justify-center`;

export const cx = {
	page: "flex min-h-screen flex-col bg-background text-foreground",
	header:
		"shrink-0 border-b border-border/50 bg-card/40 px-6 py-3.5 backdrop-blur-md supports-[backdrop-filter]:bg-card/30",
	title: "text-2xl font-semibold tracking-tight text-foreground",
	subtitle: "text-sm text-muted-foreground leading-relaxed",
	sectionLabel: "text-sm font-medium text-foreground",
	sectionHint: "mt-1 text-xs leading-relaxed text-muted-foreground",
	label: "mb-2 block text-sm font-medium text-foreground",
	input: `w-full border border-input bg-muted/40 px-3.5 py-2.5 text-sm text-foreground shadow-sm placeholder:text-muted-foreground transition-[color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 ${r.main}`,
	inputRow: `flex flex-1 items-center overflow-hidden border border-input bg-muted/30 shadow-sm transition-[box-shadow] focus-within:ring-2 focus-within:ring-ring/40 ${r.main}`,
	primaryBtn: `inline-flex h-10 min-w-[7.5rem] items-center justify-center gap-2 border border-transparent bg-primary px-5 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] duration-[160ms] hover:bg-primary/90 disabled:pointer-events-none disabled:opacity-50 ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100 ${r.main}`,
	secondaryBtn: `inline-flex h-10 min-w-[7.5rem] items-center justify-center border border-border bg-muted/40 px-5 text-sm font-medium text-foreground shadow-sm transition-[transform,background-color,color] duration-[160ms] hover:bg-muted ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100 ${r.main}`,
	ghostBtn: `inline-flex items-center gap-1 px-2 py-1.5 text-sm font-medium text-muted-foreground transition-[transform,color,background-color] duration-[160ms] hover:bg-muted hover:text-foreground ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100 ${r.small}`,
	ghostBtnPrimary: `inline-flex items-center gap-1.5 rounded-none px-2 py-1.5 text-sm font-medium text-primary transition-[transform,color,background-color] duration-[160ms] hover:bg-primary/10 ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	dangerBtn: `inline-flex items-center gap-1.5 border border-destructive/25 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive transition-[transform,background-color,color] duration-[160ms] hover:bg-destructive/15 ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100 ${r.main}`,
	/** Destructive-adjacent text action (e.g. Revoke) */
	revokeBtn: `inline-flex shrink-0 items-center gap-1.5 rounded-none border border-transparent px-2 py-1.5 text-xs font-medium text-muted-foreground transition-[transform,color,background-color,border-color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-destructive/25 hover:bg-destructive/5 hover:text-destructive active:scale-[0.97] motion-reduce:active:scale-100`,
	card: `border border-border/70 bg-card/60 p-6 shadow-sm ${r.main}`,
	listRow: `border border-border/60 bg-card/40 px-4 py-3.5 transition-[background-color] duration-150 ease-out hover:bg-muted/20 ${r.main}`,
	/** App list row — full-width link (transform/press: GSAP `GsapPressLink` + CSS fallback) */
	listRowLink: `group flex items-center justify-between gap-3 border border-border/60 bg-card/50 px-5 py-4 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-border hover:bg-card hover:shadow-md active:scale-[0.99] motion-reduce:active:scale-100 ${r.main}`,
	/** Console home feature cards */
	consoleCardInner: `group relative h-full rounded-none border border-border/60 bg-card/70 p-6 shadow-sm transition-[border-color,background-color,box-shadow] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:border-border hover:bg-card hover:shadow-md`,
	alertError: `flex items-start gap-2 border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive ${r.main}`,
	linkBack: `flex items-center gap-1.5 text-sm text-muted-foreground transition-colors duration-150 ease-out hover:text-foreground active:scale-[0.99] motion-reduce:active:scale-100`,
	iconBox: `flex size-10 items-center justify-center border border-border/60 bg-muted/40 text-foreground shadow-sm ${r.main}`,
	codeBlock: `border border-border/60 bg-muted/50 px-4 py-3 font-mono text-[11px] leading-relaxed text-muted-foreground overflow-x-auto whitespace-pre-wrap shadow-inner ${r.main}`,
	/** Return key glyph — square key cap, complements primary fill */
	returnKeyCap:
		"inline-flex items-center justify-center rounded-none bg-primary-foreground/15 p-1.5 text-primary-foreground ring-1 ring-primary-foreground/20",
	/** Header tab / pill links (Settings, etc.) */
	navPill: `inline-flex items-center rounded-none px-2 py-1 text-xs font-medium text-muted-foreground transition-[color,background-color] duration-150 ease-out hover:bg-muted hover:text-foreground ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Apps list header — New app */
	headerCta: `inline-flex items-center gap-2 rounded-none border border-border/70 bg-card/60 px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-[transform,background-color,color] duration-[160ms] hover:bg-muted/50 ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Primary CTA in empty states (compact) */
	primaryBtnCompact: `inline-flex items-center gap-2 rounded-none bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground shadow-sm transition-[transform,background-color] duration-[160ms] hover:bg-primary/90 ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** “Add domain”, “Add redirect URI”, dismiss text actions */
	textAction: `inline-flex items-center text-xs text-muted-foreground transition-[transform,color] duration-150 ease-out hover:text-foreground ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Inline Remove next to fields */
	textActionDanger: `inline-flex shrink-0 items-center text-xs text-muted-foreground transition-[transform,color] duration-150 ease-out hover:text-destructive ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Settings column footer links (icon + label) */
	linkInline: `inline-flex items-center gap-2 text-xs font-medium text-muted-foreground transition-[transform,color] duration-150 ease-out hover:text-foreground ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Muted inline <Link> inside body copy */
	linkPrimary: `font-medium text-primary underline-offset-2 transition-[transform,color] duration-150 ease-out hover:underline ${easeOutStrong} active:scale-[0.99] motion-reduce:active:scale-100`,
	/** Copy icon next to monospace value */
	iconCopyBtn: `flex size-10 shrink-0 items-center justify-center rounded-none border border-border/60 bg-card shadow-sm transition-[transform,background-color,color] duration-[160ms] hover:bg-muted ${easeOutStrong} active:scale-[0.97] motion-reduce:active:scale-100`,
	/** Code block copy (reveals on group-hover) */
	codeCopyBtn: `absolute top-2 right-2 flex size-8 items-center justify-center rounded-none border border-border/60 bg-card opacity-0 shadow-sm transition-[opacity,transform,background-color,color,border-color] duration-150 [transition-timing-function:cubic-bezier(0.23,1,0.32,1)] hover:bg-muted active:scale-[0.97] motion-reduce:active:scale-100 group-hover:opacity-100`,
} as const;
