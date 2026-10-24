"""Tamper guard and referee (TypeScript / Node edition). Run from the project root. State lives outside the project.

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
    subprocess.run([sys.executable, str(SKILL / "scripts" / "audit.py"), "--baseline"], cwd=ROOT, capture_output=True, text=True)
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
    """The builder's _scratch/ is wiped before every check run, so no shipped code can depend on it."""
    def force(fn, p, exc):  # a read-only file must not survive the purge
        try: os.chmod(p, stat.S_IWRITE); fn(p)
        except OSError: pass
    if (ROOT / BUILDER_SCRATCH).exists(): shutil.rmtree(ROOT / BUILDER_SCRATCH, **({"onexc": force} if sys.version_info >= (3, 12) else {"onerror": force}))


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
    Test-runner output that can hold traces of the breaker's tests (Playwright's test-results/ and report folders) is
    deleted when hiding: it regenerates."""
    if src_root == ROOT:
        for c in ("test-results", "playwright-report", "blob-report"): shutil.rmtree(ROOT / c, ignore_errors=True)
    base = src_root / ".1v1"
    if not base.exists(): return
    for child in list(base.iterdir()):
        r = ".1v1/" + child.name
        if not is_hidden(r): continue
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


NPX = shutil.which("npx") or "npx"


def junit_cases(xml_path, base):
    """Every test case in a JUnit report as (key, failed, skipped), or None if the runner never wrote one.
    key = "<file relative to the project>::<test title>". Works for vitest and Playwright reports."""
    import xml.etree.ElementTree as ET
    try: root = ET.parse(xml_path).getroot()
    except (OSError, ET.ParseError): return None
    out = []
    for tc in root.iter("testcase"):
        f = (tc.get("file") or tc.get("classname") or "").replace("\\", "/")
        name = (tc.get("name") or "").strip()
        if f and not f.startswith((".", "/")) and not (ROOT / f).exists() and (base / f).exists():
            f = (base / f).resolve().relative_to(ROOT).as_posix() if (base / f).resolve().is_relative_to(ROOT) else f
        if f.startswith(ROOT.as_posix() + "/"): f = f[len(ROOT.as_posix()) + 1:]
        # Playwright names a case "file.spec.ts > describe > title" or "describe > title"; keep only the title path
        if " > " in name and name.split(" > ", 1)[0].endswith((".ts", ".tsx", ".js", ".mjs")): name = name.split(" > ", 1)[1]
        failed = tc.find("failure") is not None or tc.find("error") is not None
        skipped = tc.find("skipped") is not None
        out.append((f"{f}::{name}", failed, skipped))
    return out


def suite_files(paths):
    """Split test files into Playwright specs (*.spec.ts) and vitest tests (*.test.ts)."""
    files = []
    for p in paths:
        p = pathlib.Path(p)
        if p.is_dir(): files += [q for q in sorted(p.rglob("*")) if q.is_file() and TEST_FILE_RE.search(q.name)]
        elif p.exists(): files.append(p)
    rels = [(f.resolve().relative_to(ROOT).as_posix() if f.resolve().is_relative_to(ROOT) else str(f)) for f in files]
    return [r for r in rels if re.search(r"\.spec\.[cm]?[jt]sx?$", r)], [r for r in rels if re.search(r"\.test\.[cm]?[jt]sx?$", r)]


def run_runner(kind, files, tag, show_output=False):
    """Run one runner on the given files. Returns (exit code, output, cases or None)."""
    xml = STATE / f"junit-{tag}-{kind}.xml"
    xml.unlink(missing_ok=True)
    env = clean_env()
    if kind == "playwright":
        env["PLAYWRIGHT_JUNIT_OUTPUT_NAME"] = str(xml)
        cmd = [NPX, "playwright", "test", "-c", PW_CONFIG, "--reporter=list,junit", *files]
    else:
        cmd = [NPX, "vitest", "run", "-c", VITEST_CONFIG, "--reporter=default", "--reporter=junit", f"--outputFile.junit={xml}", *files]
    p = subprocess.run(cmd, cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=env)
    return p.returncode, (p.stdout + p.stderr), junit_cases(xml, ROOT)


def run_suite(paths, tag, skip=frozenset()):
    """Run every test file under `paths` with the right runner. Return (exit code, summary line, failed keys).
    The exit code alone is not trusted: each runner must also write a JUnit report showing at least one test really ran.
    Failures listed in `skip` (withdrawn by the breaker) do not count."""
    specs, units = suite_files(paths if isinstance(paths, (list, tuple)) else [paths])
    if not specs and not units: return 5, "no test files", set()
    failed, ran, total_skipped, notes = set(), 0, 0, []
    worst = 0
    for kind, files in (("playwright", specs), ("vitest", units)):
        if not files: continue
        rc, out, cases = run_runner(kind, files, tag)
        if cases is None:
            return 3, f"{kind} ended without writing its report (exit {rc}; killed, crashed or did not compile): no test can be trusted. " \
                      + " | ".join(out.strip().splitlines()[-6:]), set()
        f_here = {k for k, bad, _ in cases if bad}
        ran += sum(1 for _, bad, sk in cases if not sk)
        total_skipped += sum(1 for _, _, sk in cases if sk)
        failed |= f_here
        if rc != 0 and not f_here:
            return 3, f"{kind} exited {rc} but its report lists no failing test (a crash outside the tests?): " \
                      + " | ".join(out.strip().splitlines()[-6:]), set()
        notes.append(f"{kind}: {len(cases)} tests, {len(f_here)} failed, {sum(1 for _, _, sk in cases if sk)} skipped")
        worst = max(worst, rc)
    real = failed - set(skip)
    if ran < 1: return 3, f"no test really ran ({'; '.join(notes)})", set()
    return (0 if not real else 1), "; ".join(notes) + (f"; withdrawn failures ignored: {len(failed & set(skip))}" if failed & set(skip) else ""), real


def withdrawn():
    """(test id, reason) pairs the breaker withdrew, and the invalid lines. A test id is "<file>::<exact test title>"
    and counts only if that file is the breaker's and really contains that title."""
    p = ROOT / WITHDRAWN
    if not p.exists(): return [], []
    lines = [l for l in p.read_text(encoding="utf-8", errors="replace").splitlines() if l.strip()]
    ok, bad = [], []
    for line in lines:
        node, _, why = line.partition("|")
        node = node.strip().replace("\\", "/")
        f, _, title = node.partition("::")
        src = ROOT / f
        good = bool(title) and f.startswith(".1v1/breaker/") and src.is_file() and title.split(" > ")[-1] in src.read_text(encoding="utf-8", errors="replace")
        (ok if good else bad).append((node, why.strip() or "no reason given"))
    return ok, bad


