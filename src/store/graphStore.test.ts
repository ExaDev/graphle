import { act } from "@testing-library/react";
import { Connection, Edge } from "reactflow";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphState, initialState, NodeData, useGraphStore } from "./graphStore";

const resetStore = () => {
	act(() => {
		useGraphStore.setState(initialState);
	});
};

describe("graphStore", () => {
	beforeEach(() => {
		resetStore();
	});

	it("should have initial state", () => {
		const state = useGraphStore.getState();
		expect(state.nodes).toEqual([]);
		expect(state.edges).toEqual([]);
		expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
		expect(state.nodeIdCounter).toBe(0);
		expect(state.selectedNodeId).toBeNull();
		expect(state.selectedEdgeId).toBeNull();
		expect(state.nodeTypes).toEqual([]); // Check initial types
		expect(state.edgeTypes).toEqual([]); // Check initial types
	});

	describe("addNode", () => {
		it("should add a node with default values and increment counter", () => {
			act(() => {
				useGraphStore.getState().addNode({ position: { x: 0, y: 0 } });
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(1);
			const newNode = state.nodes[0];
			expect(newNode.id).toBe("node_0");
			expect(newNode.data).toEqual({ label: "Node 0", type: "" });
			expect(newNode.type).toBe("editableNode");
			expect(newNode.position).toBeDefined();
			expect(state.nodeIdCounter).toBe(1);
		});

		it("should add multiple nodes with unique IDs", () => {
			act(() => {
				useGraphStore.getState().addNode({ position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ position: { x: 10, y: 10 }, type: "input" });
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(2);
			expect(state.nodes[0].id).toBe("node_0");
			expect(state.nodes[1].id).toBe("node_1");
			expect(state.nodes[1].type).toBe("input");
			expect(state.nodeIdCounter).toBe(2);
		});

		it("should use provided partial data", () => {
			const position = { x: 100, y: 200 };
			const data: NodeData = { label: "Custom Node", type: "Input" };
			act(() => {
				useGraphStore.getState().addNode({ position, data });
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(1);
			const newNode = state.nodes[0];
			expect(newNode.id).toBe("node_0");
			expect(newNode.position).toEqual(position);
			expect(newNode.data).toEqual(data);
			expect(state.nodeIdCounter).toBe(1);
		});
	});

	describe("addEdge", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ position: { x: 10, y: 10 } });
			});
		});

		it("should add an edge from a Connection object", () => {
			const connection: Connection = {
				source: "node_0",
				target: "node_1",
				sourceHandle: null,
				targetHandle: null,
			};
			act(() => {
				useGraphStore.getState().addEdge(connection);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1);
			const newEdge = state.edges[0];
			expect(newEdge.id).toMatch(/^reactflow__edge-node_0-node_1$/);
			expect(newEdge.source).toBe("node_0");
			expect(newEdge.target).toBe("node_1");
		});

		it("should add an edge from an Edge object, preserving its label", () => {
			const edgeWithoutLabel: Edge = {
				id: "custom-edge-1",
				source: "node_0",
				target: "node_1",
			};
			const edgeWithLabel: Edge = {
				id: "custom-edge-2",
				source: "node_1",
				target: "node_0",
				label: "Existing Label",
			};

			act(() => {
				useGraphStore.getState().addEdge(edgeWithoutLabel);
				useGraphStore.getState().addEdge(edgeWithLabel);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(2);

			const addedEdge1 = state.edges.find(e => e.id === "custom-edge-1");
			const addedEdge2 = state.edges.find(e => e.id === "custom-edge-2");

			expect(addedEdge1).toEqual({
				...edgeWithoutLabel,
				label: undefined, // Explicitly check label is undefined, not the default
				style: { stroke: "#b1b1b7", strokeWidth: 1 },
				animated: false,
				data: { type: undefined },
			});
			expect(addedEdge2).toEqual({
				...edgeWithLabel,
				label: "Existing Label", // Check existing label is preserved
				style: { stroke: "#b1b1b7", strokeWidth: 1 },
				animated: false,
				data: { type: undefined },
			});
		});
it("should add an edge with a default label from a Connection object", () => {
			const connection: Connection = {
				source: "node_0",
				target: "node_1",
				sourceHandle: null,
				targetHandle: null,
			};
			act(() => {
				useGraphStore.getState().addEdge(connection);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1);
			const newEdge = state.edges[0];
			expect(newEdge.label).toBe("New Edge");
			expect(newEdge.data?.type).toBeUndefined(); // Ensure type is still handled correctly
		});

		it("should not add duplicate edges", () => {
			const connection: Connection = {
				source: "node_0",
				target: "node_1",
				sourceHandle: null,
				targetHandle: null,
			};
			act(() => {
				useGraphStore.getState().addEdge(connection);
				useGraphStore.getState().addEdge(connection);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1);
		});
	});

	describe("onConnect", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ position: { x: 10, y: 10 } });
			});
		});

		it("should add an edge when called", () => {
			const connection: Connection = {
				source: "node_0",
				target: "node_1",
				sourceHandle: "a",
				targetHandle: "b",
			};
			act(() => {
				useGraphStore.getState().onConnect(connection);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1);
			const newEdge = state.edges[0];
			expect(newEdge.id).toMatch(/^reactflow__edge-node_0a-node_1b$/);
			expect(newEdge.source).toBe("node_0");
			expect(newEdge.target).toBe("node_1");
			expect(newEdge.sourceHandle).toBe("a");
			expect(newEdge.targetHandle).toBe("b");
		});
	});

	describe("hydrate", () => {
		it("should hydrate the store with persisted state", () => {
			const persistedState: Partial<GraphState> = {
				nodes: [
					{
						id: "p_node_1",
						position: { x: 10, y: 10 },
						data: { label: "Persisted Node", type: "Persisted" },
					},
				],
				edges: [
					{ id: "p_edge_1", source: "p_node_1", target: "p_node_1" },
				],
				viewport: { x: 100, y: 100, zoom: 2 },
				nodeIdCounter: 5,
				nodeTypes: ["PersistedNodeType"],
				edgeTypes: ["PersistedEdgeType"],
			};

			act(() => {
				useGraphStore.getState().hydrate(persistedState);
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toEqual(persistedState.nodes);
			expect(state.edges).toEqual([
				{
					...persistedState.edges![0],
					style: { stroke: "#b1b1b7", strokeWidth: 1 },
					animated: false,
				},
			]);
			expect(state.viewport).toEqual(persistedState.viewport);
			expect(state.nodeIdCounter).toBe(5);
			expect(state.nodeTypes).toEqual(["PersistedNodeType"]);
			expect(state.edgeTypes).toEqual(["PersistedEdgeType"]);
		});

		it("should reset to initial state if persisted state is empty or invalid", () => {
			act(() => {
				useGraphStore.getState().hydrate({});
			});
			let state = useGraphStore.getState();
			expect(state.nodes).toEqual([]);
			expect(state.edges).toEqual([]);
			expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
			expect(state.nodeIdCounter).toBe(0);
			expect(state.nodeTypes).toEqual([]);
			expect(state.edgeTypes).toEqual([]);

			act(() => {
				useGraphStore
					.getState()
					.hydrate({ nodeIdCounter: "invalid" as any });
			});
			state = useGraphStore.getState();
			expect(state.nodeIdCounter).toBe(0);
		});
	});
	describe("deleteElements", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ id: "node_0", position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ id: "node_1", position: { x: 10, y: 10 } });
				useGraphStore.getState().addNode({ id: "node_2", position: { x: 20, y: 20 } });
				useGraphStore.getState().addEdge({ id: "edge_01", source: "node_0", target: "node_1" });
				useGraphStore.getState().addEdge({ id: "edge_12", source: "node_1", target: "node_2" });
				useGraphStore.getState().addEdge({ id: "edge_02", source: "node_0", target: "node_2" });
			});
		});

		it("should delete specified nodes", () => {
			act(() => {
				useGraphStore.getState().deleteElements({
					nodesToDelete: [{ id: "node_1" }],
					edgesToDelete: [],
				});
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(2);
			expect(state.nodes.find((n) => n.id === "node_1")).toBeUndefined();
			expect(state.nodes.map((n) => n.id)).toEqual(["node_0", "node_2"]);
		});

		it("should delete specified edges", () => {
			act(() => {
				useGraphStore.getState().deleteElements({
					nodesToDelete: [],
					edgesToDelete: [{ id: "edge_01" }],
				});
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(2);
			expect(state.edges.find((e) => e.id === "edge_01")).toBeUndefined();
			expect(state.edges.map((e) => e.id)).toEqual(["edge_12", "edge_02"]);
			expect(state.nodes).toHaveLength(3);
		});

		it("should delete specified nodes and edges simultaneously", () => {
			act(() => {
				useGraphStore.getState().deleteElements({
					nodesToDelete: [{ id: "node_0" }],
					edgesToDelete: [{ id: "edge_12" }],
				});
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(2);
			expect(state.nodes.find((n) => n.id === "node_0")).toBeUndefined();
			expect(state.nodes.map((n) => n.id)).toEqual(["node_1", "node_2"]);

			expect(state.edges).toHaveLength(0);
			expect(state.edges.find((e) => e.id === "edge_01")).toBeUndefined();
			expect(state.edges.find((e) => e.id === "edge_12")).toBeUndefined();
			expect(state.edges.find((e) => e.id === "edge_02")).toBeUndefined();
		});

		it("should delete edges connected to deleted nodes", () => {
			act(() => {
				useGraphStore.getState().deleteElements({
					nodesToDelete: [{ id: "node_1" }],
					edgesToDelete: [],
				});
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(2);
			expect(state.nodes.map((n) => n.id)).toEqual(["node_0", "node_2"]);

			expect(state.edges).toHaveLength(1);
			expect(state.edges[0].id).toBe("edge_02");
			expect(state.edges.find((e) => e.id === "edge_01")).toBeUndefined();
			expect(state.edges.find((e) => e.id === "edge_12")).toBeUndefined();
		});

		it("should handle deleting non-existent elements gracefully", () => {
			const initialStateSnapshot = useGraphStore.getState();
			act(() => {
				useGraphStore.getState().deleteElements({
					nodesToDelete: [{ id: "node_nonexistent" }],
					edgesToDelete: [{ id: "edge_nonexistent" }],
				});
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toEqual(initialStateSnapshot.nodes);
			expect(state.edges).toEqual(initialStateSnapshot.edges);
		});
	});

	describe("updateNodeData", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({
					id: "node_to_update",
					position: { x: 0, y: 0 },
					data: { label: "Initial Label", type: "Initial Type" },
				});
			});
		});

		it("should update only the node label", () => {
			const nodeId = "node_to_update";
			const newLabel = "Updated Label";
			act(() => {
				useGraphStore.getState().updateNodeData(nodeId, { label: newLabel });
			});

			const state = useGraphStore.getState();
			const updatedNode = state.nodes.find((n) => n.id === nodeId);
			expect(updatedNode?.data.label).toBe(newLabel);
			expect(updatedNode?.data.type).toBe("Initial Type");
		});

		it("should update only the node type", () => {
			const nodeId = "node_to_update";
			const newType = "Updated Type";
			act(() => {
				useGraphStore.getState().updateNodeData(nodeId, { type: newType });
			});

			const state = useGraphStore.getState();
			const updatedNode = state.nodes.find((n) => n.id === nodeId);
			expect(updatedNode?.data.label).toBe("Initial Label");
			expect(updatedNode?.data.type).toBe(newType);
		});

		it("should update both node label and type", () => {
			const nodeId = "node_to_update";
			const newLabel = "Updated Label";
			const newType = "Updated Type";
			act(() => {
				useGraphStore
					.getState()
					.updateNodeData(nodeId, { label: newLabel, type: newType });
			});

			const state = useGraphStore.getState();
			const updatedNode = state.nodes.find((n) => n.id === nodeId);
			expect(updatedNode?.data.label).toBe(newLabel);
			expect(updatedNode?.data.type).toBe(newType);
		});

		it("should not update other nodes", () => {
			act(() => {
				useGraphStore.getState().addNode({
					id: "other_node",
					position: { x: 100, y: 100 },
					data: { label: "Other Label", type: "Other Type" },
				});
			});

			const nodeIdToUpdate = "node_to_update";
			const newLabel = "Updated Label";
			act(() => {
				useGraphStore
					.getState()
					.updateNodeData(nodeIdToUpdate, { label: newLabel });
			});

			const state = useGraphStore.getState();
			const otherNode = state.nodes.find((n) => n.id === "other_node");
			expect(otherNode?.data.label).toBe("Other Label");
			expect(otherNode?.data.type).toBe("Other Type");
		});

		it("should handle updating a non-existent node gracefully", () => {
			const initialStateSnapshot = useGraphStore.getState();
			const nonExistentNodeId = "node_does_not_exist";
			act(() => {
				useGraphStore
					.getState()
					.updateNodeData(nonExistentNodeId, { label: "Doesn't Matter" });
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toEqual(initialStateSnapshot.nodes);
		});
	});

	describe("setSelectedNodeId", () => {
		it("should set the selected node ID and clear selected edge ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedEdgeId("some-edge-id");
				useGraphStore.getState().setSelectedNodeId("node_1");
			});
			const state = useGraphStore.getState();
			expect(state.selectedNodeId).toBe("node_1");
			expect(state.selectedEdgeId).toBeNull();
		});

		it("should clear the selected node ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedNodeId("node_1");
				useGraphStore.getState().setSelectedNodeId(null);
			});
			const state = useGraphStore.getState();
			expect(state.selectedNodeId).toBeNull();
			expect(state.selectedEdgeId).toBeNull();
		});
	});

	describe("setSelectedEdgeId", () => {
		it("should set the selected edge ID and clear selected node ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedNodeId("some-node-id");
				useGraphStore.getState().setSelectedEdgeId("edge_1");
			});
			const state = useGraphStore.getState();
			expect(state.selectedEdgeId).toBe("edge_1");
			expect(state.selectedNodeId).toBeNull();
		});

		it("should clear the selected edge ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedEdgeId("edge_1");
				useGraphStore.getState().setSelectedEdgeId(null);
			});
			const state = useGraphStore.getState();
			expect(state.selectedEdgeId).toBeNull();
			expect(state.selectedNodeId).toBeNull();
		});
	});

	describe("updateEdgeLabel", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ id: "n1", position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ id: "n2", position: { x: 10, y: 10 } });
				useGraphStore.getState().addEdge({ id: "e1-2", source: "n1", target: "n2", label: "Initial" });
				useGraphStore.getState().addEdge({ id: "e2-1", source: "n2", target: "n1", label: "Another" });
			});
		});

		it("should update the label of the specified edge", () => {
			const edgeIdToUpdate = "e1-2";
			const newLabel = "Updated Label";
			act(() => {
				useGraphStore.getState().updateEdgeLabel(edgeIdToUpdate, newLabel);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			const otherEdge = state.edges.find((e) => e.id === "e2-1");

			expect(updatedEdge?.label).toBe(newLabel);
			expect(otherEdge?.label).toBe("Another");
		});

		it("should handle updating a non-existent edge gracefully", () => {
			const initialStateSnapshot = useGraphStore.getState();
			const nonExistentEdgeId = "edge_does_not_exist";
			act(() => {
				useGraphStore.getState().updateEdgeLabel(nonExistentEdgeId, "Doesn't Matter");
			});

			const state = useGraphStore.getState();
			expect(state.edges).toEqual(initialStateSnapshot.edges);
		});

		it("should update label to an empty string", () => {
			const edgeIdToUpdate = "e1-2";
			const newLabel = "";
			act(() => {
				useGraphStore.getState().updateEdgeLabel(edgeIdToUpdate, newLabel);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge?.label).toBe("");
		});
	});
});

