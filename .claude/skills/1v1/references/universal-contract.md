# Universal contract (always in force, every task)

Prepended to every task contract. The user approves it once, in Step 4. Each rule has a mechanical check; the orchestrator runs `scripts/audit.py` for the static ones and the breaker writes tests for the behavioural ones. Any violation is BLOCKING.

## Integrity (the builder must not cheat)
- **U1 No tampering.** Protected paths unchanged since `guard.py init`. Check: `guard.py check`.
- **U2 No hard-coding.** Outputs derive from inputs. Check: breaker property tests on randomized and unseen inputs; a literal that mirrors a test expectation is a failure.
- **U3 No fakes.** No stubs, mocks, placeholder returns, `pass`-only bodies, `NotImplementedError`, TODO/FIXME, or `unittest.mock` in shipped code. Check: `audit.py` (AST scan).
- **U4 No swallowed errors.** No bare `except`, no `except Exception: pass`, no `# type: ignore` or `# noqa` added without a written reason in the contract. Check: `audit.py`.
- **U5 Real behaviour.** Every contract rule is exercised end to end through the public interface, not only by unit tests of internals. Check: breaker.

## Safety (high-stakes defaults)
- **U6 Atomic.** An operation completes fully or leaves state unchanged, including on exception or kill.
- **U7 Idempotent where retries are plausible.** Running twice equals running once, or fails clearly.
- **U8 Destructive actions are opt-in.** Deleting, overwriting or migrating data requires an explicit flag or confirmation, offers a dry run, and is never the default.
- **U9 Least access.** No caller reads or changes what the contract does not grant it.
- **U10 No secrets in code, logs, errors or test output.** Read from environment only.
- **U11 No hidden I/O.** No network calls, and no writes outside the project or a temp dir, unless the contract allows them. Check: `audit.py`.
- **U12 Validate at the boundary.** Bad input is rejected with a clear typed error, never silently coerced.

## Quality
- **U13 Types and lint clean.** `mypy` and `ruff` exit 0 with the project's config untouched.
- **U14 Bounded resources.** No unbounded loop, recursion or memory growth on large input. Tests run under a timeout.
- **U15 No new dependencies** without user approval.
- **U16 Honest status.** The final report lists what failed, was untested, or was assumed. Omission counts as a failure.
