"""Tamper guard and referee. Run from the project root. State lives outside the project.

  guard.py freeze --check "<cmd>"   Step 4, after approval: lock tests, config, verify, CLAUDE.md, .claude/,
                                    contract and questions; record the checks and environment fingerprints
  guard.py preflight                before round 1: hook installed and live, agents installed, checks frozen
  guard.py role builder|breaker|orchestrator    set the phase (the hook only allows the matching agent)
  guard.py check --role R [--revert]            what changed since the last init; R = builder|breaker|orchestrator
  guard.py init                     snapshot after a CLEAN check (refused after a violation)
  guard.py hide | reveal            move all of .1v1/ (except the builder's input) out of / back into the project
  guard.py builder-input --check | NODEID ...   write .1v1/BUILDER_INPUT.md (prompt + contract + raw failing output)
  guard.py breaker-input [--holdout]            write .1v1/BREAKER_INPUT.md (prompt + contract + questions + how to run)
  guard.py run-check                restore the locked checks, then run the check command in a clean environment
  guard.py failing [NODEID ...]     raw output of failing breaker tests (for you to read)
  guard.py finish --seal <SEAL>     Step 6: restore the locked checks, run every final gate, print the verdict
                                    (SEAL = the one printed by the latest init)
  guard.py status
  guard.py unfreeze | approve-changes   USER ONLY, from a real terminal (refused without a TTY)
"""
import hashlib, json, os, pathlib, re, shutil, stat, subprocess, sys, time
from common import *

MAN = STATE / "manifest.json"
COPIES = STATE / "files"
FCOPIES = STATE / "frozen_files"
HID = STATE / ("h-" + hashlib.sha256((str(STATE) + "hidden").encode()).hexdigest()[:10])  # not a guessable name
BASE = STATE / "approved.json"
STRIKES = STATE / "strikes.json"
LAST = STATE / "last_check.json"
FINAL = STATE / "final.json"
ORIG = STATE / "breaker_orig"  # first version of every breaker test the breaker later edited
SKILL = pathlib.Path(__file__).resolve().parent.parent
FREE = {".1v1/report.md"}  # the only project file the orchestrator may write during the loop


def hidden_now():
    return (HID / ".1v1").exists() and any((HID / ".1v1").iterdir())


def loc(r):
    return HID / r if is_hidden(r) and (HID / r).exists() else ROOT / r


def scan():
    cur = {r: sha(ROOT / r) for r in walk() if r not in INPUTS}
    if HID.exists():
        for p in HID.rglob("*"):
            r = p.relative_to(HID).as_posix()
            if p.is_file() and r not in INPUTS and "__pycache__" not in r: cur.setdefault(r, sha(p))
    return cur


def freezable(r):
    return is_protected(r) and not is_breaker_own(r) and r != PROBE and r not in FREE


def save(p, obj): STATE.mkdir(parents=True, exist_ok=True); p.write_text(json.dumps(obj, indent=1), encoding="utf-8")


def load(p, default): return json.loads(p.read_text(encoding="utf-8")) if p.exists() else default


def snapshot(files, dst):
    if dst.exists(): shutil.rmtree(dst)
    for r in files:
        d = dst / r
        d.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(loc(r), d)


def need_tty(what):
    if not sys.stdin.isatty():
        print(f"REFUSED: {what} is for the user only. Run it yourself in a terminal (not through Claude):\n"
              f'  cd "{ROOT}"\n  python "{pathlib.Path(__file__).resolve()}" {what}')
        sys.exit(2)
    import secrets
    code = f"{what.upper()}-{secrets.randbelow(9000) + 1000}"
    try: answer = input(f"Type {code} to confirm: ").strip()
    except EOFError: answer = ""  # Claude's own tools give no interactive input: this is a refusal
    if answer != code: print("REFUSED: confirmation not given at a terminal"); sys.exit(2)


def strike(who, n=1):
    s = load(STRIKES, {}); s[who] = s.get(who, 0) + n; save(STRIKES, s)
    print(f"STRIKES {who}: {s[who]}/2")
    return s[who]


