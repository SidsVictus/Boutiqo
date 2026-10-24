"""Static scan of shipped code for U2/U3/U4/U11 cheating patterns. Exit 1 on findings.

U2 (gaming the tests) covers: test-runner detection, test-framework imports, call-stack inspection, patching
builtins or other modules, dynamic code (exec/eval/compile/__import__), an __eq__ that always says equal,
reading test environment variables, and special-casing an input that appears in a test.
Allowlists (one entry per line, in .1v1/, frozen with the contract): allow-network.txt, allow-ignores.txt
(file paths), allow-dynamic.txt (file paths), allow-literals.txt (exact literals).
"""
import ast, re, sys
from common import *

NET = {"socket", "requests", "httpx", "aiohttp", "urllib3", "http.client", "ftplib", "smtplib", "urllib.request"}
MOCK = {"unittest.mock", "mock", "pytest_mock"}
TESTFW = {"pytest", "_pytest", "unittest", "hypothesis", "doctest", "nose", "nose2"}
PATCHED = {"builtins", "sys", "os", "decimal", "pytest", "_pytest", "unittest", "hypothesis", "inspect", "importlib"}
STACK = re.compile(r"\binspect\.(stack|currentframe|getouterframes|getframeinfo)\b|\bsys\._getframe\b|\btraceback\.(extract_stack|walk_stack)\b|\.f_back\b")
TESTENV = re.compile(r"(?i)(environ|getenv)[^\n]{0,40}['\"][^'\"]*(PYTEST|HYPOTHESIS|\bCI\b|TEST)[^'\"]*['\"]")
SUPPRESS = re.compile(r"#\s*(type:\s*ignore|noqa|pylint:\s*disable|pragma:\s*no cover)")
TODO = re.compile(r"#.*\b(TODO|FIXME|XXX|HACK)\b")
PLAIN = re.compile(r"[A-Za-z0-9_./-]*")  # flags, names, paths: too common to count as special-casing


def allowed(name):
    p = ROOT / ".1v1" / name
    return set(p.read_text(encoding="utf-8").splitlines()) - {""} if p.exists() else set()


def trivial(fn):
    body = [s for s in fn.body if not (isinstance(s, ast.Expr) and isinstance(getattr(s, "value", None), ast.Constant) and isinstance(s.value.value, str))]
    if not body: return True
    if len(body) == 1:
        s = body[0]
        if isinstance(s, ast.Pass): return True
        if isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant) and s.value.value is Ellipsis: return True
        if isinstance(s, ast.Raise) and "NotImplementedError" in ast.dump(s): return True
    return False


def exempt(fn):
    d = " ".join(ast.dump(x) for x in fn.decorator_list)
    return "abstractmethod" in d or "overload" in d


def test_literals():
    """String literals the tests feed in. Source that compares against one of these is special-casing a test input."""
    lits = set()
    for r in walk():
        if not r.endswith(".py") or not (r.startswith((".1v1/breaker/", ".1v1/holdout/")) or is_protected(r)): continue
        try: tree = ast.parse((ROOT / r).read_text(encoding="utf-8", errors="replace"))
        except SyntaxError: continue
        for n in ast.walk(tree):
            if isinstance(n, ast.Constant) and isinstance(n.value, str) and len(n.value.strip()) >= 3 and not PLAIN.fullmatch(n.value):
                lits.add(n.value)
    return lits


def base_name(node):
    while isinstance(node, (ast.Attribute, ast.Subscript)): node = node.value
    return node.id if isinstance(node, ast.Name) else ""


