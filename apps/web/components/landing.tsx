"use client";

import gsap from "gsap";
import React, { useEffect, useRef, useState } from "react";

/**
 * SplitWords component - Splits text into individual words wrapped in spans for animation
 * @param text - The text to split and animate
 * @param className - CSS class to apply to each word span
 */
const SplitWords = ({
	text,
	className,
}: { text: string; className: string }) => {
	const words = Array.from(text.matchAll(/\S+/g));

	return (
		<>
			{words.map((match) => (
				<span
					key={`${text}-${match.index ?? 0}`}
					className={`inline-block ${className}`}
					style={{ opacity: 0, filter: "blur(10px)" }}
				>
					{match[0]}&nbsp;
				</span>
			))}
		</>
	);
};

/**
 * CommandBox component - Displays command text with copy functionality
 * @param command - The command text to display
 */
const CommandBox = ({ command }: { command: string }) => {
	const [copied, setCopied] = useState(false);

	const handleCopy = () => {
		navigator.clipboard.writeText(command);
		setCopied(true);
		setTimeout(() => setCopied(false), 2000);
	};

	return (
		<button
			type="button"
			className="mt-3 flex items-center justify-between bg-[#1a1620] px-4 py-3 rounded border border-[#403149] cursor-pointer hover:border-[#7D6988] transition-colors"
			onClick={handleCopy}
		>
			<code className="text-[#d4b4e2] text-[15px] font-mono tracking-wide">
				{command}
			</code>
			<span className="text-[#7D6988] text-[12px] ml-4">
				{copied ? "✓ copied" : "copy"}
			</span>
		</button>
	);
};

/**
 * Step component - Displays a single step with optional command
 * @param number - Step number
 * @param title - Step title/description
 * @param command - Optional command to display
 * @param link - Optional link with text and href
 */
const Step = ({
	number,
	title,
	command,
	link,
}: {
	number: number;
	title: string;
	command?: string;
	link?: { text: string; href: string };
}) => {
	return (
		<div className="mb-8">
			<div className="flex gap-4">
				<div className="text-[#d4b4e2] text-[18px] font-normal min-w-fit">
					{number}.
				</div>
				<div className="flex-1">
					<p className="text-[#7D6988] text-[18px] leading-relaxed">
						{title}
						{link && (
							<>
								{" "}
								<a
									href={link.href}
									className="text-[#d4b4e2] hover:opacity-80 transition-opacity cursor-pointer underline"
								>
									{link.text}
								</a>
							</>
						)}
					</p>
					{command && <CommandBox command={command} />}
				</div>
			</div>
		</div>
	);
};

/**
 * About page content configuration
 * Contains the page title and paragraphs to display on the About page
 */
const ABOUT_CONTENT = {
	title: "New Oauth system for AI",
	paragraphs: [
		"We want to democratize the use of AI so users can bring their own subscription to any harness or tool they want to use.",
		"Today, most AI products lock users into their own models, platforms, and subscriptions.",
		"Every tool becomes another account, another payment, another ecosystem.",
		"We believe access to AI should be portable.",
		"Users should be able to connect the subscriptions they already have and use them across different tools without being forced into a new platform.",
		"We help Developers to build AI products without worrying about model access, infrastructure costs, or managing multiple AI providers.",
	],
};

/**
 * Usage page content configuration - Developer view
 * Contains onboarding steps and example response data for developers
 */