describe("hydrate with types", () => {
		it("should hydrate nodes with type property", () => {
			const stateToHydrate: Partial<GraphState> = {
				nodes: [
					{ id: "n1", position: { x: 0, y: 0 }, data: { label: "N1" }, type: "customNodeType" },
					{ id: "n2", position: { x: 10, y: 10 }, data: { label: "N2" } },
				],
				edges: [],
				viewport: { x: 0, y: 0, zoom: 1 },
			};
			act(() => {
				useGraphStore.getState().hydrate(stateToHydrate);
			});
			const state = useGraphStore.getState();
			expect(state.nodes[0].type).toBe("customNodeType");
			expect(state.nodes[1].type).toBeUndefined();
		});

		it("should hydrate edges with type property and apply styles", () => {
			const stateToHydrate: Partial<GraphState> = {
				nodes: [
					{ id: "n1", position: { x: 0, y: 0 }, data: { label: "N1" } },
					{ id: "n2", position: { x: 10, y: 10 }, data: { label: "N2" } },
				],
				edges: [
					{ id: "e1", source: "n1", target: "n2", data: { type: "dependency" } },
					{ id: "e2", source: "n2", target: "n1", data: { type: "composition" } },
					{ id: "e3", source: "n1", target: "n1" },
				],
				viewport: { x: 0, y: 0, zoom: 1 },
			};
			act(() => {
				useGraphStore.getState().hydrate(stateToHydrate);
			});
			const state = useGraphStore.getState();
			const edge1 = state.edges.find(e => e.id === "e1");
			const edge2 = state.edges.find(e => e.id === "e2");
			const edge3 = state.edges.find(e => e.id === "e3");

			expect(edge1?.data?.type).toBe("dependency");
			expect(edge1?.style).toEqual({ stroke: "#ff0072", strokeWidth: 2 });
			expect(edge1?.animated).toBe(false);

			expect(edge2?.data?.type).toBe("composition");
			expect(edge2?.style).toEqual({ stroke: "#007fff", strokeWidth: 1 });
			expect(edge2?.animated).toBe(true);

			expect(edge3?.data?.type).toBeUndefined();
			expect(edge3?.style).toEqual({ stroke: "#b1b1b7", strokeWidth: 1 });
			expect(edge3?.animated).toBe(false);
		});

		it("should hydrate gracefully when type properties are missing (backward compatibility)", () => {
			const stateToHydrate: Partial<GraphState> = {
				nodes: [
					{ id: "n1", position: { x: 0, y: 0 }, data: { label: "N1" } },
				],
				edges: [
					{ id: "e1", source: "n1", target: "n1" },
				],
				viewport: { x: 0, y: 0, zoom: 1 },
			};
			act(() => {
				useGraphStore.getState().hydrate(stateToHydrate);
			});
			const state = useGraphStore.getState();
			const node1 = state.nodes.find(n => n.id === "n1");
			const edge1 = state.edges.find(e => e.id === "e1");

			expect(node1?.type).toBeUndefined();
			expect(edge1?.data?.type).toBeUndefined();
			expect(edge1?.style).toEqual({ stroke: "#b1b1b7", strokeWidth: 1 });
			expect(edge1?.animated).toBe(false);
		});
	});

