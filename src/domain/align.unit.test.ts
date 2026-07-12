import { describe, expect, it } from "vitest";

import { alignNodes, distributeNodes, type PositionedNode } from "./align";

function node(id: string, x: number, y: number): PositionedNode {
  return { id, position: { x, y } };
}

describe("alignNodes", () => {
  const nodes = [node("a", 10, 100), node("b", 50, 20), node("c", 30, 60)];

  it("left: sets every x to the minimum x, leaves y untouched", () => {
    const moves = alignNodes(nodes, "left");
    expect(moves).toEqual([
      { id: "a", position: { x: 10, y: 100 } },
      { id: "b", position: { x: 10, y: 20 } },
      { id: "c", position: { x: 10, y: 60 } },
    ]);
  });

  it("right: sets every x to the maximum x, leaves y untouched", () => {
    const moves = alignNodes(nodes, "right");
    expect(moves).toEqual([
      { id: "a", position: { x: 50, y: 100 } },
      { id: "b", position: { x: 50, y: 20 } },
      { id: "c", position: { x: 50, y: 60 } },
    ]);
  });

  it("top: sets every y to the minimum y, leaves x untouched", () => {
    const moves = alignNodes(nodes, "top");
    expect(moves).toEqual([
      { id: "a", position: { x: 10, y: 20 } },
      { id: "b", position: { x: 50, y: 20 } },
      { id: "c", position: { x: 30, y: 20 } },
    ]);
  });

  it("bottom: sets every y to the maximum y, leaves x untouched", () => {
    const moves = alignNodes(nodes, "bottom");
    expect(moves).toEqual([
      { id: "a", position: { x: 10, y: 100 } },
      { id: "b", position: { x: 50, y: 100 } },
      { id: "c", position: { x: 30, y: 100 } },
    ]);
  });

  it("centerX: sets every x to the average x, leaves y untouched", () => {
    const moves = alignNodes(nodes, "centerX");
    const averageX = (10 + 50 + 30) / 3;
    expect(moves).toEqual([
      { id: "a", position: { x: averageX, y: 100 } },
      { id: "b", position: { x: averageX, y: 20 } },
      { id: "c", position: { x: averageX, y: 60 } },
    ]);
  });

  it("centerY: sets every y to the average y, leaves x untouched", () => {
    const moves = alignNodes(nodes, "centerY");
    const averageY = (100 + 20 + 60) / 3;
    expect(moves).toEqual([
      { id: "a", position: { x: 10, y: averageY } },
      { id: "b", position: { x: 50, y: averageY } },
      { id: "c", position: { x: 30, y: averageY } },
    ]);
  });
});

describe("distributeNodes", () => {
  it("horizontal: spaces nodes evenly between the min and max x, leaving y untouched", () => {
    const nodes = [node("mid", 40, 5), node("left", 0, 1), node("right", 100, 9)];
    const moves = distributeNodes(nodes, "horizontal");
    const byId = new Map(moves.map((move) => [move.id, move]));

    expect(byId.get("left")?.position).toEqual({ x: 0, y: 1 });
    expect(byId.get("right")?.position).toEqual({ x: 100, y: 9 });
    expect(byId.get("mid")?.position).toEqual({ x: 50, y: 5 });
  });

  it("vertical: spaces nodes evenly between the min and max y, leaving x untouched", () => {
    const nodes = [node("mid", 5, 40), node("top", 1, 0), node("bottom", 9, 100)];
    const moves = distributeNodes(nodes, "vertical");
    const byId = new Map(moves.map((move) => [move.id, move]));

    expect(byId.get("top")?.position).toEqual({ x: 1, y: 0 });
    expect(byId.get("bottom")?.position).toEqual({ x: 9, y: 100 });
    expect(byId.get("mid")?.position).toEqual({ x: 5, y: 50 });
  });

  it("horizontal: spaces four nodes into equal gaps between min and max", () => {
    const nodes = [node("a", 0, 0), node("b", 90, 0), node("c", 30, 0), node("d", 60, 0)];
    const moves = distributeNodes(nodes, "horizontal");
    const xs = moves.map((move) => move.position.x).sort((a, b) => a - b);
    expect(xs).toEqual([0, 30, 60, 90]);
  });

  it("is a no-op with fewer than 3 nodes (empty)", () => {
    const nodes: PositionedNode[] = [];
    expect(distributeNodes(nodes, "horizontal")).toEqual([]);
  });

  it("is a no-op with fewer than 3 nodes (one node)", () => {
    const nodes = [node("a", 5, 5)];
    expect(distributeNodes(nodes, "horizontal")).toEqual([
      { id: "a", position: { x: 5, y: 5 } },
    ]);
  });

  it("is a no-op with fewer than 3 nodes (two nodes)", () => {
    const nodes = [node("a", 5, 5), node("b", 20, 20)];
    expect(distributeNodes(nodes, "vertical")).toEqual([
      { id: "a", position: { x: 5, y: 5 } },
      { id: "b", position: { x: 20, y: 20 } },
    ]);
  });
});
