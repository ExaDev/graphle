import React from "react"; // Import React for CSSProperties
import {
	addEdge as rfAddEdge, // Rename to avoid conflict
	applyEdgeChanges,
	applyNodeChanges,
	Connection,
	Edge,
	EdgeChange,
	Node,
	NodeChange,
	OnConnect,
	OnEdgesChange,
	OnNodesChange,
	Viewport,
} from "reactflow";
import { create } from "zustand";

type DeleteElementsPayload = {
	nodesToDelete: Pick<Node, "id">[];
	edgesToDelete: Pick<Edge, "id">[];
};

export type NodeData = {
	label: string;
	type?: string;
};

export type EdgeData = {
	type?: string;
	label?: string;
};

export type GraphState = {
	nodes: Node<NodeData>[];
	edges: Edge<EdgeData>[]; // Specify EdgeData type
	// Removed duplicate edges property
	viewport: Viewport;
	nodeIdCounter: number;
	selectedNodeId: string | null;
	selectedEdgeId: string | null;
	_isHydrated: boolean;
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	setNodes: (nodes: Node<NodeData>[]) => void;
	setEdges: (edges: Edge<EdgeData>[]) => void; // Specify EdgeData type
	setViewport: (viewport: Viewport) => void;
	setSelectedNodeId: (nodeId: string | null) => void;
	setSelectedEdgeId: (edgeId: string | null) => void;
	addNode: (nodeData: Partial<Node<NodeData>>) => void;
	addEdge: (edge: Edge<EdgeData> | Connection) => void; // Specify EdgeData type
	deleteElements: (payload: DeleteElementsPayload) => void;
	updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
	updateEdgeLabel: (edgeId: string, label: string) => void;
	updateEdgeType: (edgeId: string, type: string) => void;
	hydrate: (state: Partial<GraphState>) => void;
};

export const initialState: Omit<
	GraphState,
	| "onNodesChange"
	| "onEdgesChange"
	| "onConnect"
	| "setNodes"
	| "setEdges"
	| "setViewport"
	| "setSelectedNodeId"
	| "setSelectedEdgeId"
	| "addNode"
	| "addEdge"
	| "deleteElements"
	| "hydrate"
	| "updateNodeData"
	| "updateEdgeLabel"
	| "updateEdgeType"
> = {
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
	nodeIdCounter: 0,
	selectedNodeId: null,
	selectedEdgeId: null,
	_isHydrated: false,
};

// Define edge styles based on type
const edgeStyles: Record<string, React.CSSProperties> = {
	default: { stroke: "#b1b1b7", strokeWidth: 1 },
	dependency: { stroke: "#ff0072", strokeWidth: 2 },
	inheritance: { stroke: "#00ff7f", strokeWidth: 2, strokeDasharray: "5,5" },
	composition: { stroke: "#007fff", strokeWidth: 1 }, // Removed animated property
};

// Helper function to get style based on type
function getEdgeStyle(type?: string): React.CSSProperties {
	return edgeStyles[type || "default"] || edgeStyles.default;
}

// Helper function to determine if edge should be animated
function isEdgeAnimated(type?: string): boolean {
	return type === "composition";
}

