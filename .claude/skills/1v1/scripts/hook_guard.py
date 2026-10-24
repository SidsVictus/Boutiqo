"""Claude Code PreToolUse hook, installed by install.py. Exit 2 blocks the tool call.

Who is acting comes from the hook input: a subagent's calls carry agent_type
(1v1-builder / 1v1-breaker); calls without it come from the main session (the
orchestrator). The rules apply while the checks are frozen (from Step 4 approval
until guard.py finish, or the USER runs guard.py unfreeze); between loops only the
1v1 record and state folders stay protected. Every decision is logged to
STATE/hook.log, which guard.py reads to prove the real agents ran. Fails closed:
any internal error, including a log write that fails, blocks the call.

Shell commands are judged the way a shell runs them: segment by segment, following
the working folder through cd / pushd / Push-Location / popd, with every path
resolved (variables, ~ and wildcards expanded) before it is judged.
guard.py check is the backstop for anything a pattern misses.
"""
import glob, json, os, pathlib, re, site, sys, tempfile, traceback
from common import *

SKILL = pathlib.Path(__file__).resolve().parent.parent
TMP = pathlib.Path(tempfile.gettempdir()).resolve()
HOME = pathlib.Path.home().resolve()
HOME_CLAUDE = (HOME / ".claude").resolve()
PROT = re.compile(r"(?i)(^|[\s'\"(=/\\,:])(tests?[/\\]|\.1v1|\.claude|\.git[/\\]|evals[/\\]|conftest\.py|\.?pytest\.(ini|toml)|pyproject\.toml"
                  r"|setup\.(cfg|py)|tox\.ini|\.?mypy\.ini|\.?ruff\.toml|\.coveragerc|\.flake8|noxfile\.py|makefile\b|claude\.md"
                  r"|verify(-fast)?\b|test_\w+\.py|\w+_test\.py|sitecustomize|usercustomize|\.pth\b|pytest\.py|_pytest|pluggy)")
# inline code: PowerShell here-strings, python -c "...", bash heredocs. Their insides are code, not shell.
INLINE = re.compile(r"@'.*?'@|@\".*?\"@|\s-c\s+(\"(?:\\.|[^\"\\])*\"|'[^']*')|<<-?\s*['\"]?(\w+)['\"]?.*?\n\2\b", re.S)
WVERB = (r"sed\s+-i|perl\s+-\w*i|tee|mv|cp|rm|rmdir|unlink|truncate|touch|chmod|dd|ln|install|patch|mkdir|md"
         r"|git\s+(apply|checkout|restore|reset|clean|stash|commit|rm|mv|add|am|cherry-pick|revert|merge|rebase|pull)"
         r"|set-content|add-content|out-file|new-item|remove-item|move-item|copy-item|rename-item|clear-content|clear-item"
         r"|set-item|tee-object|expand-archive|sc|ac|ni|ri|del|erase|rd|move|copy|cpi|mi|ren|rni|clc")
SHELL_W = re.compile(rf"(?i)(^|[{{(|]|\bxargs\s+|\bsudo\s+|-exec\s+)\s*({WVERB})(?=$|[\s;&|)])")
CODE_W = re.compile(r"open\([^)]*['\"][rwax]*[wax+][rwax]*['\"]|\.write_(text|bytes)\(|\.write\(|\bos\.(remove|unlink|rename|replace|rmdir|truncate|makedirs|mkdir)\("
                    r"|\bshutil\.|\.unlink\(|\.rename\(|\.touch\(|\.mkdir\(|py_compile\.compile|\bcfile\s*="
                    r"|(?i:\[(system\.)?io\.file\]::(write|append|delete|move|copy|replace|create|open\b(?!read))|\[(system\.)?io\.directory\]::(delete|move|create))")
REDIR = re.compile(r"(?<![<>&\d=-])\d?>{1,2}\s*(?![&=])(\"[^\"]+\"|'[^']+'|[^\s;&|)]+)")
DESTR = re.compile(r"(?i)\brm\s+-\w*[rf]|remove-item\b[^;|&]*-recurse|\b(rd|rmdir)\s+/s|\bdel\s+/s|git\s+(reset|clean|stash|push\s[^;|&]*(--force|-f\b))"
                   r"|shutil\.rmtree|\bdrop\s+(table|database)\b")
