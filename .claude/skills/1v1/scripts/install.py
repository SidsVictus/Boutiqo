"""One-time setup in the target project (run from the project root).

  python "<skill>/scripts/install.py" --dry-run     show what would change, change nothing
  python "<skill>/scripts/install.py"               install agents + blocking hook in this project
  python "<skill>/scripts/install.py" --global-agents   also copy the agents to ~/.claude/agents (no restart needed later)
  python "<skill>/scripts/install.py" --uninstall   remove hook + agents, restore backed-up files
  python "<skill>/scripts/install.py" --uninstall --purge   also remove .1v1/, files marked "created by 1v1", CLAUDE.md block

Changes made by install:
  1. .claude/settings.json: adds ONE PreToolUse hook entry (hook_guard.py, all tools). Other settings untouched.
  2. .claude/agents/1v1-builder.md and 1v1-breaker.md: copied in. A different existing file with the
     same name is first saved as <name>.md.1v1-bak and restored on uninstall.
  3. .1v1/: working folder.
Claude Code loads agent files only at session start: after a first install, restart (claude --continue)
unless the agents are already in ~/.claude/agents. Hooks load immediately.
"""
import importlib.util, json, os, pathlib, re, shutil, sys
from common import *

skill = pathlib.Path(__file__).resolve().parent.parent
agents_dst = ROOT / ".claude" / "agents"
global_dst = pathlib.Path.home() / ".claude" / "agents"
sp = ROOT / ".claude" / "settings.json"
hook_script = str(skill / "scripts" / "hook_guard.py")
WIN = os.name == "nt"
if WIN:  # Claude Code may not find Git Bash for hooks; PowerShell must pass python's exit code through
    HOOK = {"type": "command", "shell": "powershell", "command": f'& "{sys.executable}" "{hook_script}"; exit $LASTEXITCODE'}
else:
    HOOK = {"type": "command", "command": f'"{sys.executable}" "{hook_script}"'}
MATCHER = "*"
OURS = re.compile(r"[\\/]1v1[\\/]scripts[\\/]hook_guard\.py\b", re.I)
BAK = ".1v1-bak"
args = set(sys.argv[1:])
dry = "--dry-run" in args


def is_ours(h):
    # Only a command that runs a 1v1 skill's scripts/hook_guard.py is ours; another tool's
    # hook_guard.py is not. Thanks to majiayu000 (PR #1) for finding the name-only match.
    # Also matches this skill at an older install location, so a stale hook cannot stay behind.
    return isinstance(h, dict) and h.get("type") == "command" and bool(OURS.search(str(h.get("command", ""))))


def without_ours(entries):
    """PreToolUse entries with our commands removed; other hooks in a shared entry are kept."""
    keep, removed = [], 0
    for e in entries:
        hs = e.get("hooks", []) if isinstance(e, dict) else []
        rest = [h for h in hs if not is_ours(h)]
        removed += len(hs) - len(rest)
        if rest or not hs: keep.append(e if len(rest) == len(hs) else {**e, "hooks": rest})
    return keep, removed


def load_settings():
    return json.loads(sp.read_text(encoding="utf-8")) if sp.exists() else {}


def say(msg): print(("[dry-run] " if dry else "") + msg)


def copy_agents(dst_dir, label):
    for f in sorted((skill / "agents").glob("*.md")):
        dst = dst_dir / f.name
        if dst.exists() and dst.read_bytes() != f.read_bytes():
            say(f"{label}: {dst} EXISTS and differs -> backup to {dst.name}{BAK}, then overwrite")
        elif dst.exists():
            say(f"{label}: {dst} already identical, no change"); continue
        else:
            say(f"{label}: copy {f.name} -> {dst}")
        if dry: continue
        dst_dir.mkdir(parents=True, exist_ok=True)
        if dst.exists(): shutil.copy2(dst, dst.with_name(dst.name + BAK))
        shutil.copy2(f, dst)


