/**
 * E2E: log in, open the Workflow Builder, drag a node from the palette
 * onto the canvas, and assert the node renders.
 *
 * Auth is bypassed by seeding a mock JWT into localStorage under the same
 * key the app reads — swap `TEST_TOKEN` / storage key to match your build.
 */
import { test, expect, type Page } from "@playwright/test";

const TEST_TOKEN = process.env.E2E_TOKEN ?? "test-jwt-token";
const AUTH_STORAGE_KEY = process.env.E2E_AUTH_KEY ?? "auth_token";

async function login(page: Page) {
  await page.addInitScript(
    ([key, token]) => {
      window.localStorage.setItem(key, token);
    },
    [AUTH_STORAGE_KEY, TEST_TOKEN],
  );
}

test.describe("Visual Workflow Builder", () => {
  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("drags a palette node onto the canvas and renders it", async ({ page }) => {
    await page.goto("/workflows");

    const canvas = page.locator('[data-testid="workflow-canvas"]');
    await expect(canvas).toBeVisible();

    const paletteItem = page.locator('[data-testid="palette-item"][data-node-type="action"]').first();
    await expect(paletteItem).toBeVisible();

    const nodesBefore = await page.locator('[data-testid="workflow-node"]').count();

    // HTML5 DnD requires manual event dispatch — Playwright's built-in
    // dragTo() falls back correctly for pointer-based canvases too.
    const canvasBox = (await canvas.boundingBox())!;
    const targetX = canvasBox.x + canvasBox.width / 2;
    const targetY = canvasBox.y + canvasBox.height / 2;

    await paletteItem.hover();
    await page.mouse.down();
    await page.mouse.move(targetX, targetY, { steps: 12 });
    await page.mouse.up();

    // Fallback: dispatch synthetic HTML5 drag events if pointer DnD is no-op.
    if ((await page.locator('[data-testid="workflow-node"]').count()) === nodesBefore) {
      await paletteItem.dragTo(canvas, { targetPosition: { x: canvasBox.width / 2, y: canvasBox.height / 2 } });
    }

    const nodesAfter = page.locator('[data-testid="workflow-node"]');
    await expect(nodesAfter).toHaveCount(nodesBefore + 1);

    const newNode = nodesAfter.last();
    await expect(newNode).toBeVisible();
    await expect(newNode).toHaveAttribute("data-node-type", "action");
  });
});
