/**
 * Family reading: parents, children and gender, without writing the world.
 */
import { describe, expect, it } from "vitest";
import { generate } from "../src/sim/gen.ts";
import { snapshot } from "../src/view/api.ts";
import { genderOf, genderWord, kinOf, type KinPerson } from "../src/view/kin.ts";
import { kinLines } from "../src/view/hudBridge.ts";
import { plant } from "../src/view/runner.ts";

const household: KinPerson[] = [
  { id: 1, name: "Lena", role: "adult", age: 34, family: [2, 3] },
  { id: 2, name: "Bram", role: "adult", age: 36, family: [1, 3] },
  { id: 3, name: "Junie", role: "child", age: 6, family: [1, 2] },
  { id: 4, name: "Sam", role: "adult", age: 29, family: [5] },
  { id: 5, name: "Otto", role: "adult", age: 31, family: [4] },
];

describe("gender", () => {
  it("names women, men, and leaves ambiguous names alone", () => {
    expect(genderOf("Marta")).toBe("woman");
    expect(genderOf("Bram")).toBe("man");
    expect(genderOf("Sam")).toBeNull();
    expect(genderOf("Ari")).toBeNull();
    expect(genderOf(null)).toBeNull();
  });

  it("says girl and boy for a child", () => {
    expect(genderWord("woman", "child")).toBe("girl");
    expect(genderWord("man", "adult")).toBe("man");
    expect(genderWord(null, "child")).toBeNull();
  });
});

describe("household kin", () => {
  it("lists adults as the child's parents, and the child under each adult", () => {
    expect(kinOf(household, household[2]!).parents).toEqual(["Lena", "Bram"]);
    expect(kinOf(household, household[0]!).children).toEqual(["Junie"]);
    expect(kinOf(household, household[1]!).children).toEqual(["Junie"]);
  });

  it("does not call a couple each other's parent", () => {
    expect(kinOf(household, household[3]!).parents).toEqual([]);
    expect(kinOf(household, household[3]!).children).toEqual([]);
  });

  it("rides on the snapshot and the card", () => {
    const snap = snapshot(plant(1));
    const child = snap.people.find((p) => p.role === "child" && p.parents.length);
    expect(child).toBeTruthy();
    const parent = snap.people.find((p) =>
      child!.family.includes(p.id) && (p.role === "adult" || p.role === "elder"));
    expect(parent).toBeTruthy();
    expect(child!.parents).toContain(parent!.name);
    expect(parent!.children).toContain(child!.name);
    expect(kinLines({ role: "child", gender: "woman", parents: ["Lena"], children: [] })).toEqual([
      { label: "gender", text: "girl" },
      { label: "parents", text: "Lena" },
    ]);
  });
});

describe("kin does not touch the world", () => {
  it("adds nothing to a generated resident", () => {
    const w = generate(1);
    const r = Object.values(w.residents)[0]!;
    expect("gender" in r).toBe(false);
    expect("parents" in r).toBe(false);
  });
});
