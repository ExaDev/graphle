import React from "react";
import {
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
	addEdge as rfAddEdge,
	Viewport,
} from "reactflow";
import { create } from "zustand";
import { getLayoutedElements } from "../utils/layout";

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
	edges: Edge<EdgeData>[];
	viewport: Viewport;
	nodeIdCounter: number;
	selectedNodeId: string | null;
	selectedEdgeId: string | null;
	nodeTypes: string[];
	edgeTypes: string[];
	_isHydrated: boolean;
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	setNodes: (nodes: Node<NodeData>[]) => void;
	setEdges: (edges: Edge<EdgeData>[]) => void;
	setViewport: (viewport: Viewport) => void;
	setSelectedNodeId: (nodeId: string | null) => void;
	setSelectedEdgeId: (edgeId: string | null) => void;
	addNode: (
		nodeData: Pick<Node<NodeData>, "position"> &
			Partial<Omit<Node<NodeData>, "position">>
	) => void;
	addEdge: (edge: Edge<EdgeData> | Connection) => void;
	deleteElements: (payload: DeleteElementsPayload) => void;
	updateNodeData: (nodeId: string, data: Partial<NodeData>) => void;
	updateEdgeLabel: (edgeId: string, label: string) => void;
	updateEdgeType: (edgeId: string, type: string) => void;
	addNodeType: (type: string) => void;
	removeNodeType: (type: string) => void;
	addEdgeType: (type: string) => void;
	removeEdgeType: (type: string) => void;
	hydrate: (state: Partial<GraphState>) => void;
	applyLayout: () => void;
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
	| "addNodeType"
	| "removeNodeType"
	| "addEdgeType"
	| "removeEdgeType"
	| "applyLayout"
> = {
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
	nodeIdCounter: 0,
	selectedNodeId: null,
	selectedEdgeId: null,
	nodeTypes: [],
	edgeTypes: [],
	_isHydrated: false,
};

const edgeStyles: Record<string, React.CSSProperties> = {
	default: { stroke: "#b1b1b7", strokeWidth: 1 },
	dependency: { stroke: "#ff0072", strokeWidth: 2 },
	inheritance: { stroke: "#00ff7f", strokeWidth: 2, strokeDasharray: "5,5" },
	composition: { stroke: "#007fff", strokeWidth: 1 },
};

function getEdgeStyle(type?: string): React.CSSProperties {
	return edgeStyles[type || "default"] || edgeStyles.default;
}

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
	setEdges: (edges: Edge<EdgeData>[]) => {
		set({ edges });
	},
	setViewport: (viewport: Viewport) => {
		set({ viewport });
	},
	setSelectedNodeId: (nodeId: string | null) => {
		set({ selectedNodeId: nodeId, selectedEdgeId: null });
	},
	setSelectedEdgeId: (edgeId: string | null) => {
		set({ selectedEdgeId: edgeId, selectedNodeId: null });
	},
	addNode: (
		nodeData: Pick<Node<NodeData>, "position"> &
			Partial<Omit<Node<NodeData>, "position">>
	) => {
		const newNodeId = `node_${get().nodeIdCounter}`;
		const newNode: Node<NodeData> = {
			id: newNodeId,
			position: nodeData.position,
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
		const isConnection = !("id" in newEdgeOrConnection);
		const edgeType =
			"data" in newEdgeOrConnection
				? newEdgeOrConnection.data?.type
				: undefined;

		const edgeToAdd = {
			...newEdgeOrConnection,
			style: getEdgeStyle(edgeType),
			animated: isEdgeAnimated(edgeType),
			label: isConnection
				? "New Edge"
				: "label" in newEdgeOrConnection
				? newEdgeOrConnection.label
				: undefined,
			data: {
				...("data" in newEdgeOrConnection
					? newEdgeOrConnection.data
					: {}),
				type: edgeType,
			},
		};

		set((state) => ({
			edges: rfAddEdge(edgeToAdd, state.edges),
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
					return {
						...edge,
						data: { ...edge.data, type: type },
						style: getEdgeStyle(type),
						animated: isEdgeAnimated(type),
					};
				}
				return edge;
			}),
		}));
	},
	addNodeType: (type: string) => {
		const trimmedType = type.trim();
		if (!trimmedType || get().nodeTypes.includes(trimmedType)) return;
		set((state) => ({
			nodeTypes: [...state.nodeTypes, trimmedType],
		}));
	},
	removeNodeType: (type: string) => {
		set((state) => ({
			nodeTypes: state.nodeTypes.filter((t) => t !== type),
		}));
	},
	addEdgeType: (type: string) => {
		const trimmedType = type.trim();
		if (!trimmedType || get().edgeTypes.includes(trimmedType)) return;
		set((state) => ({
			edgeTypes: [...state.edgeTypes, trimmedType],
		}));
	},
	removeEdgeType: (type: string) => {
		set((state) => ({
			edgeTypes: state.edgeTypes.filter((t) => t !== type),
		}));
	},
	hydrate: (newState: Partial<GraphState>) => {
		const hydratedEdges = (newState.edges || []).map((edge) => {
			const edgeType = edge.data?.type;
			return {
				...edge,
				style: getEdgeStyle(edgeType),
				animated: isEdgeAnimated(edgeType),
			};
		});

		set((state) => ({
			...initialState,
			...newState,
			edges: hydratedEdges,
			_isHydrated: true,
			nodeIdCounter:
				typeof newState.nodeIdCounter === "number"
					? newState.nodeIdCounter
					: state.nodeIdCounter,
			nodeTypes: Array.isArray(newState.nodeTypes)
				? newState.nodeTypes
				: [],
			edgeTypes: Array.isArray(newState.edgeTypes)
				? newState.edgeTypes
				: [],
		}));
	},
	applyLayout: () => {
		const { nodes, edges } = get();
		const layoutedNodes = getLayoutedElements(nodes, edges);
		set({ nodes: layoutedNodes });
	},
}));
