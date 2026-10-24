"""Time the check command. Usage: time_check.py "<cmd>". Writes verify-fast (bash: types, lint, unit tests) if over 60s."""
import os, subprocess, sys, time
from common import *

if len(sys.argv) < 2:
    print(__doc__); sys.exit(2)
cmd = sys.argv[1]
t = time.time()
r = subprocess.run(cmd, shell=True, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace",
                   env={**os.environ, "PYTHONIOENCODING": "utf-8"})
dt = time.time() - t
print(f"exit={r.returncode} seconds={dt:.1f}")
if r.returncode:
    print("\n".join((r.stdout + r.stderr).strip().splitlines()[-15:]))
if dt > 60:
    p = ROOT / "verify-fast"
    p.write_text(f"#!/usr/bin/env bash\n# {MARK}: fast subset for the loop (types, lint, unit tests); the full check runs in Step 6\n"
                 "set -u\ncd \"$(dirname \"$0\")\"\n"
                 "npx --no-install tsc --noEmit -p tsconfig.json || exit 1\n"
                 "npx --no-install eslint . --ignore-pattern \".1v1/**\" --ignore-pattern \"_scratch/**\" || exit 1\n"
                 "npx --no-install vitest run || exit 1\necho \"verify-fast: green\"\n")
    p.chmod(0o755)
    print("OVER 60s: wrote verify-fast for the loop (run: bash ./verify-fast); the full command runs in Step 6")
sys.exit(r.returncode)