LOCKED = re.compile(r"(?i)\bunfreeze\b|--uninstall|\bapprove-changes\b|ONEV1_")
NULLS = {"/dev/null", "$null", "nul", "null"}
# Leak routes: Claude's transcripts and settings (~/.claude), the state folder, and the APIs that find them.
PRIVATE = re.compile(r"(?i)\.claude\b|\.cla[?*\[]|SKILL_DIR|\b1v1-[0-9a-f]{6,}|1v1-['\"*?\[]|\b1v[*?\[]|['\"]1v1-(?!builder\b|breaker\b)")
HOMEAPI = re.compile(r"(?i)expanduser|path\.home\s*\(|\bUSERPROFILE\b|\bHOMEPATH\b|\bHOMEDRIVE\b|\$env:APPDATA|%APPDATA%|environ[^\n]{0,20}APPDATA"
                     r"|\$HOME\b|\$env:HOME|(^|[\s'\"=(])~([/\\]|$|[\s'\";])")
TEMPDIR = re.compile(r"(?i)gettempdir|tempfile\.tempdir|\$env:TE?MP\b|%TE?MP%|\bTMPDIR\b|environ[^\n]{0,20}TE?MP")
CDVERB = r"(?:cd|chdir|pushd|push-location|set-location|sl)"
SEG_CD = re.compile(rf"(?i)^\s*{CDVERB}(?:\s+(.*)|(?=[\\/.])(.*)|\s*)$", re.S)  # cd x, cd.., cd\, bare cd
SEG_POP = re.compile(r"(?i)^\s*(popd|pop-location)\s*$")
WALKUP = re.compile(r"(?i)getcwd\(\)\s*\)|cwd\(\)\.parent|\.parents?\b[^\n]{0,30}(cwd|getcwd)|chdir\s*\(|os\.pardir|\bsplit-path\b[^;\n]*-parent")
DOTGLOB = re.compile(r"(?:^|[\s'\"/\\])\.[A-Za-z0-9_-]+[*?\[]")  # .cla?de, .c*  (not regex like '.*')
INSTALL = re.compile(r"(?i)\bpip3?(\.exe)?\s+install\b|-m\s+pip\s+(install|uninstall)\b|\buv\s+(pip|add|sync|tool)\b|\bpoetry\s+(add|install)\b"
                     r"|\bconda\s+install\b|\bsetx\b|setenvironmentvariable|\bnpm\s+(i|install)\b|\bpipx\b")
# `python verify` / `& .\verify` RUN the check; only that form is ignored when looking for writes to protected paths
RUNCHECK = re.compile(r"(?i)(?:python(?:3|\.exe)?\s+(?:\.?[\\/])?|&\s*\.?[\\/])verify(?:-fast)?\b")
# Building a path or command at runtime hides it from every rule here (the red-team used base64 to reach other
# projects). Agents never need decoding, dynamic code or character arithmetic in a shell command, so these are blocked.
OBFUSCATE = re.compile(r"(?i)b64decode|\bbase64\s+(-d|--decode)\b|frombase64string|-e(nc(odedcommand)?)?\s+[A-Za-z0-9+/=]{16,}|bytes\.fromhex|\.fromhex\(|codecs\.decode"
                       r"|(?<![\w.])(exec|eval|compile|__import__)\s*\(|\[char\]\s*\d|getattr\s*\(\s*(os|__builtins__|builtins)"
                       r"|invoke-expression|\biex\b|\[scriptblock\]::create|\[convert\]::from|\[string\]::join"
                       r"|\bcfile\s*=|\battrib\b[^;\n]*\+r|isreadonly")
