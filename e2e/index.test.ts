import { expect, test } from "@playwright/test";

test.describe("Graphle", () => {
	test("should create a new project", async ({ page }) => {
		await page.goto("http://localhost:3000");
		await page.fill('input[type="text"]', "Test Project");
		await expect(page.locator('input[type="text"]')).toHaveValue(
			"Test Project"
		);
	});

	test("should add a node to the graph", async ({ page }) => {
		await page.goto("http://localhost:3000");
		await page.fill('input[type="text"]', "Test Project");
		await page.click('button:has-text("Add Node")');
		await expect(page.locator('div:has-text("New Node")')).toBeVisible();
	});

	test("should add an edge to the graph", async ({ page }) => {
		await page.goto("http://localhost:3000");
		await page.fill('input[type="text"]', "Test Project");
		await page.click('button:has-text("Add Node")');
		await page.click('button:has-text("Add Node")');
		await page.click('button:has-text("Add Edge")');
		await expect(page.locator('div:has-text("Edge from")')).toBeVisible();
	});

	test("should update the browser URL with the encoded project and view", async ({
		page,
	}) => {
		await page.goto("http://localhost:3000");
		await page.fill('input[type="text"]', "Test Project");
		await expect(page).toHaveURL(/project=.*&view=.*/);
	});

	test("should share the project URL", async ({ page }) => {
		await page.goto("http://localhost:3000");
		await page.fill('input[type="text"]', "Test Project");
		const url = page.url();
		await page.goto(url);
		await expect(page.locator('input[type="text"]')).toHaveValue(
			"Test Project"
		);
	});
});
