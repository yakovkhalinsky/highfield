/**
 * Wire Highfield's phase overlay into the vendored HUD without editing
 * hud.js: one runtime phaseView, live cards restaged to the clock phase
 * (the mesh already does this in world.js), and calendar day labels in the
 * feed / chronicle (vendored rows still say "day N").
 */
// @ts-expect-error — classic ES module in the visual fork, no .d.ts
import { phaseByName, phaseView } from "../../page3d/estate/world/phase.js";
import type { WhyView } from "../sim/engine/whyLog.ts";
import { dateLine, dateShort } from "../sim/world.ts";

export type PhaseState = {
  viewPhase?: string;
  phases?: { order?: string[] };
  people?: unknown[];
  date_line?: string;
  story?: { changing?: string; fraying?: string };
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
 * Vendored head() always writes "day N · season · weekday". Swap in the
 * calendar line when the snapshot carries one. update() calls its local
 * head (not EstateHUD.head), so this must run after update as well as head.
 */
export function applyDateLine(st: PhaseState | null | undefined): void {
  const el = typeof document !== "undefined" ? document.getElementById("when") : null;
  if (el && st?.date_line) el.textContent = st.date_line;
}

export interface StoryState {
  story?: { changing?: string; fraying?: string };
  [k: string]: unknown;
}

/** Two lines, change then fray, for the story slot above the census chips. */
export function storyLines(st: StoryState | null | undefined): [string, string] {
  return [st?.story?.changing ?? "", st?.story?.fraying ?? ""];
}

const TAB_ORDER = ["chron", "census", "watch"] as const;
const TAB_IDS: Record<(typeof TAB_ORDER)[number], string> = {
  chron: "tabChron", census: "tabCensus", watch: "tabWatch",
};

const WHY_ORDER = ["dawn", "morning", "afternoon", "evening", "night"];

export interface WhyLine { phase: string; text: string }

function placeWord(kind: string): string {
  return kind.replace(/_/g, " ");
}

/** One line per phase that has a reason, the phase on the card first. */
export function whyLines(
  st: { viewPhase?: string; people?: unknown[] } | null | undefined,
  selected: { kind?: string; id?: number } | null | undefined,
): WhyLine[] {
  if (!st || !selected || selected.kind !== "resident" || selected.id == null) return [];
  const person = (st.people ?? []).find((p): p is { id?: number; why?: WhyView[] } => {
    return !!p && typeof p === "object" && (p as { id?: unknown }).id === selected.id;
  });
  const rows = person?.why ?? [];
  const focus = st.viewPhase ?? "";
  const ordered = [...rows].sort((a, b) => {
    if (a.phase === focus) return -1;
    if (b.phase === focus) return 1;
    const ia = WHY_ORDER.indexOf(a.phase);
    const ib = WHY_ORDER.indexOf(b.phase);
    return (ia < 0 ? WHY_ORDER.length : ia) - (ib < 0 ? WHY_ORDER.length : ib);
  });
  const out: WhyLine[] = [];
  for (const row of ordered) {
    const needs = row.ranked.slice(0, 3).join(", ");
    let text = needs;
    if (row.place) {
      const named = placeWord(row.place);
      const tail = row.met ? named : `${named}, not there yet`;
      text = text ? `${text} → ${tail}` : tail;
    }
    const also = row.candidates.filter((c) => c && c !== row.place).slice(0, 2).map(placeWord);
    if (also.length) text = text ? `${text} · also ${also.join(", ")}` : `also ${also.join(", ")}`;
    if (text) out.push({ phase: row.phase, text });
  }
  return out;
}

/** Why lines under the vendored card rows. The card's own write replaces
 *  its HTML; these rows are put back when that happens. */
export function applyWhy(
  st: { viewPhase?: string; people?: unknown[] } | null | undefined,
  selected: unknown,
): void {
  if (typeof document === "undefined") return;
  const rows = document.getElementById("cardRows");
  if (!rows) return;
  const sel = selected as { kind?: string; id?: number } | null | undefined;
  const lines = whyLines(st, sel);
  const sig = lines.map((l) => `${l.phase}\t${l.text}`).join("\n");
  if (rows.dataset.hfWhy === sig && (sig === "" || rows.querySelector("[data-hf-why]"))) return;
  for (const el of Array.from(rows.querySelectorAll("[data-hf-why]"))) el.remove();
  rows.dataset.hfWhy = sig;
  if (!lines.length) return;
  const head = document.createElement("li");
  head.className = "hd";
  head.dataset.hfWhy = "1";
  const ht = document.createElement("span");
  ht.textContent = "why";
  head.append(ht, document.createElement("span"));
  rows.append(head);
  for (const line of lines) {
    const li = document.createElement("li");
    li.dataset.hfWhy = "1";
    const a = document.createElement("span");
    a.textContent = line.phase;
    const b = document.createElement("span");
    b.textContent = line.text;
    li.append(a, b);
    rows.append(li);
  }
}

/** Arrow keys move the feed tabs. Home/End jump to the ends. */
export function nextTab(current: string, key: string): string | null {
  const i = TAB_ORDER.indexOf(current as (typeof TAB_ORDER)[number]);
  if (i < 0) return null;
  if (key === "ArrowRight") return TAB_ORDER[(i + 1) % TAB_ORDER.length]!;
  if (key === "ArrowLeft") return TAB_ORDER[(i - 1 + TAB_ORDER.length) % TAB_ORDER.length]!;
  if (key === "Home") return TAB_ORDER[0]!;
  if (key === "End") return TAB_ORDER[TAB_ORDER.length - 1]!;
  return null;
}

function ensureA11y(): void {
  if (typeof document === "undefined" || document.getElementById("hf-a11y-style")) return;
  const style = document.createElement("style");
  style.id = "hf-a11y-style";
  /* Dim text on the glass was #b4bac0. Lift it, and stop the quiet rows
   * fading further, so small type stays readable. Focus is a ring, not a
   * colour change. Reduced motion drops the tag fade in the scene. */
  style.textContent = `
    :root { --dim: #d7dbe0; }
    .chron li.quiet { opacity: 1; }
    .tabs button:focus-visible, .ctl button:focus-visible, .seedrow button:focus-visible,
    .seedrow input:focus-visible, .card .x:focus-visible {
      outline: 2px solid #ffca7a; outline-offset: 2px;
    }
    #hf-story {
      margin-top: 8px; font-size: 13px; line-height: 1.35; color: var(--ink, #e9e5dc);
    }
    #hf-story .changing { display: block; }
    #hf-story .fraying { display: block; color: #d7dbe0; margin-top: 2px; }
    #cardRows li[data-hf-why] span { font-size: 12px; line-height: 1.35; }
    @media (prefers-reduced-motion: reduce) {
      #hf-story { transition: none; }
    }
  `;
  document.head.append(style);
  const tabs = document.querySelector(".tabs");
  if (tabs && !tabs.getAttribute("aria-label")) tabs.setAttribute("aria-label", "Estate record");
}

/** Story above the population chips. The words are also the accessible name. */
export function applyStory(st: StoryState | null | undefined): void {
  if (typeof document === "undefined") return;
  const pops = document.getElementById("pops");
  const box = pops?.parentElement;
  if (!box) return;
  let el = document.getElementById("hf-story");
  if (!el) {
    el = document.createElement("div");
    el.id = "hf-story";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    box.insertBefore(el, pops);
  }
  const [changing, fraying] = storyLines(st);
  const text = `${changing}\n${fraying}`;
  if (el.dataset.hf === text) return;
  el.dataset.hf = text;
  el.replaceChildren();
  const a = document.createElement("span");
  a.className = "changing";
  a.textContent = changing;
  const b = document.createElement("span");
  b.className = "fraying";
  b.textContent = fraying;
  el.append(a, b);
}

function bindTabKeys(HUD: EstateHUD): void {
  if (typeof document === "undefined" || document.body.dataset.hfTabs === "1") return;
  document.body.dataset.hfTabs = "1";
  document.addEventListener("keydown", (ev) => {
    const t = ev.target;
    if (!(t instanceof HTMLElement) || !t.closest(".tabs")) return;
    const current = typeof HUD.view === "function" ? String(HUD.view()) : "chron";
    const name = nextTab(current, ev.key);
    if (!name || !HUD.tab) return;
    ev.preventDefault();
    HUD.tab(name);
    document.getElementById(TAB_IDS[name as (typeof TAB_ORDER)[number]])?.focus();
  });
}

/**
 * Patch EstateHUD in place: shared phaseView, clock-aware cards, calendar
 * date_line on the header, calendar labels in the days feed, a story line
 * above the totals, why-lines on the resident card, and keyboard focus on the feed tabs. Returns the
 * clock-phase getter used by cards.
 */
export function installHudBridge(HUD: EstateHUD | undefined): { clockPhase: () => string | null } {
  let clockPhase: string | null = null;
  let last: PhaseState | undefined;
  if (!HUD) return { clockPhase: () => clockPhase };

  HUD.phaseView = phaseView as EstateHUD["phaseView"];
  ensureFeedDateStyle();
  ensureA11y();
  bindTabKeys(HUD);

  if (HUD.setClock) {
    const inner = HUD.setClock.bind(HUD);
    HUD.setClock = (name) => {
      clockPhase = name || null;
      return inner(name);
    };
  }

  if (HUD.card) {
    const inner = HUD.card.bind(HUD);
    HUD.card = (st, selected) => {
      const frame = liveFrame(st, clockPhase) as PhaseState;
      const open = inner(frame, selected);
      applyWhy(frame, selected);
      return open;
    };
  }

  if (HUD.head) {
    const inner = HUD.head.bind(HUD);
    HUD.head = (st) => {
      inner(st);
      applyDateLine(st);
    };
  }

  /* hud.js closes over Patch.write at load, so wrapping Patch later is a
   * no-op — relabel after each panel write instead. update() also calls
   * its local head(), bypassing the wrapped EstateHUD.head. */
  if (HUD.update) {
    const inner = HUD.update.bind(HUD);
    HUD.update = (st) => {
      last = st;
      inner(st);
      applyDateLine(st);
      applyCalendarLabels();
      applyStory(st);
    };
  }
  if (HUD.tab) {
    const inner = HUD.tab.bind(HUD);
    HUD.tab = (name, st) => {
      const frame = st ?? last;
      if (frame) last = frame;
      inner(name, frame);
      if (frame) applyDateLine(frame);
      applyCalendarLabels();
      if (frame) applyStory(frame);
    };
  }

  return { clockPhase: () => clockPhase };
}