# PowerShell comparison operands are patterns, not paths: `-notmatch '\\.git\\'` names no folder
MATCHOP = re.compile(r"(?i)-[ic]?(?:not)?(?:match|like)\s+('[^']*'|\"[^\"]*\")|-[ic]?(?:replace|split)\s+('[^']*'|\"[^\"]*\")")
# string literals that really are absolute paths outside the project (not escapes like "ß")
ABSLIT = re.compile(r"(?i)^([a-z]:[\\/]|/(?!/)[\w.-]+(/|$)|\\\\[\w.$-]+\\|\\(users|windows|program\s?files|programdata|temp|tmp)(\\|$))")
CONTENT = "content: "  # reasons starting with this are not strikes: an honest builder can trip them (it is told to stop and ask)

d, tool, ti, agent, who, target = {}, "", {}, "", "orchestrator", ""


def done(decision, reason=""):
    try:
        if frozen() is not None or decision == "probe":
            log({"actor": who, "agent_type": agent, "agent_id": d.get("agent_id", ""), "tool": tool,
                 "decision": decision, "reason": reason, "target": str(target)[:200]})
    except Exception:
        decision, reason = "block", f"1v1 hook could not write its log ({reason or 'allow'}); blocking to be safe"
    if decision in ("block", "probe"):
        print(f"1v1 guard ({who}): {reason}", file=sys.stderr)
        sys.exit(2)
    sys.exit(0)


def in_state(s):
    low = s.lower()
    return (str(STATE).lower() in low or STATE.as_posix().lower() in low
            or (len(STATE.name) >= 8 and STATE.name.lower() in low))


def skill_forms():
    """Every way a command may spell the skill folder: Windows, posix, Git Bash (/c/...), and from the home folder."""
    forms = {str(SKILL), SKILL.as_posix()}
    if SKILL.drive: forms.add("/" + SKILL.drive[0].lower() + SKILL.as_posix()[2:])
    try:
        r = SKILL.relative_to(HOME)
        for pre in ("~/", "$HOME/", "$env:USERPROFILE/", "%USERPROFILE%/", "${HOME}/"):
            forms.add(pre + r.as_posix()); forms.add((pre + str(r)).replace("/", "\\"))
    except ValueError: pass
    return sorted(forms, key=len, reverse=True)


SKILL_FORMS = skill_forms()


def strip_skill(s):
    """Replace the skill folder with SKILL_DIR and make project paths relative, so neither one's own
    folder names (".claude", "evals", ...) look like protected paths."""
    for form in SKILL_FORMS:
        s = re.sub(re.escape(form), "SKILL_DIR", s, flags=re.I)
    for form in (str(ROOT), ROOT.as_posix()):
        s = re.sub(re.escape(form) + r"[\\/]", "", s, flags=re.I)
        s = re.sub(re.escape(form) + r"(?![\w.-])", ".", s, flags=re.I)
    return s


def prompt_ok(kind, text):
    """Information wall: each agent's whole input is a file guard.py writes. The prompt itself must be the fixed
    line, so nothing of the orchestrator's (or the other agent's) words gets through."""
    fixed, inp = (BUILDER_PROMPT, BUILDER_INPUT) if kind == "builder" else (BREAKER_PROMPT, BREAKER_INPUT)
    if " ".join(str(text).split()) != fixed:
        done("block", f"the {kind} prompt must be exactly this line and nothing else: {fixed} "
                      f"Put everything else in the file with guard.py {kind}-input.")
    p = ROOT / inp
    if not p.exists() or p.stat().st_mtime < role()["since"] - 2:
        done("block", f"run guard.py {kind}-input after guard.py role {kind}, then spawn the {kind}")


def allowed_dirs():
    """Product code may use home/temp folders only if the approved contract says so (.1v1/allow-dirs.txt, frozen)."""
    f = STATE / "frozen_files" / ".1v1" / "allow-dirs.txt"
    try: return set(f.read_text(encoding="utf-8").lower().split())
    except OSError: return set()


def private(s, strict):
    """Does this text reach for Claude's transcripts, the state folder or the skill folder? strict (builder) also
    forbids finding the home or temp folder, where those live."""
    low = s.lower()
    temp_root = str(TMP).lower() in low or TMP.as_posix().lower() in low
    return bool(PRIVATE.search(s) or in_state(s) or HOMEAPI.search(s) or (strict and (TEMPDIR.search(s) or temp_root)))


