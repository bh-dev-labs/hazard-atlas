// Exercise the real Globe component over small camera steps at two pixel
// densities. Track the rendered sprite centers, not a duplicate layout model.
import { chromium } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

const fixture = await fs.mkdtemp("web/.animation-check-");
let server, browser;
try {
  await fs.writeFile(
    `${fixture}/index.html`,
    `<div id="app"></div><script type="module" src="./fixture.tsx"></script>`,
  );
  await fs.writeFile(
    `${fixture}/fixture.tsx`,
    `
import { render, h } from 'preact';
import { Globe } from '../src/Globe';
import { countryLabels } from '../src/countryLabels';
import { feature } from 'topojson-client';
import { geoOrthographic, geoEquirectangular } from 'd3-geo';
import '../src/style.css';
document.head.insertAdjacentHTML('beforeend', '<style>.canvas-wrap {width:800.25px;height:600.25px}</style>');
const geo = await fetch('/data/earth.json').then(r => r.json());
const canada = countryLabels(feature(geo, geo.objects.countries)).find(c => c.name === 'Canada');
const objects = [{id:'fire',kind:'incident', title:'Test fire',time:'2026-09-06',geometry:{type:'Point',coordinates:canada.coordinate}}];
let props = {events:[], objects, selected:'',onSelect:()=>{}, onObject:()=>window.picked=true,
 camera:{lon:-100,lat:30,zoom:1},setCamera:()=>{}, flat:false,plates:false,countries:true,
 transect:{},region:null,section:false,auto:false,speed:1,pause:()=>{}};
window.step = async (lon, flat=false, zoom=1) => {
 props = {...props, camera:{lon,lat:30,zoom}, flat};
 render(h(Globe,props),document.getElementById('app'));
 await new Promise(requestAnimationFrame);
 const rect = document.querySelector('canvas').getBoundingClientRect();
 const proj = flat ? geoEquirectangular().rotate([-lon,0,0]).scale(rect.width/6.5*zoom)
 : geoOrthographic().rotate([-lon,-30,0]).scale(Math.min(rect.width,rect.height)*.46*zoom);
 return proj.translate([rect.width/2,rect.height/2])(canada.coordinate);
};
await window.step(-100);
window.ready = true;
`,
  );
  server = await createServer({
    root: "web",
    server: { host: "127.0.0.1", port: 0 },
  });
  await server.listen();
  browser = await chromium.launch();
  for (const dpr of [1, 2]) {
    const page = await browser.newPage({
      viewport: { width: 1100, height: 850 },
      deviceScaleFactor: dpr,
    });
    const errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.draws = [];
      window.resizes = 0;
      window.canadaRasters = 0;
      const names = new WeakMap();
      const fillText = CanvasRenderingContext2D.prototype.fillText;
      CanvasRenderingContext2D.prototype.fillText = function (text, ...args) {
        if (text === "Canada") window.canadaRasters++;
        names.set(this.canvas, text);
        return fillText.call(this, text, ...args);
      };
      const drawImage = CanvasRenderingContext2D.prototype.drawImage;
      CanvasRenderingContext2D.prototype.drawImage = function (
        bitmap,
        x,
        y,
        w,
        h,
      ) {
        if (this.canvas.isConnected)
          window.draws.push({
            name: names.get(bitmap) || "marker",
            x: x + w / 2,
            y: y + h / 2,
          });
        return drawImage.apply(this, arguments);
      };
      for (const property of ["width", "height"]) {
        const descriptor = Object.getOwnPropertyDescriptor(
          HTMLCanvasElement.prototype,
          property,
        );
        Object.defineProperty(HTMLCanvasElement.prototype, property, {
          ...descriptor,
          set(value) {
            if (this.isConnected) window.resizes++;
            descriptor.set.call(this, value);
          },
        });
      }
    });
    const folder = fixture.split("/").pop();
    await page.goto(`${server.resolvedUrls.local[0]}${folder}/index.html`);
    await page.waitForFunction(
      () => window.ready && window.draws.some((d) => d.name === "Canada"),
    );
    await page.evaluate(() => {
      window.resizes = 0;
    });
    for (const flat of [false, true]) {
      for (let frame = 0; frame < 60; frame++) {
        const result = await page.evaluate(
          async ({ frame, flat }) => {
            window.draws = [];
            const expected = await window.step(-100 + frame * 0.05, flat);
            return { expected, draws: window.draws };
          },
          { frame, flat },
        );
        for (const name of ["Canada", "marker"]) {
          const draw = result.draws.find((d) => d.name === name);
          assert.ok(draw, `${name} remains visible`);
          assert.ok(
            Math.hypot(
              draw.x - result.expected[0],
              draw.y - result.expected[1],
            ) < 0.001,
            `${name} follows its exact anchor at DPR ${dpr}, frame ${frame}`,
          );
        }
      }
    }
    assert.equal(
      await page.evaluate(() => window.resizes),
      0,
      "no backing-store resets during rotation",
    );
    assert.equal(
      await page.evaluate(() => window.canadaRasters),
      1,
      "country glyphs are rasterized once across all camera frames",
    );
    const target = await page.evaluate(() =>
      window.draws.find((d) => d.name === "marker"),
    );
    const bounds = await page.locator("canvas").boundingBox();
    await page.mouse.click(bounds.x + target.x, bounds.y + target.y);
    assert.equal(
      await page.evaluate(() => window.picked),
      true,
      "moving marker remains clickable",
    );
    await page.screenshot({
      path: `/private/tmp/hazard-globe-animation-dpr${dpr}.png`,
    });
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log(
    "PASS: 240 globe/map frames at DPR 1 and 2; fixed label anchors, smooth marker coordinates, stable canvas, and marker picking.",
  );
} finally {
  await browser?.close();
  await server?.close();
  await fs.rm(fixture, { recursive: true, force: true });
}
