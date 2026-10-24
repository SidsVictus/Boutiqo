"""Shared helpers (TypeScript / Node edition, adapted for Boutiqo). State lives OUTSIDE the project so agents cannot edit it."""
import hashlib, json, os, pathlib, re, site, sys, sysconfig, tempfile, time

for _s in (sys.stdout, sys.stderr):  # Windows pipes default to cp1252; non-ASCII output must never crash a script
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass

TEST_MODE = os.environ.get("ONEV1_TEST") == "1"  # ONEV1_ROOT / ONEV1_STATE are honoured only in test mode (selftest)
ROOT = pathlib.Path(os.environ["ONEV1_ROOT"] if TEST_MODE and os.environ.get("ONEV1_ROOT") else os.getcwd()).resolve()
STATE = pathlib.Path(os.environ["ONEV1_STATE"] if TEST_MODE and os.environ.get("ONEV1_STATE")
                     else pathlib.Path(tempfile.gettempdir()) / ("1v1-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]))
# Regenerated or installed folders: never walked (hashing node_modules on every check would take minutes) and never
# writable by an agent (write_ok -> in_skipped). The Node environment fingerprint covers node_modules instead.
CACHES = {"node_modules", ".next", ".turbo", "test-results", "playwright-report", "blob-report", "coverage", ".netlify",
          ".expo", ".vercel", "__pycache__", ".vite", ".vitest", ".eslintcache"}
PROT_NAMES = {n.lower() for n in {
    "package.json", "package-lock.json", "npm-shrinkwrap.json", "pnpm-lock.yaml", "yarn.lock", ".npmrc", ".nvmrc", ".node-version",
    "verify", "verify-fast", "Makefile", ".gitlab-ci.yml", ".pre-commit-config.yaml", "CLAUDE.md", "AGENTS.md",
    "tsconfig.tsbuildinfo"}}
# Test, type and lint configuration, whatever the extension: vitest.config.ts, playwright.auth.config.ts,
# eslint.config.mjs, tsconfig.json, .eslintrc.json, babel/jest/prettier config...
CONFIG_RE = re.compile(r"(?i)^(vitest|vite|playwright|jest|eslint|babel|prettier|tsup)([.\w-]*)\.config(\.[\w-]+)*\.[cm]?[jt]s$"
                       r"|^tsconfig([.\w-]*)\.json$|^\.eslintrc|^\.prettierrc|^\.babelrc|^jsconfig\.json$")
TEST_FILE_RE = re.compile(r"(?i)\.(test|spec)\.[cm]?[jt]sx?$")
PROT_TOP = {"tests", "test", "e2e", ".1v1", ".github", ".claude", "evals", ".git", "node_modules"}
TEST_MODULES = set()  # (Python only) kept so callers that read it still work
CODE_EXT = (".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".sql", ".css")
BREAKER_OWN = (".1v1/breaker/", ".1v1/holdout/", ".1v1/scratch/")  # the only places the breaker may write
SCRATCH = ".1v1/scratch/"  # breaker probes: free to create and delete, never a gate, wiped by finish
BUILDER_SCRATCH = "_scratch"  # builder probes: never tracked or audited, wiped before every check run, so nothing can depend on it
WITHDRAWN = ".1v1/breaker/withdrawn.txt"  # "<test id> | reason" lines: the breaker's own wrong tests, shown to the user
MINOR = ".1v1/breaker/minor"  # MINOR failing tests: run and reported, not a gate (they are never sent to the builder)
AGENTS = {"1v1-builder": "builder", "1v1-breaker": "breaker"}
FROZEN = STATE / "frozen.json"
HOOK_LOG = STATE / "hook.log"
HOOK_HEAD = STATE / "hook.head"
ROLE = STATE / "role.json"
PROBE = ".1v1/HOOK_PROBE"
BUILDER_INPUT = ".1v1/BUILDER_INPUT.md"  # written only by guard.py builder-input; the one .1v1 file the builder may read
BREAKER_INPUT = ".1v1/BREAKER_INPUT.md"  # written only by guard.py breaker-input
BUILDER_PROMPT = "Read .1v1/BUILDER_INPUT.md and follow it exactly. It holds your instructions, the contract and the failing output."
BREAKER_PROMPT = "Read .1v1/BREAKER_INPUT.md and follow it exactly. It holds your instructions, the contract, the questions and how to run the system."
INPUTS = {BUILDER_INPUT, BREAKER_INPUT}
MARK = "created by 1v1"
SUB_TOOLS = {"Read", "Write", "Edit", "MultiEdit", "Bash", "PowerShell", "Glob", "Grep", "TodoWrite", "BashOutput", "KillShell"}
# The breaker's suites run with these configs (written by install.py, frozen at approval like every other config).
PW_CONFIG = "playwright.1v1.config.ts"
VITEST_CONFIG = "vitest.1v1.config.ts"


def shadow_names():
    """Python only (a project module named like an installed one). TypeScript resolves imports by path: nothing to do."""
    return set()


def compute_shadow_names():
    return []


def module_name(r):
    return None


def is_hidden(r):
    """While the builder works, everything in .1v1/ except its own input file is moved out of the project."""
    return r.startswith(".1v1/") and r not in (BUILDER_INPUT, PROBE)


def is_breaker_own(r):
    return r is not None and r.startswith(BREAKER_OWN)


def breaker_may_write(r):
    """The breaker's own folders, minus config that could change how a whole gate runs (a vitest/playwright/tsconfig file
    there would steer the suites). Helper modules (_helpers.ts) and fixtures are fine: only the breaker's suites use them."""
    return is_breaker_own(r) and not is_config(r)


def is_config(r):
    name = r.split("/")[-1]
    return name.lower() in PROT_NAMES or CONFIG_RE.search(name) is not None


def is_compiled(r):
    return False  # (Python only: sourceless .pyc). Minified bundles live in .next/ and node_modules/, never walked.


def is_protected(r):
    parts = r.split("/")
    name = parts[-1]
    return (parts[0].lower() in PROT_TOP or any(p.lower() in ("tests", "test", "__tests__", "e2e") for p in parts[:-1])
            or any(p in CACHES for p in parts[:-1]) or is_config(r) or TEST_FILE_RE.search(name) is not None)


def is_source(r):
    return r.endswith(CODE_EXT) and not is_protected(r) and not r.startswith(BUILDER_SCRATCH + "/")


def is_venv(d):
    return (d / "pyvenv.cfg").exists()


def walk():
    """Every project file except regenerated/installed folders (CACHES), the project's own .git, the builder's
    _scratch/ and real virtual environments."""
    for dp, dns, fns in os.walk(ROOT):
        here = pathlib.Path(dp)
        dns[:] = [d for d in dns if d not in CACHES and not (here == ROOT and d in (".git", BUILDER_SCRATCH)) and not is_venv(here / d)]
        for f in fns:
            yield (here / f).relative_to(ROOT).as_posix()


def sha(p):
    return hashlib.sha256(pathlib.Path(p).read_bytes()).hexdigest()


# A record of freezes and verdicts kept OUTSIDE the temp folder, under ~/.claude (off limits to every actor through the
# hook). Deleting the state folder therefore neither switches the guard off nor resets "first verdict for this approval".
RECORD = pathlib.Path(os.environ["ONEV1_RECORD"] if TEST_MODE and os.environ.get("ONEV1_RECORD") else
                      (STATE / "record.jsonl" if TEST_MODE else
                       pathlib.Path.home() / ".claude" / "1v1-records" / (hashlib.sha256(str(ROOT).encode()).hexdigest()[:12] + ".jsonl")))


def record(kind, **data):
    RECORD.parent.mkdir(parents=True, exist_ok=True)
    with open(RECORD, "a", encoding="utf-8") as f:
        f.write(json.dumps({"ts": time.time(), "kind": kind, **data}) + "\n")


def read_record():
    try: lines = RECORD.read_text(encoding="utf-8").splitlines()
    except OSError: return []
    out = []
    for line in lines:
        try: out.append(json.loads(line))
        except ValueError: out.append({"kind": "corrupt"})
    return out


def record_active():
    """True while a loop is running per the record (a freeze not yet followed by a verdict or a user unfreeze)."""
    ev = [e["kind"] for e in read_record() if e.get("kind") in ("freeze", "verdict", "unfreeze", "corrupt")]
    return bool(ev) and ev[-1] in ("freeze", "corrupt")


def rel(p):
    """Project-relative posix path, or None if p is outside the project."""
    try:
        q = pathlib.Path(str(p).strip("'\""))
        if not q.is_absolute(): q = ROOT / q
        return q.resolve().relative_to(ROOT).as_posix()
    except (ValueError, OSError):
        return None


def frozen():
    return json.loads(FROZEN.read_text(encoding="utf-8")) if FROZEN.exists() else None


def role():
    return json.loads(ROLE.read_text(encoding="utf-8")) if ROLE.exists() else {"role": "orchestrator", "since": 0}


def fingerprint(files):
    """One hash over a {path: hash} map, short enough to show the user and compare by eye."""
    return hashlib.sha256(json.dumps(sorted(files.items())).encode()).hexdigest()[:16]


def env_fingerprint():
    """Hash of what can change how Node, npm and the test runners behave outside the source: node and npm versions,
    every lockfile, and npm's record of what is installed in each node_modules (root and nested apps such as android/).
    A builder that installs or edits a package changes it."""
    import subprocess
    items = []
    for cmd in (["node", "--version"], ["npm", "--version"]):
        try: items.append(" ".join(cmd) + "=" + subprocess.run(cmd, capture_output=True, text=True, timeout=60).stdout.strip())
        except (OSError, subprocess.SubprocessError): items.append(" ".join(cmd) + "=missing")
    for base in [ROOT, *[p for p in ROOT.iterdir() if p.is_dir() and (p / "package.json").exists() and p.name not in CACHES]]:
        for f in ("package-lock.json", "node_modules/.package-lock.json"):
            q = base / f
            items.append(f"{q.relative_to(ROOT).as_posix()}:{sha(q) if q.exists() else 'none'}")
    return hashlib.sha256("\n".join(items).encode()).hexdigest()[:16]


def clean_env():
    """Environment for the final gates: nothing an agent could have set to steer Node or the test runners.
    REUSE_SERVERS is dropped on purpose: a gate must never test a stale server someone else started."""
    bad = ("PYTHON", "PYTEST", "NODE_OPTIONS", "NODE_PATH", "NODE_ENV", "VITEST", "JEST", "TS_NODE", "NPM_CONFIG", "REUSE_SERVERS",
           "PW_TEST", "PLAYWRIGHT_JUNIT", "FORCE_COLOR")
    keep = {"PYTHONIOENCODING", "PYTHONUTF8"}
    env = {k: v for k, v in os.environ.items() if k in keep or not k.upper().startswith(bad)}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    env["CI"] = "1"
    return env


def log(entry):
    """Append to the hook log. Each line carries the hash of the previous line: deleting or editing
    a line breaks the chain, which guard.py check reports."""
    STATE.mkdir(parents=True, exist_ok=True)
    lock, fd = STATE / "hook.lock", None
    for _ in range(500):  # parallel tool calls run the hook concurrently; serialise appends
        try:
            fd = os.open(lock, os.O_CREAT | os.O_EXCL | os.O_WRONLY); break
        except FileExistsError:
            try:
                if time.time() - lock.stat().st_mtime > 10: lock.unlink()
            except OSError: pass
            time.sleep(0.01)
    if fd is None: raise RuntimeError("hook log lock not acquired")  # fail closed; never append unlocked
    try:
        prev = HOOK_HEAD.read_text(encoding="utf-8").strip() if HOOK_HEAD.exists() else "start"
        line = json.dumps({"ts": time.time(), **entry, "prev": prev})
        with open(HOOK_LOG, "a", encoding="utf-8") as f:
            f.write(line + "\n")
        HOOK_HEAD.write_text(hashlib.sha256(line.encode()).hexdigest())
    finally:
        if fd is not None:
            os.close(fd); lock.unlink(missing_ok=True)


def log_chain_ok():
    if not HOOK_LOG.exists(): return True
    prev = "start"
    for line in HOOK_LOG.read_text(encoding="utf-8").splitlines():
        try: e = json.loads(line)
        except ValueError: return False
        if e.get("prev") != prev: return False
        prev = hashlib.sha256(line.encode()).hexdigest()
    return not HOOK_HEAD.exists() or HOOK_HEAD.read_text(encoding="utf-8").strip() == prev


def read_log(since=0.0):
    if not HOOK_LOG.exists(): return []
    out = []
    for line in HOOK_LOG.read_text(encoding="utf-8").splitlines():
        try: e = json.loads(line)
        except ValueError: continue
        if e.get("ts", 0) >= since: out.append(e)
    return out
