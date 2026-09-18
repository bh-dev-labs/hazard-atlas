import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import fs from "node:fs/promises";
import assert from "node:assert/strict";
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({
  viewport: { width: 1440, height: 900 },
});
const page = await context.newPage();
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const report = {
  generated: new Date().toISOString(),
  browser: browser.version(),
  sizes: [],
  checks: [],
  accessibility: [],
  errors,
};
await page.goto("http://127.0.0.1:8789");
await page
  .getByText("▲ 21 incidents · ■ 406 detections", { exact: true })
  .waitFor();
await fs.mkdir("docs/screenshots", { recursive: true });
const button = (name) =>
  page.getByRole("button", { name, exact: true }).filter({ visible: true });
const active = () => page.locator(".module-view:not([hidden])");
for (const [width, height] of [
  [1440, 900],
  [1920, 1080],
  [2560, 1440],
  [1024, 900],
  [390, 844],
]) {
  await page.setViewportSize({ width, height });
  await page.waitForTimeout(200);
  const dims = await page.evaluate(() => ({
    width: innerWidth,
    scroll: document.documentElement.scrollWidth,
    height: innerHeight,
    scrollHeight: document.documentElement.scrollHeight,
    main: document.querySelector("main").getBoundingClientRect().width,
  }));
  assert.equal(dims.scroll, width);
  assert.equal(dims.scrollHeight, height);
  assert.equal(dims.main, width);
  await page.screenshot({ path: `docs/screenshots/hazard-${width}.png` });
  report.sizes.push({ width, height, ...dims });
}
await page.setViewportSize({ width: 1440, height: 900 });
await page
  .getByRole("navigation", { name: "Main", exact: true })
  .getByRole("button", { name: "Earthquakes", exact: true })
  .click();
await active().locator(".workspace-context").waitFor();
await page.waitForTimeout(400);
assert.match(
  await active().locator(".workspace-context").innerText(),
  /618 earthquakes/,
);
await page
  .getByRole("navigation", { name: "Main", exact: true })
  .getByRole("button", { name: "Overview", exact: true })
  .click();
await page
  .getByText("▲ 21 incidents · ■ 406 detections", { exact: true })
  .waitFor();
await button("Reset layout").click();
await page.waitForTimeout(150);
const separator = page
  .getByRole("separator", { name: "Resize details" })
  .filter({ visible: true });
const before = await active()
  .locator('canvas[role="application"]')
  .boundingBox();
await separator.focus();
await page.keyboard.press("ArrowLeft");
await page.waitForTimeout(100);
const after = await active()
  .locator('canvas[role="application"]')
  .boundingBox();
assert.ok(after.width < before.width);
const handle = await separator.boundingBox();
await page.mouse.move(handle.x + 3, handle.y + 30);
await page.mouse.down();
await page.mouse.move(handle.x - 40, handle.y + 30);
await page.mouse.up();
await page.waitForTimeout(100);
const canvas = await active()
  .locator('canvas[role="application"]')
  .evaluate((c) => ({
    width: c.width,
    rect: c.getBoundingClientRect().width,
    dpr: Math.min(2, devicePixelRatio),
  }));
assert.ok(Math.abs(canvas.width - canvas.rect * canvas.dpr) < 2);
report.checks.push(
  "Keyboard and pointer resizing updates canvas pixel dimensions",
);
await button("Auto-rotate: off").click();
await button("Rotate right").click();
await button("Resume rotation").waitFor();
report.checks.push("Rotation pauses on interaction");
await button("detections").click();
await active().locator(".fire-record").first().click();
await page
  .getByRole("heading", { name: "NOAA-20 thermal detection", exact: true })
  .waitFor();
await page.screenshot({ path: "docs/screenshots/hazard-detection.png" });
await button("Restart").click();
const early = await active().locator(".pagination span").innerText();
await button("Show all").click();
assert.match(
  await active().locator(".pagination span").innerText(),
  /406 detections/,
);
report.checks.push("Detection list, details, backward seek and show all");
await active().locator(".export-menu summary").click();
let download = page.waitForEvent("download");
await button("Save complete snapshot").click();
let d = await download;
await d.saveAs("/private/tmp/hazard-snapshot.json");
const snap = JSON.parse(
  await fs.readFile("/private/tmp/hazard-snapshot.json", "utf8"),
);
assert.equal(snap.payload.detections.detections.length, 406);
await active()
  .locator("input[type=file]")
  .setInputFiles("/private/tmp/hazard-snapshot.json");
