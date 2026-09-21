import { expect, test, type Page } from "@playwright/test";

// Each spec runs once at desktop size and once on a phone (playwright.config.ts).

const SCORE_LABEL =
  /Everything close by|Mostly walkable|Some essentials nearby|Limited on foot|Car-dependent/;

const CBD = "175.27930,-37.78710";
const HAMILTON_EAST = "175.30819,-37.78575";

const analysisResponse = (page: Page) =>
  page.waitForResponse((r) => r.url().includes("/api/livability"));

async function expectBands(page: Page, response: Awaited<ReturnType<typeof analysisResponse>>) {
  expect(response.status()).toBe(200);
  const body = await response.json();
  expect(body.isochrone.features.map((f: any) => f.properties.minutes)).toEqual([15, 10, 5]);
}

async function expectNoSidewaysScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test("the welcome card explains the tool and its example scores the CBD", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "WalkReach" })).toBeVisible();
  await expectNoSidewaysScroll(page);

  const response = analysisResponse(page);
  await page.getByRole("button", { name: "Show me an example" }).click();
  await expectBands(page, await response);

  await expect(page.getByText("out of 100")).toBeVisible();
  await expect(page.getByText(SCORE_LABEL).first()).toBeVisible();
  // The address bar carries the point, so the page can be shared as is.
  await expect(page).toHaveURL(new RegExp(`\\?a=${CBD}$`));
  await expectNoSidewaysScroll(page);
});

test("clicking the map scores the point clicked", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick a spot myself" }).click();

  const canvas = page.locator(".map-pane canvas");
  await expect(canvas).toBeVisible();
  const response = analysisResponse(page);
  // The map opens on the city centre, so its middle is on the network.
  await canvas.click();
  await expectBands(page, await response);

  await expect(page.getByText("out of 100")).toBeVisible();
  await expect(page).toHaveURL(/\?a=175\.\d+,-37\.\d+$/);
});

test("a shared link opens straight on its result", async ({ page }) => {
  const response = analysisResponse(page);
  await page.goto(`/?a=${CBD}`);
  await expectBands(page, await response);

  await expect(page.getByRole("button", { name: "Show me an example" })).toBeHidden();
  await expect(page.getByText("out of 100")).toBeVisible();
});

test("a shared comparison scores both places side by side", async ({ page }) => {
  await page.goto(`/?a=${CBD}&b=${HAMILTON_EAST}`);

  await expect(page.getByRole("button", { name: "Compare two places" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByText("/ 100")).toHaveCount(2);
  await expect(page.getByText(/Place [AB] scores [\d.]+ higher\.|Both places score the same\./)).toBeVisible();
  await expectNoSidewaysScroll(page);
});

test("map and panel both fit the screen", async ({ page, isMobile }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick a spot myself" }).click();

  const viewport = page.viewportSize()!;
  const map = (await page.locator(".map-pane").boundingBox())!;
  const panel = (await page.locator(".panel").boundingBox())!;

  if (isMobile) {
    // Stacked: map full width on top, panel full width below it.
    expect(map.width).toBeCloseTo(viewport.width, 0);
    expect(panel.width).toBeCloseTo(viewport.width, 0);
    expect(panel.y).toBeGreaterThanOrEqual(map.y + map.height - 1);
    await expect(page.getByLabel("Search for an address in Hamilton")).toBeInViewport();
  } else {
    // Side by side: map to the left of a fixed-width panel.
    expect(panel.x).toBeGreaterThanOrEqual(map.x + map.width - 1);
    expect(map.height).toBeCloseTo(panel.height, 0);
  }
  await expectNoSidewaysScroll(page);
});

test("the how it works page is reachable from the top bar", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: "How it works" }).click();
  await expect(page).toHaveURL(/\/how-it-works$/);
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expectNoSidewaysScroll(page);
});
