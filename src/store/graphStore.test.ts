import { act } from "@testing-library/react";
import { Connection, Edge } from "reactflow";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphState, initialState, useGraphStore } from "./graphStore";

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
			expect(newNode.data).toEqual({ label: "Node 0" });
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
			const data = { label: "Custom Node" };
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
			expect(state.edges[0]).toEqual(edge);
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
					{ id: "p_node_1", position: { x: 10, y: 10 }, data: {} },
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
			expect(state.edges).toEqual(persistedState.edges);
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
});
