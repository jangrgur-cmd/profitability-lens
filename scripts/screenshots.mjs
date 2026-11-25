// Retakes the README screenshots in docs/screenshots/ with a local Edge or
// Chrome in headless mode, driven over the DevTools protocol. Needs no npm
// packages: Node's own http server serves the site and its WebSocket client
// talks to the browser. Run from anywhere:
//
//   node scripts/screenshots.mjs
//
// Set BROWSER to the browser's path if it is not found. A fresh, temporary
// browser profile is used, so nothing on your own profile changes.

import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const OUT = join(ROOT, "docs", "screenshots");
const PORT = 5199;
const DEBUG_PORT = 9339;

const DESKTOP = { width: 1280, height: 900, scale: 1, mobile: false };
const PHONE = { width: 390, height: 844, scale: 2, mobile: true };

const pickFirstChip = (id) => `document.querySelector("#${id} button").click()`;
const resultSection = (n) => `#results-body > section:nth-of-type(${n})`;

/**
 * Each shot: page, viewport, theme, Learn mode, a script to run after load,
 * and optionally a CSS selector to crop to (cut at maxHeight pixels).
 */
const SHOTS = [
  { file: "rating.png", page: "index.html", view: DESKTOP, theme: "light", run: pickFirstChip("example-chips") },
  { file: "learn-mode-dark.png", page: "index.html", view: DESKTOP, theme: "dark", learn: true, run: pickFirstChip("example-chips"), clip: resultSection(4), maxHeight: 470 },
  { file: "rating-phone-dark.png", page: "index.html", view: PHONE, theme: "dark", run: `${pickFirstChip("example-chips")}; document.querySelector("#results").scrollIntoView()` },
  { file: "segments.png", page: "segments.html", view: DESKTOP, theme: "light", run: pickFirstChip("seg-example-chips"), clip: "#seg-form ~ *", maxHeight: 700 },
  { file: "practice.png", page: "learn.html", view: DESKTOP, theme: "light" },
];

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png" };

function serve() {
  const server = createServer((req, res) => {
    const path = normalize(decodeURIComponent(new URL(req.url, "http://x").pathname)).replace(/^[\\/]+/, "");
    const file = join(ROOT, path || "index.html");
    if (!file.startsWith(ROOT) || !existsSync(file) || !statSync(file).isFile()) {
      res.writeHead(404).end();
      return;
    }
    res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream" });
    res.end(readFileSync(file));
  });
  return new Promise((resolve) => server.listen(PORT, "127.0.0.1", () => resolve(server)));
}

function findBrowser() {
  const candidates = [
    process.env.BROWSER,
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
    "/usr/bin/microsoft-edge",
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) throw new Error("No Edge or Chrome found. Set BROWSER to its path.");
  return found;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function debuggerUrl() {
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await sleep(200);
    }
  }
  throw new Error("The browser did not start its DevTools endpoint.");
}

/** A minimal DevTools protocol client over one WebSocket. */
function connect(url) {
  const ws = new WebSocket(url);
  let nextId = 1;
  const pending = new Map();
  const waiters = [];
  ws.addEventListener("message", (event) => {
    const msg = JSON.parse(event.data);
    if (msg.id && pending.has(msg.id)) {
      const { resolve, reject } = pending.get(msg.id);
      pending.delete(msg.id);
      if (msg.error) reject(new Error(msg.error.message));
      else resolve(msg.result);
    } else if (msg.method) {
      for (const w of waiters.filter((x) => x.method === msg.method && x.sessionId === msg.sessionId)) {
        waiters.splice(waiters.indexOf(w), 1);
        w.resolve(msg.params);
      }
    }
  });
  const send = (method, params = {}, sessionId) => new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });
  const once = (method, sessionId) => new Promise((resolve) => waiters.push({ method, sessionId, resolve }));
  return new Promise((resolve) => ws.addEventListener("open", () => resolve({ send, once, close: () => ws.close() })));
}

async function shoot(cdp, shot) {
  const { targetId } = await cdp.send("Target.createTarget", { url: "about:blank" });
  const { sessionId } = await cdp.send("Target.attachToTarget", { targetId, flatten: true });
  const send = (method, params) => cdp.send(method, params, sessionId);
  const { view } = shot;

  await send("Page.enable");
  await send("Emulation.setDeviceMetricsOverride", { width: view.width, height: view.height, deviceScaleFactor: view.scale, mobile: view.mobile });
  await send("Emulation.setEmulatedMedia", { features: [{ name: "prefers-color-scheme", value: shot.theme }] });
  const prefs = { lang: "en", theme: shot.theme, learn: shot.learn ? "on" : "off" };
  await send("Page.addScriptToEvaluateOnNewDocument", {
    source: `for (const [k, v] of Object.entries(${JSON.stringify(prefs)})) localStorage.setItem("profitability-lens/" + k, v);`,
  });

  const loaded = cdp.once("Page.loadEventFired", sessionId);
  await send("Page.navigate", { url: `http://127.0.0.1:${PORT}/${shot.page}` });
  await loaded;
  await sleep(600);
  if (shot.run) await send("Runtime.evaluate", { expression: shot.run, awaitPromise: true });
  await sleep(800);

  let clip;
  if (shot.clip) {
    const { result } = await send("Runtime.evaluate", {
      expression: `(() => { const el = document.querySelector(${JSON.stringify(shot.clip)}); el.scrollIntoView(); const r = el.getBoundingClientRect(); return JSON.stringify({ x: r.left + scrollX - 16, y: r.top + scrollY - 16, width: r.width + 32, height: Math.min(r.height + 32, ${shot.maxHeight ?? Infinity}) }); })()`,
      returnByValue: true,
    });
    clip = { ...JSON.parse(result.value), scale: 1 };
    await sleep(300);
  }

  const { data } = await send("Page.captureScreenshot", { format: "png", clip, captureBeyondViewport: Boolean(clip) });
  writeFileSync(join(OUT, shot.file), Buffer.from(data, "base64"));
  await cdp.send("Target.closeTarget", { targetId });
  console.log(`Wrote docs/screenshots/${shot.file}`);
}

const server = await serve();
const profile = mkdtempSync(join(tmpdir(), "pl-shots-"));
const browser = spawn(findBrowser(), [
  "--headless=new", `--remote-debugging-port=${DEBUG_PORT}`, `--user-data-dir=${profile}`,
  "--no-first-run", "--no-default-browser-check", "--hide-scrollbars", "--force-color-profile=srgb", "about:blank",
], { stdio: "ignore" });

try {
  const cdp = await connect(await debuggerUrl());
  for (const shot of SHOTS) await shoot(cdp, shot);
  cdp.close();
} finally {
  browser.kill();
  server.close();
  await sleep(500);
  rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
}
