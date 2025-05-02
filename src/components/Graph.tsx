import React, { useCallback } from "react"; // Added React import for MouseEvent type
import ReactFlow, {
	Background,
	Controls,
	MiniMap,
	Node,
	Edge,
	OnEdgesDelete,
	OnNodesDelete,
	ReactFlowProvider,
	NodeTypes,
} from "reactflow";
import "reactflow/dist/style.css";

import { useGraphStore } from "@/store/graphStore";
import EditableNode from "./EditableNode";

const nodeTypes: NodeTypes = {
	editableNode: EditableNode,
};

function GraphComponent() {
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const onNodesChange = useGraphStore((state) => state.onNodesChange);
	const onEdgesChange = useGraphStore((state) => state.onEdgesChange);
	const onConnect = useGraphStore((state) => state.onConnect);
	const addNode = useGraphStore((state) => state.addNode);
	const deleteElements = useGraphStore((state) => state.deleteElements);
	const setSelectedNodeId = useGraphStore((state) => state.setSelectedNodeId);
	const setSelectedEdgeId = useGraphStore((state) => state.setSelectedEdgeId);

	const handleAddNode = () => {
		addNode({});
	};

	const handleNodesDelete: OnNodesDelete = useCallback(
		(nodesToDelete) => {
			deleteElements({ nodesToDelete, edgesToDelete: [] });
		},
		[deleteElements],
	);

	const handleEdgesDelete: OnEdgesDelete = useCallback(
		(edgesToDelete) => {
			deleteElements({ nodesToDelete: [], edgesToDelete });
		},
		[deleteElements],
	);

	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			setSelectedNodeId(node.id);
		},
		[setSelectedNodeId],
	);

	const handleEdgeClick = useCallback(
		(_event: React.MouseEvent, edge: Edge) => {
			setSelectedEdgeId(edge.id);
		},
		[setSelectedEdgeId],
	);

	return (
		<div style={{ height: "100vh", width: "100%", position: "relative" }}>
			<button
				onClick={handleAddNode}
				style={{
					position: "absolute",
					top: 15,
					left: 15,
					zIndex: 4,
					padding: "8px 15px",
					background: "#fff",
					border: "1px solid #ccc",
					borderRadius: "4px",
					cursor: "pointer",
					boxShadow: "0 2px 5px rgba(0,0,0,0.1)",
				}}
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
				onNodeClick={handleNodeClick}
				onEdgeClick={handleEdgeClick}
				nodeTypes={nodeTypes}
				fitView
			>
				<Controls />
				<Background />
				<MiniMap />
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
