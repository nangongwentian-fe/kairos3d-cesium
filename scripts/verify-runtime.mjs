import { createServer } from "node:net";
import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { spawn, spawnSync } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { tmpdir } from "node:os";

const root = process.cwd();
const host = "127.0.0.1";
const requireToken = process.argv.includes("--require-token") || process.env.KAIROS_REQUIRE_CESIUM_TOKEN === "1";
const keepServer = process.argv.includes("--keep-server");
const artifactDir = join(root, "runtime-verification-artifacts");
const artifactJson = join(artifactDir, "runtime-smoke.json");
const artifactPng = join(artifactDir, "runtime-smoke.png");

async function main() {
  mkdirSync(artifactDir, { recursive: true });

  const vitePort = Number(process.env.KAIROS_RUNTIME_PORT) || (await findOpenPort(5177));
  const chromePort = Number(process.env.KAIROS_CHROME_DEBUG_PORT) || (await findOpenPort(9222));
  const chromePath = findChrome();

  if (!chromePath) {
    throw new Error("Chrome was not found. Set CHROME_PATH to a Chromium-based browser executable.");
  }

  const vite = startVite(vitePort);
  const chrome = startChrome(chromePath, chromePort);
  const logs = {
    viteStdout: "",
    viteStderr: "",
    chromeStdout: "",
    chromeStderr: ""
  };

  vite.stdout?.on("data", (chunk) => {
    logs.viteStdout += chunk.toString();
  });
  vite.stderr?.on("data", (chunk) => {
    logs.viteStderr += chunk.toString();
  });
  chrome.stdout?.on("data", (chunk) => {
    logs.chromeStdout += chunk.toString();
  });
  chrome.stderr?.on("data", (chunk) => {
    logs.chromeStderr += chunk.toString();
  });

  let cdp;
  try {
    const url = `http://${host}:${vitePort}/?runtimeVerify=1`;
    await waitForHttp(`http://${host}:${vitePort}/`, 60_000);
    cdp = await openRuntimePage(chromePort, url);
    const result = await verifyPage(cdp, { url, requireToken });
    const screenshot = await cdp.send("Page.captureScreenshot", { format: "png", fromSurface: true });
    writeFileSync(artifactPng, Buffer.from(screenshot.data, "base64"));

    const output = {
      ok: result.ok,
      url,
      vitePort,
      requireToken,
      chromePath,
      steps: result.steps,
      consoleErrors: cdp.consoleErrors,
      pageErrors: cdp.pageErrors,
      failedRequests: cdp.failedRequests,
      badResponses: cdp.badResponses,
      checkedAt: new Date().toISOString()
    };
    writeFileSync(artifactJson, JSON.stringify(output, null, 2));

    console.log(
      JSON.stringify(
        {
          ok: output.ok,
          steps: output.steps.length,
          ionTokenConfigured: output.steps[0]?.value?.ionTokenConfigured ?? false,
          artifactJson,
          artifactPng
        },
        null,
        2
      )
    );
  } catch (error) {
    const output = {
      ok: false,
      error: String(error?.stack || error?.message || error),
      vitePort,
      requireToken,
      chromePath,
      logs,
      consoleErrors: cdp?.consoleErrors ?? [],
      pageErrors: cdp?.pageErrors ?? [],
      failedRequests: cdp?.failedRequests ?? [],
      badResponses: cdp?.badResponses ?? [],
      checkedAt: new Date().toISOString()
    };
    writeFileSync(artifactJson, JSON.stringify(output, null, 2));
    console.error(output.error);
    process.exitCode = 1;
  } finally {
    cdp?.close();
    if (!keepServer) {
      killTree(chrome);
      killTree(vite);
    }
  }
}

function startVite(port) {
  return spawn(pnpmCommand(), ["--filter", "@kairos3d/examples", "exec", "vite", "--host", host, "--port", String(port), "--strictPort"], {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    shell: process.platform === "win32",
    windowsHide: true
  });
}