def scan(r, net_ok, ign_ok, dyn_ok, lit_ok, lits):
    out, src = [], (ROOT / r).read_text(encoding="utf-8", errors="replace")
    try: tree = ast.parse(src)
    except SyntaxError as e: return [f"{r}: syntax error {e}"]
    for i, line in enumerate(src.splitlines(), 1):
        if SUPPRESS.search(line) and r not in ign_ok: out.append(f"{r}:{i} U4 suppression comment")
        if TODO.search(line): out.append(f"{r}:{i} U3 TODO/FIXME")
        if re.search(r"PYTEST_CURRENT_TEST|sys\.modules.*pytest|['\"]pytest['\"] in sys", line): out.append(f"{r}:{i} U2 detects test runner")
        if STACK.search(line): out.append(f"{r}:{i} U2 inspects the call stack")
        if TESTENV.search(line): out.append(f"{r}:{i} U2 reads a test environment variable")
    # Protocol members are declarations, so `...` is their correct body. ABC methods are exempt only via @abstractmethod.
    in_protocol = {id(f) for c in ast.walk(tree) if isinstance(c, ast.ClassDef) and any("Protocol" in ast.dump(x) for x in c.bases) for f in c.body}
    for n in ast.walk(tree):
        if isinstance(n, (ast.Import, ast.ImportFrom)):
            mods = [a.name for a in n.names] if isinstance(n, ast.Import) else [n.module or ""]
            for m in mods:
                if any(m == x or m.startswith(x + ".") for x in MOCK): out.append(f"{r}:{n.lineno} U3 mock import {m}")
                if m.split(".")[0] == BUILDER_SCRATCH: out.append(f"{r}:{n.lineno} U2 imports the builder's throwaway _scratch")
                elif m.split(".")[0] in TESTFW: out.append(f"{r}:{n.lineno} U2 imports a test framework ({m})")
                if any(m == x or m.startswith(x + ".") for x in NET) and r not in net_ok: out.append(f"{r}:{n.lineno} U11 network import {m}")
        if isinstance(n, ast.ExceptHandler):
            broad = n.type is None or (isinstance(n.type, ast.Name) and n.type.id in ("Exception", "BaseException"))
            silent = all(isinstance(s, (ast.Pass, ast.Continue)) or (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant)) for s in n.body)
            if n.type is None: out.append(f"{r}:{n.lineno} U4 bare except")
            elif broad and silent: out.append(f"{r}:{n.lineno} U4 swallowed exception")
        if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef)):
            if trivial(n) and not exempt(n) and id(n) not in in_protocol and not (n.name.startswith("__") and n.name.endswith("__")):
                out.append(f"{r}:{n.lineno} U3 stub body in {n.name}")
            body = [s for s in n.body if not (isinstance(s, ast.Expr) and isinstance(s.value, ast.Constant))]
            if n.name in ("__eq__", "__ne__", "__contains__", "__bool__") and len(body) == 1 and isinstance(body[0], ast.Return) \
                    and isinstance(body[0].value, ast.Constant) and isinstance(body[0].value.value, bool):
                out.append(f"{r}:{n.lineno} U2 {n.name} always returns {body[0].value.value}")
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Attribute) and n.func.attr == "_exit" and base_name(n.func) == "os":
            out.append(f"{r}:{n.lineno} U2 os._exit (kills the interpreter, including a test run, with a chosen status)")
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("exec", "eval", "compile", "__import__") and r not in dyn_ok:
            out.append(f"{r}:{n.lineno} U2 dynamic code ({n.func.id})")
        if isinstance(n, ast.Call) and isinstance(n.func, ast.Name) and n.func.id in ("setattr", "delattr") and n.args \
                and base_name(n.args[0]) in PATCHED:
            out.append(f"{r}:{n.lineno} U2 patches module {base_name(n.args[0])}")
        if isinstance(n, (ast.Assign, ast.AugAssign, ast.AnnAssign)):
            for t in (n.targets if isinstance(n, ast.Assign) else [n.target]):
                if isinstance(t, (ast.Attribute, ast.Subscript)) and base_name(t) in PATCHED:
                    out.append(f"{r}:{n.lineno} U2 patches module {base_name(t)}")
        cands = []
        if isinstance(n, ast.Compare) and any(isinstance(o, (ast.Eq, ast.NotEq, ast.In, ast.NotIn, ast.Is)) for o in n.ops):
            cands = [n.left, *n.comparators]
        elif isinstance(n, ast.Dict): cands = [k for k in n.keys if k is not None]
        elif isinstance(n, ast.match_case): cands = [x for x in ast.walk(n.pattern) if isinstance(x, ast.Constant)]
        for c in cands:
            if isinstance(c, ast.Constant) and isinstance(c.value, str) and c.value in lits and c.value not in lit_ok:
                out.append(f"{r}:{getattr(c, 'lineno', n.lineno if hasattr(n, 'lineno') else 0)} U2 special-cases a test input {c.value!r}")
    for stmt in tree.body:  # exiting at import time ends a test run before any test executes
        if isinstance(stmt, ast.If) and "__name__" in ast.dump(stmt.test): continue
        for n in ast.walk(stmt):
            if isinstance(n, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda, ast.ClassDef)): break
            if isinstance(n, ast.Call) and ((isinstance(n.func, ast.Name) and n.func.id in ("exit", "quit"))
                                            or (isinstance(n.func, ast.Attribute) and n.func.attr == "exit" and base_name(n.func) == "sys")):
                out.append(f"{r}:{n.lineno} U2 exits the interpreter at import time")
    return out


def project_extras():
    """Findings that are not about one .py file: compiled modules outside __pycache__ (unreadable to this audit)."""
    return [f"{r} U2 compiled module without reviewable source" for r in walk() if is_compiled(r) and not r.startswith(".1v1/")]


if __name__ == "__main__":
    net_ok, ign_ok, dyn_ok, lit_ok = (allowed(f) for f in ("allow-network.txt", "allow-ignores.txt", "allow-dynamic.txt", "allow-literals.txt"))
    lits = test_literals()
    res = [f for r in walk() if is_source(r) and not r.startswith(".1v1/") for f in scan(r, net_ok, ign_ok, dyn_ok, lit_ok, lits)]
    res += project_extras()
    print("\n".join(res) if res else "clean")
    sys.exit(1 if res else 0)