def verdicts_since_approval():
    """Verdicts given since the user last approved the checks: from the state folder AND from the record kept under
    ~/.claude, so deleting the state folder cannot reset this."""
    since = load(STATE / "approved_at.json", {"time": 0})["time"]
    out = [f for f in load(FINAL, []) if f["time"] > since]
    ev = read_record()
    last_ok = max([e.get("ts", 0) for e in ev if e.get("kind") == "approve"] or [0])
    out += [{"time": e.get("ts", 0), "verdict": e.get("verdict", "?") + " (record)"} for e in ev
            if e.get("kind") == "verdict" and e.get("ts", 0) > last_ok]
    return out


def freeze(check_cmd):
    if frozen() is not None: print("already frozen"); return 0
    if not check_cmd: print('ERROR: freeze needs --check "<check command>"'); return 2
    if verdicts_since_approval() or record_active():  # a second freeze after a verdict would let anyone retry until GREEN
        print("This approval already has a verdict, or a loop is already running: "
              + (", ".join(f["verdict"] for f in verdicts_since_approval()) or "running") + ".")
        need_tty("freeze")
        record("approve", by="user at a terminal")
    elif not read_record():
        record("approve", by="first approval")
    STATE.mkdir(parents=True, exist_ok=True)
    import common
    (STATE / "shadow.json").write_text(json.dumps(compute_shadow_names()), encoding="utf-8")
    common._shadow = None
    cur = scan()
    files = {r: h for r, h in cur.items() if freezable(r)}
    snapshot(files, FCOPIES)
    changed = []
    base = load(BASE, None)
    if base is None: save(BASE, files); save(STATE / "approved_at.json", {"time": time.time()})
    else: changed = sorted(r for r in set(base) | set(files) if base.get(r) != files.get(r))
    fp, env = fingerprint(files), env_fingerprint()
    save(FROZEN, {"time": time.time(), "check": check_cmd, "files": files, "changed_since_approval": changed,
                  "fingerprint": fp, "env": env})
    save(STRIKES, {"builder": 0, "breaker": 0, "orchestrator": 0})
    LAST.unlink(missing_ok=True)
    shutil.rmtree(ORIG, ignore_errors=True)
    init(force=True)
    save(ROLE, {"role": "orchestrator", "since": time.time()})
    record("freeze", fingerprint=fp)
    print(f"frozen: {len(files)} protected files (tests, config, verify, CLAUDE.md, .claude, contract, questions)")
    print(f"CHECKS FINGERPRINT: {fp}  (environment {env}). Show this to the user; finish must print the same.")
    if changed: print("WARNING: these checks differ from the first approved run; a GREEN verdict now needs the user's approve-changes:\n  " + "\n  ".join(changed))
    return 0


def frozen_diff():
    fz, cur, bad = frozen(), scan(), []
    if fz is None: return bad
    for r, h in fz["files"].items():
        if r not in cur: bad.append(("frozen-deleted", r))
        elif cur[r] != h: bad.append(("frozen-modified", r))
    for r in cur:
        if freezable(r) and r not in fz["files"]: bad.append(("frozen-added", r))
    return bad


def purge_pycache():
    """Bytecode in the project is never trusted: delete it (the gates also read bytecode only from an empty prefix).
    The builder's _scratch/ goes too, so no shipped code can depend on it."""
    def force(fn, p, exc):  # a read-only file must not survive the purge
        try: os.chmod(p, stat.S_IWRITE); fn(p)
        except OSError: pass
    if (ROOT / BUILDER_SCRATCH).exists(): shutil.rmtree(ROOT / BUILDER_SCRATCH, onexc=force)
    for dp, dns, _ in os.walk(ROOT):
        for dn in list(dns):
            if dn == "__pycache__":
                shutil.rmtree(pathlib.Path(dp) / dn, ignore_errors=True); dns.remove(dn)


