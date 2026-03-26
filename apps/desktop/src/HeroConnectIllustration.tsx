import gsap from "gsap";
import { useEffect, useRef } from "react";

type Props = {
	className?: string;
};

/**
 * Inlines the hero SVG and drives motion with GSAP: pointer parallax on the
 * hand/scene vs the cursor swarm, plus a subtle continuous jitter (“dither”).
 */
export function HeroConnectIllustration({ className = "" }: Props) {
	const wrapRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap) return;

		let cancelled = false;
		let dispose: (() => void) | undefined;

		void (async () => {
			try {
				const res = await fetch("/hero-connect.svg");
				const text = await res.text();
				if (cancelled) return;

				wrap.innerHTML = text;
				const svg = wrap.querySelector("svg");
				if (!svg) return;

				svg.removeAttribute("width");
				svg.removeAttribute("height");
				svg.setAttribute("preserveAspectRatio", "xMaxYMid meet");
				svg.style.display = "block";
				svg.style.height = "100%";
				svg.style.width = "auto";
				svg.style.maxHeight = "100%";

				const scene = svg.querySelector("#hero-scene");
				const cursors = svg.querySelector("#hero-cursors");
				if (!scene || !cursors || cancelled) return;

				gsap.set([scene, cursors], { transformOrigin: "540px 236px" });

				const target = { x: 0, y: 0 };
				const quickSceneX = gsap.quickTo(scene, "x", {
					duration: 0.85,
					ease: "power3.out",
				});
				const quickSceneY = gsap.quickTo(scene, "y", {
					duration: 0.85,
					ease: "power3.out",
				});
				const quickTx = gsap.quickTo(target, "x", {
					duration: 0.48,
					ease: "power2.out",
				});
				const quickTy = gsap.quickTo(target, "y", {
					duration: 0.48,
					ease: "power2.out",
				});

				const onPointerMove = (e: PointerEvent) => {
					const rect = wrap.getBoundingClientRect();
					if (rect.width < 1 || rect.height < 1) return;
					const nx = (e.clientX - rect.left) / rect.width - 0.5;
					const ny = (e.clientY - rect.top) / rect.height - 0.5;
					quickSceneX(-nx * 10);
					quickSceneY(-ny * 6);
					quickTx(nx * 26);
					quickTy(ny * 16);
				};

				const jitter = () => {
					const t = performance.now() * 0.001;
					const jx = Math.sin(t * 2.1) * 1.4 + Math.cos(t * 3.3) * 0.45;
					const jy = Math.cos(t * 1.85) * 1.1 + Math.sin(t * 2.7) * 0.4;
					const rot = Math.sin(t * 1.2) * 0.12;
					gsap.set(cursors, {
						x: target.x + jx,
						y: target.y + jy,
						rotation: rot,
					});
				};

				gsap.ticker.add(jitter);
				window.addEventListener("pointermove", onPointerMove, {
					passive: true,
				});

				dispose = () => {
					gsap.ticker.remove(jitter);
					window.removeEventListener("pointermove", onPointerMove);
					gsap.killTweensOf([scene, cursors, target]);
				};
			} catch {
				/* ignore */
			}
		})();

		return () => {
			cancelled = true;
			dispose?.();
			wrap.innerHTML = "";
		};
	}, []);

	return (
		<div
			ref={wrapRef}
			className={`pointer-events-none ${className}`}
			aria-hidden
		/>
	);
}
