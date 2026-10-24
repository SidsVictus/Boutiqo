"""Self-test for the TypeScript / Node edition. Usage: python3 selftest_ts.py [--node-modules <path to a node_modules>]

Builds a tiny Node project in a temp folder (node_modules linked from --node-modules or the current project), then
checks the parts this edition changed: protected-path rules, the hook's decisions for each actor, freeze/check/revert,
the vitest suite runner with its JUnit gate, withdrawn tests and the audit baseline. Runs in test mode (ONEV1_TEST=1),
so nothing is written to ~/.claude.
"""
import json, os, pathlib, shutil, subprocess, sys, tempfile

S = pathlib.Path(__file__).resolve().parent
args = sys.argv[1:]
NM = pathlib.Path(args[args.index("--node-modules") + 1] if "--node-modules" in args else pathlib.Path.cwd() / "node_modules").resolve()
if not (NM / ".bin" / "vitest").exists():
    print(f"needs a node_modules with vitest: {NM}"); sys.exit(2)

tmp = pathlib.Path(tempfile.mkdtemp(prefix="onev1ts-")).resolve()
proj, state = tmp / "proj", tmp / "state"
proj.mkdir(); state.mkdir()
env = {**os.environ, "ONEV1_TEST": "1", "ONEV1_ROOT": str(proj), "ONEV1_STATE": str(state), "ONEV1_RECORD": str(state / "record.jsonl")}
fails = []


def t(name, ok):
    print(("ok   " if ok else "FAIL ") + name)
    if not ok: fails.append(name)


def w(r, text):
    p = proj / r; p.parent.mkdir(parents=True, exist_ok=True); p.write_text(text, encoding="utf-8")


def run(script, *a, inp=""):
    return subprocess.run([sys.executable, str(S / script), *a], cwd=proj, env=env, input=inp, capture_output=True, text=True)


def hook(tool, agent="", **ti):
    d = {"tool_name": tool, "tool_input": ti, "session_id": "x"}
    if agent: d["agent_type"] = agent
    p = subprocess.run([sys.executable, str(S / "hook_guard.py")], cwd=proj, env=env, input=json.dumps(d), capture_output=True, text=True)
    return p.returncode


B, K = "1v1-builder", "1v1-breaker"

# --- a tiny project -------------------------------------------------------------------------------------------------
os.symlink(NM, proj / "node_modules")
w("package.json", json.dumps({"name": "p", "private": True, "type": "module", "scripts": {"test": "vitest run"}}))
w("vitest.config.ts", 'import { defineConfig } from "vitest/config";\nexport default defineConfig({ test: { include: ["tests/**/*.test.ts"] } });\n')
w("tsconfig.json", json.dumps({"compilerOptions": {"strict": True, "noEmit": True, "module": "esnext", "moduleResolution": "bundler", "target": "ES2020"}, "include": ["src", "tests"]}))
w("src/sum.ts", "export function sum(a: number, b: number): number {\n  return a + b;\n}\n")
w("tests/unit/sum.test.ts", 'import { expect, test } from "vitest";\nimport { sum } from "../../src/sum";\ntest("adds", () => expect(sum(2, 3)).toBe(5));\n')
w("verify", "#!/usr/bin/env bash\ncd \"$(dirname \"$0\")\"\nnpx --no-install vitest run || exit 1\n")
os.chmod(proj / "verify", 0o755)

# --- protected-path rules -------------------------------------------------------------------------------------------
sys.path.insert(0, str(S))
os.environ.update({k: v for k, v in env.items() if k.startswith("ONEV1")})
import common  # noqa: E402  (reads the env above)
for r in ["tests/e2e/a.spec.ts", "src/lib/a.test.ts", "android/src/edge.test.ts", "package.json", "package-lock.json", "tsconfig.json",
          "vitest.config.ts", "playwright.auth.config.ts", "playwright.1v1.config.ts", "eslint.config.mjs", "node_modules/x/index.js",
          ".1v1/contract.md", "verify", "CLAUDE.md", "AGENTS.md", "android/node_modules/a.js", "src/__tests__/x.ts"]:
    t(f"protected: {r}", common.is_protected(r))
for r in ["src/app/page.tsx", "src/lib/r2.ts", "supabase/migrations/0014_photos.sql", "next.config.ts", "android/App.tsx", "netlify.toml"]:
    t(f"not protected (product code): {r}", not common.is_protected(r))
t("breaker may write its helper", common.breaker_may_write(".1v1/breaker/_helpers.ts"))
t("breaker may not write a config in its folder", not common.breaker_may_write(".1v1/breaker/vitest.config.ts"))
t("node_modules is never walked", not any(r.startswith("node_modules") for r in common.walk()))

# --- install + freeze -----------------------------------------------------------------------------------------------
p = run("install.py")
t("install writes vitest.1v1.config.ts", (proj / "vitest.1v1.config.ts").exists() and common.MARK in (proj / "vitest.1v1.config.ts").read_text())
t("install adds the hook", "hook_guard.py" in (proj / ".claude" / "settings.json").read_text())
w(".1v1/contract.md", "# Contract: sum\nR1: sum(a, b) returns a + b.\n")
w(".1v1/questions.md", "G1: empty input?\nT1: negative numbers?\n")
p = run("round_budget.py", "init", "--rounds", "3", "--streak", "2")
p = run("guard.py", "freeze", "--check", "bash ./verify")
t("freeze prints a fingerprint", "CHECKS FINGERPRINT" in p.stdout)
t("freeze records an audit baseline", (state / "audit_baseline.json").exists())