export const useGraphStore = create<GraphState>((set, get) => ({
	...initialState,

	onNodesChange: (changes: NodeChange[]) => {
		set({
			nodes: applyNodeChanges(changes, get().nodes),
		});
	},
	onEdgesChange: (changes: EdgeChange[]) => {
		set({
			edges: applyEdgeChanges(changes, get().edges),
		});
	},
	onConnect: (connection: Connection) => {
		get().addEdge(connection);
	},
	setNodes: (nodes: Node<NodeData>[]) => {
		set({ nodes });
	},
	setEdges: (edges: Edge<EdgeData>[]) => { // Specify EdgeData type
		set({ edges });
	},
	setViewport: (viewport: Viewport) => {
		set({ viewport });
	},
	setSelectedNodeId: (nodeId: string | null) => {
		set({ selectedNodeId: nodeId, selectedEdgeId: null }); // Clear edge selection when node is selected
	},
	setSelectedEdgeId: (edgeId: string | null) => {
		set({ selectedEdgeId: edgeId, selectedNodeId: null }); // Clear node selection when edge is selected
	},
	addNode: (nodeData: Partial<Node<NodeData>>) => {
		const newNodeId = `node_${get().nodeIdCounter}`;
		const newNode: Node<NodeData> = {
			id: newNodeId,
			position: nodeData.position ?? {
				x: Math.random() * 500,
				y: Math.random() * 300,
			},
			data: nodeData.data ?? {
				label: `Node ${get().nodeIdCounter}`,
				type: "",
			},
			type: nodeData.type ?? "editableNode",
			...nodeData,
		};
		set((state) => ({
			nodes: [...state.nodes, newNode],
			nodeIdCounter: state.nodeIdCounter + 1,
		}));
	},
	addEdge: (newEdgeOrConnection: Edge<EdgeData> | Connection) => {
		// Apply style and animation when adding edge
		const edgeType =
			"data" in newEdgeOrConnection ? newEdgeOrConnection.data?.type : undefined;
		const edgeWithStyleAndAnimation = {
			...newEdgeOrConnection,
			style: getEdgeStyle(edgeType),
			animated: isEdgeAnimated(edgeType), // Set animated property directly
			// Ensure data object exists and includes type
			data: {
				...("data" in newEdgeOrConnection ? newEdgeOrConnection.data : {}),
				type: edgeType,
			},
		};
		set((state) => ({
			edges: rfAddEdge(edgeWithStyleAndAnimation, state.edges), // Use renamed import
		}));
	},
	deleteElements: ({
		nodesToDelete,
		edgesToDelete,
	}: DeleteElementsPayload) => {
		const nodeIdsToDelete = new Set(nodesToDelete.map((n) => n.id));
		const edgeIdsToDelete = new Set(edgesToDelete.map((e) => e.id));

		set((state) => {
			const remainingNodes = state.nodes.filter(
				(node) => !nodeIdsToDelete.has(node.id)
			);
			const remainingEdges = state.edges.filter(
				(edge) =>
					!edgeIdsToDelete.has(edge.id) &&
					!nodeIdsToDelete.has(edge.source) &&
					!nodeIdsToDelete.has(edge.target)
			);

			return {
				nodes: remainingNodes,
				edges: remainingEdges,
			};
		});
	},
	updateNodeData: (nodeId: string, data: Partial<NodeData>) => {
		set((state) => ({
			nodes: state.nodes.map((node) => {
				if (node.id === nodeId) {
					return {
						...node,
						data: {
							...node.data,
							...data,
						},
					};
				}
				return node;
			}),
		}));
	},
	updateEdgeLabel: (edgeId: string, label: string) => {
		set((state) => ({
			edges: state.edges.map((edge) => {
				if (edge.id === edgeId) {
					return {
						...edge,
						label: label,
					};
				}
				return edge;
			}),
		}));
	},
	updateEdgeType: (edgeId: string, type: string) => {
		set((state) => ({
			edges: state.edges.map((edge) => {
				if (edge.id === edgeId) {
					// Also update style and animation when type changes
					return {
						...edge,
						data: { ...edge.data, type: type }, // Store type in data object
						style: getEdgeStyle(type),
						animated: isEdgeAnimated(type), // Update animated property
					};
				}
				return edge;
			}),
		}));
	},
	hydrate: (newState: Partial<GraphState>) => {
		// Apply styles and animation to hydrated edges
		const hydratedEdges = (newState.edges || []).map((edge) => {
			const edgeType = edge.data?.type;
			return {
				...edge,
				style: getEdgeStyle(edgeType),
				animated: isEdgeAnimated(edgeType), // Set animated property
			};
		});

		set((state) => ({
			...initialState,
			...newState,
			edges: hydratedEdges, // Use edges with applied styles
			_isHydrated: true,
			nodeIdCounter:
				typeof newState.nodeIdCounter === "number"
					? newState.nodeIdCounter
					: state.nodeIdCounter,
		}));
	},
}));
