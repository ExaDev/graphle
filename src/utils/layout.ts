import dagre from "dagre";
import { Edge, Node } from "reactflow";

const nodeWidth = 150;
const nodeHeight = 50;

export const getLayoutedElements = (nodes: Node[], edges: Edge[]): Node[] => {
	const dagreGraph = new dagre.graphlib.Graph();
	dagreGraph.setDefaultEdgeLabel(() => ({}));
	dagreGraph.setGraph({ rankdir: "TB", nodesep: 60, ranksep: 60 });

	nodes.forEach((node) => {
		dagreGraph.setNode(node.id, { width: nodeWidth, height: nodeHeight });
	});

	edges.forEach((edge) => {
		dagreGraph.setEdge(edge.source, edge.target);
	});

	dagre.layout(dagreGraph);

	const layoutedNodes = nodes.map((node) => {
		const nodeWithPosition = dagreGraph.node(node.id);
		const position = {
			x: nodeWithPosition.x - nodeWidth / 2,
			y: nodeWithPosition.y - nodeHeight / 2,
		};

		return { ...node, position };
	});

	return layoutedNodes;
};