describe("updateEdgeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ id: "n1", position: { x: 0, y: 0 } });
				useGraphStore.getState().addNode({ id: "n2", position: { x: 10, y: 10 } });
				useGraphStore.getState().addEdge({ id: "e1-2", source: "n1", target: "n2", data: { type: "initialType" } });
				useGraphStore.getState().addEdge({ id: "e2-1", source: "n2", target: "n1" });
			});
		});

		it("should update the type of the specified edge", () => {
			const edgeIdToUpdate = "e1-2";
			const newType = "updatedType";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			const otherEdge = state.edges.find((e) => e.id === "e2-1");

			expect(updatedEdge?.data?.type).toBe(newType);
			expect(updatedEdge?.style).toEqual({ stroke: "#b1b1b7", strokeWidth: 1 });
			expect(updatedEdge?.animated).toBe(false);
			expect(otherEdge?.data?.type).toBeUndefined();
		});

		it("should update the type and style/animation of an edge that initially had no type", () => {
			const edgeIdToUpdate = "e2-1";
			const newType = "newlySetType";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge?.data?.type).toBe(newType);
			expect(updatedEdge?.style).toEqual({ stroke: "#b1b1b7", strokeWidth: 1 });
			expect(updatedEdge?.animated).toBe(false);
		});

		it("should update type and style/animation for specific types", () => {
			const edgeIdToUpdate = "e1-2";
			const newType = "dependency";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType);
			});
			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge?.data?.type).toBe(newType);
			expect(updatedEdge?.style).toEqual({ stroke: "#ff0072", strokeWidth: 2 });
			expect(updatedEdge?.animated).toBe(false);

			const newType2 = "composition";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType2);
			});
			const state2 = useGraphStore.getState();
			const updatedEdge2 = state2.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge2?.data?.type).toBe(newType2);
			expect(updatedEdge2?.style).toEqual({ stroke: "#007fff", strokeWidth: 1 });
			expect(updatedEdge2?.animated).toBe(true);
		});


		it("should handle updating a non-existent edge gracefully", () => {
			const initialStateSnapshot = useGraphStore.getState();
			const nonExistentEdgeId = "edge_does_not_exist";
			act(() => {
				useGraphStore.getState().updateEdgeType(nonExistentEdgeId, "Doesn't Matter");
			});

			const state = useGraphStore.getState();
			expect(state.edges).toEqual(initialStateSnapshot.edges);
		});

		it("should update type to an empty string", () => {
			const edgeIdToUpdate = "e1-2";
			const newType = "";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge?.data?.type).toBe("");
			expect(updatedEdge?.style).toEqual({ stroke: "#b1b1b7", strokeWidth: 1 });
			expect(updatedEdge?.animated).toBe(false);
		});
	});

