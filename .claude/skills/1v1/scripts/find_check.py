"""Find (or create) the one-command check. Usage: find_check.py [--create]

--create writes ./verify, a Python script (works on Windows and Unix): pytest, then mypy, then ruff, skipping
.1v1/. Run it as `python verify`. "No tests collected" is a failure, not a pass: a greenfield project needs
seed tests (SKILL.md Step 3) before anything can be green.
"""
import importlib.util, re, stat, sys
from common import *

VERIFY = f'''#!/usr/bin/env python3
# {MARK}: the project's check command. Exit 0 = green. Run: python verify
import subprocess, sys

STEPS = [
    ["pytest", "-q", "-p", "no:cacheprovider", "--ignore=.1v1"],
    ["mypy", ".", "--exclude", r"(^|/)\\.1v1/"],
    ["ruff", "check", ".", "--extend-exclude", ".1v1"],
]
import os, tempfile, xml.etree.ElementTree as ET
for step in STEPS:
    xml = os.path.join(tempfile.mkdtemp(), "junit.xml")
    extra = [f"--junitxml={{xml}}"] if step[0] == "pytest" else []
    rc = subprocess.run([sys.executable, "-m", *step, *extra]).returncode
    if step[0] == "pytest" and rc == 5:
        print("verify: no tests collected - counts as a failure"); sys.exit(1)
    if step[0] == "pytest" and rc == 0:  # exit 0 is not enough: code that kills pytest early also exits 0
        try: s = ET.parse(xml).getroot(); s = s if s.tag == "testsuite" else s.find("testsuite")
        except (OSError, ET.ParseError): print("verify: pytest wrote no report - counts as a failure"); sys.exit(1)
        if int(s.get("tests", 0)) - int(s.get("skipped", 0)) < 1: print("verify: no test ran - counts as a failure"); sys.exit(1)
    if rc:
        print(f"verify: {{step[0]}} failed (exit {{rc}})"); sys.exit(1)
print("verify: green")
'''


def run_cmd_for(p):
    head = p.read_text(encoding="utf-8", errors="replace")[:200]
    if "python" in head.splitlines()[0] if head else False: return "python verify"
    return "bash ./verify"


def find():
    if (ROOT / "verify").exists(): return run_cmd_for(ROOT / "verify")
    mk = ROOT / "Makefile"
    if mk.exists():
        for t in ("check", "test", "verify"):
            if re.search(rf"^{t}:", mk.read_text(encoding="utf-8"), re.M): return f"make {t}"
    if (ROOT / "noxfile.py").exists(): return "nox"
    if (ROOT / "tox.ini").exists(): return "tox"
    pp = ROOT / "pyproject.toml"
    if (ROOT / "pytest.ini").exists() or (pp.exists() and "[tool.pytest" in pp.read_text(encoding="utf-8")): return "python -m pytest -q"
    return None


def create():
    missing = [m for m in ("pytest", "mypy", "ruff", "hypothesis") if importlib.util.find_spec(m) is None]
    if missing: print("MISSING TOOLS (ask user to install): " + ", ".join(missing)); return None
    p = ROOT / "verify"
    p.write_text(VERIFY, encoding="utf-8")
    p.chmod(p.stat().st_mode | stat.S_IEXEC)
    return "python verify"


if __name__ == "__main__":
    c = find()
    if not c and "--create" in sys.argv: c = create()
    if not c: print("NO CHECK COMMAND"); sys.exit(1)
    print(c)