PY_DIRS = []
for _d in {sys.prefix, sys.base_prefix, *site.getsitepackages(), site.getusersitepackages()}:
    try: PY_DIRS.append(pathlib.Path(_d).resolve())
    except OSError: pass


def under(q, base): return q == base or base in q.parents


def under_home_claude(p):
    try: q = pathlib.Path(str(p).strip("'\"")).expanduser().resolve()
    except (OSError, RuntimeError): return False
    return under(q, HOME_CLAUDE)


def in_tmp(p):
    try: q = pathlib.Path(str(p).strip("'\"")).resolve()
    except OSError: return False
    return under(q, TMP) and not in_state(str(q))


def in_python(p):
    """Inside the Python installation (stdlib, site-packages): read-only for everyone during the loop."""
    try: q = pathlib.Path(str(p).strip("'\"")).expanduser().resolve()
    except (OSError, RuntimeError): return False
    return any(under(q, x) for x in PY_DIRS)


def reach_ok(q):
    """Agents may reach only the project, the Python installation (library source) and, for the breaker, temp."""
    if under(q, ROOT): return True
    if any(under(q, x) for x in PY_DIRS): return not under(q, HOME_CLAUDE)
    return who == "breaker" and under(q, TMP) and not in_state(str(q))


def is_state_path(q):
    """The state folder, any 1v1 state folder in temp, or the record folder under ~/.claude."""
    if in_state(str(q)) or under(q, RECORD.parent): return True
    return under(q, TMP) and any(p.name.lower().startswith("1v1-") for p in [q, *q.parents] if under(p, TMP) and p != TMP)


VAR = re.compile(r"(?i)\$env:(\w+)|\$\{?(HOME|TEMP|TMP|USERPROFILE|APPDATA|LOCALAPPDATA)\}?\b|%(\w+)%")


def expand(t):
    """A token as the shell would see it: variables and ~ expanded. Returns (text, unresolved_variable)."""
    t = t.strip().strip("'\"").rstrip(",;")
    unresolved = False
    def rep(m):
        nonlocal unresolved
        name = (m.group(1) or m.group(2) or m.group(3) or "").upper()
        val = {"HOME": str(HOME)}.get(name) or os.environ.get(name)
        if val is None: unresolved = True; return m.group(0)
        return val
    t = VAR.sub(rep, t)
    if t.startswith("~"): t = str(HOME) + t[1:]
    if t.startswith("$"): unresolved = True  # a script variable ($x): its value is not known here
    return t, unresolved


def resolve(cur, t):
    """All paths a token can mean from folder `cur`: wildcards expanded (up to 200 matches), plus the literal path."""
    text, unresolved = expand(t)
    if unresolved or not text: return []
    base = pathlib.Path(text)
    q = base if base.is_absolute() else (cur / base)  # also handles rooted (\Users) and drive-relative (C:x) forms
    out = []
    if any(ch in text for ch in "*?["):
        try: out = [pathlib.Path(p) for p in glob.glob(str(q))[:200]]
        except (OSError, ValueError): out = []
    out.append(q)
    res = []
    for p in out:
        try: res.append(p.resolve())
        except (OSError, RuntimeError): pass
    return res


PATHTOK = re.compile(r"\"[^\"]*\"|'[^']*'|[^\s;&|<>(),]+")  # commas separate PowerShell list items: "a.py","b.py"


def path_tokens(seg):
    """Words in a shell segment that look like paths."""
    out = []
    for m in PATHTOK.finditer(seg):
        t = m.group(0)
        bare = t.strip("'\"")
        if not bare or bare.startswith("-") and not re.match(r"^-\w+[:=]", bare): continue
        if re.search(r"[\\/~*?]|^\.\.?$|^\$env:|^\$\{?\w|%\w+%|\.\w{1,6}$|^[a-zA-Z]:", bare): out.append(bare)
    return out


