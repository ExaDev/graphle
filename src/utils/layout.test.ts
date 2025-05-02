import type { Edge, Node } from "reactflow";
import { describe, expect, it } from "vitest";
import { getLayoutedElements } from "./layout";

describe("getLayoutedElements", () => {
	it("should return an empty array for an empty graph", () => {
		const nodes: Node[] = [];
		const edges: Edge[] = [];
		const layoutedElements = getLayoutedElements(nodes, edges);
		expect(layoutedElements).toEqual([]);
	});

	it("should return nodes with calculated positions for a simple graph", () => {
		const nodes: Node[] = [
			{ id: "1", position: { x: 0, y: 0 }, data: { label: "Node 1" } },
			{ id: "2", position: { x: 0, y: 0 }, data: { label: "Node 2" } },
		];
		const edges: Edge[] = [{ id: "e1-2", source: "1", target: "2" }];

		const layoutedElements = getLayoutedElements(nodes, edges);

		expect(layoutedElements).toHaveLength(2);
		expect(layoutedElements.map((n) => n.id).sort()).toEqual(["1", "2"]);

		layoutedElements.forEach((node) => {
			expect(node.position).toBeDefined();
			expect(typeof node.position.x).toBe("number");
			expect(typeof node.position.y).toBe("number");
			expect(node.data).toEqual(
				nodes.find((n) => n.id === node.id)?.data
			);
		});
	});

	it("should return nodes with calculated positions when there are no edges", () => {
		const nodes: Node[] = [
			{ id: "a", position: { x: 0, y: 0 }, data: { label: "Node A" } },
			{ id: "b", position: { x: 0, y: 0 }, data: { label: "Node B" } },
		];
		const edges: Edge[] = [];

		const layoutedElements = getLayoutedElements(nodes, edges);

		expect(layoutedElements).toHaveLength(2);
		expect(layoutedElements.map((n) => n.id).sort()).toEqual(["a", "b"]);

		layoutedElements.forEach((node) => {
			expect(node.position).toBeDefined();
			expect(typeof node.position.x).toBe("number");
			expect(typeof node.position.y).toBe("number");
			expect(node.data).toEqual(
				nodes.find((n) => n.id === node.id)?.data
			);
		});
	});
});
