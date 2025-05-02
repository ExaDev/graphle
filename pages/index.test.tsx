import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import IndexPage from "./index";

describe("IndexPage Component", () => {
	it("renders without crashing", () => {
		render(<IndexPage />);
		expect(screen.getByText("Graphle")).toBeInTheDocument();
	});

	it("updates project name", () => {
		render(<IndexPage />);
		const input = screen.getByLabelText("Project Name:");
		fireEvent.change(input, { target: { value: "New Project" } });
		expect(input.value).toBe("New Project");
	});

	it("renders Graph component", () => {
		render(<IndexPage />);
		expect(screen.getByText("Graph")).toBeInTheDocument();
	});

	it("updates URL with encoded project and view", () => {
		render(<IndexPage />);
		const input = screen.getByLabelText("Project Name:");
		fireEvent.change(input, { target: { value: "New Project" } });
		expect(window.location.search).toContain("project=");
		expect(window.location.search).toContain("view=");
	});
});
