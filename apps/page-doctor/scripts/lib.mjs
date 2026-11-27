// Small shared helpers for the Page Doctor fetchers (plain Node 22, built-in fetch only).
// NOTE: these helpers are deliberately duplicated in apps/creator-match/scripts/lib.mjs (apps stay independent).
import { mkdirSync, writeFileSync, renameSync, readFileSync, existsSync } from "node:fs";
import { dirname } from "node:path";

export const USER_AGENT =
  "indie-publisher-tools/1.0 (+https://github.com; static site data refresh; polite, 1 req/s)";

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Minimal `--key value` / `--flag` parser. */
export function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const eq = a.indexOf("=");
      if (eq > 0) out[a.slice(2, eq)] = a.slice(eq + 1);
      else if (i + 1 < argv.length && !argv[i + 1].startsWith("--")) out[a.slice(2)] = argv[++i];
      else out[a.slice(2)] = true;
    } else out._.push(a);
  }
  return out;
}

export function numEnv(name, fallback, env = process.env) {
  const v = Number(env[name]);
  return Number.isFinite(v) && env[name] !== "" && env[name] != null ? v : fallback;
}

export function log(...a) {
  console.log(`[${new Date().toISOString().slice(11, 19)}]`, ...a);
}
export function warn(...a) {
  console.warn(`[${new Date().toISOString().slice(11, 19)}] WARN`, ...a);
}

/** Spaces out request starts per host. `delayMs` can be raised at run time when the host pushes back. */
export class Throttle {
  constructor(name, delayMs) {
    this.name = name;
    this.delayMs = delayMs;
    this.baseDelayMs = delayMs;
    this.okStreak = 0;
    this.next = 0;
    this.stats = { requests: 0, ok: 0, failed: 0, statuses: {} };
  }
  async wait() {
    const now = Date.now();
    const at = Math.max(now, this.next);
    this.next = at + this.delayMs;
    if (at > now) await sleep(at - now);
  }
  /** Hold back every request to THIS host for ms (other hosts are unaffected). */
  pause(ms) {
    this.next = Math.max(this.next, Date.now() + ms);
  }
  note(status, ok) {
    this.stats.requests++;
    if (ok) {
      this.stats.ok++;
      // after a run of good responses, creep back toward the configured delay
      if (++this.okStreak >= 30 && this.delayMs > this.baseDelayMs) { this.delayMs = Math.max(this.baseDelayMs, Math.round(this.delayMs * 0.85)); this.okStreak = 0; }
    } else { this.stats.failed++; this.okStreak = 0; }
    const k = String(status);
    this.stats.statuses[k] = (this.stats.statuses[k] || 0) + 1;
  }
  summary() {
    const s = this.stats;
    return `${this.name}: ${s.requests} requests, ${s.ok} ok, ${s.failed} failed, statuses ${JSON.stringify(s.statuses)}, delay ${this.delayMs}ms`;
  }
}

/**
 * GET a URL as text through a Throttle. Retries network errors and 5xx; backs off on 429/403 (rate limiting)
 * and slows the throttle down. Returns { status, text }. Throws after the retries are used up.
 * 404 (and other 4xx) are returned, not thrown.
 */
export async function getText(url, throttle, opts = {}) {
  const retries = opts.retries ?? numEnv("HTTP_RETRIES", 3);
  const timeoutMs = opts.timeoutMs ?? numEnv("HTTP_TIMEOUT_MS", 30000);
  const rateLimitWaitMs = opts.rateLimitWaitMs ?? numEnv("RATE_LIMIT_WAIT_MS", 45000);
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    await throttle.wait();
    try {
      const res = await fetch(url, {
        headers: { "User-Agent": USER_AGENT, "Accept-Language": "en-US,en;q=0.8", ...(opts.headers || {}) },
        signal: AbortSignal.timeout(timeoutMs),
        redirect: "follow",
      });
      const text = await res.text();
      throttle.note(res.status, res.ok);
      if (res.status === 429 || (res.status === 403 && opts.treat403AsLimit)) {
        throttle.delayMs = Math.min(Math.round(throttle.delayMs * 1.5) + 100, 6000);
        lastErr = new Error(`HTTP ${res.status} (rate limited) for ${url}`);
        if (attempt < retries) {
          warn(`${throttle.name}: ${res.status}, pausing this host ${Math.round(rateLimitWaitMs / 1000)}s, delay now ${throttle.delayMs}ms`);
          throttle.pause(rateLimitWaitMs); // the pause is per host; the next wait() sleeps it off
          continue;
        }
        throw lastErr;
      }
      if (res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status} for ${url}`);
        if (attempt < retries) {
          await sleep(1500 * (attempt + 1));
          continue;
        }
        throw lastErr;
      }
      return { status: res.status, text };
    } catch (e) {
      if (e && /rate limited|^HTTP 5/.test(String(e.message))) throw e;
      lastErr = e;
      throttle.note("network-error", false);
      if (attempt < retries) await sleep(1500 * (attempt + 1));
    }
  }
  throw lastErr ?? new Error("request failed: " + url);
}

export async function getJson(url, throttle, opts = {}) {
  const { status, text } = await getText(url, throttle, opts);
  if (status >= 400) throw new Error(`HTTP ${status} for ${url}`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Non-JSON response (${text.slice(0, 80).replace(/\s+/g, " ")}) for ${url}`);
  }
}

/** Write JSON atomically: temp file in the same folder, then rename. */
export function writeJsonAtomic(path, obj, pretty = false) {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = `${path}.tmp-${process.pid}`;
  writeFileSync(tmp, JSON.stringify(obj, null, pretty ? 2 : 0) + "\n");
  renameSync(tmp, path);
}

export function readJsonIfExists(path) {
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}
