import type { NextConfig } from "next";

const isGithubActions = process.env.GITHUB_ACTIONS === 'true'

const nextConfig: NextConfig = {
	output: "export",
	pageExtensions: ["tsx", "ts"],
	images: {
		unoptimized: true,
	},
	basePath: isGithubActions ? '/graphle' : '',
	assetPrefix: isGithubActions ? '/graphle/' : '',
};

export default nextConfig;
