// Builds the real binary, runs it on an ephemeral port against a temporary
// data directory, and drives the pages a reader actually sees. Nothing here
// contacts USGS: upstream responses are routed to the bundled demo snapshot.
import { chromium } from "@playwright/test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { execFileSync, spawn } from "node:child_process";

const root = await fs.mkdtemp(path.join(os.tmpdir(), "hazard-atlas-check-"));
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
    viewport: { width: 1440, height: 1050 },
  });
  page = await context.newPage();
  page.on("pageerror", (error) => errors.push(error.message));

  const demo = JSON.parse(
    await fs.readFile("web/public/data/demo.geojson", "utf8"),
  );
  const envelope = {
    id: "browser-fixture",
    query: "Mock February query",
    fetched: new Date().toISOString(),
    complete: true,
    stale: false,
    data: demo,
  };
  await context.route("**/api/recent?*", (route) =>
    route.fulfill({ json: envelope }),
  );
  await context.route("**/api/detail/**", (route) =>
    route.fulfill({
      json: {
        type: "Feature",
        id: new URL(route.request().url()).pathname.split("/").pop(),
        properties: {
          products: {
            origin: [
              {
                preferredWeight: 1,
                properties: {
                  "horizontal-error": "1.25",
                  "depth-error": "2.5",
                },
              },
            ],
          },
        },
      },
    }),
  );

  const active = () => page.locator(".module-view:not([hidden])");
  const count = (amount) =>
    active().getByText(`${amount} earthquakes`, { exact: true }).waitFor();
  const upload = (data) =>
    active()
      .locator("input[type=file]")
      .setInputFiles({
        name: "snapshot.json",
        mimeType: "application/json",
        buffer: Buffer.from(JSON.stringify(data)),
      });
  const earthquakes = async () => {
    await page
      .getByRole("button", { name: "Earthquakes", exact: true })
      .click();
    await page.waitForTimeout(400);
  };

  await page.goto(base);
  await earthquakes();
  await count(618);

  // 1. Shared views are validated before anything reaches the renderer.
  const badView = {
    mode: "demo",
    filters: {
      text: "",
      region: { name: "invalid", west: 1e20, east: 1e20, south: 0, north: 1 },
    },
  };
  await page.goto(
    base + "?view=" + encodeURIComponent(JSON.stringify(badView)),
  );
  await earthquakes();
  await count(618);
  await active()
    .getByText("The shared view was invalid; showing defaults.", {
      exact: false,
    })
    .waitFor();
  checks.push("Out-of-range shared coordinates rejected without hanging");

  // 2. A malformed snapshot is refused and the loaded dataset survives.
  const invalid = structuredClone(demo.features[0]);
  invalid.properties.mag = "invalid";
  await upload({ type: "FeatureCollection", features: [invalid] });
  await active()
    .getByRole("alert")
    .filter({ hasText: "Invalid snapshot" })
    .waitFor();
  await count(618);
  checks.push("Malformed snapshot preserves previous dataset");

  // 3. A tampered snapshot fails its recorded checksum.
  const digest = await page.evaluate(async (value) => {
    const bytes = await crypto.subtle.digest(
      "SHA-256",
      new TextEncoder().encode(JSON.stringify(value)),
    );
    return [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, "0"))
      .join("");
  }, demo);
  const tampered = structuredClone(demo);
  tampered.metadata = { sha256: digest };
  tampered.features[0].properties.place = "Modified";
  await upload(tampered);
  await active()
    .getByRole("alert")
    .filter({ hasText: "checksum mismatch" })
    .waitFor();
  checks.push("Snapshot checksum detects a modified observation");

  // 4. A shrinking dataset clamps the table pagination.
  await active()
    .getByRole("button", { name: "Next page", exact: true })
    .click()
    .catch(() => {});
  await upload({ ...demo, features: demo.features.slice(0, 2) });
  await count(2);
  assert.match(
    await active().locator(".pagination span").innerText(),
    /Page 1 of 1/,
  );
  assert.equal(await active().locator(".events tbody tr").count(), 2);
  checks.push("Shrinking snapshot clamps table pagination");

  // 5. Historical retrieval reports progress and cancels on the server.
  await page.goto(base);
  await earthquakes();
  await count(618);
  const jobs = [];
  await page.route("**/api/history?*", async (route) => {
    const job = new URL(route.request().url()).searchParams.get("job");
    if (job) jobs.push(job);
    await new Promise((resolve) => setTimeout(resolve, 4000));
    await route.fulfill({ json: envelope }).catch(() => {});
  });
  const cancellations = [];
  page.on("request", (request) => {
    if (
      request.method() === "DELETE" &&
      request.url().includes("/history/jobs/")
    )
      cancellations.push(request.url());
  });
  await active().locator(".toolbar select").selectOption("history");
  await active()
    .getByRole("button", { name: "Retrieve history", exact: true })
    .click();
  await active()
    .getByText("Historical retrieval: running", { exact: false })
    .waitFor();
  assert.equal(jobs.length, 1, "history request carried no job id");
  await active()
    .getByRole("button", { name: "Cancel retrieval", exact: true })
    .click();
  await active()
    .getByText("Historical retrieval: cancelled", { exact: false })
    .waitFor();
  assert.ok(
    cancellations.some((url) => url.endsWith(jobs[0])),
    "cancelling did not release the server job",
  );
  await count(618);
  checks.push(
    "Historical progress reports and cancellation reaches the server",
  );
  await page.unrouteAll({ behavior: "ignoreErrors" });

  // 6. Source uncertainty reads the snapshot, then the current source detail.
  await page.goto(base);
  await earthquakes();
  await count(618);
  await active()
    .locator(".events tbody tr")
    .first()
    .getByRole("button")
    .first()
    .click();
  await active().getByText("Source uncertainty", { exact: false }).click();
  await active()
    .getByText("(current source detail)", { exact: false })
    .first()
    .waitFor();
  const values = await active().locator(".uncertainty dd").allInnerTexts();
  assert.ok(
    values.some((text) => text.includes("1.25 km")),
    `horizontal uncertainty missing: ${values.join(" | ")}`,
  );
  assert.ok(
    values.some((text) => text.includes("Unavailable")),
    "an absent field should read Unavailable, not zero",
  );
  checks.push("Source uncertainty distinguishes unavailable from zero");

  // 7. A custom transect redraws the depth section.
  await active()
    .getByRole("button", { name: /depth section/ })
    .click();
  const editor = active().locator(".transect-editor");
  await editor.waitFor();
  await editor.getByLabel("Start latitude").fill("-40");
  await editor.getByLabel("End latitude").fill("-40");
  await editor.getByRole("button", { name: "Apply transect" }).click();
  await active().getByText("170, -40 to -170, -40", { exact: false }).waitFor();
  await editor.getByLabel("End longitude").fill("170");
  await editor.getByLabel("End latitude").fill("-40");
  await editor.getByRole("button", { name: "Apply transect" }).click();
  await editor.getByRole("alert").waitFor();
  await active().getByText("170, -40 to -170, -40", { exact: false }).waitFor();
  checks.push("Custom transect applies and rejects a degenerate corridor");

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