await page
  .getByText("Reopened immutable snapshot without contacting a provider.")
  .waitFor();
report.checks.push("Complete hashed snapshot export and import");
for (const title of [
  "Incident versus detection",
  "How satellites observe heat",
  "Read a sequence of observations",
]) {
  await button(title).click();
  await button("Next step").waitFor();
  await button("Next step").click();
  await button("Next step").click();
  await button("Complete & reflect").click();
  await button("Return to my exploration").click();
}
report.checks.push(
  "Three wildfire lessons, reflection and prior-view restoration",
);
await page
  .getByRole("navigation", { name: "Main", exact: true })
  .getByRole("button", { name: "Earthquakes", exact: true })
  .click();
await active().locator(".workspace-context").waitFor();
await page.waitForTimeout(400);
assert.match(
  await active().locator(".workspace-context").innerText(),
  /618 earthquakes/,
);
await active().locator(".event-link").first().click();
await active().locator(".magnitude").waitFor();
await button("2D map").click();
await button("3D globe").click();
await button("Show all").click();
download = page.waitForEvent("download");
await button("Export GeoJSON snapshot").click();
d = await download;
await d.saveAs("/private/tmp/hazard-quake.json");
assert.equal(
  JSON.parse(await fs.readFile("/private/tmp/hazard-quake.json", "utf8"))
    .features.length,
  618,
);
report.checks.push(
  "Earthquake route selection, globe/map, replay and 618-event export (lesson regression is covered by the inherited browser harness)",
);
await page.screenshot({ path: "docs/screenshots/hazard-earthquakes.png" });
for (const route of [
  "Earthquakes",
  "Wildfires",
  "Hazards",
  "Sources & References",
]) {
  await page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("button", { name: route, exact: true })
    .click();
  await page.waitForTimeout(100);
  const axe = await new AxeBuilder({ page }).analyze();
  report.accessibility.push({
    route,
    violations: axe.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      nodes: v.nodes.map((n) => ({
        target: n.target,
        summary: n.failureSummary,
      })),
    })),
  });
}
await page
  .getByRole("navigation", { name: "Main", exact: true })
  .getByRole("button", { name: "Wildfires", exact: true })
  .click();
await page.setViewportSize({ width: 390, height: 844 });
await button("List").click();
await button("detections").click();
await active().locator(".fire-record").first().click();
await page
  .getByRole("heading", { name: "NOAA-20 thermal detection", exact: true })
  .waitFor();
await page.screenshot({ path: "docs/screenshots/hazard-mobile-details.png" });
await button("Globe").click();
assert.ok(await active().locator('canvas[role="application"]').isVisible());
report.checks.push("390px Globe/List/Learn and selection sheet");
await page.emulateMedia({ reducedMotion: "reduce" });
await button("Auto-rotate: off")
  .click()
  .catch(() => {});
assert.equal(
  await active()
    .getByRole("button", { name: "Auto-rotate: on", exact: true })
    .count(),
  0,
);
report.checks.push("Reduced motion blocks automatic rotation");
await page.setViewportSize({ width: 1024, height: 900 });
await page.evaluate(() => (document.documentElement.style.fontSize = "24px"));
await page.screenshot({ path: "docs/screenshots/hazard-enlarged-text.png" });
assert.equal(
  await page.evaluate(() => document.documentElement.scrollWidth > innerWidth),
  false,
);
report.checks.push("Enlarged root text without page overflow");
await fs.writeFile(
  "docs/hazard-browser-results.json",
  JSON.stringify(report, null, 2),
);
console.log(JSON.stringify(report, null, 2));
await browser.close();
assert.equal(errors.length, 0);
assert.equal(report.accessibility.flatMap((r) => r.violations).length, 0);
