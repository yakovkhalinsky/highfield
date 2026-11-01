/**
 * How a household reads as parents, children and gender.
 * The sim stores a flat member list and a role from age. It does not
 * record a parent id or a sex, so this is a reading of that list:
 * adults and elders in the household are the parents of its children,
 * and a name is gendered only when the estate's name list is unambiguous.
 * Nothing here is written back onto the world.
 */

export type Gender = "woman" | "man";

/** Names from rules.json `presentation.resident_names` that are not ambiguous. */
const WOMEN = new Set([
  "Ada", "Cleo", "Esme", "Greta", "Ines", "Lena", "Nia", "Pia", "Rosa",
  "Tess", "Una", "Zeta", "Faye", "Hana", "Junie", "Marta", "Priya", "Ula", "Vesna",
]);
const MEN = new Set([
  "Bram", "Dev", "Hal", "Jonas", "Ossian", "Yusuf", "Emil", "Gus", "Ivo",
  "Otto", "Wim", "Vik",
]);

export function genderOf(name: string | null | undefined): Gender | null {
  if (!name) return null;
  if (WOMEN.has(name)) return "woman";
  if (MEN.has(name)) return "man";
  return null;
}

/** A child reads as a girl or a boy; an adult or elder as a woman or a man. */
export function genderWord(gender: Gender | null, role: string | null | undefined): string | null {
  if (!gender) return null;
  const child = role === "child";
  if (gender === "woman") return child ? "girl" : "woman";
  return child ? "boy" : "man";
}

export interface KinPerson {
  id: number;
  name: string | null;
  role: string;
  age: number;
  family: number[];
}

export interface Kin {
  gender: Gender | null;
  parents: string[];
  children: string[];
}

/**
 * Parents are the adults and elders in the same household.
 * Children are the household's children. Other adults are not parents
 * of each other, and children are not parents of each other.
 */
export function kinOf(people: readonly KinPerson[], person: KinPerson): Kin {
  const byId = new Map(people.map((p) => [p.id, p]));
  const others = person.family
    .map((id) => byId.get(id))
    .filter((p): p is KinPerson => p !== undefined && p.id !== person.id);
  const names = (list: KinPerson[]) =>
    list.map((p) => p.name).filter((n): n is string => !!n);
  if (person.role === "child") {
    return {
      gender: genderOf(person.name),
      parents: names(others.filter((p) => p.role === "adult" || p.role === "elder")),
      children: [],
    };
  }
  return {
    gender: genderOf(person.name),
    parents: [],
    children: names(others.filter((p) => p.role === "child")),
  };
}
