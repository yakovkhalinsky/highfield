/**
 * page3d is vendored from llm-world (scripts/sync-page3d.ts): the 3D page
 * stays the Python app's page, byte for byte, at the pinned commit. Any
 * edit here, or a sync that missed a file, fails this test.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { PAGE3D, needReference } from "../scripts/reference.ts";

function files(dir: string, at = ""): string[] {
  return readdirSync(join(dir, at)).flatMap((n) => {
    const rel = at ? `${at}/${n}` : n;
    return statSync(join(dir, rel)).isDirectory() ? files(dir, rel) : [rel];
  }).sort();
}

describe("page3d matches llm-world", () => {
  needReference();
  for (const { from, to } of PAGE3D) {
    it(to.replace(/.*\/page3d\//, "page3d/"), () => {
      const want = files(from);
      expect(files(to)).toEqual(want);
      for (const rel of want) {
        expect(readFileSync(join(to, rel)).equals(readFileSync(join(from, rel))), rel).toBe(true);
      }
    });
  }
});
