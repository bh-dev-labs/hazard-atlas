import fs from "node:fs/promises";
import path from "node:path";
import { spawn, execFileSync } from "node:child_process";
import assert from "node:assert/strict";
const { version } = JSON.parse(await fs.readFile("package.json", "utf8"));
const folder = `HazardAtlas-${version}-darwin-arm64`;
const root = await fs.mkdtemp("/private/tmp/atlas-consumer-");
execFileSync("/usr/bin/unzip", ["-q", `release/${folder}.zip`, "-d", root]);
const binary = path.join(
  root,
  folder,
  "Hazard Atlas.app",
  "Contents/MacOS/hazard-atlas",
);
const data = path.join(root, "data");
const start = async (dir) => {
  const process = spawn(
    binary,
    ["-demo", "-no-browser", "-addr", "127.0.0.1:8790", "-data-dir", dir],
    { stdio: ["ignore", "pipe", "pipe"] },
  );
  let output = "";
  process.stderr.on("data", (b) => (output += b));
  for (let i = 0; i < 60; i++) {
    try {
      const r = await fetch("http://127.0.0.1:8790/api/health");
      if (r.ok) return process;
    } catch {}
    await new Promise((r) => setTimeout(r, 100));
  }
  throw Error("Consumer failed to start " + output);
};
const stop = async (p) => {
  p.kill("SIGINT");
  await new Promise((r) => p.once("exit", r));
};
let p = await start(data);
assert.equal(
  (await (await fetch("http://127.0.0.1:8790/api/health")).json()).version,
  version,
);
const response = await fetch("http://127.0.0.1:8790/api/demo");
const demo = await response.json();
assert.equal(demo.data.features.length, 618);
const home = await fetch("http://127.0.0.1:8790/");
assert.ok((await home.text()).includes("Hazard Atlas"));
const ready = await (await fetch("http://127.0.0.1:8790/api/ready")).json();
assert.equal(ready.ready, true);
const attack = await fetch("http://127.0.0.1:8790/api/quit", {
  method: "POST",
});
assert.equal(attack.status, 403);
const backup = path.join(root, "backup.db");
execFileSync(binary, ["-data-dir", data, "-backup", backup]);
await stop(p);
p = await start(data);
assert.equal(
  (await (await fetch("http://127.0.0.1:8790/api/demo")).json()).id,
  demo.id,
);
await stop(p);
const restored = path.join(root, "restored");
await fs.mkdir(restored);
await fs.copyFile(backup, path.join(restored, "hazard-atlas.db"));
assert.ok(
  execFileSync(binary, ["-data-dir", restored, "-check-db"])
    .toString()
    .includes("ok"),
);
p = await start(restored);
assert.equal(
  (await (await fetch("http://127.0.0.1:8790/api/demo")).json()).data.features
    .length,
  618,
);
await stop(p);
const report = {
  archive: `${folder}.zip`,
  version,
  root,
  checks: [
    "Fresh ZIP extraction",
    "Native executable start",
    "Embedded production frontend",
    "Offline 618-event dataset",
    "SQLite readiness",
    "Cross-origin quit rejected",
    "Consistent backup while running",
    "Restart preserves snapshot identity",
    "Restore into clean directory",
    "Integrity check and restored launch",
  ],
  windowsRuntimeTested: false,
  intelMacRuntimeTested: false,
  generated: new Date().toISOString(),
};
await fs.writeFile(
  "docs/consumer-test-results.json",
  JSON.stringify(report, null, 2),
);
console.log(report);
