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
	});

	describe("addNode", () => {
		it("should add a node with default values and increment counter", () => {
			act(() => {
				useGraphStore.getState().addNode({});
			});

			const state = useGraphStore.getState();
			expect(state.nodes).toHaveLength(1);
			const newNode = state.nodes[0];
			expect(newNode.id).toBe("node_0");
			expect(newNode.data).toEqual({ label: "Node 0", type: "" }); // Check default type
			expect(newNode.type).toBe("editableNode");
			expect(newNode.position).toBeDefined();
			expect(state.nodeIdCounter).toBe(1);
		});

		it("should add multiple nodes with unique IDs", () => {
			act(() => {
				useGraphStore.getState().addNode({});
				useGraphStore.getState().addNode({ type: "input" });
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
				useGraphStore.getState().addNode({});
				useGraphStore.getState().addNode({});
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

		it("should add an edge from an Edge object", () => {
			const edge: Edge = {
				id: "custom-edge-1",
				source: "node_0",
				target: "node_1",
			};
			act(() => {
				useGraphStore.getState().addEdge(edge);
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1);
			expect(state.edges[0]).toEqual({
				...edge,
				style: { stroke: "#b1b1b7", strokeWidth: 1 },
				animated: false,
				data: { type: undefined },
			});
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
				useGraphStore.getState().addNode({});
				useGraphStore.getState().addNode({});
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
						data: { label: "Persisted Node", type: "Persisted" }, // Add required data
					},
				],
				edges: [
					{ id: "p_edge_1", source: "p_node_1", target: "p_node_1" },
				],
				viewport: { x: 100, y: 100, zoom: 2 },
				nodeIdCounter: 5,
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
				useGraphStore.getState().addNode({ id: "node_0" });
				useGraphStore.getState().addNode({ id: "node_1" });
				useGraphStore.getState().addNode({ id: "node_2" });
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
				// Add a node to update
				useGraphStore.getState().addNode({
					id: "node_to_update",
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
			expect(updatedNode?.data.type).toBe("Initial Type"); // Type should remain unchanged
		});

		it("should update only the node type", () => {
			const nodeId = "node_to_update";
			const newType = "Updated Type";
			act(() => {
				useGraphStore.getState().updateNodeData(nodeId, { type: newType });
			});

			const state = useGraphStore.getState();
			const updatedNode = state.nodes.find((n) => n.id === nodeId);
			expect(updatedNode?.data.label).toBe("Initial Label"); // Label should remain unchanged
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
			// Add another node
			act(() => {
				useGraphStore.getState().addNode({
					id: "other_node",
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
				useGraphStore.getState().setSelectedEdgeId("some-edge-id"); // Pre-set edge
				useGraphStore.getState().setSelectedNodeId("node_1");
			});
			const state = useGraphStore.getState();
			expect(state.selectedNodeId).toBe("node_1");
			expect(state.selectedEdgeId).toBeNull();
		});

		it("should clear the selected node ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedNodeId("node_1"); // Pre-set node
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
				useGraphStore.getState().setSelectedNodeId("some-node-id"); // Pre-set node
				useGraphStore.getState().setSelectedEdgeId("edge_1");
			});
			const state = useGraphStore.getState();
			expect(state.selectedEdgeId).toBe("edge_1");
			expect(state.selectedNodeId).toBeNull();
		});

		it("should clear the selected edge ID", () => {
			act(() => {
				useGraphStore.getState().setSelectedEdgeId("edge_1"); // Pre-set edge
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
				useGraphStore.getState().addNode({ id: "n1" });
				useGraphStore.getState().addNode({ id: "n2" });
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
			expect(otherEdge?.label).toBe("Another"); // Ensure other edges are unaffected
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
describe("updateEdgeType", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({ id: "n1" });
				useGraphStore.getState().addNode({ id: "n2" });
				useGraphStore.getState().addEdge({ id: "e1-2", source: "n1", target: "n2", type: "initialType" });
				useGraphStore.getState().addEdge({ id: "e2-1", source: "n2", target: "n1" }); // Edge without initial type
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
			expect(otherEdge?.data?.type).toBeUndefined();
		});

		it("should update the type of an edge that initially had no type", () => {
			const edgeIdToUpdate = "e2-1";
			const newType = "newlySetType";
			act(() => {
				useGraphStore.getState().updateEdgeType(edgeIdToUpdate, newType);
			});

			const state = useGraphStore.getState();
			const updatedEdge = state.edges.find((e) => e.id === edgeIdToUpdate);
			expect(updatedEdge?.data?.type).toBe(newType);
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
		});
	});