def pytest_gate(d, fails=None):
    """Run one of the breaker's suites (.1v1/breaker without minor/, or .1v1/holdout)."""
    if not (ROOT / d).exists(): return False, f"{d} does not exist"
    paths = [ROOT / d]
    if d == ".1v1/breaker":
        paths = [q for q in (ROOT / d).iterdir() if q.resolve() != (ROOT / MINOR).resolve()]
    skip = {n for n, _ in withdrawn()[0]} if d == ".1v1/breaker" else set()
    rc, tail, keys = run_suite(paths, d.split("/")[-1], skip)
    if fails is not None: fails |= keys
    if rc == 5: return False, "no tests found"
    return rc == 0, tail + (f"; failing: {', '.join(sorted(keys)[:5])}" if keys else "")


def project_tests_gate():
    """The project's own tests must really run: vitest (project config) and the offline Playwright suite, each with a
    JUnit report showing tests ran and none failed. The check command's exit code is not trusted alone."""
    results = []
    xml = STATE / "junit-project-vitest.xml"; xml.unlink(missing_ok=True)
    p = subprocess.run([NPX, "vitest", "run", "--reporter=default", "--reporter=junit", f"--outputFile.junit={xml}"],
                       cwd=ROOT, capture_output=True, text=True, encoding="utf-8", errors="replace", env=clean_env())
    cases = junit_cases(xml, ROOT)
    results.append(("vitest", p.returncode, cases))
    for cfg in ("playwright.auth.config.ts",):
        if not (ROOT / cfg).exists(): continue
        x = STATE / "junit-project-pw.xml"; x.unlink(missing_ok=True)
        env = clean_env(); env["PLAYWRIGHT_JUNIT_OUTPUT_NAME"] = str(x)
        q = subprocess.run([NPX, "playwright", "test", "-c", cfg, "--reporter=list,junit"], cwd=ROOT, capture_output=True,
                           text=True, encoding="utf-8", errors="replace", env=env)
        results.append((cfg, q.returncode, junit_cases(x, ROOT)))
    good, info = True, []
    for name, rc, cs in results:
        if cs is None: good = False; info.append(f"{name}: no JUnit report (exit {rc})"); continue
        ran = sum(1 for _, _, sk in cs if not sk); bad = [k for k, f, _ in cs if f]
        if rc != 0 or bad or ran < 1: good = False
        info.append(f"{name}: {len(cs)} tests, {len(bad)} failed, exit {rc}" + (f" ({', '.join(bad[:3])})" if bad else ""))
    return good, "; ".join(info)