const USAGE_CONTENT_DEV = {
	title: "use Polaris",
	paragraphs: [
		"If you are a developer and want to leverage what we are building so that your users can bring their own subscription follow these instructions.",
	],
	steps: [
		{
			number: 1,
			title: "First register your application here to use the Polaris OAuth",
		},
		{
			number: 2,
			title: "Save the provided clientSecret and clientId in your .env file",
		},
		{
			number: 3,
			title: "Add this button to the login page",
			command: "continue with Polaris",
		},
		{
			number: 4,
			title:
				"When a user is successfully authenticated, they will be redirected to your provided redirect URI along with the following information",
		},
	],
	response: `{
  "access_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6InNzb19vaWRjX2tleV9wYWlyXzAxSlBYTjZLRjdOQUVBWlRGRFlFU0FFMEtYIn0.eyJpc3MiOiJodHRwczovL2F1dGguZXhhbXBsZS5jb20iLCJzdWIiOiJ1c2VyXzAxSlBYTjZLQTc2MjJLSjRWUDgzWDFOVEtYIiwic2lkIjoiYXBwX2NvbnNlbnRfMDFKUFhONktBUVc4M0FNWFhZNVdYM1JIVEoiLCJqdGkiOiIwMUpQWE42S0ZHWlFZVzNBTTJERVZYODRZUyIsImV4cCI6MTc0MjYwNDg1MywiaWF0IjoxNzQyNjA0NTUzfQ.dsMI3PBp5LWGeUosFUYYLsjC78swFMI4EUVXW1LN7yd80hxLhAvCX6gKN2s9h13a1tkAX77PDI2PooEJ8RQyB-Zcp_wzdomHffjqCeL-YgGojuCUmgjOm9w7kwg86e81tcMBIX3y872pe9jg1HrVs0t_tJNjoLEKtSwm-Flegttyg7M5SikrHKzul0Jv6ovaXjN4RygDPH6Nbg7Ewag5UwYd9aQK7IRG2oXZPC6WjJx-boyRvwgAqJ5pCedRc2ta5-sb3KyrgS6Xb0S3y1KA57RiDvJdQp8z_wL2_4e6iwG00a7OwyorIDpxKl5kAJE_Fct71931lB4EmNsGkVLxoA",
  "expires_in": 3600,
  "id_token": "eyJhbGciOiJSUzI1NiIsImtpZCI6InNzb19vaWRjX2tleV9wYWlyXzAxSlBYTjZLRjdOQUVBWlRGRFlFU0FFMEtYIn0.eyJuYW1lIjoiTGVyb3kgSmVua2lucyIsImdpdmVuX25hbWUiOiJMZXJveSIsImZhbWlseV9uYW1lIjoiSmVua2lucyIsImVtYWlsIjoibGVyb3kuamVua2luc0BleGFtcGxlLmNvbSIsImVtYWlsX3ZlcmlmaWVkIjpmYWxzZSwiZXhwIjoxNzQyNjA4MTUzLCJpYXQiOjE3NDI2MDQ1NTN9.UmZj238IIPPtjlc3xEUn_nkNPtw4d71pJLcVyN-0IhDwS1q4bLURIfaV5NdBOUCMmK-BKK5p9NtRUVx5iuTuokah1tQAvfY6dMYNBAD9LMpsv4dvFZMSJHbH9khgrpnLUdvPzTveNBHpmBK7WvZ5VGLlX3Mr-WuI28bvHPI112sNaa-A8gPU7joMgitq01d0raWkBf6XvcAODHD8qKdcS0p4xCnFHVZnfKtgpVDnQJXEFzZnCbcHhdJvaWaTbhLWuWlbIbi4bv-Za3aYAZ-SdcvqkQNWcAPnaj17qLEfY_nyjmiVSW6qkWuq_vJUBLFMmaMbJTYzAsUPAh17_cg24A",
  "refresh_token": "GCOzb87tq7LWpSMaBCjVHnJPH",
  "token_type": "bearer"
}`,
};

/**
 * Usage page content configuration - User view
 * Contains steps with commands for users to get started with Polaris
 */
const USAGE_CONTENT_USER = {
	title: "use Polaris",
	type: "steps",
	steps: [
		{
			number: 1,
			title: "First create your Polaris account",
			link: { text: "here", href: "#" },
		},
		{
			number: 2,
			title: "Install the CLI",
			command: "bun add -g hax-cli",
		},
		{
			number: 3,
			title: "Run the CLI tool connect your subscriptions",
			command: "hax-cli",
		},
		{
			number: 4,
			title:
				"Now you can use your AI subscriptions in any tool support login with your Polaris account",
		},
	],
};

type UsageStep = {
	number: number;
	title: string;
	command?: string;
	link?: { text: string; href: string };
};

/**
 * Home component - Renders the landing page with About and Usage views
 */
