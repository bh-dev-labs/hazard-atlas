// Builds the real binary, runs it on an ephemeral port in demo mode, and
// drives the Hazards tab a reader actually sees: glyph click/detail,
// spiderfy/regroup, category/severity filters, and the timeline scrubber.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "hazards-check-"));
const executable = path.join(
  root,
  process.platform === "win32" ? "observatory.exe" : "observatory",
);
execFileSync("go", ["build", "-o", executable, "./cmd/observatory"]);
const server = spawn(executable, [
  "-demo",
  "-no-browser",
  "-addr",
  "127.0.0.1:0",
  "-data-dir",
  path.join(root, "data"),
]);
const exited = new Promise((resolve) => server.once("exit", resolve));
let browser;
let page;
const checks = [];
const errors = [];
// Finds the average screen position of pixels close to an RGB color in the
// hazard marker canvas, so tests click the actual rendered glyph instead of
// a guessed coordinate that drifts if layout changes.
async function locate(page, [r, g, b]) {
  return page.evaluate(
    ([r, g, b]) => {
      const canvases = [...document.querySelectorAll("canvas")].filter(
        (c) => c.width > 0 && !c.closest("[hidden]"),
      );
      const marker = canvases[canvases.length - 1];
      const ctx = marker.getContext("2d");
      const w = marker.width,
        h = marker.height;
      const data = ctx.getImageData(0, 0, w, h).data;
      let sx = 0,
        sy = 0,
        n = 0;
      for (let py = 0; py < h; py++) {
        for (let px = 0; px < w; px++) {
          const i = (py * w + px) * 4;
          if (
            Math.abs(data[i] - r) < 12 &&
            Math.abs(data[i + 1] - g) < 12 &&
            Math.abs(data[i + 2] - b) < 12
          ) {
            sx += px;
            sy += py;
            n++;
          }
        }
      }
      if (n === 0) return null;
      const rect = marker.getBoundingClientRect();
      const dpr = marker.width / rect.width;
      return { x: rect.left + sx / n / dpr, y: rect.top + sy / n / dpr, n };
    },
    [r, g, b],
  );
}
try {
  const base = await new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(Error("Server did not start")),
      30000,
    );
    server.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    server.once("exit", (code) => {
      clearTimeout(timer);
      reject(Error(`Server exited early: ${code}`));
    });
    let output = "";
    server.stderr.on("data", (chunk) => {
      output += chunk;
      const match = output.match(/url=(http:\/\/127\.0\.0\.1:\d+)/);
      if (match) {
        clearTimeout(timer);
        resolve(match[1]);
      }
    });
  });
  browser = await chromium.launch();
  const context = await browser.newContext({
    viewport: { width: 1300, height: 850 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

  const hazardsAPI = await (
    await page.request.get(`${base}/api/hazards?demo=true`)
  ).json();
  assert.equal(
    hazardsAPI.records.length,
    6,
    "demo fixture ships 6 hazard records",
  );
  checks.push("GET /api/hazards?demo=true returns the 6 frozen demo records");

  await page.goto(`${base}/#hazards`);
  await page
    .getByRole("navigation", { name: "Main", exact: true })
    .getByRole("button", { name: "Hazards", exact: true })
    .waitFor();
  const active = () => page.locator(".module-view:not([hidden])");

  // Layout regression: the globe canvas must actually fill the panel, not
  // collapse to a sliver (this broke once already: the container was
  // missing the CSS class that gives it height).
  await page.waitForTimeout(1500);
  const box = await active().locator("canvas").first().boundingBox();
  assert.ok(
    box.width > 400 && box.height > 300,
    `globe canvas too small: ${JSON.stringify(box)}`,
  );
  checks.push("Hazards globe canvas fills its panel, not a collapsed sliver");

  // Every category and severity checkbox is present and starts checked.
  for (const label of [
    "Volcanoes",
    "Severe storms",
    "Floods",
    "Landslides",
    "Drought",
    "Dust and haze",
    "Sea and lake ice",
    "Snow",
    "Temperature extremes",
    "Water color",
    "Manmade",
  ]) {
    assert.ok(
      await active().getByLabel(label, { exact: true }).isChecked(),
      `${label} checkbox missing or unchecked by default`,
    );
  }
  checks.push("All 11 category filters render, checked by default");

  await active()
    .getByText(/6 of 6 hazards active/)
    .waitFor();
  checks.push(
    "Timeline shows all 6 demo hazards active at the default (present) cursor",
  );

  // Click the drought glyph (severity green, the only unclustered green
  // marker in the demo fixture) and confirm the right panel opens with its
  // details, then confirm "Clear selection" reverts it.
  const drought = await locate(page, [59, 109, 17]); // --severity-green-stroke
  assert.ok(drought, "could not locate the drought glyph by color");
  await page.mouse.click(drought.x, drought.y);
  await active()
    .getByRole("heading", { name: "Demo Drought, Closed", exact: true })
    .waitFor();
  await active()
    .getByText(/Severity:\s*Green/)
    .waitFor();
  await active().getByText("2026-08-01 – 2026-09-04").waitFor();
  checks.push(
    "Clicking a glyph opens its record in the right panel with category, severity and date range",
  );
  await active().getByRole("button", { name: "Clear selection" }).click();
  await active()
    .getByText("Click a glyph on the globe for details.", { exact: false })
    .waitFor();
  checks.push(
    "Clear selection reverts the right panel to the empty-state hint",
  );

  // Regression for a real bug: Globe.tsx calls the `pause` prop on every
  // pointer-down specifically to freeze auto-rotation before a click lands,
  // but HazardExplorer's pause() once only stopped timeline playback, not
  // rotation -- so clicking a glyph while rotating never got a stable
  // target and took many attempts. Turn auto-rotate on, click a glyph in
  // one shot, and confirm it both selects and stops the rotation.
  await active()
    .getByRole("button", { name: "Auto-rotate: off", exact: true })
    .click();
  await active()
    .getByRole("button", { name: "Auto-rotate: on", exact: true })
    .waitFor();
  await page.waitForTimeout(600); // let it actually rotate a bit
  const droughtWhileRotating = await locate(page, [59, 109, 17]);
  assert.ok(
    droughtWhileRotating,
    "could not locate the drought glyph while rotating",
  );
  await page.mouse.click(droughtWhileRotating.x, droughtWhileRotating.y);
  await active()
    .getByRole("heading", { name: "Demo Drought, Closed", exact: true })
    .waitFor();
  await active()
    .getByRole("button", { name: "Auto-rotate: off", exact: true })
    .waitFor();
  checks.push(
    "Clicking a glyph while auto-rotating selects in one click and stops rotation",
  );
  await active().getByRole("button", { name: "Clear selection" }).click();

  // Find an actual cluster the same way Globe.tsx does, instead of guessing
  // a screen position: reproduce its exact projection (same d3-geo call,
  // same camera, same 18px grid bucket) against the API response, so this
  // doesn't depend on eyeballing a screenshot or on incidental colors.
  const { geoOrthographic, geoDistance } = await import("d3-geo");
  const canvasBox = await active().locator("canvas").first().boundingBox();
  const camera = { lon: 10, lat: 15, zoom: 1 }; // HazardExplorer's fixed initial camera
  const visible = (point) =>
    geoDistance(point, [camera.lon, camera.lat]) < Math.PI / 2 - 0.001;
  const proj = geoOrthographic()
    .rotate([-camera.lon, -camera.lat, 0])
    .scale(Math.min(canvasBox.width, canvasBox.height) * 0.46 * camera.zoom)
    .translate([canvasBox.width / 2, canvasBox.height / 2])
    .clipAngle(90);
  const buckets = new Map();
  for (const r of hazardsAPI.records) {
    const coord = r.geometry[r.geometry.length - 1].coordinates; // "present" cursor = latest point
    if (!visible(coord)) continue;
    const [x, y] = proj(coord);
    const key = Math.floor(x / 18) + "," + Math.floor(y / 18);
    (buckets.get(key) || buckets.set(key, []).get(key)).push({
      id: r.id,
      title: r.title,
    });
  }
  const clusterBucket = [...buckets.entries()].find(
    ([, members]) => members.length > 1,
  );
  assert.ok(
    clusterBucket,
    "expected at least one multi-member cluster bucket at the default camera; demo fixture or camera changed",
  );
  const [bx, by] = clusterBucket[0].split(",").map(Number);
  const cluster = {
    x: canvasBox.x + (bx + 0.5) * 18,
    y: canvasBox.y + (by + 0.5) * 18,
  };
  await page.mouse.move(cluster.x, cluster.y);
  await page
    .getByRole("tooltip")
    .getByText(/hazards, tap to separate/)
    .waitFor();
  checks.push(
    "Hovering an unexpanded cluster shows a count, not an individual title",
  );
  await page.mouse.click(cluster.x, cluster.y);
  await page.waitForTimeout(200);
  // After spiderfying, hovering the exact original center should no longer
  // show the "N hazards" count -- the members moved to a ring around it.
  await page.mouse.move(cluster.x, cluster.y);
  const collapsedTooltip = await page
    .getByRole("tooltip")
    .getByText(/hazards, tap to separate/)
    .count();
  assert.equal(
    collapsedTooltip,
    0,
    "cluster badge should be gone once spiderfied",
  );
  checks.push(
    "Clicking a cluster spiderfies its members away from the shared point",
  );
  await page.mouse.click(cluster.x, cluster.y);
  await page.waitForTimeout(200);
  await page.mouse.move(cluster.x, cluster.y);
  await page
    .getByRole("tooltip")
    .getByText(/hazards, tap to separate/)
    .waitFor();
  checks.push("Clicking the same spot again regroups the cluster");

  // Regression: the spiderfied cluster is remembered by its screen-grid
  // cell, so if the view moves that key would point at a different patch of
  // screen and expand whatever unrelated markers now sit there. Spiderfy,
  // rotate away and back, and confirm it collapsed instead of persisting.
  await page.mouse.click(cluster.x, cluster.y);
  await page.waitForTimeout(150);
  await active().locator('canvas[role="application"]').focus();
  await page.keyboard.press("ArrowRight");
  await page.waitForTimeout(150);
  await page.keyboard.press("ArrowLeft");
  await page.waitForTimeout(250);
  await page.mouse.move(cluster.x, cluster.y);
  await page
    .getByRole("tooltip")
    .getByText(/hazards, tap to separate/)
    .waitFor();
  checks.push(
    "A spiderfied cluster collapses when the view moves, instead of going stale",
  );

  // Category filtering removes exactly that category's markers and updates
  // the active count, without needing a refetch.
  await active().getByLabel("Landslides", { exact: true }).uncheck();
  await active()
    .getByText(/5 of 5 hazards active/)
    .waitFor();
  await active().getByLabel("Landslides", { exact: true }).check();
  await active()
    .getByText(/6 of 6 hazards active/)
    .waitFor();
  checks.push(
    "Unchecking a category filters it out client-side; rechecking restores it",
  );

  // Severity filtering is independent of category: unchecking Green removes
  // only the drought record (the demo iceberg has no GDACS match, so it's
  // "unknown", not green).
  await active().getByLabel("Green", { exact: true }).uncheck();
  await active()
    .getByText(/5 of 5 hazards active/)
    .waitFor();
  await active().getByLabel("Green", { exact: true }).check();
  await active()
    .getByText(/6 of 6 hazards active/)
    .waitFor();
  checks.push("Severity filter is independent of category filter");

  // The timeline scrubber narrows the active set by date window: dragging to
  // the earliest point leaves only the drought record (the only one whose
  // window starts that early).
  const slider = active().locator('input[type="range"]');
  const min = await slider.getAttribute("min");
  await slider.fill(min);
  await active()
    .getByText(/1 of 6 hazards active/)
    .waitFor();
  checks.push(
    "Scrubbing the timeline to its start shows only the hazard active that early",
  );

  // 1366x768 is the most common panel size on a 14" Windows laptop (the next
  // most common, 1920x1080, is already covered by the 1440x900-and-up sizes
  // exercised elsewhere): confirm the Hazards tab doesn't overflow or
  // collapse its globe at that size.
  await page.setViewportSize({ width: 1366, height: 768 });
  await page.waitForTimeout(300);
  const laptopOverflow = await page.evaluate(
    () => document.documentElement.scrollWidth > innerWidth,
  );
  assert.equal(
    laptopOverflow,
    false,
    "page overflows horizontally at 1366x768",
  );
  const laptopCanvas = await active().locator("canvas").first().boundingBox();
  assert.ok(
    laptopCanvas.width > 300 && laptopCanvas.height > 200,
    `globe canvas too small at 1366x768: ${JSON.stringify(laptopCanvas)}`,
  );
  assert.ok(
    await page
      .getByRole("navigation", { name: "Main", exact: true })
      .isVisible(),
    "main nav not visible at 1366x768",
  );
  await page.screenshot({ path: path.join(root, "hazards-1366x768.png") });
  checks.push(
    'Hazards tab fits a 1366x768 (14" Windows laptop) viewport without horizontal overflow',
  );

  assert.deepEqual(errors, [], "page errors");
  console.log(checks.map((line) => "ok - " + line).join("\n"));
  console.log(`\n${checks.length} checks passed.`);
} catch (reason) {
  if (page) {
    await page.screenshot({
      path: path.join(root, "failure.png"),
      fullPage: true,
    });
    console.error("Failure screenshot:", path.join(root, "failure.png"));
    console.error("Page errors:", errors);
  }
  throw reason;
} finally {
  await browser?.close();
  server.kill("SIGINT");
  await exited;
}