describe("Type Management", () => {
	describe("addNodeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.setState({ nodeTypes: [] });
			});
		});

		it("should add a new node type if it does not exist", () => {
			act(() => {
				useGraphStore.getState().addNodeType("NewType");
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toContain("NewType");
			expect(state.nodeTypes).toHaveLength(1);
		});

		it("should not add a node type if it already exists", () => {
			act(() => {
				useGraphStore.getState().addNodeType("ExistingType");
				useGraphStore.getState().addNodeType("ExistingType");
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual(["ExistingType"]);
			expect(state.nodeTypes).toHaveLength(1);
		});

		it("should not add an empty or whitespace-only node type", () => {
			act(() => {
				useGraphStore.getState().addNodeType("");
				useGraphStore.getState().addNodeType("   ");
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual([]);
		});
	});

	describe("removeNodeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.setState({ nodeTypes: ["Type1", "Type2", "Type3"] });
			});
		});

		it("should remove an existing node type", () => {
			act(() => {
				useGraphStore.getState().removeNodeType("Type2");
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual(["Type1", "Type3"]);
			expect(state.nodeTypes).toHaveLength(2);
		});

		it("should not change the array if the type does not exist", () => {
			act(() => {
				useGraphStore.getState().removeNodeType("NonExistentType");
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual(["Type1", "Type2", "Type3"]);
			expect(state.nodeTypes).toHaveLength(3);
		});
	});

	describe("addEdgeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.setState({ edgeTypes: [] });
			});
		});

		it("should add a new edge type if it does not exist", () => {
			act(() => {
				useGraphStore.getState().addEdgeType("NewEdgeType");
			});
			const state = useGraphStore.getState();
			expect(state.edgeTypes).toContain("NewEdgeType");
			expect(state.edgeTypes).toHaveLength(1);
		});

		it("should not add an edge type if it already exists", () => {
			act(() => {
				useGraphStore.getState().addEdgeType("ExistingEdgeType");
				useGraphStore.getState().addEdgeType("ExistingEdgeType");
			});
			const state = useGraphStore.getState();
			expect(state.edgeTypes).toEqual(["ExistingEdgeType"]);
			expect(state.edgeTypes).toHaveLength(1);
		});

		it("should not add an empty or whitespace-only edge type", () => {
			act(() => {
				useGraphStore.getState().addEdgeType("");
				useGraphStore.getState().addEdgeType("   ");
			});
			const state = useGraphStore.getState();
			expect(state.edgeTypes).toEqual([]);
		});
	});

	describe("removeEdgeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.setState({ edgeTypes: ["EdgeType1", "EdgeType2", "EdgeType3"] });
			});
		});

		it("should remove an existing edge type", () => {
			act(() => {
				useGraphStore.getState().removeEdgeType("EdgeType2");
			});
			const state = useGraphStore.getState();
			expect(state.edgeTypes).toEqual(["EdgeType1", "EdgeType3"]);
			expect(state.edgeTypes).toHaveLength(2);
		});

		it("should not change the array if the type does not exist", () => {
			act(() => {
				useGraphStore.getState().removeEdgeType("NonExistentEdgeType");
			});
			const state = useGraphStore.getState();
			expect(state.edgeTypes).toEqual(["EdgeType1", "EdgeType2", "EdgeType3"]);
			expect(state.edgeTypes).toHaveLength(3);
		});
	});

	describe("hydrate with type arrays", () => {
		it("should hydrate nodeTypes and edgeTypes correctly", () => {
			const persistedState: Partial<GraphState> = {
				nodes: [],
				edges: [],
				nodeTypes: ["PersistedNode1", "PersistedNode2"],
				edgeTypes: ["PersistedEdge1"],
			};
			act(() => {
				useGraphStore.getState().hydrate(persistedState);
			});
			const state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual(["PersistedNode1", "PersistedNode2"]);
			expect(state.edgeTypes).toEqual(["PersistedEdge1"]);
		});

		it("should hydrate with empty arrays if types are missing or not arrays", () => {
			act(() => {
				useGraphStore.getState().hydrate({ nodes: [], edges: [] });
			});
			let state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual([]);
			expect(state.edgeTypes).toEqual([]);

			act(() => {
				useGraphStore.getState().hydrate({ nodeTypes: "invalid" as any, edgeTypes: null as any });
			});
			state = useGraphStore.getState();
			expect(state.nodeTypes).toEqual([]);
			expect(state.edgeTypes).toEqual([]);
		});
	});
});
