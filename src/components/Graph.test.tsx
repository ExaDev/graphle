import { GraphState, initialState, useGraphStore } from "@/store/graphStore";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Connection, Edge, Node, ReactFlowProps } from "reactflow";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import Graph from "./Graph";

vi.mock("@/store/graphStore");

let capturedProps: ReactFlowProps | null = null;

vi.mock("reactflow", async () => {
	const actual = await vi.importActual("reactflow");
	const ReactFlowMock = (props: ReactFlowProps & { "data-testid"?: string }) => {
		capturedProps = props;
		return (
			<div data-testid={props["data-testid"] ?? "reactflow-mock"}>
				{props.children}
			</div>
		);
	};
	return {
		...actual,
		default: ReactFlowMock,
	};
});

describe("Graph Component", () => {
	let mockOnNodesChange: Mock;
	let mockOnEdgesChange: Mock;
	let mockAddEdge: Mock;
	let mockOnConnect: Mock;
	let mockSetNodes: Mock;
	let mockSetEdges: Mock;
	let mockSetViewport: Mock;
	let mockAddNode: Mock;
	let mockHydrate: Mock;
	let mockDeleteElements: Mock;
	let mockUpdateNodeData: Mock; // Renamed from mockUpdateNodeLabel for consistency
	let mockUpdateEdgeLabel: Mock;
	let mockUpdateEdgeType: Mock; // Added mock for edge type update
	let mockSetSelectedNodeId: Mock;
	let mockSetSelectedEdgeId: Mock;

	const resetStoreMock = () => {
		mockOnNodesChange = vi.fn();
		mockOnEdgesChange = vi.fn();
		mockAddEdge = vi.fn();
		mockOnConnect = vi.fn((connection) => mockAddEdge(connection));
		mockSetNodes = vi.fn();
		mockSetEdges = vi.fn();
		mockSetViewport = vi.fn();
		mockAddNode = vi.fn();
		mockHydrate = vi.fn();
		mockDeleteElements = vi.fn();
		mockUpdateNodeData = vi.fn();
		mockUpdateEdgeLabel = vi.fn();
		mockUpdateEdgeType = vi.fn(); // Initialize mock
		mockSetSelectedNodeId = vi.fn();
		mockSetSelectedEdgeId = vi.fn();

		const mockState: GraphState = {
			...initialState,
			onNodesChange: mockOnNodesChange,
			onEdgesChange: mockOnEdgesChange,
			onConnect: mockOnConnect,
			setNodes: mockSetNodes,
			setEdges: mockSetEdges,
			setViewport: mockSetViewport,
			addNode: mockAddNode,
			addEdge: mockAddEdge,
			hydrate: mockHydrate,
			deleteElements: mockDeleteElements,
			updateNodeData: mockUpdateNodeData,
			updateEdgeLabel: mockUpdateEdgeLabel,
			updateEdgeType: mockUpdateEdgeType, // Add mock to state
			setSelectedNodeId: mockSetSelectedNodeId,
			setSelectedEdgeId: mockSetSelectedEdgeId,
		};

		(useGraphStore as unknown as Mock).mockImplementation(
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			(selector?: (state: GraphState) => any) => {
				if (selector) {
					return selector(mockState);
				}
				return mockState;
			}
		);

		useGraphStore.setState(initialState);
	};

	beforeEach(() => {
		resetStoreMock();
		vi.clearAllMocks();
		capturedProps = null;
	});

	it("renders the Add Node button and ReactFlow", () => {
		render(<Graph />);
		expect(
			screen.getByRole("button", { name: /add node/i })
		).toBeInTheDocument();
		expect(screen.getByTestId("reactflow-mock")).toBeInTheDocument();
	});

	it('calls addNode from the store when "Add Node" button is clicked', () => {
		render(<Graph />);
		const addButton = screen.getByRole("button", { name: /add node/i });
		fireEvent.click(addButton);

		expect(mockAddNode).toHaveBeenCalledTimes(1);
		expect(mockAddNode).toHaveBeenCalledWith({});
	});

	it("calls onConnect from the store when ReactFlow's onConnect is triggered", () => {
		render(<Graph />);

		const onConnectProp = useGraphStore((state) => state.onConnect);

		const testConnection: Connection = {
			source: "node_0",
			target: "node_1",
			sourceHandle: "a",
			targetHandle: "b",
		};

		expect(onConnectProp).toBeInstanceOf(Function);

		act(() => {
			if (onConnectProp) {
				onConnectProp(testConnection);
			}
		});

		expect(mockOnConnect).toHaveBeenCalledTimes(1);
		expect(mockOnConnect).toHaveBeenCalledWith(testConnection);
		expect(mockAddEdge).toHaveBeenCalledTimes(1);
		expect(mockAddEdge).toHaveBeenCalledWith(testConnection);
	});
it("calls deleteElements from the store when ReactFlow's onNodesDelete is triggered", () => {
	render(<Graph />);

	expect(capturedProps).not.toBeNull();
	expect(capturedProps?.onNodesDelete).toBeInstanceOf(Function);

	const nodesToDelete: Node[] = [
		{ id: "node_1", position: { x: 0, y: 0 }, data: {} },
		{ id: "node_2", position: { x: 0, y: 0 }, data: {} },
	];

	act(() => {
		if (capturedProps?.onNodesDelete) {
			capturedProps.onNodesDelete(nodesToDelete);
			}
		});

		expect(mockDeleteElements).toHaveBeenCalledTimes(1);
		expect(mockDeleteElements).toHaveBeenCalledWith({
			nodesToDelete,
			edgesToDelete: [],
		});
	});

	it("calls deleteElements from the store when ReactFlow's onEdgesDelete is triggered", () => {
		render(<Graph />);

		expect(capturedProps).not.toBeNull();
		expect(capturedProps?.onEdgesDelete).toBeInstanceOf(Function);

		const edgesToDelete: Edge[] = [
			{ id: "edge_1", source: "a", target: "b" },
			{ id: "edge_2", source: "c", target: "d" },
		];

		act(() => {
			if (capturedProps?.onEdgesDelete) {
				capturedProps.onEdgesDelete(edgesToDelete);
			}
		});

		expect(mockDeleteElements).toHaveBeenCalledTimes(1);
		expect(mockDeleteElements).toHaveBeenCalledWith({
			nodesToDelete: [],
			edgesToDelete,
		});
	});

	it("calls setSelectedNodeId from the store when ReactFlow's onNodeClick is triggered", () => {
		render(<Graph />);

		expect(capturedProps).not.toBeNull();
		expect(capturedProps?.onNodeClick).toBeInstanceOf(Function);

		const nodeToClick: Node = {
			id: "node_to_click",
			position: { x: 0, y: 0 },
			data: { label: "Click Me" },
		};
		const mockEvent = {} as React.MouseEvent; // Mock event object

		act(() => {
			if (capturedProps?.onNodeClick) {
				capturedProps.onNodeClick(mockEvent, nodeToClick);
			}
		});

		expect(mockSetSelectedNodeId).toHaveBeenCalledTimes(1);
		expect(mockSetSelectedNodeId).toHaveBeenCalledWith(nodeToClick.id);
	});

	it("calls setSelectedEdgeId from the store when ReactFlow's onEdgeClick is triggered", () => {
		render(<Graph />);

		expect(capturedProps).not.toBeNull();
		expect(capturedProps?.onEdgeClick).toBeInstanceOf(Function);

		const edgeToClick: Edge = {
			id: "edge_to_click",
			source: "a",
			target: "b",
			label: "Click Me",
		};
		const mockEvent = {} as React.MouseEvent; // Mock event object

		act(() => {
			if (capturedProps?.onEdgeClick) {
				capturedProps.onEdgeClick(mockEvent, edgeToClick);
			}
		});

		expect(mockSetSelectedEdgeId).toHaveBeenCalledTimes(1);
		expect(mockSetSelectedEdgeId).toHaveBeenCalledWith(edgeToClick.id);
	});
});
