import type { NextConfig } from "next";

const nextConfig: NextConfig = {
	output: "export",
	pageExtensions: ["tsx", "ts"],
	// Tell Next.js to look for pages in the src/ directory
	// Note: The default 'pages' directory is still checked if src/pages doesn't exist.
	// Since we moved pages to src/pages, this isn't strictly necessary but good practice.
	// pageExtensions already filters out test files.
	images: {
		unoptimized: true,
	},
};

export default nextConfig;
