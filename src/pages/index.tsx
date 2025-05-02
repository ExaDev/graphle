"use client";

import Graph from "@/components/Graph";
import { usePersistence } from "@/hooks/usePersistence";
import { useUrlSharing } from "@/hooks/useUrlSharing";

function StateInitializer() {
	useUrlSharing();
	usePersistence();

	return null;
}

const IndexPage = () => {
	return (
		<div>
			<h1>Graphle</h1>
			<StateInitializer />
			<Graph />
		</div>
	);
};

export default IndexPage;
