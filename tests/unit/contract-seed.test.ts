// created by 1v1: R6 acceptance test (.1v1/contract.md), frozen at approval.
import { describe, expect, it } from "vitest";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const ROOT = path.resolve(__dirname, "../..");

function cssFiles(dir: string): string[] {
  const out: string[] = [];
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...cssFiles(p));
    else if (e.name.endsWith(".css")) out.push(p);
  }
  return out;
}

describe("R6: fonts", () => {
  it("R6: every font file the CSS loads is tracked by git", () => {
    const tracked = new Set(execFileSync("git", ["ls-files", "public"], { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean));
    const missing: string[] = [];
    for (const f of cssFiles(path.join(ROOT, "src"))) {
      const css = fs.readFileSync(f, "utf8");
      for (const m of css.matchAll(/url\(\s*["']?([^"')]+\.(?:woff2?|ttf|otf|eot))["']?\s*\)/gi)) {
        const u = m[1];
        if (/^(https?:|data:)/.test(u)) continue;
        if (!tracked.has(path.posix.join("public", u.replace(/^\//, "")))) missing.push(`${path.relative(ROOT, f)} -> ${u}`);
      }
    }
    expect(missing).toEqual([]);
  });

  it("R6: Svetze and Aptos are no longer used anywhere in src", () => {
    const hits: string[] = [];
    const walk = (dir: string) => {
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) walk(p);
        else if (/\.(css|tsx?|mjs)$/.test(e.name) && /\b(Svetze|Aptos)\b/.test(fs.readFileSync(p, "utf8"))) hits.push(path.relative(ROOT, p));
      }
    };
    walk(path.join(ROOT, "src"));
    expect(hits).toEqual([]);
  });
});
