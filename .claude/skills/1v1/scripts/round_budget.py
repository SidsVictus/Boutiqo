"""Round/streak counter kept outside the project.
Usage: init --rounds N --streak M | record NEW_FAILURES | ack | status

checkpoint=true means: stop and ask the user whether to continue, then run `ack`.
Checkpoints fall at 50% and 80% of the round cap, and only when the cap is 4 or more rounds.
"""
import json, sys
from common import *

F = STATE / "budget.json"


def load(): return json.loads(F.read_text(encoding="utf-8"))


def due(s):
    if s["rounds"] < 4: return None
    frac = s["round"] / s["rounds"]
    for cp, at in (("cp80", 0.8), ("cp50", 0.5)):
        if frac >= at and not s.get(cp): return cp
    return None


def out(s):
    stop = s["round"] >= s["rounds"] or s["zero_streak"] >= s["streak"]
    reason = "streak" if s["zero_streak"] >= s["streak"] else ("rounds" if s["round"] >= s["rounds"] else "")
    print(json.dumps({**s, "stop": stop, "reason": reason, "checkpoint": (due(s) is not None) and not stop}))


a = sys.argv[1:] or ["status"]
if a[0] == "init":
    STATE.mkdir(parents=True, exist_ok=True)
    s = {"rounds": int(a[a.index("--rounds") + 1]), "streak": int(a[a.index("--streak") + 1]), "round": 0, "zero_streak": 0}
    F.write_text(json.dumps(s)); out(s)
elif a[0] == "record":
    s = load()
    if s["round"] >= s["rounds"]: print("REFUSED: round cap reached"); sys.exit(1)
    s["round"] += 1
    s["zero_streak"] = s["zero_streak"] + 1 if int(a[1]) == 0 else 0
    F.write_text(json.dumps(s)); out(s)
elif a[0] == "ack":
    s = load()
    cp = due(s)
    if cp: s[cp] = True
    if cp == "cp80": s["cp50"] = True
    F.write_text(json.dumps(s)); out(s)
elif a[0] == "status": out(load())
else: print(__doc__); sys.exit(2)
