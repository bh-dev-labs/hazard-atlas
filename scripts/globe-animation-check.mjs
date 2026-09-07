import { chromium } from "@playwright/test";
import { createServer } from "vite";
import fs from "node:fs/promises";
import assert from "node:assert/strict";

async function checkDisplayedInk(page, dpr) {
  await page.evaluate(async () => {
    const font = await new FontFace("Country Labels", `url(${window.labelFontUrl})`).load();
    document.fonts.add(font);
    const source = document.querySelector('[data-country="Canada"]');
    const panel = document.createElement("div");
    panel.style.cssText = "position:fixed;left:0;top:0;width:180px;height:90px;background:white;z-index:99999";
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.style.cssText = "position:absolute;width:180px;height:90px";
    const outline = document.createElementNS("http://www.w3.org/2000/svg", "g");
    const outlineStroke = source.cloneNode(true);
    outlineStroke.removeAttribute("paint-order");
    outlineStroke.removeAttribute("transform");
    outlineStroke.setAttribute("fill", "none");
    outlineStroke.setAttribute("stroke", "white");
    const outlineFill = source.cloneNode(true);
    outlineFill.removeAttribute("paint-order");
    outlineFill.removeAttribute("transform");
    outlineFill.setAttribute("fill", "black");
    outlineFill.setAttribute("stroke", "none");
    outline.append(outlineStroke, outlineFill);
    outline.style.opacity = "1";
    const size = Number(source.dataset.fontSize);
    const hinted = document.createElementNS("http://www.w3.org/2000/svg", "text");
    hinted.textContent = source.dataset.country;
    for (const [name, value] of Object.entries({
      "font-family": "Country Labels", "font-size": String(size),
      "text-anchor": "middle", "dominant-baseline": "central",
      fill: "black", stroke: "white", "stroke-width": "3", "paint-order": "stroke",
    })) hinted.setAttribute(name, value);
    svg.append(outline, hinted);
    const bitmap = document.createElement("canvas");
    const ink = bitmap.getContext("2d");
    ink.font = `${size}px 'Country Labels'`;
    bitmap.width = Math.ceil((ink.measureText(source.dataset.country).width + 8) * devicePixelRatio);
    bitmap.height = Math.ceil((size + 12) * devicePixelRatio);
    ink.scale(devicePixelRatio, devicePixelRatio);
    ink.font = `${size}px 'Country Labels'`;
    ink.textAlign = "center";
    ink.textBaseline = "middle";
    ink.fillStyle = "black";
    ink.strokeStyle = "white";
    ink.lineWidth = 3;
    ink.lineJoin = "round";
    ink.strokeText(source.dataset.country, bitmap.width / devicePixelRatio / 2, bitmap.height / devicePixelRatio / 2);
    ink.fillText(source.dataset.country, bitmap.width / devicePixelRatio / 2, bitmap.height / devicePixelRatio / 2);
    bitmap.style.cssText = `position:absolute;left:0;top:0;width:${bitmap.width / devicePixelRatio}px;height:${bitmap.height / devicePixelRatio}px;will-change:transform`;
    panel.append(svg, bitmap);
    document.body.append(panel);
    window.pixelProbe = { panel, svg, outline, hinted, bitmap };
  });
  const samples = { outline: [], hinted: [], bitmap: [] };
  for (const mode of Object.keys(samples)) {
    for (let phase = 0; phase < 8; phase++) {
      await page.evaluate(({ mode, phase, dpr }) => {
        const { svg, outline, hinted, bitmap } = window.pixelProbe;
        const horizontal = 80 + phase / (8 * dpr);
        const vertical = 40 + phase / (8 * dpr);
        svg.style.display = mode !== "bitmap" ? "block" : "none";
        bitmap.style.display = mode === "bitmap" ? "block" : "none";
        outline.style.display = mode === "outline" ? "block" : "none";
        hinted.style.display = mode === "hinted" ? "block" : "none";
        outline.setAttribute("transform", `translate(${horizontal},${vertical})`);
        hinted.setAttribute("x", String(horizontal));
        hinted.setAttribute("y", String(vertical));
        bitmap.style.transform = `translate3d(${horizontal - bitmap.width / dpr / 2}px,${vertical - bitmap.height / dpr / 2}px,0)`;
      }, { mode, phase, dpr });
      const screenshot = await page.screenshot({ clip: { x: 0, y: 0, width: 180, height: 90 } });
      samples[mode].push(await page.evaluate(async (base64) => {
        const image = await createImageBitmap(await (await fetch(`data:image/png;base64,${base64}`)).blob());
        const canvas = document.createElement("canvas");
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext("2d");
        context.drawImage(image, 0, 0);
        const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
        let mass = 0, energy = 0, horizontalMoment = 0, verticalMoment = 0;
        for (let offset = 0; offset < pixels.length; offset += 4) {
          const darkness = 1 - pixels[offset] / 255;
          mass += darkness;
          energy += darkness * darkness;
          horizontalMoment += darkness * ((offset / 4) % canvas.width);
          verticalMoment += darkness * Math.floor(offset / 4 / canvas.width);
        }
        return { contrast: energy / mass, x: horizontalMoment / mass, y: verticalMoment / mass };
      }, screenshot.toString("base64")));
    }
  }
  await page.evaluate(() => window.pixelProbe.panel.remove());
  const range = values => Math.max(...values.map(value => value.contrast)) - Math.min(...values.map(value => value.contrast));
  const motionError = values => Math.max(...values.slice(1).map((value, index) => Math.hypot(value.x - values[index].x - 1 / 8, value.y - values[index].y - 1 / 8)));
  console.log(JSON.stringify(samples.outline));
  console.log(JSON.stringify({ dpr, variation: Object.fromEntries(Object.entries(samples).map(([mode, values]) => [mode, range(values)])), motionError: Object.fromEntries(Object.entries(samples).map(([mode, values]) => [mode, motionError(values)])) }));
  assert.ok(range(samples.outline) < range(samples.bitmap), "outlines have less displayed contrast fluctuation than translated bitmaps");
  assert.ok(motionError(samples.outline) < 0.35 / dpr, "visible glyphs follow subpixel motion without pixel-row jumps");
}

