import { GraphState, initialState, useGraphStore } from "@/store/graphStore";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Connection, ReactFlowProps } from "reactflow";
import { beforeEach, describe, expect, it, Mock, vi } from "vitest";
import Graph from "./Graph";

vi.mock("@/store/graphStore");

vi.mock("reactflow", async () => {
	const actual = await vi.importActual("reactflow");
	return {
		...actual,
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
		default: (props: ReactFlowProps & { "data-testid"?: string }) => (
			<div data-testid={props["data-testid"] ?? "reactflow-mock"}>
				{props.children}
			</div>
		),
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
});
