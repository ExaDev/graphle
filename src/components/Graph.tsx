import React, { useCallback } from "react";
import ReactFlow, {
	Background,
	Controls,
	Edge,
	MiniMap,
	Node,
	NodeTypes,
	OnEdgesDelete,
	OnNodesDelete,
	ReactFlowProvider,
	useReactFlow,
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
	const { project } = useReactFlow();

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

	const handleNodeClick = useCallback(
		(_event: React.MouseEvent, node: Node) => {
			setSelectedNodeId(node.id);
		},
		[setSelectedNodeId]
	);

	const handleEdgeClick = useCallback(
		(_event: React.MouseEvent, edge: Edge) => {
			setSelectedEdgeId(edge.id);
		},
		[setSelectedEdgeId]
	);

	const handlePaneDoubleClick = useCallback(
		(event: React.MouseEvent) => {
			const position = project({
				x: event.clientX,
				y: event.clientY,
			});
			addNode({ position });
		},
		[addNode, project]
	);

	return (
		<div style={{ height: "100vh", width: "100%", position: "relative" }}>
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
				onDoubleClick={handlePaneDoubleClick}
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
