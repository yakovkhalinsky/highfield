/**
 * Copy page3d from the reference (reference.json's llm-world commit, or
 * LLM_WORLD) into page3d/, replacing what is there. Bump the sha, run
 * `npm run reference && npm run sync:page3d`, and commit both together;
 * tests/vendor.test.ts fails while the two disagree.
 */
import { cpSync, rmSync } from "node:fs";
import { PAGE3D, needReference } from "./reference.ts";

needReference();
for (const { from, to } of PAGE3D) {
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  console.log(`page3d: ${from} -> ${to}`);
}
