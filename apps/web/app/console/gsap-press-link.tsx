"use client";

import Link from "next/link";
import type { ComponentProps } from "react";
import { useRef } from "react";
import { type GsapPressOptions, useGsapPress } from "./use-gsap-press";

type LinkProps = ComponentProps<typeof Link>;

/** Next.js `<Link>` with GSAP press feedback (see `useGsapPress`). */
export function GsapPressLink({
	scale,
	pressDuration,
	releaseDuration,
	...props
}: LinkProps & GsapPressOptions) {
	const ref = useRef<HTMLAnchorElement>(null);
	useGsapPress(ref, { scale, pressDuration, releaseDuration });
	return <Link ref={ref} {...props} />;
}
