"""Shared helpers. State lives OUTSIDE the project so agents cannot edit it."""
import hashlib, json, os, pathlib, re, site, sys, sysconfig, tempfile, time

for _s in (sys.stdout, sys.stderr):  # Windows pipes default to cp1252; non-ASCII output must never crash a script
    try: _s.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError): pass

TEST_MODE = os.environ.get("ONEV1_TEST") == "1"  # ONEV1_ROOT / ONEV1_STATE are honoured only in test mode (selftest)
ROOT = pathlib.Path(os.environ["ONEV1_ROOT"] if TEST_MODE and os.environ.get("ONEV1_ROOT") else os.getcwd()).resolve()
STATE = pathlib.Path(os.environ["ONEV1_STATE"] if TEST_MODE and os.environ.get("ONEV1_STATE")
                     else pathlib.Path(tempfile.gettempdir()) / ("1v1-" + hashlib.sha256(str(ROOT).encode()).hexdigest()[:12]))
CACHES = {"__pycache__", ".mypy_cache", ".ruff_cache", ".pytest_cache", ".hypothesis"}  # regenerated; never trusted
PROT_NAMES = {n.lower() for n in {
    "conftest.py", "pytest.ini", ".pytest.ini", "pytest.toml", ".pytest.toml", "tox.ini", "setup.cfg", "setup.py",
    "mypy.ini", ".mypy.ini", "ruff.toml", ".ruff.toml", ".coveragerc", ".flake8", "pyproject.toml", "verify", "verify-fast",
    "Makefile", "noxfile.py", ".gitlab-ci.yml", ".pre-commit-config.yaml", "CLAUDE.md", "sitecustomize.py", "usercustomize.py"}}
PROT_TOP = {"tests", "test", ".1v1", ".github", ".claude", "evals", ".git"}
# Modules that decide how tests run. A file or package with one of these names anywhere in the project could stand in
# for the real one (a project-level pytest.py replaces pytest), so they are protected wherever they appear.
TEST_MODULES = {"pytest", "_pytest", "pluggy", "py", "iniconfig", "hypothesis", "unittest", "doctest", "coverage", "xdist",
                "sitecustomize", "usercustomize", "conftest", "site", "typing", "builtins"}
BREAKER_OWN = (".1v1/breaker/", ".1v1/holdout/", ".1v1/scratch/")  # the only places the breaker may write
SCRATCH = ".1v1/scratch/"  # breaker probes: free to create and delete, never a gate, wiped by finish
BUILDER_SCRATCH = "_scratch"  # builder probes: never tracked or audited, wiped before every check run, so nothing can depend on it
WITHDRAWN = ".1v1/breaker/withdrawn.txt"  # "<test node id> | reason" lines: the breaker's own wrong tests, shown to the user
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
_shadow = None


def shadow_names():
    """Top-level names a project module must not take: the standard library and installed distributions, minus the
    project's own names recorded at freeze. Cached in the state folder (computing it is slow)."""
    global _shadow
    if _shadow is None:
        f = STATE / "shadow.json"
        try: _shadow = set(json.loads(f.read_text(encoding="utf-8")))
        except (OSError, ValueError): _shadow = set(sys.stdlib_module_names)
    return _shadow


def compute_shadow_names():
    import importlib.metadata
    names = set(sys.stdlib_module_names) | set(importlib.metadata.packages_distributions())
    own = {p.stem if p.suffix == ".py" else p.name for p in ROOT.iterdir() if p.suffix == ".py" or (p / "__init__.py").exists()}
    return sorted((names - own) | TEST_MODULES)


def module_name(r):
    """The importable top-level name a path defines, or None. r is project-relative posix."""
    parts = r.split("/")
    if parts[-1] == "__init__.py" and len(parts) >= 2: return parts[-2]
    if parts[-1].endswith((".py", ".pyc", ".pyd", ".so")): return parts[-1].split(".")[0]
    return None


def is_hidden(r):
    """While the builder works, everything in .1v1/ except its own input file is moved out of the project."""
    return r.startswith(".1v1/") and r not in (BUILDER_INPUT, PROBE)


def is_breaker_own(r):
    return r is not None and r.startswith(BREAKER_OWN)


def breaker_may_write(r):
    """The breaker's own folders, minus config that could change how a whole gate runs. Its conftest.py (fixtures for its
    own tests) is allowed: it only affects the breaker's suites, which the builder cannot touch."""
    return is_breaker_own(r) and (r.split("/")[-1] == "conftest.py" or not is_config(r))


def is_config(r):
    name = r.split("/")[-1].lower()
    return name in PROT_NAMES or name.endswith(".pth") or module_name(r) in TEST_MODULES


def is_compiled(r):
    """Compiled modules outside __pycache__ (a sourceless .pyc imports like a module but the audit cannot read it)."""
    return r.lower().endswith((".pyc", ".pyo", ".pyd", ".so")) and "__pycache__" not in r.split("/")


def is_protected(r):
    parts = r.split("/")
    name = parts[-1].lower()
    m = module_name(r)
    top_level = len(parts) == 1 or (len(parts) == 2 and parts[-1] == "__init__.py")
    return (parts[0].lower() in PROT_TOP or any(p.lower() in ("tests", "test") for p in parts[:-1])
            or is_config(r) or is_compiled(r) or (top_level and m in shadow_names())
            or re.fullmatch(r"test_.*\.py|.*_test\.py", name) is not None)


def is_source(r):
    return r.endswith(".py") and not is_protected(r)


def is_venv(d):
    return (d / "pyvenv.cfg").exists()


def walk():
    """Every project file except caches, the project's own .git and real virtual environments (pyvenv.cfg).
    A folder merely *named* venv or node_modules is walked: hiding code there must not hide it from the guard."""
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
    """Hash of what can change how Python and pytest behave outside the project: installed distributions,
    .pth files, sitecustomize/usercustomize. A builder that pip-installs a plugin or drops a .pth changes it."""
    dirs = {p for p in [*site.getsitepackages(), site.getusersitepackages(), sysconfig.get_paths().get("purelib", ""),
                        os.environ.get("ONEV1_EXTRA_SITE", "")] if p}  # the extra dir lets selftest prove this works
    items = []
    for d in sorted(dirs):
        dp = pathlib.Path(d)
        if not dp.is_dir(): continue
        for e in sorted(dp.iterdir(), key=lambda x: x.name):
            if e.name.endswith((".dist-info", ".egg-info", ".egg-link")): items.append(e.name)
            elif e.suffix == ".pth" or e.name in ("sitecustomize.py", "usercustomize.py"):
                try: items.append(e.name + ":" + sha(e))
                except OSError: items.append(e.name)
    return hashlib.sha256("\n".join(items).encode()).hexdigest()[:16]


def clean_env():
    """Environment for the final gates: nothing an agent could have set to steer Python or pytest."""
    bad = ("PYTHON", "PYTEST", "HYPOTHESIS", "COV_", "COVERAGE")
    keep = {"PYTHONIOENCODING", "PYTHONUTF8"}
    env = {k: v for k, v in os.environ.items() if k in keep or not k.upper().startswith(bad)}
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    env["PYTHONIOENCODING"] = "utf-8"
    # bytecode is read only from a fresh empty folder: a crafted .pyc in the project can never stand in for its source
    env["PYTHONPYCACHEPREFIX"] = tempfile.mkdtemp(prefix="1v1pyc-")
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