# --- hook decisions -------------------------------------------------------------------------------------------------
t("probe read is blocked", hook("Read", file_path=str(proj / ".1v1/HOOK_PROBE")) == 2)
t("builder: write a test -> block", hook("Write", B, file_path=str(proj / "tests/unit/x.test.ts"), content="x") == 2)
t("builder: write package.json -> block", hook("Write", B, file_path=str(proj / "package.json"), content="{}") == 2)
t("builder: write source -> allow", hook("Write", B, file_path=str(proj / "src/x.ts"), content="export const x = 1;\n") == 0)
t("builder: write a migration -> allow", hook("Write", B, file_path=str(proj / "supabase/migrations/0014_x.sql"), content="select 1;\n") == 0)
t("builder: npm install -> block", hook("Bash", B, command="npm install left-pad") == 2)
t("builder: npx -y -> block", hook("Bash", B, command="npx -y cowsay hi") == 2)
t("builder: playwright install -> block", hook("Bash", B, command="npx playwright install chromium") == 2)
t("builder: run the check -> allow", hook("Bash", B, command="bash ./verify") == 0)
t("builder: run vitest -> allow", hook("Bash", B, command="npx vitest run") == 0)
t("builder: npm run build -> allow", hook("Bash", B, command="npm run build") == 0)
t("builder: sed -i on a test -> block", hook("Bash", B, command="sed -i 's/5/6/' tests/unit/sum.test.ts") == 2)
t("builder: rm -rf tests -> block", hook("Bash", B, command="rm -rf tests") == 2)
t("builder: node -e writing a test -> block", hook("Bash", B, command="node -e \"require('fs').writeFileSync('tests/unit/a.test.ts','')\"") == 2)
t("builder: read the contract -> block", hook("Read", B, file_path=str(proj / ".1v1/contract.md")) == 2)
t("builder: content that edits checks -> block", hook("Write", B, file_path=str(proj / "src/evil.ts"),
                                                          content="import fs from 'node:fs';\nfs.writeFileSync('tests/unit/sum.test.ts', '');\n") == 2)
t("builder: content that finds the home folder -> block", hook("Write", B, file_path=str(proj / "src/h.ts"),
                                                                 content="import os from 'node:os';\nexport const h = os.homedir();\n") == 2)
t("breaker: write its test -> allow", hook("Write", K, file_path=str(proj / ".1v1/breaker/r1.test.ts"), content="x") == 0)
t("breaker: write source -> block", hook("Write", K, file_path=str(proj / "src/sum.ts"), content="x") == 2)
t("breaker: write a config in its folder -> block", hook("Write", K, file_path=str(proj / ".1v1/breaker/vitest.config.ts"), content="x") == 2)
t("orchestrator: write source during the loop -> block", hook("Write", "", file_path=str(proj / "src/sum.ts"), content="x") == 2)
t("orchestrator: general-purpose agent -> block", hook("Agent", "", subagent_type="general-purpose", prompt="hi") == 2)

# --- check + revert -------------------------------------------------------------------------------------------------
p = run("guard.py", "role", "builder")
w("tests/unit/sum.test.ts", 'import { test } from "vitest";\ntest("adds", () => {});\n')  # tampering that got past the hook
p = run("guard.py", "check", "--role", "builder", "--revert")
t("check catches and reverts a tampered test", p.returncode in (1, 3) and "toBe(5)" in (proj / "tests/unit/sum.test.ts").read_text())
p = run("guard.py", "check", "--role", "builder")

# --- the vitest gate ------------------------------------------------------------------------------------------------
w(".1v1/breaker/r1.test.ts", 'import { expect, test } from "vitest";\nimport { sum } from "../../src/sum";\n'
  'test("R1: adds negatives", () => expect(sum(-2, -3)).toBe(-5));\n'
  'test("T1: wrong on purpose", () => expect(sum(1, 1)).toBe(3));\n')
sys.path.insert(0, str(S))
import guard  # noqa: E402
good, info = guard.pytest_gate(".1v1/breaker")
t("breaker gate fails on a failing test", not good and "T1: wrong on purpose" in info)
w(".1v1/breaker/withdrawn.txt", ".1v1/breaker/r1.test.ts::T1: wrong on purpose | contradicts R1\n")
good, info = guard.pytest_gate(".1v1/breaker")
t("a withdrawn failure no longer fails the gate", good)
w(".1v1/breaker/withdrawn.txt", ".1v1/breaker/r1.test.ts::no such title | bogus\n")
t("a withdrawn line naming no real test is invalid", guard.withdrawn()[1] != [])
(proj / ".1v1/breaker/withdrawn.txt").unlink()
w(".1v1/breaker/r1.test.ts", 'import { test } from "vitest";\n')  # no tests at all
good, info = guard.pytest_gate(".1v1/breaker")
t("a suite where no test ran is not a pass", not good)
w(".1v1/breaker/r1.test.ts", 'import { expect, test } from "vitest";\nimport { sum } from "../../src/sum";\ntest("R1: adds", () => expect(sum(2, 2)).toBe(4));\n')
good, info = guard.pytest_gate(".1v1/breaker")
t("a real pass passes", good)

# --- audit baseline -------------------------------------------------------------------------------------------------
p = run("audit.py")
t("audit: clean against its baseline", p.returncode == 0)
w("src/cheat.ts", "export function f(x: string): number {\n  // @ts-ignore\n  if (process.env.VITEST) return 4;\n  return x.length;\n}\n")
p = run("audit.py")
t("audit: new suppression and test detection are findings", p.returncode == 1 and "U4" in p.stdout and "U2" in p.stdout)
(proj / "src/cheat.ts").unlink()

shutil.rmtree(tmp, ignore_errors=True)
print(f"\n{len(fails)} failure(s)" if fails else "\nall passed")
sys.exit(1 if fails else 0)
