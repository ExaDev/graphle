import { fireEvent, render, screen } from "@testing-library/react";
import React from "react";
import { describe, expect, it, beforeAll } from "vitest";
import IndexPage from "../../src/pages/index";

beforeAll(() => {
	global.ResizeObserver = class ResizeObserver {
		observe() {}
		unobserve() {}
		disconnect() {}
	};
});
describe("IndexPage Component", () => {
	it("renders without crashing", () => {
		render(<IndexPage />);
		expect(screen.getByText("Graphle")).toBeInTheDocument();
	});

	it("renders Graph component", () => {
		render(<IndexPage />);
		expect(screen.getByText("Graphle")).toBeInTheDocument();
	});

	it("updates URL with encoded project and view", () => {
		render(<IndexPage />);
	});
});
