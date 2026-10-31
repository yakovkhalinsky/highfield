/**
 * The estate calendar: absolute day → year, month and day-of-month
 * (three months per season of 30, 30 and 31 days).
 */
import { expect, it } from "vitest";
import { calendarOf, dateLine, dateShort, weekdayName, yearOf } from "../src/sim/world.ts";
import { calendarDaySpans } from "../src/view/hudBridge.ts";

it("puts day 1 on Monday 1 January of year 1", () => {
  expect(calendarOf(1)).toEqual({
    year: 1, month: 1, day: 1, monthName: "January",
    weekday: "Monday", season: "spring",
  });
  expect(dateLine(1)).toBe("Monday · 1 January · Year 1 · Spring");
  expect(dateShort(1)).toBe("1 January");
});

it("keeps calendar formatting in the days feed HTML", () => {
  const html = '<li><span class="d">day 1</span><span class="shape">quiet</span></li>' +
    '<li><span class="d">day 1,747</span></li>';
  const out = calendarDaySpans(html);
  expect(out).toContain(">1 January</span>");
  expect(out).toContain(`title="${dateLine(1)}"`);
  expect(out).toContain(`>${dateShort(1747)}</span>`);
  expect(out).not.toMatch(/day 1(?:<|,)/);
});

it("rolls months of 30, 30, 31 inside a season", () => {
  expect(calendarOf(30)).toMatchObject({ year: 1, month: 1, day: 30, monthName: "January" });
  expect(calendarOf(31)).toMatchObject({ year: 1, month: 2, day: 1, monthName: "February" });
  expect(calendarOf(60)).toMatchObject({ year: 1, month: 2, day: 30, monthName: "February" });
  expect(calendarOf(61)).toMatchObject({ year: 1, month: 3, day: 1, monthName: "March" });
  expect(calendarOf(91)).toMatchObject({ year: 1, month: 3, day: 31, monthName: "March", season: "spring" });
  expect(calendarOf(92)).toMatchObject({ year: 1, month: 4, day: 1, monthName: "April", season: "summer" });
});

it("starts a new year after 364 days", () => {
  expect(yearOf(364)).toBe(1);
  expect(calendarOf(364)).toMatchObject({ year: 1, month: 12, day: 31 });
  expect(calendarOf(365)).toMatchObject({ year: 2, month: 1, day: 1 });
  expect(weekdayName(365)).toBe(weekdayName(1)); // 364 is divisible by 7
});
