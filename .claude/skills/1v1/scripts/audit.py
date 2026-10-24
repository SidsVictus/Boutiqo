"""Static scan of shipped code for U2/U3/U4/U11 cheating patterns (TypeScript / Node edition). Exit 1 on findings.

  audit.py              report findings that are NEW since approval (exit 1 if any)
  audit.py --baseline   record today's findings as the baseline (guard.py freeze runs this at approval)
  audit.py --all        report every finding, baseline included (for the approval screen)

An existing codebase already has some of these patterns (for example a justified eslint-disable comment), so only
findings added during the loop fail the gate. A finding is identified by file + rule + the trimmed line text, so moving
code around does not create a "new" finding, but adding one does.

U2 (gaming the tests): detecting a test run (Playwright, vitest, jest, webdriver, NODE_ENV=test), importing a test
framework in shipped code, dynamic code (eval, new Function), exiting the process, special-casing a literal that a test
feeds in, importing the builder's _scratch/.
U3 (fakes): TODO/FIXME/XXX/HACK, "not implemented" throws, vi.mock/jest.mock in shipped code.
U4 (swallowed errors): @ts-ignore / @ts-nocheck / @ts-expect-error, eslint-disable, empty catch blocks.
U11 (hidden I/O): an absolute http(s) URL literal not listed in .1v1/allow-network.txt.
Allowlists (one entry per line, in .1v1/, frozen with the contract): allow-network.txt (URL prefixes),
allow-ignores.txt (file paths), allow-dynamic.txt (file paths), allow-literals.txt (exact literals).
"""
import json, re, sys
from common import *

BASELINE = STATE / "audit_baseline.json"
TESTFW = re.compile(r"""(?:from\s+|import\s*\(\s*|require\s*\(\s*)["'](vitest|@playwright/test|playwright|jest|@jest/[\w-]+|@testing-library/[\w-]+|msw)["']""")
TESTDETECT = re.compile(r"process\.env\.(PLAYWRIGHT\w*|PW_TEST\w*|VITEST\w*|JEST_WORKER_ID|TEST_\w+)|navigator\.webdriver|__PLAYWRIGHT|HeadlessChrome"
                        r"|NODE_ENV\s*[!=]==?\s*[\"']test[\"']|[\"']test[\"']\s*[!=]==?\s*process\.env\.NODE_ENV|import\.meta\.vitest")
DYNAMIC = re.compile(r"(?<![\w.])eval\s*\(|\bnew\s+Function\s*\(|(?<![\w.])Function\s*\(\s*[\"'`]")
EXIT = re.compile(r"\bprocess\.(exit|abort|kill)\s*\(")
SUPPRESS = re.compile(r"@ts-(ignore|nocheck|expect-error)|eslint-disable")
TODO = re.compile(r"(//|/\*|\*|--|#).*\b(TODO|FIXME|XXX|HACK)\b")
NOTIMPL = re.compile(r"(?i)throw\s+new\s+\w*Error\s*\(\s*[\"'`]\s*(not\s+implemented|todo|stub)")
MOCKS = re.compile(r"\b(vi|jest)\.(mock|fn|spyOn|stubGlobal)\s*\(")
EMPTY_CATCH = re.compile(r"catch\s*(\(\s*[\w$]*\s*\))?\s*\{\s*\}|\.catch\(\s*\(\s*[\w$]*\s*\)\s*=>\s*(\{\s*\}|undefined|null|void 0)\s*\)")
URL = re.compile(r"""["'`](https?://[^"'`\s]+)""")
SCRATCH_IMPORT = re.compile(r"""["'`](?:\.{1,2}/)+(?:[\w./-]*/)?_scratch/|["'`]@/_scratch/|["'`]_scratch/""")
STR = re.compile(r"""(["'`])((?:\\.|(?!\1).){4,120}?)\1""")
OPERAND = re.compile(r"""(?:===|!==|==|!=)\s*(["'`])(?P<a>(?:\\.|(?!\1).){4,120}?)\1"""
                     r"""|(["'`])(?P<b>(?:\\.|(?!\3).){4,120}?)\3\s*(?:===|!==|==|!=)"""
                     r"""|(?:\bcase\s+|\.(?:includes|has|startsWith|endsWith)\(\s*)(["'`])(?P<c>(?:\\.|(?!\5).){4,120}?)\5""")
