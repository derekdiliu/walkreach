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

test("the example waits for a slow map rather than failing", async ({ page }) => {
  // MapLibre is imported once the page is up, so hold back every script
  // requested after load: on the live site it arrives about a second after
  // the buttons, and a click in that gap used to throw.
  let loaded = false;
  page.on("load", () => (loaded = true));
  await page.route("**/_next/static/chunks/**", async (route) => {
    if (loaded) await new Promise((r) => setTimeout(r, 3000));
    await route.continue();
  });
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));

  await page.goto("/");
  const example = page.getByRole("button", { name: "Show me an example" });
  await expect(example).toBeDisabled();

  const response = analysisResponse(page);
  await example.click();
  await expectBands(page, await response);
  await expect(page.getByText("out of 100")).toBeVisible();
  expect(errors).toEqual([]);
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

test("counts what is within reach, lists it, and draws the walk to one", async ({ page }) => {
  const response = analysisResponse(page);
  await page.goto(`/?a=${CBD}`);
  const analysis = await (await response).json();
  const supermarkets = analysis.amenities.filter((a: any) => a.category === "supermarket");
  expect(supermarkets.length).toBeGreaterThan(0);

  // The counts are cumulative, so the 15 minute column counts every one listed.
  const counts = page.getByRole("table", { name: "Amenities within 5, 10 and 15 minutes" });
  await expect(counts.getByRole("row", { name: /^Supermarket/ }).getByRole("cell").last())
    .toHaveText(String(supermarkets.length));

  await page.getByRole("button", { name: /Supermarket .* within 15 min/ }).click();
  const list = page.getByRole("list", { name: "Supermarket within 15 minutes" });
  await expect(list.getByRole("button")).toHaveCount(supermarkets.length);

  const nearest = supermarkets[0];
  const route = page.waitForResponse((r) => r.url().includes("/api/route"));
  const pick = list.getByRole("button").first();
  await pick.click();
  const body = await (await route).json();
  expect(body.amenity).toEqual(nearest);
  expect(body.route.coordinates.length).toBeGreaterThan(1);
  await expect(pick).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("The walk is drawn on the map.")).toBeVisible();
  // On a phone the list is scrolled well below the map; picking brings the
  // map, and the walk on it, back into view.
  await expect(page.locator(".map-pane")).toBeInViewport({ ratio: 0.9 });

  // Picking it again takes the walk away.
  await pick.click();
  await expect(pick).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("The walk is drawn on the map.")).toBeHidden();
  await expectNoSidewaysScroll(page);
});

test("suggests suburbs as you type and goes straight to one", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Pick a spot myself" }).click();

  const input = page.getByRole("combobox", { name: "Search for an address in Hamilton" });
  await input.pressSequentially("chartw");
  const options = page.getByRole("listbox", { name: "Suggestions" }).getByRole("option");
  await expect(options.first()).toContainText("Chartwell");
  await expect(options.first()).toContainText("Area");

  // A suburb carries its point: scored without asking Nominatim.
  let geocoded = false;
  page.on("request", (r) => r.url().includes("/api/geocode") && (geocoded = true));
  const response = analysisResponse(page);
  await options.first().click();
  await expectBands(page, await response);
  await expect(input).toHaveValue("Chartwell");
  await expect(page.getByRole("listbox", { name: "Suggestions" })).toBeHidden();
  expect(geocoded).toBe(false);
});

test("keeps a house number and looks the street up once it is picked", async ({ page }) => {
  // The street is resolved by Nominatim; answer for it here rather than
  // asking the real service from a test.
  let asked = "";
  await page.route("**/api/geocode**", (route) => {
    asked = new URL(route.request().url()).searchParams.get("q") ?? "";
    return route.fulfill({
      json: { results: [{ lng: 175.2932, lat: -37.7457, label: "13 Hukanui Road, Chartwell" }] },
    });
  });
  await page.goto("/");
  await page.getByRole("button", { name: "Pick a spot myself" }).click();

  const input = page.getByRole("combobox", { name: "Search for an address in Hamilton" });
  await input.pressSequentially("13 Huk");
  const option = page.getByRole("option", { name: /13 Hukanui Road/ });
  await expect(option).toBeVisible();

  const response = analysisResponse(page);
  await input.press("ArrowDown");
  await expect(page.getByRole("option").first()).toHaveAttribute("aria-selected", "true");
  await input.press("Enter");
  await expectBands(page, await response);
  expect(asked).toBe("13 Hukanui Road");
});

test("start over clears the place and the link, and a refresh stays clear", async ({ page }) => {
  const response = analysisResponse(page);
  await page.goto(`/?a=${CBD}`);
  await expectBands(page, await response);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByText("out of 100")).toBeHidden();
  await expect(page.getByRole("button", { name: "Show me an example" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Start over" })).toBeHidden();

  await page.reload();
  await expect(page.getByRole("button", { name: "Show me an example" })).toBeVisible();
  await expect(page.getByText("out of 100")).toBeHidden();
});

test("start over leaves comparison mode", async ({ page }) => {
  await page.goto(`/?a=${CBD}&b=${HAMILTON_EAST}`);
  await expect(page.getByText("/ 100")).toHaveCount(2);

  await page.getByRole("button", { name: "Start over" }).click();
  await expect(page).toHaveURL(/\/$/);
  // Back to one place, where comparing is offered only once there is a first.
  await expect(page.getByRole("group", { name: "Mode" })).toBeHidden();
  await expect(page.getByRole("button", { name: "Compare with another place" })).toBeHidden();
  await expect(page.getByText("/ 100")).toHaveCount(0);
});

test("a failed analysis says so and can be retried", async ({ page }) => {
  let fail = true;
  await page.route("**/api/livability**", (route) =>
    fail ? route.fulfill({ status: 500 }) : route.continue(),
  );
  await page.goto(`/?a=${CBD}`);
  await expect(page.getByText("We couldn’t calculate this location.")).toBeVisible();
  // Not the intro again, as if nothing had been asked.
  await expect(page.getByRole("button", { name: "Try the city centre" })).toBeHidden();

  fail = false;
  const response = analysisResponse(page);
  await page.getByRole("button", { name: "Try again" }).click();
  await expectBands(page, await response);
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
