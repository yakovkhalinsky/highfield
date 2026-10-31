/**
 * Runner, API and words — Highfield-owned. World ticks diverge from
 * Python; we still require deterministic runs, sane API shapes, and
 * render helpers that match their own contracts.
 */
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { canon, hash16, worldHash } from "../src/py/canon.ts";
import { dayLine, full, say, commas } from "../src/view/render.ts";
import { KEEP_EVENTS, plant, step } from "../src/view/runner.ts";
import type { Ev } from "../src/sim/engine/events.ts";
import { LLM_STATUS, MAX_QUEUED, SOURCE_TEXT, respond } from "../src/view/api.ts";
import * as W from "../src/sim/world.ts";
import { ESTATE, PYTHON } from "../scripts/parity.ts";

const HARNESS = join(import.meta.dirname, "web_harness.py");

describe.each([[1, 40], [42, 30]])("seed %i, %i days", (seed, days) => {
  const s = plant(seed);
  const said: string[] = [];
  for (let i = 0; i < days; i++) said.push(...step(s).map(say));
  const w = s.world;
  const again = plant(seed);
  for (let i = 0; i < days; i++) step(again);

  it("is deterministic for the same seed and length", () => {
    expect(worldHash(w)).toBe(worldHash(again.world));
    expect(hash16(canon(s.events))).toBe(hash16(canon(again.events)));
    expect(s.last_watch.why).toMatch(/\w/);
  });

  it("says every event without inventing nullish junk", () => {
    expect(said.length).toBeGreaterThan(0);
    for (const line of said) {
      expect(line).not.toMatch(/undefined|null|NaN/);
    }
  });

  it("draws a no-WebGL frame with the calendar header", () => {
    const status = `${W.weekdayName(w.day)} · no watcher yet`;
    const text = full({ world: w, status, watcher_line: null, chronicle: [] });
    expect(text).toMatch(/DAY \d+/);
    expect(text).toContain(W.weekdayName(w.day));
  });

  it("answers /api/ground and /api/state with Highfield fields", () => {
    const get = (path: string) => JSON.parse(respond(s, { step: 0 }, "GET", path, null).body);
    const ground = get("/api/ground");
    expect(ground.width).toBe(w.width);
    expect(ground.buildings.length).toBeGreaterThan(0);
    const state = get("/api/state");
    expect(state.llm).toBe(LLM_STATUS);
    expect(state.date_line).toBe(W.dateLine(w.day));
    expect(state.calendar).toEqual(W.calendarOf(w.day));
    expect(state.wear).toBeDefined();
    expect(state.puddle).toBeDefined();
    expect(state.wear.length).toBe(w.width * w.height);
    expect(state.chronicle).toEqual(s.chronicle.slice(-8));
  });

  it("takes control requests", () => {
    const run = structuredClone(s);
    const queued = { step: 0 };
    const r = respond(run, queued, "POST", "/api/control", JSON.stringify({ paused: true }));
    expect(r.status).toBe(200);
    expect(run.paused).toBe(true);
  });
});

it("refuses what web.py's handler refuses", () => {
  const s = plant(1);
  const q = { step: 0 };
  const err = (body: string) => JSON.parse(respond(s, q, "POST", "/api/control", body).body).error;
  expect(["{", "[]", "null", "3"].map(err)).toEqual(["the body is not JSON", ...Array(3).fill("the body is not a JSON object")]);
  expect(respond(s, q, "GET", "/api/nothing", null)).toMatchObject({ status: 404, body: "no such thing" });
  expect(respond(s, q, "POST", "/api/state", "{}")).toMatchObject({ status: 404 });
  expect(respond(s, q, "POST", "/api/control", "")).toMatchObject({ status: 200 });
  expect(["3.0", "1e2"].map(err)).toEqual(Array(2).fill("the body is not a JSON object"));
});

it("reads the path as urlparse(...).path does", () => {
  const s = plant(1);
  const q = { step: 0 };
  for (const p of ["/api/state?x=1", "/api/state#top", "/api/state;v=2", "/api/state?a=/b;c"]) {
    expect(respond(s, q, "GET", p, null).status, p).toBe(200);
  }
  expect(respond(s, q, "POST", "/api/control?x=1", '{"step": 2}')).toMatchObject({ status: 200 });
  expect(q.step).toBe(2);
  expect(respond(s, q, "GET", "/api/states", null).status).toBe(404);
});

it("answers a snapshot that throws with a 500 and the error, as web.py's /api/state does", () => {
  const s = plant(1);
  (s as { world: unknown }).world = { ...s.world, residents: null };
  const r = respond(s, { step: 0 }, "GET", "/api/state", null);
  expect(r.status).toBe(500);
  expect(JSON.parse(r.body).error).toMatch(/null/);
});

it("queues no more than MAX_QUEUED days", () => {
  const s = plant(1);
  const q = { step: 0 };
  for (let i = 0; i < 150; i++) respond(s, q, "POST", "/api/control", '{"step": 100}');
  expect(q.step).toBe(MAX_QUEUED);
});

it("can tell a float step from a whole one here (JSON.parse source text)", () => {
  expect(SOURCE_TEXT).toBe(true);
});

describe("the event log's cap", () => {
  const PAD = 380;
  const s = plant(5);
  s.events = Array.from({ length: PAD }, (_, n) => ({ kind: "pad", day: 0, n }) as unknown as Ev);
  for (let i = 0; i < 40; i++) step(s);

  it("prunes to the last 400 events", () => {
    expect(s.events.length).toBe(KEEP_EVENTS);
    expect(s.events[0]!.kind).toBe("pad");
  });
});

describe("dayLine at its thresholds", () => {
  const book = (total: number, extra: Partial<W.Daybook> = {}): W.Daybook =>
    ({ uses: { shop: total - Math.floor(total / 3), bench: Math.floor(total / 3) }, out: 0, noise: 0, broke: 0, ...extra });
  const books: W.Daybook[] = [];
  for (const total of [1, 351, 352, 353, 399, 400, 401, 1000, 12345]) {
    for (const weather of [undefined, "clear", "rain", "heat", "frost", "storm"]) {
      books.push(book(total, weather === undefined ? {} : { weather }));
      books.push(book(total, { weather: weather ?? "clear", sold_out: true }));
    }
  }
  books.push({ uses: {}, out: 0, noise: 0, broke: 0 });
  books.push({ uses: { shop: 400 }, out: 0, noise: 0, broke: 0 });
  books.push({ uses: { tree: 200, bench: 200 }, out: 0, noise: 0, broke: 0 });

  it("writes every line as render.day_line does, 352|353 and 399|400 included", () => {
    const py = JSON.parse(execFileSync(PYTHON, [HARNESS, "lines"],
      { cwd: ESTATE, encoding: "utf8", input: JSON.stringify(books) })) as string[];
    expect(books.map((b) => dayLine(b))).toEqual(py);
    expect(new Set(py).size).toBeGreaterThan(30);
  });
});

it("writes thousands as Python's {:,} does", () => {
  expect([0, 999, 1000, -1234567].map(commas)).toEqual(["0", "999", "1,000", "-1,234,567"]);
});
