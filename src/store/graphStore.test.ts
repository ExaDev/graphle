import { act } from "@testing-library/react";
import { Connection, Edge } from "reactflow";
import { beforeEach, describe, expect, it } from "vitest";
import { GraphState, initialState, useGraphStore } from "./graphStore"; // Import initialState

// Helper to reset store data properties before each test
const resetStore = () => {
	act(() => {
		// Reset only the data properties to their initial values
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
			expect(newNode.type).toBe("default");
			expect(newNode.position).toBeDefined(); // Position is random but should exist
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
			// Add nodes required for edges
			act(() => {
				useGraphStore.getState().addNode({}); // node_0
				useGraphStore.getState().addNode({}); // node_1
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
			// Corrected Regex: Handles are omitted from ID if null
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
				useGraphStore.getState().addEdge(connection); // Try adding again
			});

			const state = useGraphStore.getState();
			expect(state.edges).toHaveLength(1); // Should still only be 1
		});
	});

	describe("onConnect", () => {
		beforeEach(() => {
			act(() => {
				useGraphStore.getState().addNode({}); // node_0
				useGraphStore.getState().addNode({}); // node_1
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
				useGraphStore.getState().hydrate({}); // Empty object
			});
			let state = useGraphStore.getState();
			expect(state.nodes).toEqual([]);
			expect(state.edges).toEqual([]);
			expect(state.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
			expect(state.nodeIdCounter).toBe(0);

			act(() => {
				useGraphStore
					.getState()
					.hydrate({ nodeIdCounter: "invalid" as any }); // Invalid counter
			});
			state = useGraphStore.getState();
			expect(state.nodeIdCounter).toBe(0);
		});
	});
});
