import { useEffect, useState } from "react";
import { loadGraphState, saveGraphState } from "../utils/storage";

const Graph = ({ project, view, onProjectChange, onViewChange }) => {
	const [nodes, setNodes] = useState([]);
	const [edges, setEdges] = useState([]);

	useEffect(() => {
		if (project) {
			const savedGraphState = loadGraphState(project.id);
			if (savedGraphState) {
				setNodes(savedGraphState.nodes);
				setEdges(savedGraphState.edges);
			}
		}
	}, [project]);

	const addNode = (node) => {
		const newNodes = [...nodes, node];
		setNodes(newNodes);
		saveGraphState(project.id, { nodes: newNodes, edges });
	};

	const removeNode = (nodeId) => {
		const newNodes = nodes.filter((node) => node.id !== nodeId);
		const newEdges = edges.filter(
			(edge) => edge.source !== nodeId && edge.target !== nodeId
		);
		setNodes(newNodes);
		setEdges(newEdges);
		saveGraphState(project.id, { nodes: newNodes, edges: newEdges });
	};

	const updateNode = (updatedNode) => {
		const newNodes = nodes.map((node) =>
			node.id === updatedNode.id ? updatedNode : node
		);
		setNodes(newNodes);
		saveGraphState(project.id, { nodes: newNodes, edges });
	};

	const addEdge = (edge) => {
		const newEdges = [...edges, edge];
		setEdges(newEdges);
		saveGraphState(project.id, { nodes, edges: newEdges });
	};

	const removeEdge = (edgeId) => {
		const newEdges = edges.filter((edge) => edge.id !== edgeId);
		setEdges(newEdges);
		saveGraphState(project.id, { nodes, edges: newEdges });
	};

	const updateEdge = (updatedEdge) => {
		const newEdges = edges.map((edge) =>
			edge.id === updatedEdge.id ? updatedEdge : edge
		);
		setEdges(newEdges);
		saveGraphState(project.id, { nodes, edges: newEdges });
	};

	return (
		<div>
			<h2>Graph</h2>
			<div>
				<button
					onClick={() =>
						addNode({ id: Date.now(), label: "New Node" })
					}
				>
					Add Node
				</button>
				<button
					onClick={() =>
						addEdge({
							id: Date.now(),
							source: nodes[0]?.id,
							target: nodes[1]?.id,
						})
					}
				>
					Add Edge
				</button>
			</div>
			<div>
				{nodes.map((node) => (
					<div key={node.id}>
						<span>{node.label}</span>
						<button onClick={() => removeNode(node.id)}>
							Remove Node
						</button>
						<button
							onClick={() =>
								updateNode({ ...node, label: "Updated Node" })
							}
						>
							Update Node
						</button>
					</div>
				))}
			</div>
			<div>
				{edges.map((edge) => (
					<div key={edge.id}>
						<span>{`Edge from ${edge.source} to ${edge.target}`}</span>
						<button onClick={() => removeEdge(edge.id)}>
							Remove Edge
						</button>
						<button
							onClick={() =>
								updateEdge({ ...edge, label: "Updated Edge" })
							}
						>
							Update Edge
						</button>
					</div>
				))}
			</div>
		</div>
	);
};

export default Graph;