def orig_gate(current_fails):
    """Rerun the suites with the first version of every breaker file the breaker edited. An edit must not hide a real
    failure. The originals are swapped in place (imports are relative to the project), then the edits are put back."""
    name = "edited breaker tests: original versions"
    files = [p for p in ORIG.rglob("*") if p.is_file()] if ORIG.exists() else []
    if not files: return (name, True, "no edits")
    backup = STATE / "edited_backup"
    shutil.rmtree(backup, ignore_errors=True)
    for p in files:
        r = p.relative_to(ORIG).as_posix()
        if (ROOT / r).exists(): (backup / r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(ROOT / r, backup / r)
        (ROOT / r).parent.mkdir(parents=True, exist_ok=True); shutil.copy2(p, ROOT / r)
    try:
        skip = {n for n, _ in withdrawn()[0]}
        orig_fails = set()
        for sub in (".1v1/breaker", ".1v1/holdout"):
            if (ROOT / sub).exists():
                paths = [q for q in (ROOT / sub).iterdir() if q.resolve() != (ROOT / MINOR).resolve()]
                orig_fails |= run_suite(paths, "orig-" + sub.split("/")[-1], skip)[2]
    finally:
        for p in files:
            r = p.relative_to(ORIG).as_posix()
            if (backup / r).exists(): shutil.copy2(backup / r, ROOT / r)
            else: (ROOT / r).unlink(missing_ok=True)
        shutil.rmtree(backup, ignore_errors=True)
    hidden = sorted(orig_fails - set(current_fails))  # fail with the originals, pass now
    if not hidden: return (name, True, f"{len(files)} edited file(s); no failure hidden by an edit")
    return (name, False, f"edits turned these failures green: {', '.join(hidden[:5])}{' ...' if len(hidden) > 5 else ''}; "
            "the user must review the edits (approve-changes accepts them)")


TITLE = re.compile(r"""\b(?:test|it)(?:\.\w+)?\s*\(\s*(["'`])(.+?)\1""")


def questions_table():
    q = ROOT / ".1v1" / "questions.md"
    if not q.exists(): return
    tests = []  # (title, title + the start of its body: comments may cite IDs too)
    for d in (".1v1/breaker", ".1v1/holdout"):
        for p in (ROOT / d).rglob("*") if (ROOT / d).exists() else []:
            if not (p.is_file() and TEST_FILE_RE.search(p.name)): continue
            src = p.read_text(encoding="utf-8", errors="replace")
            defs = list(TITLE.finditer(src))
            for i, m in enumerate(defs):
                end = defs[i + 1].start() if i + 1 < len(defs) else len(src)
                tests.append((m.group(2), m.group(2) + " " + src[m.end():min(end, m.end() + 600)]))
    print("\nQUESTIONS (paste into the report verbatim; take each outcome from the breaker's QUESTIONS table):")
    print("| ID | Question (verbatim) | Tests found |")
    for line in q.read_text(encoding="utf-8", errors="ignore").splitlines():
        m = re.match(r"\s*([GTQ]\d+):\s*(.+)", line)
        if not m: continue
        hits = [n for n, text in tests if re.search(rf"(?<![A-Za-z0-9]){m.group(1)}(?![0-9])", text)]
        print(f"| {m.group(1)} | {m.group(2).strip()} | {', '.join(hits[:4]) + (' ...' if len(hits) > 4 else '') if hits else 'NONE: needs a reason'} |")


def failing(nodes, show=True):
    """Raw failing output of breaker tests. nodes are test ids ("<file>::<title>") or files/folders; default all of
    .1v1/breaker (minor/ included, for reading)."""
    files = sorted({n.split("::", 1)[0] for n in nodes}) if nodes else [".1v1/breaker"]
    specs, units = suite_files([ROOT / f for f in files])
    outs, rc = [], 0
    for kind, fs in (("playwright", specs), ("vitest", units)):
        if not fs: continue
        r, out, _ = run_runner(kind, fs, "failing")
        rc = max(rc, r)
        outs.append(f"$ {kind} {' '.join(fs)}\n{out[-12000:]}")
    text_ = "\n\n".join(outs) or "no test files"
    if show: print(text_[-20000:])
    return rc, text_[-20000:]


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
    gates.append(("Node environment unchanged", env == fz.get("env"), f"{fz.get('env')} -> {env}" + ("" if env == fz.get("env") else
                  ": node/npm version, a lockfile or node_modules changed during the loop")))
    a = run([sys.executable, str(SKILL / "scripts" / "audit.py")])
    gates.append(("audit.py (U2/U3/U4/U11 scan, new findings since approval)", a.returncode == 0,
                  " | ".join(a.stdout.strip().splitlines()[-6:]) if a.stdout.strip() else ""))
    c = run(fz["check"], shell=True)
    gates.append((f"check command: {fz['check']}", c.returncode == 0, f"exit {c.returncode}"))
    if (ROOT / "tests").is_dir():  # the check command's exit code is not trusted alone either
        good, info = project_tests_gate(); gates.append(("project tests really ran (JUnit reports)", good, info))
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
        rc, tail, _ = run_suite(ROOT / MINOR, "minor")
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