export default function Home() {
	const containerRef = useRef<HTMLDivElement>(null);
	const [currentPage, setCurrentPage] = useState<"about" | "usage">("about");
	const [userType, setUserType] = useState<"dev" | "user">("dev");

	const content =
		currentPage === "about"
			? ABOUT_CONTENT
			: userType === "dev"
				? USAGE_CONTENT_DEV
				: USAGE_CONTENT_USER;

	useEffect(() => {
		void currentPage;

		const ctx = gsap.context(() => {
			const tl = gsap.timeline();

			// Animate the heading words
			tl.to(".heading-word", {
				opacity: 1,
				filter: "blur(0px)",
				duration: 0.8,
				stagger: 0.08,
				ease: "power2.out",
			})
				.to(
					".para-word",
					{
						opacity: 1,
						filter: "blur(0px)",
						duration: 0.6,
						stagger: 0.02,
						ease: "power2.out",
					},
					"-=0.4",
				)
				.fromTo(
					".nav-btn",
					{ opacity: 0, filter: "blur(5px)" },
					{
						opacity: 1,
						filter: "blur(0px)",
						duration: 0.6,
						stagger: 0.1,
						ease: "power2.out",
					},
					"-=0.5",
				)
				.fromTo(
					".user-type-toggle",
					{ opacity: 0, filter: "blur(5px)" },
					{
						opacity: 1,
						filter: "blur(0px)",
						duration: 0.6,
						ease: "power2.out",
					},
					"-=0.5",
				);
		}, containerRef);

		return () => ctx.revert();
	}, [currentPage]);

	const paragraphs = "paragraphs" in content ? content.paragraphs : [];
	const steps = "steps" in content ? content.steps : [];

	return (
		<div
			ref={containerRef}
			className="h-svh w-svw bg-[#2A232D] flex justify-center text-[#7D6988] overflow-hidden"
			style={{ fontFamily: "var(--font-playfair), serif" }}
		>
			<div className="w-175 h-full border-x border-dashed border-[#403149] px-3 relative">
				<div className="absolute -left-60 top-16 flex flex-col gap-1.5">
					<button
						type="button"
						className={`nav-btn text-left text-[17px] hover:opacity-80 transition-opacity cursor-pointer ${
							currentPage === "about" ? "text-[#d4b4e2]" : "text-[#7D6988]"
						}`}
						onClick={() => setCurrentPage("about")}
					>
						About
					</button>
					<button
						type="button"
						className={`nav-btn text-left text-[17px] hover:opacity-80 transition-opacity cursor-pointer ${
							currentPage === "usage" ? "text-[#d4b4e2]" : "text-[#7D6988]"
						}`}
						onClick={() => setCurrentPage("usage")}
					>
						usage
					</button>
				</div>

				<div className="w-full h-full border-x border-dashed border-[#403149] flex flex-col relative overflow-y-auto">
					{currentPage === "usage" && (
						<div className="user-type-toggle mt-10 px-10 py-4 flex items-center gap-8">
							<button
								type="button"
								className={`text-[20px] font-normal tracking-wide hover:opacity-80 transition-opacity cursor-pointer ${
									userType === "dev" ? "text-[#d4b4e2]" : "text-[#7D6988]"
								}`}
								onClick={() => setUserType("dev")}
							>
								dev
							</button>
							<div className="h-8 w-px bg-[#403149]" />
							<button
								type="button"
								className={`text-[20px] font-normal tracking-wide hover:opacity-80 transition-opacity cursor-pointer ${
									userType === "user" ? "text-[#d4b4e2]" : "text-[#7D6988]"
								}`}
								onClick={() => setUserType("user")}
							>
								user
							</button>
						</div>
					)}

					<div
						className={`border-y border-dashed border-[#403149] px-10 py-6 ${currentPage === "usage" ? "mt-0" : "mt-10"}`}
					>
						<h1 className="text-[#d4b4e2] text-[22px] font-normal tracking-wide">
							<SplitWords text={content.title} className="heading-word" />
						</h1>
					</div>

					<div className="px-10 py-8 space-y-6 text-[20px] leading-relaxed font-normal pr-16">
						{currentPage === "usage" && userType === "dev" ? (
							<div className="space-y-8">
								<p>
									<SplitWords
										text={USAGE_CONTENT_DEV.paragraphs[0]}
										className="para-word"
									/>
								</p>

								{steps.map((step: UsageStep) => (
									<Step
										key={step.number}
										number={step.number}
										title={step.title}
										command={step.command}
										link={step.link}
									/>
								))}

								<div>
									<pre className="whitespace-pre-wrap rounded border border-[#403149] bg-[#1a1620] p-4 text-[14px] leading-relaxed text-[#d4b4e2] overflow-x-auto">
										{USAGE_CONTENT_DEV.response}
									</pre>
								</div>
							</div>
						) : currentPage === "usage" && userType === "user" ? (
							<div>
								{USAGE_CONTENT_USER.steps.map((step) => (
									<Step
										key={step.number}
										number={step.number}
										title={step.title}
										command={step.command}
										link={step.link}
									/>
								))}
							</div>
						) : (
							paragraphs.map((paragraph, i) => (
								<p key={`${paragraph.slice(0, 12)}-${i}`}>
									<SplitWords text={paragraph} className="para-word" />
								</p>
							))
						)}
					</div>
				</div>
			</div>
		</div>
	);
}
