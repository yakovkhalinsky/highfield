/**
 * Copy page3d from the reference (reference.json's llm-world commit, or
 * LLM_WORLD) into page3d/, replacing what is there — except Highfield's
 * visual forks (isVisualFork), which are left alone. Bump the sha,
 * run `npm run reference && npm run sync:page3d`, and commit both together;
 * tests/vendor.test.ts fails while the non-forked files disagree.
 */
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { PAGE3D, isVisualFork, needReference } from "./reference.ts";

function files(dir: string, at = ""): string[] {
  return readdirSync(join(dir, at)).flatMap((n) => {
    const rel = at ? `${at}/${n}` : n;
    return statSync(join(dir, rel)).isDirectory() ? files(dir, rel) : [rel];
  });
}

needReference();
for (const { from, to } of PAGE3D) {
  const stash: { rel: string; buf: Buffer }[] = [];
  if (existsSync(to)) {
    for (const rel of files(to)) {
      if (!isVisualFork(rel)) continue;
      stash.push({ rel, buf: readFileSync(join(to, rel)) });
    }
  }
  rmSync(to, { recursive: true, force: true });
  cpSync(from, to, { recursive: true });
  for (const { rel, buf } of stash) {
    const dest = join(to, rel);
    mkdirSync(dirname(dest), { recursive: true });
    writeFileSync(dest, buf);
    console.log(`page3d: kept visual fork ${rel}`);
  }
  const forked = stash.map((s) => s.rel);
  console.log(`page3d: ${from} -> ${to}` +
    (forked.length ? ` (forked: ${forked.join(", ")})` : ""));
}
