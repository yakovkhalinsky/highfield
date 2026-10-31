/**
 * The store and the worker's saving, against fake-indexeddb: what is
 * resumed, what is refused, that a crashed day is never kept, that a
 * failed save is told and that a second tab on a seed does not save over
 * the first. setTimeout is faked (the worker's pace); setImmediate is not,
 * so IndexedDB's own events still run.
 */
import "fake-indexeddb/auto";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { plant, step, type RunState } from "../src/view/runner.ts";
import type { FromWorker } from "../src/worker/protocol.ts";
import * as store from "../src/worker/store.ts";

const boom = { on: false };
vi.mock("../src/view/runner.ts", async (orig) => {
  const real = await orig<typeof import("../src/view/runner.ts")>();
  // a day that throws part way: the world has moved on when it throws
  return { ...real, step: (s: RunState) => { real.step(s); if (boom.on) throw new Error("boom"); } };
});

/** a read that answers 500 (or throws) while its path is set, the others as ever */
const sick = { path: "", throws: false };
vi.mock("../src/view/api.ts", async (orig) => {
  const real = await orig<typeof import("../src/view/api.ts")>();
  return {
    ...real,
    respond: (...a: Parameters<typeof real.respond>) => {
      if (a[2] === "GET" && a[3] === sick.path) {
        if (sick.throws) throw new Error("sick");
        return { status: 500, contentType: "text/plain", body: "sick" };
      }
      return real.respond(...a);
    },
  };
});

const posted: FromWorker[] = [];
const self = { postMessage: (m: FromWorker) => posted.push(m), onmessage: null as null | ((e: { data: unknown }) => unknown) };
let nextId = 1;
const send = async (data: object) => {
  await self.onmessage!({ data: { id: nextId++, ...data } });
  return posted.at(-1)!;
};
/** let IndexedDB's queued events run */
const settle = async () => { for (let i = 0; i < 20; i++) await new Promise((r) => setImmediate(r)); };
const dayOf = async (seed: number) => (await store.load(seed))?.state.world.day;

function rawPut(rec: unknown): Promise<void> {
  return new Promise((done, fail) => {
    const rq = indexedDB.open("highfield", 1);
    rq.onsuccess = () => {
      const tx = rq.result.transaction("estates", "readwrite");
      tx.objectStore("estates").put(rec);
      tx.oncomplete = () => { rq.result.close(); done(); };
      tx.onerror = () => fail(tx.error);
    };
  });
}

beforeAll(async () => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
  (globalThis as { self?: unknown }).self = self;
  await import("../src/worker/sim.worker.ts");
});
afterEach(() => { boom.on = false; sick.path = ""; sick.throws = false; vi.unstubAllGlobals(); vi.restoreAllMocks(); });

describe("the store", () => {
  it("reclaims a seed after this tab releases it", async () => {
    const a = await store.claim(42);
    expect(a).toBeTypeOf("function");
    await a!();
    const b = await store.claim(42);
    expect(b).toBeTypeOf("function");
    await b!();
  });

  it("resumes its own save, and refuses another format, other rules, the wrong seed or a broken shape", async () => {
    const s = plant(11);
    step(s);
    expect(await store.save(s)).toEqual({ ok: true });
    expect((await store.load(11))?.state).toEqual(s);
    expect(await store.lastSeed()).toBe(11);
    const rec = { seed: 11, format: store.FORMAT, rules: store.RULES, saved: 0, state: s };
    const bad: [string, unknown][] = [
      ["format", { ...rec, format: store.FORMAT + 1 }],
      ["rules", { ...rec, rules: "0000000000000000" }],
      ["seed", { ...rec, state: plant(12) }],
      ["cells", { ...rec, state: { ...s, world: { ...s.world, cells: null } } }],
      ["day", { ...rec, state: { ...s, world: { ...s.world, day: "3" } } }],
      ["events", { ...rec, state: { ...s, events: {} } }],
      ["pace", { ...rec, state: { ...s, tick_seconds: -1 } }],
      ["memory", { ...rec, state: { ...s, memory: { why: { used: [] } } } }],
      ["chronicle", { ...rec, state: { ...s, chronicle: {} } }],
      ["not an object", { seed: 11, format: store.FORMAT, rules: store.RULES, state: 7 }],
    ];
    for (const [why, r] of bad) {
      await rawPut(r);
      expect(await store.load(11), why).toBeUndefined();
    }
  });

  it("pins RunState's keys to FORMAT: change one, bump the other", () => {
    const s = plant(1);
    expect(store.looksLikeRun(s, 1)).toBe(true);
    expect([store.FORMAT, Object.keys(s).sort(), Object.keys(s.world).sort()]).toMatchSnapshot();
  });

  it("says why a save failed: storage full", async () => {
    vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    expect(await store.save(plant(13))).toEqual({ ok: false, why: "storage full" });
  });
});

