/**
 * Live clock phase overlay + HUD bridge: cards restage to the clock phase
 * without forking vendored hud.js.
 */
import { describe, expect, it } from "vitest";
// page3d JS modules have no .d.ts; the build still typechecks tests.
// @ts-expect-error — no types for the visual-fork classic ES module
import { phaseByName, phaseView } from "../page3d/estate/world/phase.js";
import { installHudBridge, liveFrame, type EstateHUD, type PhaseState } from "../src/view/hudBridge.ts";

const st = {
  day: 3,
  people: [
    { id: 1, x: 0, y: 0, mode: "in", in: true, pin: true, unit: 10, fixture: null },
    { id: 2, x: 1, y: 1, mode: "in", in: true, pin: true, unit: 11, fixture: null },
  ],
  phases: {
    day: 3,
    order: ["dawn", "morning", "afternoon", "evening", "night"],
    at: {
      morning: {
        "1": [4, 5, "s", null, null, null],
        "2": [2, 2, "a", 11, 7, null],
      },
      dawn: {
        "1": [0, 0, "i", 10, null, null],
        "2": [1, 1, "i", 11, null, null],
      },
    },
  },
} as PhaseState;

describe("phaseView", () => {
  it("places people where the named phase left them", () => {
    const m = phaseByName(st, "morning");
    expect(m.viewPhase).toBe("morning");
    expect(m.people[0]).toMatchObject({ x: 4, y: 5, mode: "school", in: false });
    expect(m.people[1]).toMatchObject({ x: 2, y: 2, mode: "at", fixture: 7, in: false });
  });

  it("leaves the snapshot alone for a missing or out-of-range phase", () => {
    expect(phaseView(st, -1)).toBe(st);
    expect(phaseByName(st, "nope")).toBe(st);
  });
});

describe("hudBridge", () => {
  it("liveFrame restages night facts to the clock phase", () => {
    const framed = liveFrame(st, "morning")!;
    expect(framed.viewPhase).toBe("morning");
    expect(framed.people![0]).toMatchObject({ mode: "school" });
  });

  it("liveFrame leaves scrubbed snapshots alone", () => {
    const scrubbed = { ...st, viewPhase: "dawn" };
    expect(liveFrame(scrubbed, "morning")).toBe(scrubbed);
  });

  it("installs shared phaseView and clock-aware cards", () => {
    let seen: PhaseState | undefined;
    const HUD: EstateHUD = {
      setClock: () => true,
      card: (s) => { seen = s; return true; },
      phaseView: () => st,
    };
    const { clockPhase } = installHudBridge(HUD);
    expect(HUD.phaseView).toBe(phaseView);
    HUD.setClock!("morning");
    expect(clockPhase()).toBe("morning");
    HUD.card!(st, null);
    expect(seen!.viewPhase).toBe("morning");
    expect(seen!.people![0]).toMatchObject({ mode: "school" });
  });
});