def install():
    say(f"settings: add PreToolUse hook -> {sp}")
    say(f"  matcher: {MATCHER} (every tool; the hook decides)")
    say(f"  command: {HOOK['command']}" + ("  (shell: powershell)" if WIN else ""))
    copy_agents(agents_dst, "agents")
    if "--global-agents" in args: copy_agents(global_dst, "global agents")
    say(f"folder: create {ROOT / '.1v1'}")
    if dry: return
    s = load_settings()
    hooks = s.setdefault("hooks", {}).setdefault("PreToolUse", [])
    hooks[:] = without_ours(hooks)[0]
    hooks.append({"matcher": MATCHER, "hooks": [HOOK]})
    sp.parent.mkdir(parents=True, exist_ok=True)
    sp.write_text(json.dumps(s, indent=2), encoding="utf-8")
    (ROOT / ".1v1").mkdir(exist_ok=True)
    miss = [m for m in ("pytest", "hypothesis", "mypy", "ruff") if importlib.util.find_spec(m) is None]
    if miss: print("MISSING (pip install): " + " ".join(miss))
    print("installed hook + agents. Hook is active now. Agents load at session start: if 1v1-builder and "
          "1v1-breaker are not in your Agent tool list, restart Claude Code (claude --continue).")
    print('to remove: python "' + str(skill / "scripts" / "install.py") + '" --uninstall')


def uninstall():
    if frozen() is not None and not sys.stdin.isatty():
        print("REFUSED: the 1v1 checks are frozen (a loop is running). The user must run uninstall from their own terminal."); sys.exit(2)
    if sp.exists():
        s = load_settings()
        pre = s.get("hooks", {}).get("PreToolUse", [])
        keep, n = without_ours(pre)
        say(f"settings: remove {n} 1v1 hook command{'' if n == 1 else 's'} from {sp}")
        if not dry:
            if keep: s["hooks"]["PreToolUse"] = keep
            else:
                s.get("hooks", {}).pop("PreToolUse", None)
                if not s.get("hooks"): s.pop("hooks", None)
            if s: sp.write_text(json.dumps(s, indent=2), encoding="utf-8")
            else: sp.unlink()
    dirs = [(agents_dst, "agents")] + ([(global_dst, "global agents")] if "--global-agents" in args else [])
    for d, label in dirs:
        for f in sorted((skill / "agents").glob("*.md")):
            dst = d / f.name
            bak = dst.with_name(dst.name + BAK)
            if bak.exists():
                say(f"{label}: restore {dst.name} from backup")
                if not dry: shutil.move(bak, dst)
            elif dst.exists() and dst.read_bytes() == f.read_bytes():
                say(f"{label}: delete {dst}")
                if not dry: dst.unlink()
            elif dst.exists():
                say(f"{label}: {dst} was modified by you, left in place")
    if "--purge" in args:
        if (ROOT / ".1v1").exists():
            say("purge: delete .1v1/")
            if not dry: shutil.rmtree(ROOT / ".1v1")
        for r in list(walk()):
            p = ROOT / r
            try: head = p.read_text(encoding="utf-8", errors="replace")[:300]
            except OSError: continue
            if MARK in head:
                say(f"purge: delete {r} ({MARK})")
                if not dry: p.unlink()
        cm = ROOT / "CLAUDE.md"
        if cm.exists():
            t = cm.read_text(encoding="utf-8"); a, b = "<!-- 1v1:start -->", "<!-- 1v1:end -->"
            if a in t and b in t:
                say("purge: remove the 1v1 block from CLAUDE.md")
                if not dry:
                    t = t[:t.index(a)].rstrip("\n") + "\n" + t[t.index(b) + len(b):].lstrip("\n")
                    if t.strip(): cm.write_text(t, encoding="utf-8")
                    else: cm.unlink()
        if STATE.exists():
            say(f"purge: delete state folder {STATE}")
            if not dry: shutil.rmtree(STATE, ignore_errors=True)
        if RECORD.exists():
            say(f"purge: delete the 1v1 record {RECORD}")
            if not dry: RECORD.unlink()
    if not dry: print("uninstalled")


(uninstall if "--uninstall" in args else install)()