def write_ok(r, raw):
    """May the current actor write this path? r = project-relative path or None."""
    if in_state(str(raw)) or is_state_path(pathlib.Path(str(raw))): return False
    # Outside the project: the orchestrator anywhere but ~/.claude and Python; the breaker only in temp (its test output).
    # The builder never: a script it parks in temp could list temp from its own location and find the state folder.
    if r is None: return ((who == "orchestrator" and not under_home_claude(raw) and not in_python(raw))
                          or (who == "breaker" and in_tmp(raw)))
    if in_skipped(r): return False
    if who == "breaker": return breaker_may_write(r)  # its own tests (and fixtures), never config that steers a gate
    if who == "builder":  # _scratch/ is wiped before every check run, so nothing in it can reach a verdict
        return r.startswith(BUILDER_SCRATCH + "/") or not is_protected(r)
    return r == ".1v1/report.md"  # the orchestrator writes no project file during the loop: not code, not checks


def in_skipped(r):
    """The project's .git and real virtual environments are not snapshotted, so nobody may write into them."""
    parts = r.split("/")
    if parts[0] == ".git": return True
    cur = ROOT
    for part in parts[:-1]:
        cur = cur / part
        if is_venv(cur): return True
    return False


def relq(q):
    """Project-relative path ("" for the project root itself), or None outside the project."""
    if q == ROOT: return ""
    try: return q.relative_to(ROOT).as_posix() if under(q, ROOT) else None
    except ValueError: return None


def segments(c):
    """Shell segments in order (separated by ; && || | newline), with inline code replaced by CODE."""
    return [s for s in re.split(r"(?<![0-9>])(?:&&|\|\||[;|\n&])+(?!\d?>)", INLINE.sub(" CODE ", c)) if s.strip()]


