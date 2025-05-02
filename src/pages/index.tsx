"use client";

import Graph from "@/components/Graph";
import NodeDetailSidebar from "@/components/NodeDetailSidebar";
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
			<NodeDetailSidebar />
		</div>
	);
};

export default IndexPage;
