import { useCallback } from "react";
import ReactFlow, {
	Background,
	Controls,
	OnEdgesDelete,
	OnNodesDelete,
	ReactFlowProvider
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphStore } from "@/store/graphStore";

function GraphComponent() {
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const onNodesChange = useGraphStore((state) => state.onNodesChange);
	const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
	const onConnect = useGraphStore((state) => state.onConnect);
	const addNode = useGraphStore((state) => state.addNode);
	const deleteElements = useGraphStore((state) => state.deleteElements);

	const handleAddNode = () => {
		addNode({});
	};

	const handleNodesDelete: OnNodesDelete = useCallback(
		(nodesToDelete) => {
			deleteElements({ nodesToDelete, edgesToDelete: [] });
		},
		[deleteElements]
	);

	const handleEdgesDelete: OnEdgesDelete = useCallback(
		(edgesToDelete) => {
			deleteElements({ nodesToDelete: [], edgesToDelete });
		},
		[deleteElements]
	);

	return (
		<div style={{ height: "100vh", width: "100%", position: "relative" }}>
			<button
				onClick={handleAddNode}
				style={{ position: "absolute", top: 10, left: 10, zIndex: 4 }}
			>
				Add Node
			</button>
			<ReactFlow
				nodes={nodes}
				edges={edges}
				onNodesChange={onNodesChange}
				onEdgesChange={onEdgesChange}
				onConnect={onConnect}
				onNodesDelete={handleNodesDelete}
				onEdgesDelete={handleEdgesDelete}
				fitView
			>
				<Controls />
				<Background />
			</ReactFlow>
		</div>
	);
}

function Graph() {
	return (
		<ReactFlowProvider>
			<GraphComponent />
		</ReactFlowProvider>
	);
}

export default Graph;
