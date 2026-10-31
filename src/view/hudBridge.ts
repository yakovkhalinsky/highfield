/**
 * Wire Highfield's phase overlay into the vendored HUD without editing
 * hud.js: one runtime phaseView, live cards restaged to the clock phase
 * (the mesh already does this in world.js), and calendar day labels in the
 * feed / chronicle (vendored rows still say "day N").
 */
// @ts-expect-error — classic ES module in the visual fork, no .d.ts
import { phaseByName, phaseView } from "../../page3d/estate/world/phase.js";
import { dateLine, dateShort } from "../sim/world.ts";

export type PhaseState = {
  viewPhase?: string;
  phases?: { order?: string[] };
  people?: unknown[];
  date_line?: string;
  [k: string]: unknown;
};

export type EstateHUD = {
  head?: (st: PhaseState) => void;
  update?: (st: PhaseState) => void;
  tab?: (name: string, st?: PhaseState) => void;
  setClock?: (name: string | null) => boolean;
  card?: (st: PhaseState, selected: unknown) => boolean;
  phaseView?: (st: PhaseState, index: number) => PhaseState;
  [k: string]: unknown;
};

/** Restage a live (unscrubbed) snapshot to the named clock phase. */
export function liveFrame(st: PhaseState | null | undefined, clockPhase: string | null): PhaseState | null | undefined {
  if (!st || st.viewPhase || !clockPhase) return st;
  return phaseByName(st, clockPhase) as PhaseState;
}

/**
 * Rewrite vendored feed / chronicle day spans ("day 1,747") to calendar
 * labels in an HTML string. Used by tests; the live path edits the DOM
 * after write (see applyCalendarLabels).
 */
export function calendarDaySpans(html: string): string {
  return html.replace(/<span class="d">day ([0-9,]+)<\/span>/g, (m, raw: string) => {
    const day = Number(String(raw).replace(/,/g, ""));
    if (!Number.isSafeInteger(day) || day < 1) return m;
    const label = dateShort(day);
    const title = dateLine(day).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
    return `<span class="d" title="${title}">${label}</span>`;
  });
}

/**
 * After hud.js writes "day N", swap the label text in place. Patch.write
 * keys off el._html (the vendored markup), so this does not thrash the
 * list on the next poll — only a real day change rewrites the rows.
 */
export function applyCalendarLabels(root: ParentNode | null | undefined = typeof document !== "undefined" ? document.getElementById("chron") : null): void {
  if (!root) return;
  for (const el of Array.from(root.querySelectorAll(":scope > li > .d"))) {
    const m = /^day ([0-9,]+)$/.exec(el.textContent || "");
    if (!m) continue;
    const day = Number(m[1]!.replace(/,/g, ""));
    if (!Number.isSafeInteger(day) || day < 1) continue;
    el.textContent = dateShort(day);
    el.setAttribute("title", dateLine(day));
  }
}

function ensureFeedDateStyle(): void {
  if (typeof document === "undefined" || document.getElementById("hf-date-style")) return;
  const style = document.createElement("style");
  style.id = "hf-date-style";
  /* full month names need a little more than the vendored 62px day column */
  style.textContent = ".chron > li { grid-template-columns: 100px 1fr; }";
  document.head.append(style);
}

/**
 * Patch EstateHUD in place: shared phaseView, clock-aware cards, calendar
 * date_line on the header, calendar labels in the days feed. Returns the
 * clock-phase getter used by cards.
 */
export function installHudBridge(HUD: EstateHUD | undefined): { clockPhase: () => string | null } {
  let clockPhase: string | null = null;
  if (!HUD) return { clockPhase: () => clockPhase };

  HUD.phaseView = phaseView as EstateHUD["phaseView"];
  ensureFeedDateStyle();

  if (HUD.setClock) {
    const inner = HUD.setClock.bind(HUD);
    HUD.setClock = (name) => {
      clockPhase = name || null;
      return inner(name);
    };
  }

  if (HUD.card) {
    const inner = HUD.card.bind(HUD);
    HUD.card = (st, selected) => inner(liveFrame(st, clockPhase) as PhaseState, selected);
  }

  if (HUD.head) {
    const inner = HUD.head.bind(HUD);
    HUD.head = (st) => {
      inner(st);
      const el = document.getElementById("when");
      if (el && st?.date_line) el.textContent = st.date_line;
    };
  }

  /* hud.js closes over Patch.write at load, so wrapping Patch later is a
   * no-op — relabel after each panel write instead. */
  if (HUD.update) {
    const inner = HUD.update.bind(HUD);
    HUD.update = (st) => {
      inner(st);
      applyCalendarLabels();
    };
  }
  if (HUD.tab) {
    const inner = HUD.tab.bind(HUD);
    HUD.tab = (name, st) => {
      inner(name, st);
      applyCalendarLabels();
    };
  }

  return { clockPhase: () => clockPhase };
}