def shell(cmd):
    global target
    target = cmd
    c = MATCHOP.sub(" PATTERN ", strip_skill(cmd))
    if in_state(c): done("block", "the 1v1 state folder is off limits")
    if LOCKED.search(c): done("block", "unfreeze, approve-changes, uninstall and ONEV1_ overrides are for the user to run in their own terminal")
    agentish = who in ("builder", "breaker")
    if agentish:
        if INSTALL.search(c): done("block", "installing packages or setting persistent environment variables is not allowed in the loop")
        if OBFUSCATE.search(c):
            done("block", "decoding, dynamic code or building strings from characters is not allowed in agent commands: "
                          "write plain commands (put real logic in a file in the project)")
        if private(c, who == "builder"):
            done("block", "this command reaches for Claude's files, the skill or 1v1 state, the home folder, or (builder) the temp folder: off limits")
        if WALKUP.search(c): done("block", "this command walks up from the working folder: agents work only inside the project")
        g = DOTGLOB.search(c)
        if g: done("block", f"globbing a hidden folder name ({g.group(0).strip()}) is not allowed")
        if who == "builder" and re.search(r"(?i)\.1v1|\.hypothesis", c): done("block", ".1v1 and .hypothesis are off limits to the builder")
    else:  # the orchestrator: it only runs guard.py and the check, so the leak and destruction rules apply to it too
        co = c.replace("SKILL_DIR", "")
        if DESTR.search(co): done("block", "destructive command: the orchestrator deletes nothing during the loop")
        if OBFUSCATE.search(co): done("block", "decoding or dynamic code is not allowed in orchestrator commands during the loop")
        if private(co, True): done("block", "this command reaches for Claude's files, the 1v1 state, the home or the temp folder: off limits during the loop")
    # inline code that writes: the paths it names live in its strings
    for m in INLINE.finditer(c):
        code = m.group(0)
        if CODE_W.search(code):
            if any(is_state_path(q) or in_python(q) or under(q, HOME_CLAUDE) for lit in re.findall(r"['\"]([^'\"\n]+)['\"]", code) for q in resolve(ROOT, lit)):
                done("block", "the Python installation, Claude's files and the 1v1 state are read-only during the loop")
            if who != "breaker" and PROT.search(RUNCHECK.sub(" ", code)):
                done("block", "this code writes and names a protected path (tests, .1v1, config, verify, CLAUDE.md, .claude). "
                              "Never route around this block")
            lits = [q for lit in re.findall(r"['\"]([^'\"\n]+)['\"]", code) if re.search(r"[\\/.]", lit) for q in resolve(ROOT, lit)]
            if who == "orchestrator" and any(under(q, ROOT) and relq(q) not in ("", ".1v1/report.md") for q in lits):
                done("block", "the orchestrator writes nothing in the project during the loop; run guard.py commands and the check only")
            if who == "builder" and any(under(q, ROOT) and relq(q) and not write_ok(relq(q), q) for q in lits):
                done("block", "this code writes to a path the builder may not write. Never route around this block")
            if who == "breaker" and any(relq(q) and not breaker_may_write(relq(q))
                                         for lit in re.findall(r"['\"]([^'\"\n]+)['\"]", code) for q in resolve(ROOT, lit) if under(q, ROOT)):
                done("block", "breaker code may write only its own tests in .1v1/breaker/, .1v1/holdout/ or .1v1/scratch/")
    cur, stack = ROOT, []  # the working folder as the shell would have it
    for seg in segments(c):
        m = SEG_CD.match(seg)
        if m or SEG_POP.match(seg):
            if SEG_POP.match(seg):
                cur = stack.pop() if stack else ROOT
                continue
            t = (m.group(1) or m.group(2) or "").strip()
            if not t or t == "~" or t.startswith("-") or re.fullmatch(r"(?i)[a-z]:", t.strip("'\"")):  # home, back, or a drive switch
                if agentish: done("block", "cd with no folder (or ~, -) leaves the project: agents work only inside the project")
                continue
            if re.match(r"(?i)\s*push", seg): stack.append(cur)
            qs = resolve(cur, t)
            if not qs:  # a folder held in a variable
                if who == "builder": done("block", f"this command moves into a folder held in a variable ({t}): name the folder directly")
                cur = None if who != "breaker" else TMP
                continue
            q = qs[-1]
            if agentish and not reach_ok(q): done("block", f"this command leaves the project ({t}): agents work only inside the project")
            cur = q
            continue
        here = cur or ROOT
        toks = path_tokens(seg)
        resolved = [(t, q) for t in toks for q in resolve(here, t)]
        if agentish:
            far = [t for t, q in resolved if not reach_ok(q)]
            if far: done("block", f"this command names {far[0]}, outside the project: agents work only inside the project"
                                  + (" and temp" if who == "breaker" else ""))
        redirects = [t for t in REDIR.findall(seg) if t.strip("'\"").lower() not in NULLS and not re.fullmatch(r"[\d.()]+", t)]
        writes = bool(SHELL_W.search(seg)) or bool(CODE_W.search(seg))
        destructive = bool(DESTR.search(seg))
        for t in redirects:
            qs = resolve(here, t)
            if not qs:
                if who != "breaker" and PROT.search(seg): done("block", "redirect to a variable in a command that names a protected path")
                continue
            for q in qs:
                if not write_ok(relq(q), q): done("block", f"redirect writes to {t}, which you may not write")
        if not (writes or destructive): continue
        if cur is None and who != "breaker": done("block", "this command writes after moving into a folder held in a variable")
        for t, q in resolved:
            if is_state_path(q) or in_python(q) or under(q, HOME_CLAUDE):
                done("block", "the Python installation, Claude's files and the 1v1 state are read-only during the loop")
        if who in ("builder", "breaker") and destructive:
            mine = ROOT / (BUILDER_SCRATCH if who == "builder" else SCRATCH.rstrip("/"))
            if not (resolved and all(under(q, mine) for _, q in resolved)):
                done("block", "destructive command: ask the orchestrator, who must ask the user")
        rh = relq(here)
        if rh not in (None, "") and not write_ok(rh + "/x", here):
            done("block", f"this command writes inside {rh}, which you may not write")
        sp = RUNCHECK.sub(" ", seg)  # running the check command is not writing to it
        if who == "breaker":
            bad = [t for t, q in resolved if under(q, ROOT) and not write_ok(relq(q), q)
                   and relq(q) not in (".1v1/breaker", ".1v1/holdout", ".1v1/scratch", ".1v1", "")]
            if bad: done("block", f"breaker may write only its own tests in .1v1/breaker/, .1v1/holdout/ or .1v1/scratch/ (command touches {bad[0]})")
        elif who == "orchestrator":
            hit = [t for t, q in resolved if under(q, ROOT) and relq(q) not in ("", ".1v1/report.md") and not t.startswith("SKILL_DIR")
                   and not RUNCHECK.fullmatch(t)]
            if hit or PROT.search(sp):
                done("block", f"the orchestrator writes nothing in the project during the loop (command touches {hit[0] if hit else 'a protected path'}); "
                              "run guard.py commands and the check only")
        else:
            bad = [t for t, q in resolved if under(q, ROOT) and not write_ok(relq(q), q)]
            if bad or PROT.search(sp):
                done("block", f"this command can write and it names a protected path ({bad[0] if bad else 'tests, .1v1, config, verify, CLAUDE.md, .claude'}). "
                              "If you only meant to read or run something, use the Read tool or a command without write operations. "
                              "Never route around this block")
    done("allow")