describe("the worker's saves", () => {
  it("forgets with fresh, and a resumed estate waits its pace", async () => {
    await send({ type: "open", seed: 3, fresh: true });
    vi.advanceTimersByTime(0); // planted on day 1; a new estate's first day comes at once
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":3}' });
    vi.advanceTimersByTime(300);
    // stepping pauses; run on, so a resume has a pace it could wrongly jump
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"paused":false}' });
    await send({ type: "flush" });
    expect(await dayOf(3)).toBe(5);

    expect(await send({ type: "open", seed: 3 })).toMatchObject({ type: "opened", resumed: true, day: 5, saving: true });
    vi.advanceTimersByTime(0);
    await send({ type: "flush" });
    expect(await dayOf(3)).toBe(5);

    expect(await send({ type: "open", seed: 3, fresh: true })).toMatchObject({ type: "opened", resumed: false, day: 1 });
    expect(await dayOf(3)).toBe(1);
  });

  it("never keeps a crashed day, and marks the save with the day that threw", async () => {
    await send({ type: "open", seed: 4, fresh: true });
    vi.advanceTimersByTime(0); // day 2 ticks; its save is under way
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":1}' });
    boom.on = true;
    vi.advanceTimersByTime(100); // day 3 throws while day 2 is still saving
    expect(posted.at(-1)).toMatchObject({ type: "error", id: null });
    await settle();
    expect(await store.load(4)).toMatchObject({ state: { world: { day: 2 } }, crashed: 3 });
    boom.on = false;
    expect(await send({ type: "open", seed: 4 })).toMatchObject({ type: "opened", day: 2, crashed: 3 });
  });

  it("tells the page when saving fails, and when it works again", async () => {
    await send({ type: "open", seed: 5, fresh: true });
    const put = vi.spyOn(IDBObjectStore.prototype, "put").mockImplementation(() => { throw new DOMException("full", "QuotaExceededError"); });
    posted.length = 0;
    vi.advanceTimersByTime(0);
    await settle();
    expect(posted).toContainEqual({ type: "saving", id: null, ok: false, why: "storage full" });
    put.mockRestore();
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":1}' });
    vi.advanceTimersByTime(100);
    await settle();
    expect(posted.at(-1)).toEqual({ type: "saving", id: null, ok: true, why: "" });
  });

  it("does not save over a seed open in another tab", async () => {
    await send({ type: "open", seed: 6, fresh: true });
    await send({ type: "flush" });
    vi.stubGlobal("navigator", { locks: { request: (_n: string, _o: object, cb: (l: null) => unknown) => Promise.resolve(cb(null)) } });
    expect(await send({ type: "open", seed: 6, fresh: true })).toMatchObject({ type: "opened", saving: false, why: "open in another tab" });
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":2}' });
    vi.advanceTimersByTime(300);
    await send({ type: "flush" });
    // fresh was not honoured and nothing was saved: the other tab's estate stands
    expect(await dayOf(6)).toBe(1);
  });

  it("keeps the crash mark through reloads until a day past it is saved", async () => {
    await send({ type: "open", seed: 8, fresh: true });
    vi.advanceTimersByTime(0); // day 2
    await send({ type: "flush" });
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":1}' });
    boom.on = true;
    vi.advanceTimersByTime(100); // day 3 throws
    await settle();
    boom.on = false;
    for (let reload = 0; reload < 2; reload++) {
      expect(await send({ type: "open", seed: 8 })).toMatchObject({ type: "opened", day: 2, crashed: 3 });
      await send({ type: "flush" }); // the page closing saves what it has
      expect(await store.load(8)).toMatchObject({ crashed: 3 });
    }
    await send({ type: "api", method: "POST", path: "/api/control", body: '{"step":1}' });
    vi.advanceTimersByTime(100); // day 3 goes through this time
    await send({ type: "flush" });
    const after = await store.load(8);
    expect(after?.state.world.day).toBe(3);
    expect(after).not.toHaveProperty("crashed");
  });

  it("neither runs nor saves over a save that has a run's shape but cannot be run", async () => {
    const s = plant(9);
    step(s);
    const rid = Object.keys(s.world.residents)[0]!;
    const bad = { ...s, world: { ...s.world, residents: { ...s.world.residents, [rid]: null } } };
    expect(store.looksLikeRun(bad, 9)).toBe(true);
    await rawPut({ seed: 9, format: store.FORMAT, rules: store.RULES, saved: 0, state: bad });
    const o = await send({ type: "open", seed: 9 });
    expect(o).toMatchObject({ type: "opened", seed: 9, day: 2, resumed: false, saving: false });
    expect((o as { broken?: string }).broken).toMatch(/answers 500|throws/);
    expect(await send({ type: "api", method: "GET", path: "/api/state", body: null })).toMatchObject({ status: 503 });
    await send({ type: "flush" });
    expect((await store.load(9))?.state.world.residents[rid]).toBeNull();
    // "start over" is the way on
    expect(await send({ type: "open", seed: 9, fresh: true })).toMatchObject({ type: "opened", day: 1, saving: true });
  });

  it("catches a save where only one of the three reads fails", async () => {
    await send({ type: "open", seed: 16, fresh: true });
    await send({ type: "flush" });
    const saved = await store.load(16);
    for (const path of ["/api/ground", "/api/state", "/api/plain"]) {
      for (const throws of [false, true]) {
        sick.path = path;
        sick.throws = throws;
        const why = throws ? `${path} throws: sick` : `${path} answers 500`;
        expect(await send({ type: "open", seed: 16 }), why).toMatchObject({ type: "opened", resumed: false, saving: false, broken: why });
        await send({ type: "flush" });
        expect(await store.load(16), why).toEqual(saved);
      }
    }
    sick.path = "";
    expect(await send({ type: "open", seed: 16 })).toMatchObject({ type: "opened", resumed: true, day: 1 });
  });

  it("meets a save whose next day throws with start over, not a crash on every reload", async () => {
    await send({ type: "open", seed: 10, fresh: true });
    await send({ type: "flush" });
    boom.on = true;
    expect(await send({ type: "open", seed: 10 })).toMatchObject({ type: "opened", resumed: false, broken: "day 2 throws: boom" });
    boom.on = false;
    expect(await send({ type: "open", seed: 10 })).toMatchObject({ type: "opened", resumed: true, day: 1 });
  });

  it("saves again after an open that could not hold the seed", async () => {
    vi.stubGlobal("navigator", { locks: { request: (_n: string, _o: object, cb: (l: null) => unknown) => Promise.resolve(cb(null)) } });
    await send({ type: "open", seed: 15, fresh: true });
    await send({ type: "flush" }); // nothing to do: not held
    vi.unstubAllGlobals();
    await send({ type: "open", seed: 15, fresh: true });
    vi.advanceTimersByTime(0); // day 2
    await send({ type: "flush" });
    expect(await dayOf(15)).toBe(2);
  });
});

describe("a newer page", () => {
  it("is not blocked by this one: the store steps aside on versionchange", async () => {
    expect(await store.available()).toBe(true);
    const blocked = vi.fn();
    const v2 = await new Promise<IDBDatabase>((done, fail) => {
      const rq = indexedDB.open("highfield", 2);
      rq.onblocked = blocked;
      rq.onsuccess = () => done(rq.result);
      rq.onerror = () => fail(rq.error);
    });
    expect(blocked).not.toHaveBeenCalled();
    expect(v2.version).toBe(2);
    v2.close();
    // the old page's store now finds a database newer than it: no storage, not a hang
    expect(await store.save(plant(14))).toEqual({ ok: false, why: "no storage here" });
  });
});
