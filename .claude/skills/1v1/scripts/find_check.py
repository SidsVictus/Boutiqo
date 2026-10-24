"""Find (or create) the one-command check (TypeScript / Node edition). Usage: find_check.py [--create]

--create writes ./verify, a bash script: TypeScript (tsc --noEmit), ESLint, vitest, then the project's offline
Playwright suite when one exists. Run it as `bash ./verify`. "No tests found" is a failure, not a pass: a greenfield
project needs seed tests (SKILL.md Step 3) before anything can be green.
"""
import json, re, stat, sys
from common import *

VERIFY = f'''#!/usr/bin/env bash
# {MARK}: the project's check command. Exit 0 = green. Run: bash ./verify
set -u
cd "$(dirname "$0")"
step() {{ echo "verify: $1"; shift; "$@"; rc=$?; if [ $rc -ne 0 ]; then echo "verify: FAILED ($rc): $*"; exit 1; fi; }}
step "types"  npx --no-install tsc --noEmit -p tsconfig.json
step "lint"   npx --no-install eslint . --ignore-pattern ".1v1/**" --ignore-pattern "_scratch/**"
step "unit"   npx --no-install vitest run
__EXTRA__
__E2E__
echo "verify: green"
'''


def scripts():
    p = ROOT / "package.json"
    try: return json.loads(p.read_text(encoding="utf-8")).get("scripts", {})
    except (OSError, ValueError): return {}


def find():
    if (ROOT / "verify").exists():
        head = (ROOT / "verify").read_text(encoding="utf-8", errors="replace")[:200]
        return "python verify" if "python" in (head.splitlines() or [""])[0] else "bash ./verify"
    s = scripts()
    for t in ("verify", "check", "ci"):
        if t in s: return f"npm run {t}"
    mk = ROOT / "Makefile"
    if mk.exists():
        for t in ("check", "test", "verify"):
            if re.search(rf"^{t}:", mk.read_text(encoding="utf-8"), re.M): return f"make {t}"
    return None


def create():
    missing = [t for t in ("tsc", "eslint", "vitest") if not (ROOT / "node_modules" / ".bin" / t).exists()]
    if missing: print("MISSING TOOLS (ask the user to npm install them): " + ", ".join(missing)); return None
    e2e = ""
    for cfg in ("playwright.auth.config.ts",):
        if (ROOT / cfg).exists(): e2e = f'step "e2e"    npx --no-install playwright test -c {cfg}'
    extra = []
    for sub in sorted(q for q in ROOT.iterdir() if q.is_dir() and (q / "package.json").exists() and q.name not in CACHES):
        try: sc = json.loads((sub / "package.json").read_text(encoding="utf-8")).get("scripts", {})
        except (OSError, ValueError): continue
        if "typecheck" in sc: extra.append(f'step "{sub.name} types" bash -c "cd {sub.name} && npm run --silent typecheck"')
        if "test" in sc: extra.append(f'step "{sub.name} tests" bash -c "cd {sub.name} && npm test --silent"')
    p = ROOT / "verify"
    p.write_text(VERIFY.replace("__E2E__", e2e).replace("__EXTRA__", "\n".join(extra)), encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return "bash ./verify"


if __name__ == "__main__":
    c = find()
    if not c and "--create" in sys.argv: c = create()
    if not c: print("NO CHECK COMMAND"); sys.exit(1)
    print(c)