PLAIN = re.compile(r"[A-Za-z0-9_./@:-]*")  # flags, names, paths, URLs: too common to count as special-casing
LOCAL_URL = re.compile(r"(?i)^https?://(localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\])([:/]|$)|^https?://(www\.)?(w3\.org|schemas\.|example\.(com|org))")


def allowed(name):
    p = ROOT / ".1v1" / name
    return set(p.read_text(encoding="utf-8").splitlines()) - {""} if p.exists() else set()


def test_literals():
    """String literals the tests feed in (project tests, breaker and holdout). Shipped code that compares against one of
    these is special-casing a test input."""
    lits = set()
    for r in walk():
        if not (TEST_FILE_RE.search(r) and (r.startswith((".1v1/breaker/", ".1v1/holdout/")) or is_protected(r))): continue
        try: src = (ROOT / r).read_text(encoding="utf-8", errors="replace")
        except OSError: continue
        for m in STR.finditer(src):
            v = m.group(2)
            if v.strip() and not PLAIN.fullmatch(v) and "${" not in v: lits.add(v)
    return lits


def scan(r, net_ok, ign_ok, dyn_ok, lit_ok, lits):
    out = []
    try: src = (ROOT / r).read_text(encoding="utf-8", errors="replace")
    except OSError: return out
    in_tests_dir = False
    for i, line in enumerate(src.splitlines(), 1):
        t = line.strip()
        def add(rule, what): out.append({"file": r, "line": i, "rule": rule, "what": what, "text": t[:160]})
        if SUPPRESS.search(line) and r not in ign_ok: add("U4", "suppression comment")
        if EMPTY_CATCH.search(line): add("U4", "swallowed error (empty catch)")
        if TODO.search(line): add("U3", "TODO/FIXME")
        if NOTIMPL.search(line): add("U3", "not-implemented throw")
        if MOCKS.search(line): add("U3", "test mock in shipped code")
        if TESTFW.search(line): add("U2", "imports a test framework")
        if TESTDETECT.search(line): add("U2", "detects a test run")
        if DYNAMIC.search(line) and r not in dyn_ok: add("U2", "dynamic code (eval / new Function)")
        if EXIT.search(line): add("U2", "exits the process")
        if SCRATCH_IMPORT.search(line): add("U2", "imports the builder's throwaway _scratch")
        for m in URL.finditer(line):
            u = m.group(1)
            if not LOCAL_URL.search(u) and not any(u.startswith(a) for a in net_ok): add("U11", f"network URL {u[:80]}")
        for m in OPERAND.finditer(line):  # a test literal used as a comparison operand, a case label or a lookup key
            v = m.group("a") or m.group("b") or m.group("c")
            if v and v in lits and v not in lit_ok: add("U2", f"special-cases a test input {v[:60]!r}")
    return out


def key(f):
    return f"{f['file']}|{f['rule']}|{f['what'].split(' ')[0]}|{f['text']}"


def findings():
    net_ok, ign_ok, dyn_ok, lit_ok = (allowed(f) for f in ("allow-network.txt", "allow-ignores.txt", "allow-dynamic.txt", "allow-literals.txt"))
    lits = test_literals()
    return [f for r in walk() if is_source(r) and not r.startswith(".1v1/") for f in scan(r, net_ok, ign_ok, dyn_ok, lit_ok, lits)]


if __name__ == "__main__":
    res = findings()
    if "--baseline" in sys.argv:
        STATE.mkdir(parents=True, exist_ok=True)
        counts = {}
        for f in res: counts[key(f)] = counts.get(key(f), 0) + 1
        BASELINE.write_text(json.dumps(counts), encoding="utf-8")
        print(f"baseline: {len(res)} existing finding(s) recorded; only new ones fail the gate")
        sys.exit(0)
    if "--all" not in sys.argv:
        try: base = json.loads(BASELINE.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            print("NO BASELINE: guard.py freeze records it at approval. Without it every finding counts.")
            base = {}
        left, new = dict(base), []
        for f in res:
            k = key(f)
            if left.get(k, 0) > 0: left[k] -= 1
            else: new.append(f)
        res = new
    for f in res: print(f"{f['file']}:{f['line']} {f['rule']} {f['what']}: {f['text']}")
    print("clean" if not res else f"{len(res)} finding(s)")
    sys.exit(1 if res else 0)