const fixture = await fs.mkdtemp("web/.animation-check-");
let server, browser;
try {
  await fs.writeFile(`${fixture}/index.html`, `<div id="app"></div><script type="module" src="./fixture.tsx"></script>`);
  await fs.writeFile(`${fixture}/fixture.tsx`, `
import { render, h } from 'preact';
import { Globe } from '../src/Globe';
import { countryLabels } from '../src/countryLabels';
import { feature } from 'topojson-client';
import { geoOrthographic, geoEquirectangular } from 'd3-geo';
import labelFontUrl from '@fontsource/noto-sans/files/noto-sans-latin-400-normal.woff?url';
import '../src/style.css';
window.labelFontUrl = labelFontUrl;
document.head.insertAdjacentHTML('beforeend', '<style>body {margin:0}.canvas-wrap {width:min(800.25px,100vw);height:600.25px}</style>');
const geo = await fetch('/data/earth.json').then(response => response.json());
const canada = countryLabels(feature(geo, geo.objects.countries)).find(country => country.name === 'Canada');
const objects = [{id:'fire',kind:'incident',title:'Test fire',time:'2026-09-06',geometry:{type:'Point',coordinates:canada.coordinate}}];
let props = {events:[],objects,selected:'',onSelect:()=>{},onObject:()=>window.picked=true,
camera:{lon:-100,lat:30,zoom:1},setCamera:()=>{},flat:false,plates:false,countries:true,
transect:{},region:null,section:false,auto:false,speed:1,pause:()=>{}};
window.step = async (lon, flat=false, zoom=1) => {
  props = {...props,camera:{lon,lat:30,zoom},flat};
  render(h(Globe,props),document.getElementById('app'));
  await new Promise(requestAnimationFrame);
  const rect = document.querySelector('canvas').getBoundingClientRect();
  const proj = flat ? geoEquirectangular().rotate([-lon,0,0]).scale(rect.width/6.5*zoom)
    : geoOrthographic().rotate([-lon,-30,0]).scale(Math.min(rect.width,rect.height)*.46*zoom);
  return proj.translate([rect.width/2,rect.height/2])(canada.coordinate);
};
await window.step(-100);
window.ready = true;
`);
  server = await createServer({ root: "web", server: { host: "127.0.0.1", port: 0 } });
  await server.listen();
  browser = await chromium.launch();
  for (const [width, dpr] of [[1100, 1], [1100, 2], [390, 2], [390, 3]]) {
    const page = await browser.newPage({ viewport: { width, height: 850 }, deviceScaleFactor: dpr });
    const errors = [];
    page.on("pageerror", error => errors.push(error.message));
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
      CanvasRenderingContext2D.prototype.drawImage = function (bitmap, left, top, width, height) {
        if (this.canvas.isConnected) window.draws.push({ name: names.get(bitmap) || "marker", x: left + width / 2, y: top + height / 2 });
        return drawImage.apply(this, arguments);
      };
      for (const property of ["width", "height"]) {
        const descriptor = Object.getOwnPropertyDescriptor(HTMLCanvasElement.prototype, property);
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
    await page.waitForFunction(() => window.ready && document.querySelector('[data-country="Canada"]'));
    await page.evaluate(() => {
      window.resizes = 0;
      window.label = document.querySelector('[data-country="Canada"]');
      window.labelPath = window.label.getAttribute("d");
    });
    for (const flat of [false, true]) {
      let rotationOpacity;
      for (let frame = 0; frame < 60; frame++) {
        const result = await page.evaluate(async ({ frame, flat }) => {
          window.draws = [];
          const expected = await window.step(-100 + frame * 0.05, flat);
          const label = document.querySelector('[data-country="Canada"]');
          const anchor = new DOMPoint(0, 0).matrixTransform(label.getScreenCTM());
          const canvas = document.querySelector('canvas[role="application"]').getBoundingClientRect();
          return {
            expected,
            draws: [...window.draws, { name: "Canada", x: anchor.x - canvas.x, y: anchor.y - canvas.y }],
            sameElement: label === window.label,
            samePath: label.getAttribute("d") === window.labelPath,
            opacity: Number(label.style.opacity),
            canvasLabelCopies: window.draws.filter(draw => draw.name === "Canada").length,
          };
        }, { frame, flat });
        assert.ok(result.sameElement, "label element persists across frames");
        assert.ok(result.samePath, "glyph outlines stay unchanged across frames");
        rotationOpacity ??= result.opacity;
        assert.ok(result.opacity > 0, "interior label remains visible");
        assert.equal(result.opacity, rotationOpacity, "interior label opacity stays constant during rotation");
        assert.equal(result.canvasLabelCopies, 0, "labels are not resampled into the globe canvas");
        for (const name of ["Canada", "marker"]) {
          const draw = result.draws.find(draw => draw.name === name);
          assert.ok(draw, `${name} remains visible`);
          // Canada is a device-pixel-snapped glyph outline (anti-shimmer), so its anchor
          // can be off by up to half a device pixel; the marker draws at its exact anchor.
          // Canada is snapped to a quarter device pixel (anti-shimmer), so its anchor
          // can be off by up to an eighth of a device pixel; the marker draws exactly.
          const tolerance = name === "Canada" ? (Math.SQRT2 * 0.125) / dpr + 0.02 : 0.02;
          assert.ok(Math.hypot(draw.x - result.expected[0], draw.y - result.expected[1]) < tolerance, `${name} follows its exact anchor at DPR ${dpr}, frame ${frame}`);
        }
      }
    }
    assert.equal(await page.evaluate(() => window.resizes), 0, "no backing-store resets during rotation");
    assert.equal(await page.evaluate(() => window.canadaRasters), 0, "country glyphs never pass through a canvas bitmap");
    const target = await page.evaluate(() => window.draws.find(draw => draw.name === "marker"));
    const bounds = await page.locator('canvas[role="application"]').boundingBox();
    await page.mouse.click(bounds.x + target.x, bounds.y + target.y);
    assert.equal(await page.evaluate(() => window.picked), true, "moving marker remains clickable");
    await page.screenshot({ path: `/private/tmp/hazard-globe-animation-${width}-dpr${dpr}.png` });
    await checkDisplayedInk(page, dpr);
    assert.deepEqual(errors, []);
    await page.close();
  }
  console.log("PASS: 480 desktop/mobile globe/map frames at DPR 1, 2 and 3; persistent outlines, exact anchors, screenshot contrast and glyph-motion checks, and marker picking.");
} finally {
  await browser?.close();
  await server?.close();
  await fs.rm(fixture, { recursive: true, force: true });
}