def record_guard():
    """Between loops (a record exists): nobody may touch the 1v1 record or state folders through Claude."""
    blob = strip_skill(json.dumps(ti, ensure_ascii=False))
    hit = in_state(blob) or re.search(r"(?i)1v1-records|1v1-['\"*?\[]|\b1v[*?\[]|['\"]1v1-(?!builder\b|breaker\b)|\b1v1-[0-9a-f]{6,}", blob)
    if not hit and tool in ("Bash", "PowerShell"):
        cmd = str(ti.get("command", ""))
        for seg in segments(cmd):
            if SHELL_W.search(seg) or DESTR.search(seg) or REDIR.search(seg) or CODE_W.search(seg):
                if any(is_state_path(q) or under(q, HOME_CLAUDE / "1v1-records") or q == HOME_CLAUDE
                       for t in path_tokens(seg) for q in resolve(ROOT, t)):
                    hit = True; break
    if not hit and tool in ("Write", "Edit", "MultiEdit", "NotebookEdit", "Read", "Glob", "Grep"):
        p = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
        if p and any(is_state_path(q) for q in resolve(ROOT, str(p))): hit = True
    if hit:
        done("block", "the 1v1 record and state folders are not to be touched through Claude; the user manages them "
                      "from their own terminal (guard.py unfreeze / install.py --uninstall --purge)")


