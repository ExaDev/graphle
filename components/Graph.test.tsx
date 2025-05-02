import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import Graph from "./Graph";

describe("Graph Component", () => {
	const project = { id: "1", name: "Test Project" };
	const view = { id: "1", name: "Test View" };

	it("renders without crashing", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		expect(screen.getByText("Graph")).toBeInTheDocument();
	});

	it("adds a node", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		expect(screen.getByText("New Node")).toBeInTheDocument();
	});

	it("removes a node", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Remove Node"));
		expect(screen.queryByText("New Node")).not.toBeInTheDocument();
	});

	it("updates a node", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Update Node"));
		expect(screen.getByText("Updated Node")).toBeInTheDocument();
	});

	it("adds an edge", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Edge"));
		expect(
			screen.getByText("Edge from undefined to undefined")
		).toBeInTheDocument();
	});

	it("removes an edge", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Edge"));
		fireEvent.click(screen.getByText("Remove Edge"));
		expect(
			screen.queryByText("Edge from undefined to undefined")
		).not.toBeInTheDocument();
	});

	it("updates an edge", () => {
		render(
			<Graph
				project={project}
				view={view}
				onProjectChange={() => {}}
				onViewChange={() => {}}
			/>
		);
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Node"));
		fireEvent.click(screen.getByText("Add Edge"));
		fireEvent.click(screen.getByText("Update Edge"));
		expect(screen.getByText("Updated Edge")).toBeInTheDocument();
	});
});
