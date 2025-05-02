"use client";

import Graph from "@/components/Graph";
import { useEffect, useRef } from "react";
import DetailSidebar from "@/components/NodeDetailSidebar";
import { usePersistence } from "@/hooks/usePersistence";
import { useUrlSharing } from "@/hooks/useUrlSharing";
import { useGraphStore } from "@/store/graphStore";

function StateInitializer() {
	useUrlSharing();
	usePersistence();

	const applyLayout = useGraphStore((state) => state.applyLayout);
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const initialLayoutApplied = useRef(false);

	useEffect(() => {
		if (
			!initialLayoutApplied.current &&
			nodes.length > 0 &&
			edges.length > 0
		) {
			applyLayout();
			initialLayoutApplied.current = true;
		}
	}, [applyLayout, nodes.length, edges.length]);

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
