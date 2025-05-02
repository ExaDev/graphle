import React, { ChangeEvent, KeyboardEvent, useEffect, useState } from "react";
import { NodeData, useGraphStore } from "../store/graphStore"; // Import NodeData type

const DetailSidebar: React.FC = () => {
	// Use individual selectors for each state slice
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
	const selectedEdgeId = useGraphStore((state) => state.selectedEdgeId);
	const updateNodeData = useGraphStore((state) => state.updateNodeData);
	const updateEdgeLabel = useGraphStore((state) => state.updateEdgeLabel);
	const updateEdgeType = useGraphStore((state) => state.updateEdgeType); // Import the new action

	// Find selected elements based on IDs
	const selectedNode = nodes.find((node) => node.id === selectedNodeId);
	const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);

	const [nodeLabel, setNodeLabel] = useState<string>("");
	const [nodeType, setNodeType] = useState<string>("");
	const [edgeLabel, setEdgeLabel] = useState<string>("");
	const [edgeType, setEdgeType] = useState<string>(""); // Add state for edge type

	useEffect(() => {
		if (selectedNode) {
			setNodeLabel(selectedNode.data.label ?? "");
			setNodeType(selectedNode.data.type ?? "");
			setEdgeLabel(""); // Clear edge states
			setEdgeType("");
		} else if (selectedEdge) {
			setEdgeLabel(String(selectedEdge.label ?? ""));
			setEdgeType(selectedEdge.type ?? ""); // Set edge type state
			setNodeLabel(""); // Clear node states
			setNodeType("");
		} else {
			// Clear all if nothing is selected
			setNodeLabel("");
			setNodeType("");
			setEdgeLabel("");
			setEdgeType("");
		}
	}, [selectedNode, selectedEdge]);

	if (!selectedNode && !selectedEdge) {
		return null;
	}

	// --- Node Handlers ---
	const handleNodeLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
		setNodeLabel(event.target.value);
	};

	const handleNodeTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
		setNodeType(event.target.value);
	};

	const handleNodeSave = (field: keyof NodeData, value: string) => {
		if (selectedNode) {
			updateNodeData(selectedNode.id, { [field]: value });
		}
	};

	const handleNodeKeyDown = (
		event: KeyboardEvent<HTMLInputElement>,
		field: keyof NodeData
	) => {
		if (event.key === "Enter") {
			handleNodeSave(field, (event.target as HTMLInputElement).value);
			(event.target as HTMLInputElement).blur();
		}
	};

	// --- Edge Handlers ---
	const handleEdgeLabelChange = (event: ChangeEvent<HTMLInputElement>) => {
		setEdgeLabel(event.target.value);
	};

	const handleEdgeSave = (value: string) => {
		if (selectedEdge) {
			updateEdgeLabel(selectedEdge.id, value);
		}
	};

	const handleEdgeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleEdgeSave((event.target as HTMLInputElement).value);
			(event.target as HTMLInputElement).blur();
		}
	};

	const handleEdgeTypeChange = (event: ChangeEvent<HTMLInputElement>) => {
		setEdgeType(event.target.value);
	};

	const handleEdgeTypeSave = (value: string) => {
		if (selectedEdge) {
			updateEdgeType(selectedEdge.id, value);
		}
	};

	const handleEdgeTypeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleEdgeTypeSave((event.target as HTMLInputElement).value);
			(event.target as HTMLInputElement).blur();
		}
	};

	// --- Styles ---
	const inputStyle: React.CSSProperties = {
		width: "100%",
		padding: "0.5rem",
		border: "1px solid #e2e8f0",
		borderRadius: "0.25rem",
		marginBottom: "0.75rem",
	};

	const labelStyle: React.CSSProperties = {
		display: "block",
		fontWeight: 600,
		marginBottom: "0.25rem",
	};

	const sidebarStyle: React.CSSProperties = {
		position: "fixed",
		top: 0,
		right: 0,
		height: "100%",
		width: "250px",
		backgroundColor: "#f7fafc",
		padding: "1rem",
		boxShadow: "0 0 10px rgba(0, 0, 0, 0.1)",
		borderLeft: "1px solid #e2e8f0",
		zIndex: 10,
		overflowY: "auto",
	};

	const detailItemStyle: React.CSSProperties = {
		marginBottom: "0.75rem",
	};

	const detailKeyStyle: React.CSSProperties = {
		fontWeight: 600,
		textTransform: "capitalize",
	};

	return (
		<div style={sidebarStyle}>
			{selectedNode && (
				<>
					<h2 className="text-lg font-semibold mb-4">Node Details</h2>
					<div className="space-y-4">
						<div style={detailItemStyle}>
							<span style={detailKeyStyle}>ID:</span> {selectedNode.id}
						</div>
						<div>
							<label htmlFor="node-label-input" style={labelStyle}>
								Label:
							</label>
							<input
								id="node-label-input"
								type="text"
								value={nodeLabel}
								onChange={handleNodeLabelChange}
								onBlur={(e) => handleNodeSave("label", e.target.value)}
								onKeyDown={(e) => handleNodeKeyDown(e, "label")}
								style={inputStyle}
								className="border rounded px-2 py-1 w-full"
							/>
						</div>
						<div>
							<label htmlFor="node-type-input" style={labelStyle}>
								Type:
							</label>
							<input
								id="node-type-input"
								type="text"
								value={nodeType}
								onChange={handleNodeTypeChange}
								onBlur={(e) => handleNodeSave("type", e.target.value)}
								onKeyDown={(e) => handleNodeKeyDown(e, "type")}
								style={inputStyle}
								className="border rounded px-2 py-1 w-full"
							/>
						</div>
						{Object.entries(selectedNode.data)
							.filter(([key]) => key !== "label" && key !== "type")
							.map(([key, value]) => (
								<div key={key} style={detailItemStyle}>
									<span style={detailKeyStyle}>{key}:</span> {String(value)}
								</div>
							))}
					</div>
				</>
			)}

			{selectedEdge && (
				<>
					<h2 className="text-lg font-semibold mb-4">Edge Details</h2>
					<div className="space-y-4">
						<div style={detailItemStyle}>
							<span style={detailKeyStyle}>ID:</span> {selectedEdge.id}
						</div>
						<div style={detailItemStyle}>
							<span style={detailKeyStyle}>Source:</span> {selectedEdge.source}
						</div>
						<div style={detailItemStyle}>
							<span style={detailKeyStyle}>Target:</span> {selectedEdge.target}
						</div>
						<div>
							<label htmlFor="edge-label-input" style={labelStyle}>
								Label:
							</label>
							<input
								id="edge-label-input"
								type="text"
								value={edgeLabel}
								onChange={handleEdgeLabelChange}
								onBlur={(e) => handleEdgeSave(e.target.value)}
								onKeyDown={handleEdgeKeyDown}
								style={inputStyle}
								className="border rounded px-2 py-1 w-full"
							/>
						</div>
						<div>
							<label htmlFor="edge-type-input" style={labelStyle}>
								Type:
							</label>
							<input
								id="edge-type-input"
								type="text"
								value={edgeType}
								onChange={handleEdgeTypeChange}
								onBlur={(e) => handleEdgeTypeSave(e.target.value)}
								onKeyDown={handleEdgeTypeKeyDown}
								style={inputStyle}
								className="border rounded px-2 py-1 w-full"
							/>
						</div>
					</div>
				</>
			)}
		</div>
	);
};

export default DetailSidebar; // Renamed component
