"use client";

import Graph from "@/components/Graph";
import DetailSidebar from "@/components/NodeDetailSidebar"; // Renamed import
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
			<DetailSidebar />
		</div>
	);
};

export default IndexPage;
