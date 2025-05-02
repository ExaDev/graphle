import {
	addEdge,
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

export type GraphState = {
	nodes: Node[];
	edges: Edge[];
	viewport: Viewport;
	nodeIdCounter: number;
	_isHydrated: boolean;
	onNodesChange: OnNodesChange;
	onEdgesChange: OnEdgesChange;
	onConnect: OnConnect;
	setNodes: (nodes: Node[]) => void;
	setEdges: (edges: Edge[]) => void;
	setViewport: (viewport: Viewport) => void;
	addNode: (nodeData: Partial<Node>) => void;
	addEdge: (edge: Edge | Connection) => void;
	deleteElements: (payload: DeleteElementsPayload) => void;
	updateNodeLabel: (nodeId: string, newLabel: string) => void;
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
	| "addNode"
	| "addEdge"
	| "deleteElements"
	| "hydrate"
	| "updateNodeLabel"
> = {
	nodes: [],
	edges: [],
	viewport: { x: 0, y: 0, zoom: 1 },
	nodeIdCounter: 0,
	_isHydrated: false,
};

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
	setNodes: (nodes: Node[]) => {
		set({ nodes });
	},
	setEdges: (edges: Edge[]) => {
		set({ edges });
	},
	setViewport: (viewport: Viewport) => {
		set({ viewport });
	},
	addNode: (nodeData: Partial<Node>) => {
		const newNodeId = `node_${get().nodeIdCounter}`;
		const newNode: Node = {
			id: newNodeId,
			position: nodeData.position ?? {
				x: Math.random() * 500,
				y: Math.random() * 300,
			},
			data: nodeData.data ?? { label: `Node ${get().nodeIdCounter}` },
			// Ensure new nodes use the custom editable type by default
			type: nodeData.type ?? "editableNode",
			...nodeData,
		};
		set((state) => ({
			nodes: [...state.nodes, newNode],
			nodeIdCounter: state.nodeIdCounter + 1,
		}));
	},
	addEdge: (edge: Edge | Connection) => {
		set((state) => ({
			edges: addEdge(edge, state.edges),
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
	updateNodeLabel: (nodeId: string, newLabel: string) => {
		set((state) => ({
			nodes: state.nodes.map((node) => {
				if (node.id === nodeId) {
					return {
						...node,
						data: {
							...node.data,
							label: newLabel,
						},
					};
				}
				return node;
			}),
		}));
	},
	hydrate: (newState: Partial<GraphState>) => {
		set((state) => ({
			...initialState,
			...newState,
			_isHydrated: true,
			nodeIdCounter:
				typeof newState.nodeIdCounter === "number"
					? newState.nodeIdCounter
					: state.nodeIdCounter,
		}));
	},
}));