function startChrome(executable, port) {
  const userDataDir = join(tmpdir(), `kairos-runtime-chrome-${Date.now()}`);
  const args = [
    "--headless=new",
    "--disable-extensions",
    "--disable-gpu",
    "--no-first-run",
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    "about:blank"
  ];
  if (process.platform === "linux") {
    args.splice(1, 0, "--no-sandbox");
  }

  const child = spawn(executable, args, {
    cwd: root,
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true
  });
  child.once("exit", () => {
    rmSync(userDataDir, { recursive: true, force: true });
  });
  return child;
}

async function openRuntimePage(debugPort, url) {
  await waitForHttp(`http://${host}:${debugPort}/json/version`, 30_000);
  const target = await createPageTarget(debugPort, url);
  const cdp = new CdpClient(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send("Runtime.enable");
  await cdp.send("Page.enable");
  await cdp.send("Network.enable");
  await cdp.send("Log.enable");
  await cdp.send("Page.navigate", { url });
  await cdp.waitFor("Page.loadEventFired", 60_000);
  return cdp;
}

async function createPageTarget(debugPort, url) {
  const endpoint = `http://${host}:${debugPort}/json/new?${encodeURIComponent(url)}`;
  let response = await fetch(endpoint, { method: "PUT" });
  if (!response.ok) {
    response = await fetch(endpoint);
  }
  if (!response.ok) {
    throw new Error(`Failed to create Chrome target: HTTP ${response.status}`);
  }
  return response.json();
}

async function verifyPage(cdp, options) {
  await evaluate(cdp, waitForHarnessExpression(), 90_000);
  const expression = runtimeVerifyExpression(options.requireToken);
  const value = await evaluate(cdp, expression, 120_000);

  if (cdp.consoleErrors.length || cdp.pageErrors.length || cdp.failedRequests.length || cdp.badResponses.length) {
    throw new Error("Runtime smoke completed but browser console or network checks failed.");
  }

  return value;
}

function waitForHarnessExpression() {
  return `
    (async () => {
      const started = Date.now();
      while (Date.now() - started < 90000) {
        if (globalThis.__kairosRuntimeVerify?.ready === true) {
          return true;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      throw new Error("Runtime verification harness did not become ready.");
    })()
  `;
}

function runtimeVerifyExpression(shouldRequireToken) {
  return `
    (async () => {
      const api = globalThis.__kairosRuntimeVerify;
      if (!api) {
        throw new Error("Runtime verification harness is missing.");
      }
      const steps = [];
      const run = async (name, fn) => {
        const value = await fn();
        steps.push({ name, ok: true, value });
        return value;
      };

      const state = await run("getState", () => api.getState());
      if (${JSON.stringify(shouldRequireToken)} && !state.ionTokenConfigured) {
        throw new Error("Cesium Ion token was required but not configured.");
      }

      await run("runDrawCircle", () => api.runDrawCircle());
      await run("runDrawRectangle", () => api.runDrawRectangle());
      await run("editCircle", () => api.editCircle());
      await run("editRectangle", () => api.editRectangle());
      await run("createOverlays", () => api.createOverlays());
      await run("pickOverlayAt", () => api.pickOverlayAt());
      await run("createModelWithOrientation", () => api.createModelWithOrientation());
      await run("snapshotRoundtrip", () => api.snapshotRoundtrip());
      await run("finalState", () => api.getState());
      return { ok: true, steps };
    })()
  `;
}

async function evaluate(cdp, expression, timeout) {
  const result = await cdp.send("Runtime.evaluate", {
    expression,
    awaitPromise: true,
    returnByValue: true,
    timeout
  });
  if (result.exceptionDetails) {
    throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  }
  return result.result.value;
}

class CdpClient {
  constructor(url) {
    this.url = url;
    this.nextId = 1;
    this.pending = new Map();
    this.eventWaiters = new Map();
    this.consoleErrors = [];
    this.pageErrors = [];
    this.failedRequests = [];
    this.badResponses = [];
    this.requests = new Map();
  }

  open() {
    return new Promise((resolve, reject) => {
      this.socket = new WebSocket(this.url);
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
      this.socket.addEventListener("message", (event) => this.handleMessage(event.data));
    });
  }

  close() {
    this.socket?.close();
  }

  send(method, params = {}) {
    const id = this.nextId++;
    this.socket.send(JSON.stringify({ id, method, params }));
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
    });
  }

  waitFor(method, timeout) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${method}`)), timeout);
      const waiters = this.eventWaiters.get(method) ?? [];
      waiters.push((params) => {
        clearTimeout(timer);
        resolve(params);
      });
      this.eventWaiters.set(method, waiters);
    });
  }

  handleMessage(raw) {
    const message = JSON.parse(raw);
    if (message.id) {
      const pending = this.pending.get(message.id);
      if (!pending) {
        return;
      }
      this.pending.delete(message.id);
      if (message.error) {
        pending.reject(new Error(message.error.message));
      } else {
        pending.resolve(message.result);
      }
      return;
    }

    this.recordEvent(message.method, message.params);
    const waiters = this.eventWaiters.get(message.method);
    if (waiters?.length) {
      this.eventWaiters.set(message.method, []);
      for (const waiter of waiters) {
        waiter(message.params);
      }
    }
  }

  recordEvent(method, params) {
    if (method === "Network.requestWillBeSent") {
      this.requests.set(params.requestId, {
        url: params.request?.url,
        type: params.type
      });
    }
    if (method === "Runtime.consoleAPICalled" && params.type === "error") {
      this.consoleErrors.push(params.args?.map((arg) => arg.value || arg.description).join(" "));
    }
    if (method === "Runtime.exceptionThrown") {
      this.pageErrors.push(params.exceptionDetails?.exception?.description || params.exceptionDetails?.text);
    }
    if (method === "Log.entryAdded" && params.entry?.level === "error") {
      this.consoleErrors.push(params.entry.text);
    }
    if (method === "Network.loadingFailed") {
      const request = this.requests.get(params.requestId);
      this.failedRequests.push({
        requestId: params.requestId,
        url: request?.url,
        type: request?.type,
        errorText: params.errorText
      });
    }
    if (method === "Network.responseReceived" && params.response?.status >= 400) {
      this.badResponses.push({ url: params.response.url, status: params.response.status });
    }
  }
}

async function waitForHttp(url, timeoutMs) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return;
      }
    } catch {
      // Server not ready yet.
    }
    await delay(250);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function findOpenPort(start) {
  for (let port = start; port < start + 100; port += 1) {
    if (await isOpen(port)) {
      return port;
    }
  }
  throw new Error(`No open port found from ${start} to ${start + 99}.`);
}

function isOpen(port) {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, host);
  });
}

function findChrome() {
  const candidates = [
    process.env.CHROME_PATH,
    "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe",
    "C:\\Program Files\\Microsoft\\Edge\\Application\\msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
    which("google-chrome"),
    which("google-chrome-stable"),
    which("chromium-browser"),
    which("chromium"),
    which("microsoft-edge")
  ].filter(Boolean);

  return candidates.find((candidate) => existsSync(candidate));
}

function which(command) {
  const result = spawnSync(process.platform === "win32" ? "where.exe" : "which", [command], {
    encoding: "utf8"
  });
  return result.status === 0 ? result.stdout.split(/\r?\n/).find(Boolean) : undefined;
}

function pnpmCommand() {
  return "pnpm";
}

function killTree(child) {
  if (!child?.pid || child.exitCode !== null) {
    return;
  }
  if (process.platform === "win32") {
    spawnSync("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  child.kill("SIGTERM");
}

main().catch((error) => {
  console.error(error?.stack || error?.message || error);
  process.exitCode = 1;
});