def restore_frozen():
    """Put every locked file back exactly as approved. Whatever changed it, the checks that run are the approved ones."""
    bad = frozen_diff()
    for kind, r in bad:
        if kind == "frozen-added": loc(r).unlink(missing_ok=True)
        elif (FCOPIES / r).exists():
            loc(r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(FCOPIES / r, loc(r))
    return bad


def check(who, revert, prove=True):
    if not MAN.exists(): print("ERROR: no snapshot; run init"); return 2
    old, new, bad, edited = json.loads(MAN.read_text(encoding="utf-8")), scan(), [], []
    for r in set(old) | set(new):
        kind = "deleted" if r not in new else "added" if r not in old else "modified" if old[r] != new[r] else None
        if not kind or r in FREE: continue
        if who == "breaker":
            if r.startswith(SCRATCH): continue
            if not breaker_may_write(r) or kind == "deleted": bad.append((kind, r))
            elif kind == "modified":
                edited.append(r)
                if not (ORIG / r).exists() and (COPIES / r).exists():  # keep the first version; finish reruns it
                    (ORIG / r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(COPIES / r, ORIG / r)
        elif who == "orchestrator" or is_protected(r) or is_breaker_own(r):
            bad.append((kind, r))  # the orchestrator changes nothing in the project during the loop
    bad += [b for b in frozen_diff() if b[1] not in {x[1] for x in bad}]
    if not log_chain_ok(): bad.append(("hook-log-tampered", "the hook log's hash chain is broken: a line was edited or deleted"))
    since = role()["since"]
    log_ = read_log(since)
    if who in ("builder", "breaker") and prove:
        mine = [e for e in log_ if e.get("actor") == who]
        if not mine: bad.append(("agent-proof", f"the hook saw no tool calls from 1v1-{who} since 'guard.py role {who}': the real agent did not run, or the hook is not live"))
    # every event since the last check counts, once, even if a role switch happened in between
    fresh = [e for e in read_log(0) if e.get("ts", 0) > load(LAST, {}).get("time", 0)]
    others = sorted({e.get("agent_type") for e in fresh if e.get("actor") == "other-agent"})
    if others: bad.append(("wrong-agent", "tool calls from agent types " + ", ".join(others)))
    tries = {}
    for e in fresh:
        if e.get("decision") != "block": continue
        print(f"BLOCKED ATTEMPT ({e.get('actor')}, {e.get('tool')}): {e.get('reason')} | {e.get('target', '')[:120]}")
        tgt = str(e.get("target", ""))
        aimed = rel(tgt) is not None or ".claude" in tgt.lower() or STATE.name.lower() in tgt.lower()  # checks, code, Claude, state
        content_only = str(e.get("reason", "")).startswith("content: ")  # an honest builder can trip these; it must stop and ask
        if e.get("tool") in ("Write", "Edit", "MultiEdit", "NotebookEdit") and e.get("actor") in ("builder", "breaker", "orchestrator") and aimed and not content_only:
            bad.append(("blocked-write", f"{e.get('actor')} tried to write {tgt[:120]}"))
        if e.get("actor") in ("builder", "breaker") and not content_only:
            k = (e.get("actor"), e.get("reason")); tries[k] = tries.get(k, 0) + 1
    for (actor, reason), n in tries.items():
        if n >= 2: bad.append(("retried-after-block", f"{actor} hit the same block {n} times (rule 4: a block is a stop sign): {reason}"))
    for r in edited: print(f"EDITED (allowed; the original version is rerun by finish, list it in the report): {r}")
    for kind, r in bad:
        print(f"VIOLATION {kind}: {r}")
        if revert and kind.replace("frozen-", "") in ("added", "modified", "deleted"):
            src = FCOPIES / r if kind.startswith("frozen") else COPIES / r
            if kind.endswith("added"): loc(r).unlink(missing_ok=True)
            elif src.exists():
                loc(r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(src, loc(r))
    n = strike(who) if bad and frozen() is not None else load(STRIKES, {}).get(who, 0)
    save(LAST, {"clean": not bad, "time": time.time(), "scan": fingerprint(scan())})
    print("clean" if not bad else f"{len(bad)} violation(s)" + (" (reverted; run check again before init)" if revert else ""))
    if bad and n >= 2:
        print(f"STOP: two strikes for {who}. Stop the loop and report to the user."); return 3
    return 1 if bad else 0


def seal():
    """Hash of everything the verdict runs: the locked checks plus the breaker's and holdout tests (scratch excluded).
    Printed by every init; the orchestrator keeps the latest in its own context (no agent can edit that) and passes it
    to finish. Tampering with the copies in the state folder then cannot produce a GREEN."""
    return fingerprint({r: h for r, h in scan().items() if freezable(r) or (is_breaker_own(r) and not r.startswith(SCRATCH))})


def init(force=False):
    if not force:
        if frozen_diff(): print("REFUSED: frozen checks changed. Run check --revert, then check until clean."); return 1
        last = load(LAST, {"clean": True})
        if not last["clean"]: print("REFUSED: the last check had violations. Run check again; init only after a clean check."); return 1
        if last.get("scan") and last["scan"] != fingerprint(scan()):
            print("REFUSED: files changed since the last check. Run guard.py check first; init snapshots only what a check saw."); return 1
    if COPIES.exists(): shutil.rmtree(COPIES)
    cur = scan()
    snapshot(cur, COPIES)
    save(MAN, cur)
    print(f"snapshot: {len(cur)} files")
    if frozen() is not None: print(f"SEAL: {seal()}  (keep the latest; pass it to finish --seal)")
    return 0


def move(src_root, dst_root):
    """hide: every entry of .1v1/ except the builder's input and the probe goes to the state folder. reveal: back.
    Caches that can hold traces of the breaker's tests go too: hypothesis's example database (failing inputs, holdout
    included) is parked outside the project, and mypy/ruff/pytest caches are deleted (they regenerate)."""
    hyp_src, hyp_dst = (ROOT / ".hypothesis", STATE / "hypothesis") if src_root == ROOT else (STATE / "hypothesis", ROOT / ".hypothesis")
    if hyp_src.exists():
        if hyp_dst.exists(): shutil.rmtree(hyp_dst, ignore_errors=True)
        shutil.move(str(hyp_src), str(hyp_dst))
    if src_root == ROOT:
        for c in (".mypy_cache", ".ruff_cache", ".pytest_cache"): shutil.rmtree(ROOT / c, ignore_errors=True)
    base = src_root / ".1v1"
    if not base.exists(): return
    for child in list(base.iterdir()):
        r = ".1v1/" + child.name
        if not is_hidden(r) or child.name == "__pycache__": continue
        d = dst_root / r
        d.parent.mkdir(parents=True, exist_ok=True)
        if d.exists(): shutil.rmtree(d) if d.is_dir() else d.unlink()
        shutil.move(str(child), str(d))


def preflight():
    ok = True
    def line(good, msg):
        nonlocal ok; ok &= good; print(("OK   " if good else "FAIL ") + msg)
    fz = frozen()
    line(fz is not None, "checks frozen (guard.py freeze ran after approval)")
    sp = ROOT / ".claude" / "settings.json"
    line(sp.exists() and "hook_guard.py" in sp.read_text(encoding="utf-8"), "1v1 hook in .claude/settings.json (install.py)")
    for name in AGENTS:
        locs = [ROOT / ".claude" / "agents" / f"{name}.md", pathlib.Path.home() / ".claude" / "agents" / f"{name}.md"]
        line(any(p.exists() for p in locs), f"agent {name} installed (.claude/agents or ~/.claude/agents)")
    probes = [e for e in read_log(fz["time"] if fz else 0) if e.get("decision") == "probe"]
    line(bool(probes), f"hook is live: a Read of {PROBE} after freeze was blocked by the hook")
    line(log_chain_ok(), "hook log hash chain intact")
    if not ok:
        print("\nPREFLIGHT FAILED. Do not start round 1. If the probe failed: Read the file "
              f"{PROBE} with the Read tool (it must be BLOCKED), then rerun preflight. If it is still not blocked, "
              "or the agents are missing from your Agent tool, the user must restart Claude Code (`claude --continue`). "
              "Never substitute a general-purpose agent.")
    return 0 if ok else 1


def run(cmd, shell=False):
    return subprocess.run(cmd, shell=shell, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=clean_env())


def run_check(show=True):
    """Restore the locked checks, then run the approved check command in a clean environment."""
    fz = frozen()
    if fz is None: print("ERROR: not frozen"); return 2, ""
    purge_pycache()
    bad = restore_frozen()
    for kind, r in bad: print(f"VIOLATION {kind}: {r} (restored to the approved version before running)")
    if bad: strike(role()["role"])
    c = run(fz["check"], shell=True)
    out = (c.stdout + c.stderr)[-20000:]
    if show: print(out + f"\nexit {c.returncode}")
    return c.returncode, out


def junit_counts(xml_path):
    """(tests, failures+errors, skipped) from a JUnit report, or None if pytest never wrote one."""
    import xml.etree.ElementTree as ET
    try: root = ET.parse(xml_path).getroot()
    except (OSError, ET.ParseError): return None
    suites = [root] if root.tag == "testsuite" else root.findall("testsuite")
    n = lambda k: sum(int(s.get(k, 0) or 0) for s in suites)
    return n("tests"), n("failures") + n("errors"), n("skipped")


def run_suite(path, sub, extra=()):
    """Run one suite; return (exit code, last line, failed test keys like 'breaker/test_x.py::name').
    The exit code alone is not trusted: code that kills pytest with exit status 0 (os._exit(0) at import) would pass.
    pytest must also write a JUnit report showing at least one test ran and none failed."""
    xml = STATE / f"junit-{sub}-{abs(hash(str(path))) % 10**8}.xml"
    xml.unlink(missing_ok=True)
    p = run([sys.executable, "-m", "pytest", str(path), "-q", "-rf", "-p", "no:cacheprovider", f"--junitxml={xml}", *extra])
    counts = junit_counts(xml)
    if p.returncode in (0, 1) and counts is None:
        return 3, "pytest ended without writing its report (killed or exited early): no test can be trusted", set()
    if p.returncode == 0 and counts and (counts[0] - counts[2] < 1 or counts[1] > 0):
        return 3, f"report shows {counts[0]} tests, {counts[1]} failed, {counts[2]} skipped: not a real pass", set()
    keys = set()
    for node in re.findall(r"^FAILED (\S+)", p.stdout, re.M):
        node = node.replace("\\", "/")
        keys.add(sub + "/" + (node.split(sub + "/", 1)[1] if sub + "/" in node else node))
    return p.returncode, (p.stdout.strip().splitlines() or [""])[-1], keys


def withdrawn():
    """(node id, reason) pairs the breaker withdrew, and the invalid lines. Only full node ids that match exactly one
    collected test count (a prefix such as '.1v1/breaker/test_' would otherwise withdraw whole files)."""
    p = ROOT / WITHDRAWN
    if not p.exists(): return [], []
    lines = [l for l in p.read_text(encoding="utf-8", errors="replace").splitlines() if l.strip()]
    col = run([sys.executable, "-m", "pytest", ".1v1/breaker", "--collect-only", "-q", "-p", "no:cacheprovider",
               "--ignore", str(ROOT / MINOR)])
    ids = {l.strip().replace("\\", "/") for l in col.stdout.splitlines() if "::" in l}
    ok, bad = [], []
    for line in lines:
        node, _, why = line.partition("|")
        node = node.strip().replace("\\", "/")
        (ok if "::" in node and node in ids else bad).append((node, why.strip() or "no reason given"))
    return ok, bad


def pytest_gate(d, fails=None):
    if not (ROOT / d).exists(): return False, f"{d} does not exist"
    extra = ["--ignore", str(ROOT / MINOR)] if d == ".1v1/breaker" else []
    if d == "tests": extra = []
    if d == ".1v1/breaker":
        for node, _ in withdrawn()[0]: extra += ["--deselect", node]
    rc, tail, keys = run_suite(ROOT / d, d.split("/")[-1], extra)
    if fails is not None: fails |= keys
    if rc == 5: return False, "no tests collected"
    return rc == 0, tail


def orig_gate(current_fails):
    """Rerun the suites with the first version of every breaker file the breaker edited. An edit must not hide a real failure."""
    name = "edited breaker tests: original versions"
    files = [p for p in ORIG.rglob("*.py")] if ORIG.exists() else []
    if not files: return (name, True, "no edits")
    run_dir = STATE / "orig_run"  # outside the project: a full copy of the suites with the original versions swapped in
    shutil.rmtree(run_dir, ignore_errors=True)
    subs = [s for s in ("breaker", "holdout") if (ROOT / ".1v1" / s).exists()]
    for sub in subs: shutil.copytree(ROOT / ".1v1" / sub, run_dir / sub, ignore=shutil.ignore_patterns("__pycache__"))
    for p in files:
        d = run_dir / p.relative_to(ORIG / ".1v1"); d.parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, d)
    orig_fails = set()
    for sub in subs: orig_fails |= run_suite(run_dir / sub, sub)[2]
    skip = {"breaker/" + n.split(".1v1/breaker/", 1)[-1] for n, _ in withdrawn()[0]}
    orig_fails = {k for k in orig_fails if not k.startswith("breaker/minor/") and k not in skip}
    current_fails = {k for k in current_fails if not k.startswith("breaker/minor/") and k not in skip}
    hidden = sorted(orig_fails - current_fails)  # fail with the originals, pass now
    shutil.rmtree(run_dir, ignore_errors=True)
    if not hidden: return (name, True, f"{len(files)} edited file(s); no failure hidden by an edit")
    return (name, False, f"edits turned these failures green: {', '.join(hidden[:5])}{' ...' if len(hidden) > 5 else ''}; "
            "the user must review the edits (approve-changes accepts them)")


def questions_table():
    q = ROOT / ".1v1" / "questions.md"
    if not q.exists(): return
    tests = []  # (name, name + the start of its body: docstrings and comments may cite IDs too)
    for d in (".1v1/breaker", ".1v1/holdout"):
        for p in (ROOT / d).rglob("*.py") if (ROOT / d).exists() else []:
            src = p.read_text(encoding="utf-8", errors="replace")
            defs = list(re.finditer(r"^\s*(?:async\s+)?def (test_\w+)", src, re.M))
            for i, m in enumerate(defs):
                end = defs[i + 1].start() if i + 1 < len(defs) else len(src)
                tests.append((m.group(1), m.group(1)[5:].replace("_", " ") + " " + src[m.end():min(end, m.end() + 600)]))
    print("\nQUESTIONS (paste into the report verbatim; take each outcome from the breaker's QUESTIONS table):")
    print("| ID | Question (verbatim) | Tests found |")
    for line in q.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*([GTQ]\d+):\s*(.+)", line)
        if not m: continue
        hits = [n for n, text in tests if re.search(rf"\b{m.group(1)}\b", text)]  # test_R4_T9_x counts for T9
        print(f"| {m.group(1)} | {m.group(2).strip()} | {', '.join(hits[:4]) + (' ...' if len(hits) > 4 else '') if hits else 'NONE: needs a reason'} |")


def failing(nodes, show=True):
    """Raw failing output of breaker tests."""
    p = run([sys.executable, "-m", "pytest", *(nodes or [".1v1/breaker"]), "-q", "--tb=short", "-p", "no:cacheprovider", "-rf"])
    if show: print(p.stdout[-20000:])
    return p.returncode, p.stdout[-20000:]


def template(name):
    t = (SKILL / "references" / name).read_text(encoding="utf-8")
    return t.split("\n---\n", 1)[1].strip() if "\n---\n" in t else t


def text(r):
    p = loc(r)
    return p.read_text(encoding="utf-8", errors="ignore") if p.exists() else f"({r} missing)"


def builder_input(args):
    """Write .1v1/BUILDER_INPUT.md: builder prompt + contract + raw failing output. The orchestrator adds nothing:
    the hook only lets it spawn the builder with the fixed one-line BUILDER_PROMPT."""
    if "--check" in args:
        rc, out = run_check(show=False)
        source = f"check command: {(frozen() or {}).get('check')} (exit {rc})"
    else:
        nodes = [x for x in args if not x.startswith("--")]
        if not nodes: print("usage: guard.py builder-input --check | <failing breaker test node IDs>"); return 2
        was_hidden = hidden_now()
        if was_hidden: move(HID, ROOT)
        rc, out = failing(nodes, show=False)
        if was_hidden: move(ROOT, HID)
        source = "breaker tests: " + " ".join(nodes)
    p = ROOT / BUILDER_INPUT
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(f"{template('builder-prompt.md')}\n\n# Contract\n\n{text('.1v1/contract.md')}\n\n"
                 f"# Failing output ({source}), exactly as printed\n\n```\n{out}\n```\n", encoding="utf-8")
    print(f"wrote {BUILDER_INPUT} ({p.stat().st_size} bytes). Spawn 1v1-builder with exactly this prompt:\n{BUILDER_PROMPT}")
    return 0


def breaker_input(args):
    """Write .1v1/BREAKER_INPUT.md: breaker prompt + contract + questions + how to run. The orchestrator adds nothing."""
    fz = frozen() or {}
    b = load(STATE / "budget.json", {})
    holdout = "--holdout" in args
    p = ROOT / BREAKER_INPUT
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_text(
        f"{template('breaker-prompt.md')}\n\n# This round\n\nRound {b.get('round', 0) + 1} of {b.get('rounds', '?')}. "
        + ("**This is the holdout round:** also write a separate set of tests in `.1v1/holdout/` (see the prompt above). "
           if holdout else "This is not the holdout round: do not write to `.1v1/holdout/`. ")
        + f"The project's check command is `{fz.get('check', '?')}`. Run the system only through the Interface in the "
          "contract. Throwaway probes go in `.1v1/scratch/`.\n\n"
          f"# Contract\n\n{text('.1v1/contract.md')}\n\n# Questions (answer every ID)\n\n{text('.1v1/questions.md')}\n",
        encoding="utf-8")
    print(f"wrote {BREAKER_INPUT} ({p.stat().st_size} bytes). Spawn 1v1-breaker with exactly this prompt:\n{BREAKER_PROMPT}")
    return 0


def finish(given_seal=""):
    fz = frozen()
    if fz is None: print("ERROR: not frozen; nothing to finish"); return 2
    move(HID, ROOT)
    purge_pycache()
    gates = []
    bad = restore_frozen()  # every gate below runs the approved checks, whatever happened to the files
    gates.append(("frozen checks unchanged", not bad, "; ".join(f"{k} {r} (restored)" for k, r in bad) or "unchanged"))
    old, cur = load(MAN, {}), scan()
    drift = sorted(r for r in set(old) | set(cur) if old.get(r) != cur.get(r) and r not in FREE and not r.startswith(SCRATCH)
                   and not freezable(r))
    for r in drift:
        if r in old and (COPIES / r).exists(): loc(r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(COPIES / r, loc(r))
        elif r not in old: loc(r).unlink(missing_ok=True)
    gates.append(("no changes since the last guard check", not drift, ", ".join(drift[:8]) + " (restored)" if drift else "none"))
    gates.append(("builder _scratch/ removed before the gates", not (ROOT / BUILDER_SCRATCH).exists(),
                  "removed" if not (ROOT / BUILDER_SCRATCH).exists() else "STILL PRESENT: something stopped the purge"))
    now = seal()
    gates.append(("seal matches (what runs is what the last check saw)", bool(given_seal) and given_seal == now,
                  "no --seal given" if not given_seal else f"given {given_seal}, files {now}"))
    gates.append(("hook log intact", log_chain_ok(), "hash chain verified" if log_chain_ok() else "a line was edited or deleted"))
    env = env_fingerprint()
    gates.append(("Python environment unchanged", env == fz.get("env"), f"{fz.get('env')} -> {env}" + ("" if env == fz.get("env") else
                  ": packages, .pth files or sitecustomize changed during the loop")))
    a = run([sys.executable, str(SKILL / "scripts" / "audit.py")])
    gates.append(("audit.py (U2/U3/U4/U11 scan)", a.returncode == 0, a.stdout.strip().splitlines()[-1] if a.stdout.strip() else ""))
    c = run(fz["check"], shell=True)
    gates.append((f"check command: {fz['check']}", c.returncode == 0, f"exit {c.returncode}"))
    if (ROOT / "tests").is_dir():  # the check command's exit code is not trusted alone either
        good, info = pytest_gate("tests"); gates.append(("project tests really ran (JUnit report)", good, info))
    fails = set()
    for d in (".1v1/breaker", ".1v1/holdout"):
        good, info = pytest_gate(d, fails); gates.append((f"{d} tests", good, info))
    gates.append(orig_gate(fails))
    w, wbad = withdrawn()
    if w:
        gates.append(("breaker tests withdrawn by the breaker (reported, check them)", True,
                      "; ".join(f"{n} ({why})" for n, why in w)[:600]))
    if wbad:
        gates.append(("withdrawn.txt lines are exact test ids", False,
                      "not a single collected test, so not withdrawn: " + "; ".join(n for n, _ in wbad)[:400]))
    if (ROOT / MINOR).exists():
        rc, tail, _ = run_suite(ROOT / MINOR, "breaker")
        gates.append(("MINOR breaker tests (reported, not a gate)", True, tail))
    s = load(STRIKES, {})
    gates.append(("strikes below 2", all(v < 2 for v in s.values()), json.dumps(s)))
    changed = fz.get("changed_since_approval", [])
    gates.append(("checks same as first approved run", not changed, ", ".join(changed) or "same"))
    budget = load(STATE / "budget.json", {})
    attacked = [e for e in read_log(fz["time"]) if e.get("actor") == "breaker"]
    gates.append(("the breaker attacked (a recorded round with real breaker tool calls)", budget.get("round", 0) >= 1 and bool(attacked),
                  f"rounds recorded {budget.get('round', 0)}, breaker tool calls {len(attacked)}"))
    prior = verdicts_since_approval()
    gates.append(("first verdict for this approval", not prior, "none before" if not prior else
                  "earlier: " + ", ".join(f["verdict"] for f in prior) + " (a rerun cannot replace a verdict)"))
    green = all(g[1] for g in gates)
    verdict = ("GREEN" if green else "NOT GREEN") + (" (TEST STATE)" if TEST_MODE else "")
    print(f"VERDICT: {verdict}")
    for name, good, info in gates: print(f"{'pass' if good else 'FAIL'} | {name} | {info}")
    print(f"rounds: {budget.get('round', '?')}/{budget.get('rounds', '?')}")
    print(f"CHECKS FINGERPRINT: approved {fz.get('fingerprint')}, now {fingerprint({r: h for r, h in scan().items() if freezable(r)})}")
    questions_table()
    shutil.rmtree(ROOT / SCRATCH, ignore_errors=True)
    for r in INPUTS: (ROOT / r).unlink(missing_ok=True)
    record("verdict", verdict=verdict, seal=given_seal)
    hist = load(FINAL, [])
    hist.append({"time": time.time(), "verdict": verdict, "gates": gates, "budget": budget, "fingerprint": fz.get("fingerprint")})
    save(FINAL, hist)
    FROZEN.unlink(missing_ok=True)
    save(ROLE, {"role": "orchestrator", "since": time.time()})
    print("loop ended: checks unfrozen. Write the report from this output only.")
    return 0 if green else 1


if __name__ == "__main__":
    a = sys.argv[1:] or ["-h"]
    cmd = a[0]
    if cmd == "freeze": sys.exit(freeze(a[a.index("--check") + 1] if "--check" in a else ""))
    elif cmd == "init": sys.exit(init())
    elif cmd == "check":
        sys.exit(check(a[a.index("--role") + 1] if "--role" in a else role()["role"], "--revert" in a))
    elif cmd == "hide": move(ROOT, HID); print("hidden")
    elif cmd == "reveal": move(HID, ROOT); print("revealed")
    elif cmd == "role":
        if a[1:2] not in (["builder"], ["breaker"], ["orchestrator"]): print("role must be builder, breaker or orchestrator"); sys.exit(2)
        save(ROLE, {"role": a[1], "since": time.time()}); print("role", a[1])
    elif cmd == "preflight": sys.exit(preflight())
    elif cmd == "failing": sys.exit(failing(a[1:])[0])
    elif cmd == "run-check": sys.exit(run_check()[0])
    elif cmd == "builder-input": sys.exit(builder_input(a[1:]))
    elif cmd == "breaker-input": sys.exit(breaker_input(a[1:]))
    elif cmd == "finish": sys.exit(finish(a[a.index("--seal") + 1] if "--seal" in a and len(a) > a.index("--seal") + 1 else ""))
    elif cmd == "status":
        fz = frozen()
        print(json.dumps({"frozen": fz is not None, "fingerprint": fz and fz.get("fingerprint"), "role": role(),
                          "strikes": load(STRIKES, {}), "hidden": hidden_now(), "log_chain_ok": log_chain_ok(),
                          "finals": [f["verdict"] for f in load(FINAL, [])]}, indent=1))
    elif cmd == "unfreeze":
        need_tty("unfreeze"); FROZEN.unlink(missing_ok=True); record("unfreeze", by="user at a terminal"); print("unfrozen")
    elif cmd == "approve-changes":
        need_tty("approve-changes")
        fz = frozen()
        files = {r: h for r, h in scan().items() if freezable(r)}
        snapshot(files, FCOPIES); save(BASE, files)
        shutil.rmtree(ORIG, ignore_errors=True)  # the user reviewed and accepted the breaker's test edits too
        if fz: fz["files"], fz["changed_since_approval"], fz["fingerprint"] = files, [], fingerprint(files); save(FROZEN, fz)
        save(LAST, {"clean": True, "time": time.time()})
        save(STATE / "approved_at.json", {"time": time.time()})
        record("approve", by="user at a terminal (approve-changes)")
        init(force=True)
        print(f"current checks ({len(files)} files) recorded as approved; new fingerprint {fingerprint(files)}")
    else: print(__doc__); sys.exit(2)