def main():
    global d, tool, ti, agent, who, target
    raw = sys.stdin.buffer.read().decode("utf-8", errors="replace")  # bytes: Windows would decode stdin as cp1252
    d = json.loads(raw)
    tool, ti = d.get("tool_name", ""), d.get("tool_input") or {}
    agent = d.get("agent_type") or ""
    who = AGENTS.get(agent, "orchestrator" if not agent else "other-agent")
    path = ti.get("file_path") or ti.get("notebook_path") or ti.get("path") or ""
    target = path or ti.get("pattern", "") or ti.get("subagent_type", "")
    if tool == "Read" and path and rel(path) == PROBE:
        done("probe", "HOOK_PROBE: the 1v1 hook is live and blocked this read on purpose")
    if RECORD.exists() or frozen() is not None:
        record_guard()
    if frozen() is None:
        if record_active():  # the record says a loop is running but the state folder is gone: tampering; fail closed
            done("block", "a 1v1 loop is running but its state folder is missing. Nothing may run until the user resolves "
                          "it from their own terminal: guard.py unfreeze")
        sys.exit(0)
    sub = who != "orchestrator"
    if sub and tool not in SUB_TOOLS:
        done("block", f"{tool} is not available to 1v1 agents (no subagents, messages, web, MCP or skills)")
    if tool in ("Agent", "Task"):
        st, ph = ti.get("subagent_type", ""), role()["role"]
        if AGENTS.get(st) != ph:
            done("block", f"during the 1v1 loop the only agent allowed now is 1v1-{ph}" if ph in ("builder", "breaker") else
                 "no subagents outside a builder or breaker phase; run guard.py role builder|breaker first. "
                 "Never substitute general-purpose: if 1v1-builder/1v1-breaker are not available, stop and ask the user to restart Claude Code")
        prompt_ok(AGENTS[st], ti.get("prompt", ""))
        done("allow")
    if tool == "SendMessage":  # during the loop a message can only be the current agent's fixed line
        ph = role()["role"]
        if ph not in ("builder", "breaker"): done("block", "no messages to agents outside a builder or breaker phase")
        prompt_ok(ph, ti.get("message", ""))
        done("allow")
    if tool in ("Write", "Edit", "MultiEdit", "NotebookEdit"):
        if not write_ok(rel(path), path): done("block", f"{rel(path) or path} is not writable for {who} during the 1v1 loop")
        if sub:
            text = strip_skill(" ".join(str(x) for x in (ti.get("content"), ti.get("new_string"), ti.get("new_source"),
                                                          *[e.get("new_string") for e in ti.get("edits") or [] if isinstance(e, dict)]) if x))
            if PRIVATE.search(text) or in_state(text):
                done("block", CONTENT + "this content reaches for Claude's files, the skill or 1v1 state: off limits")
            ok = allowed_dirs()
            literals = [m.group(2) for m in re.finditer(r"(['\"])([^'\"\n]{1,300})\1", text)]  # paths live in strings
            if who == "builder":
                low = text.lower()
                if (HOMEAPI.search(text) and "home" not in ok) or ((TEMPDIR.search(text) or str(TMP).lower() in low
                                                                   or TMP.as_posix().lower() in low) and "temp" not in ok):
                    done("block", CONTENT + "this code finds the home or temp folder, which the contract does not allow. If the product "
                                  "really needs it, stop and return BLOCKED so the user can allow it (.1v1/allow-dirs.txt)")
                far = [lit for lit in literals if ABSLIT.match(lit) and lit.lower() not in NULLS
                       and not any(under(q, ROOT) or any(under(q, x) for x in PY_DIRS) for q in resolve(ROOT, lit))]
                if far and "abs" not in ok:
                    done("block", CONTENT + f"this code names an absolute path outside the project ({far[0]}). If the product really "
                                  "needs it, stop and return BLOCKED so the user can allow it (.1v1/allow-dirs.txt: abs)")
                if CODE_W.search(text) and PROT.search(" " + "  ".join(literals)):
                    done("block", CONTENT + "this code writes files and names a protected path in a string (tests, .1v1, config, "
                                  "verify, ...): a script that edits the checks when it runs is still editing the checks")
        done("allow")
    if tool in ("Read", "Glob", "Grep", "LS", "NotebookRead"):
        blob = " ".join(str(ti.get(k, "")) for k in ("file_path", "path", "pattern", "glob", "notebook_path"))
        if in_state(blob): done("block", "the 1v1 state folder is off limits")
        if sub and (under_home_claude(path) or PRIVATE.search(strip_skill(blob))):
            done("block", "Claude's own files (transcripts, settings, skills) are off limits to 1v1 agents")
        if sub:
            spots = [x for x in (path, ti.get("notebook_path")) if x]
            pat = str(ti.get("pattern", "")) if tool == "Glob" else ""
            spots += [pat] if re.match(r"(?i)^([a-z]:|[\\/~$%])", pat) else []
            far = [x for x in spots for q in resolve(ROOT, x) if not reach_ok(q)]
            if far: done("block", f"{far[0]} is outside the project: agents read only the project, the Python installation"
                                  + (" and temp" if who == "breaker" else ""))
            if re.search(r"(^|[/\\])\.\.([/\\]|$)", pat + str(ti.get("glob", ""))):
                done("block", "patterns may not climb out of their folder with ..")
        if who == "builder" and re.search(r"(^|[\s/\\])\.(1v1|hypothesis)", blob.replace(str(ROOT), "").replace(ROOT.as_posix(), "")):
            if not (tool == "Read" and rel(path) == BUILDER_INPUT): done("block", ".1v1 and .hypothesis are off limits to the builder (except BUILDER_INPUT.md)")
        done("allow")
    if tool in ("Bash", "PowerShell"):
        shell(str(ti.get("command", "")))
    done("allow")


try:
    main()
except SystemExit:
    raise
except Exception:
    target = traceback.format_exc()[-300:]
    try:
        active = frozen() is not None or record_active()
    except Exception:
        active = True
    if active: done("block", "1v1 hook internal error; blocking to be safe")
    sys.exit(0)
