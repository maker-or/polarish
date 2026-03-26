"use client";

import gsap from "gsap";
import { type RefObject, useLayoutEffect, useRef } from "react";

export type GsapPressOptions = {
	/** Scale while pointer is down (default 0.97). */
	scale?: number;
	/** Press-in duration (seconds). */
	pressDuration?: number;
	/** Release duration (seconds). */
	releaseDuration?: number;
};

const easeIn = "power2.out";
const easeOut = "power3.out";

/**
 * Pointer-driven scale using GSAP (snappy press-in, smooth release).
 * No-ops when `prefers-reduced-motion: reduce` so CSS fallbacks apply.
 */
export function useGsapPress<T extends HTMLElement>(
	ref: RefObject<T | null>,
	{
		scale = 0.97,
		pressDuration = 0.11,
		releaseDuration = 0.24,
	}: GsapPressOptions = {},
) {
	const optsRef = useRef({ scale, pressDuration, releaseDuration });
	optsRef.current = { scale, pressDuration, releaseDuration };

	useLayoutEffect(() => {
		const el = ref.current;
		if (!el) return;

		const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
		if (mq.matches) return;

		gsap.set(el, { transformOrigin: "50% 50%" });

		const onDown = () => {
			const { scale: s, pressDuration: pd } = optsRef.current;
			gsap.to(el, {
				scale: s,
				duration: pd,
				ease: easeIn,
				overwrite: "auto",
			});
		};

		const onUp = () => {
			const { releaseDuration: rd } = optsRef.current;
			gsap.to(el, {
				scale: 1,
				duration: rd,
				ease: easeOut,
				overwrite: "auto",
			});
		};

		el.addEventListener("pointerdown", onDown);
		el.addEventListener("pointerup", onUp);
		el.addEventListener("pointerleave", onUp);
		el.addEventListener("pointercancel", onUp);

		return () => {
			el.removeEventListener("pointerdown", onDown);
			el.removeEventListener("pointerup", onUp);
			el.removeEventListener("pointerleave", onUp);
			el.removeEventListener("pointercancel", onUp);
			gsap.killTweensOf(el);
			gsap.set(el, { clearProps: "transform" });
		};
	}, [ref]);
}
