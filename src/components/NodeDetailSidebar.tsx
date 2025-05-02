import React, { ChangeEvent, KeyboardEvent, useEffect, useState } from "react";
import { NodeData, useGraphStore } from "../store/graphStore";

const DetailSidebar: React.FC = () => {
	const nodes = useGraphStore((state) => state.nodes);
	const edges = useGraphStore((state) => state.edges);
	const selectedNodeId = useGraphStore((state) => state.selectedNodeId);
	const selectedEdgeId = useGraphStore((state) => state.selectedEdgeId);
	const updateNodeData = useGraphStore((state) => state.updateNodeData);
	const updateEdgeLabel = useGraphStore((state) => state.updateEdgeLabel);
	const updateEdgeType = useGraphStore((state) => state.updateEdgeType);
	const nodeTypes = useGraphStore((state) => state.nodeTypes);
	const edgeTypes = useGraphStore((state) => state.edgeTypes);
	const addNodeType = useGraphStore((state) => state.addNodeType);
	const addEdgeType = useGraphStore((state) => state.addEdgeType);

	const selectedNode = nodes.find((node) => node.id === selectedNodeId);
	const selectedEdge = edges.find((edge) => edge.id === selectedEdgeId);

	const [nodeLabel, setNodeLabel] = useState<string>("");
	const [nodeType, setNodeType] = useState<string>("");
	const [edgeLabel, setEdgeLabel] = useState<string>("");
	const [edgeType, setEdgeType] = useState<string>("");
	const [showNewNodeTypeInput, setShowNewNodeTypeInput] = useState(false);
	const [showNewEdgeTypeInput, setShowNewEdgeTypeInput] = useState(false);
	const [newNodeTypeInput, setNewNodeTypeInput] = useState("");
	const [newEdgeTypeInput, setNewEdgeTypeInput] = useState("");

	useEffect(() => {
		setShowNewNodeTypeInput(false); // Reset add new input visibility on selection change
		setShowNewEdgeTypeInput(false);
		setNewNodeTypeInput("");
		setNewEdgeTypeInput("");

		if (selectedNode) {
			setNodeLabel(selectedNode.data.label ?? "");
			setNodeType(selectedNode.data.type ?? "");
			setEdgeLabel("");
			setEdgeType("");
		} else if (selectedEdge) {
			setEdgeLabel(String(selectedEdge.label ?? ""));
			setEdgeType(selectedEdge.data?.type ?? ""); // Get type from data object
			setNodeLabel("");
			setNodeType("");
		} else {
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

	const handleNodeTypeSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		if (value === "__add_new__") {
			setShowNewNodeTypeInput(true);
			setNodeType(""); // Clear selection if adding new
		} else {
			setShowNewNodeTypeInput(false);
			setNodeType(value);
			if (selectedNode) {
				updateNodeData(selectedNode.id, { type: value });
			}
		}
	};

	const handleAddNewNodeType = () => {
		if (newNodeTypeInput.trim()) {
			addNodeType(newNodeTypeInput.trim());
			setNodeType(newNodeTypeInput.trim()); // Select the newly added type
			if (selectedNode) {
				updateNodeData(selectedNode.id, { type: newNodeTypeInput.trim() });
			}
			setNewNodeTypeInput("");
			setShowNewNodeTypeInput(false);
		}
	};

	const handleNewNodeTypeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleAddNewNodeType();
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

	const handleEdgeTypeSelectChange = (event: ChangeEvent<HTMLSelectElement>) => {
		const value = event.target.value;
		if (value === "__add_new__") {
			setShowNewEdgeTypeInput(true);
			setEdgeType(""); // Clear selection if adding new
		} else {
			setShowNewEdgeTypeInput(false);
			setEdgeType(value);
			if (selectedEdge) {
				updateEdgeType(selectedEdge.id, value);
			}
		}
	};

	const handleAddNewEdgeType = () => {
		if (newEdgeTypeInput.trim()) {
			addEdgeType(newEdgeTypeInput.trim());
			setEdgeType(newEdgeTypeInput.trim()); // Select the newly added type
			if (selectedEdge) {
				updateEdgeType(selectedEdge.id, newEdgeTypeInput.trim());
			}
			setNewEdgeTypeInput("");
			setShowNewEdgeTypeInput(false);
		}
	};

	const handleNewEdgeTypeKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
		if (event.key === "Enter") {
			handleAddNewEdgeType();
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

	const selectStyle: React.CSSProperties = {
		...inputStyle, // Inherit base styles
		appearance: "none", // Remove default browser appearance
		backgroundImage: `url('data:image/svg+xml;utf8,<svg fill="black" height="24" viewBox="0 0 24 24" width="24" xmlns="http://www.w3.org/2000/svg"><path d="M7 10l5 5 5-5z"/></svg>')`,
		backgroundRepeat: "no-repeat",
		backgroundPosition: "right 0.5rem center",
		backgroundSize: "1.5em",
		paddingRight: "2.5rem", // Make space for the arrow
	};

	const buttonStyle: React.CSSProperties = {
		padding: "0.3rem 0.6rem",
		marginLeft: "0.5rem",
		backgroundColor: "#4299e1", // blue-500
		color: "white",
		border: "none",
		borderRadius: "0.25rem",
		cursor: "pointer",
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
							<label htmlFor="node-type-select" style={labelStyle}>
								Type:
							</label>
							<select
								id="node-type-select"
								value={showNewNodeTypeInput ? "__add_new__" : nodeType}
								onChange={handleNodeTypeSelectChange}
								style={selectStyle}
								className="border rounded px-2 py-1 w-full"
							>
								<option value="">Select Type</option>
								{nodeTypes.map((type) => (
									<option key={type} value={type}>
										{type}
									</option>
								))}
								<option value="__add_new__">Add New...</option>
							</select>
							{showNewNodeTypeInput && (
								<div style={{ display: "flex", marginTop: "0.5rem" }}>
									<input
										type="text"
										value={newNodeTypeInput}
										onChange={(e) => setNewNodeTypeInput(e.target.value)}
										onKeyDown={handleNewNodeTypeKeyDown}
										placeholder="New node type"
										style={{ ...inputStyle, marginBottom: 0, flexGrow: 1 }}
										autoFocus
									/>
									<button onClick={handleAddNewNodeType} style={buttonStyle}>
										Add
									</button>
								</div>
							)}
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
							<label htmlFor="edge-type-select" style={labelStyle}>
								Type:
							</label>
							<select
								id="edge-type-select"
								value={showNewEdgeTypeInput ? "__add_new__" : edgeType}
								onChange={handleEdgeTypeSelectChange}
								style={selectStyle}
								className="border rounded px-2 py-1 w-full"
							>
								<option value="">Select Type</option>
								{edgeTypes.map((type) => (
									<option key={type} value={type}>
										{type}
									</option>
								))}
								<option value="__add_new__">Add New...</option>
							</select>
							{showNewEdgeTypeInput && (
								<div style={{ display: "flex", marginTop: "0.5rem" }}>
									<input
										type="text"
										value={newEdgeTypeInput}
										onChange={(e) => setNewEdgeTypeInput(e.target.value)}
										onKeyDown={handleNewEdgeTypeKeyDown}
										placeholder="New edge type"
										style={{ ...inputStyle, marginBottom: 0, flexGrow: 1 }}
										autoFocus
									/>
									<button onClick={handleAddNewEdgeType} style={buttonStyle}>
										Add
									</button>
								</div>
							)}
						</div>
					</div>
				</>
			)}
		</div>
	);
};

export default DetailSidebar;
