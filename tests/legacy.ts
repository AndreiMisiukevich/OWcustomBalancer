import { JSDOM } from "jsdom";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";

const ROOT = path.resolve(__dirname, "..");
const LEGACY = path.join(ROOT, "legacy");
const PAGE_SCRIPTS = [
  "globals.js",
  "ow_defines.js",
  "common.js",
  "owapi.js",
  "stats_updater.js",
  "import_export.js",
  "ui.js",
  "init.js",
];

export function seededRandom(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface LegacyPage {
  window: any;
  g: (expr: string) => any;
  alerts: string[];
  workerMessages: any[];
  close: () => void;
}

export function loadLegacyPage(storage: Record<string, string> = {}): LegacyPage {
  const html = fs
    .readFileSync(path.join(LEGACY, "index.html"), "utf8")
    .replace(/<script[^>]*><\/script>/g, "");
  const dom = new JSDOM(html, { url: "http://legacy.test/", runScripts: "outside-only" });
  const w = dom.window as any;
  for (const [k, v] of Object.entries(storage)) w.localStorage.setItem(k, v);
  const alerts: string[] = [];
  const workerMessages: any[] = [];
  w.alert = (m: string) => alerts.push(String(m));
  w.confirm = () => true;
  w.prompt = () => null;
  w.Worker = class {
    onmessage: unknown = null;
    postMessage(m: unknown) {
      workerMessages.push(JSON.parse(JSON.stringify(m)));
    }
    terminate() {}
  };
  w.HTMLElement.prototype.scrollIntoView = () => {};
  Object.defineProperty(w.HTMLElement.prototype, "innerText", {
    get() {
      return this.textContent;
    },
    set(v: string) {
      this.textContent = v;
    },
  });
  w.XMLHttpRequest = class {
    open() {}
    send() {}
  };
  const ctx = dom.getInternalVMContext();
  for (const s of PAGE_SCRIPTS) {
    new vm.Script(fs.readFileSync(path.join(LEGACY, s), "utf8"), { filename: s }).runInContext(ctx);
  }
  return {
    window: w,
    g: (expr: string) => w.eval(expr),
    alerts,
    workerMessages,
    close: () => dom.window.close(),
  };
}

export function loadWorkerBalancer(dir: "legacy" | "public/balancer", random: () => number) {
  const ctx: any = { performance: { now: () => 0 }, console };
  vm.createContext(ctx);
  vm.runInContext("Math.random = __rnd;", Object.assign(ctx, { __rnd: random }));
  for (const f of ["ow_defines.js", "common.js", "balancer.js"]) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, dir, f), "utf8"), ctx, { filename: f });
  }
  return ctx;
}

export function readRepoFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel));
}
