# Contract template

The contract is the only shared truth between builder and breaker. A human approves it (Step 4). If it is vague, both agents will fill the gap differently and the loop proves nothing. Every item must be checkable by a command.

Save as `.1v1/contract.md`. Keep it under 60 lines.

```markdown
# Contract: <task name>

## Goal
<1-3 sentences, plain words.>

## Non-goals
- <what must NOT be built or changed>

## Interface
<Exact function signatures, CLI usage, or HTTP routes, with types.
The breaker attacks this surface only.>

## Rules (each must map to a check)
- R1: <testable statement, e.g. "booking the same slot twice returns SlotTakenError">
- R2: ...
Each rule lists how it is checked: `pytest`, `hypothesis property`, `mypy`, `ruff`, or `CLI run`.

## Invariants
- <things true for ALL inputs, e.g. "total billed == sum of line items">
The breaker turns these into property tests.

## Sample data
<Real examples supplied by the user. If none, write "NONE PROVIDED" and
the breaker must say which tests used invented data.>

## Agent may decide alone
- <naming, internal structure, helper libs from stdlib / already-installed only>

## Agent must ask first
- <new dependencies, schema changes, deleting data, network calls, anything irreversible>

## Severity
BLOCKING = breaks any R or invariant, crashes, loses data, or fails mypy/ruff.
MINOR = style, naming, perf under 2x, wording. Logged, never looped on.

## Done means
All R and invariants pass; check command green; breaker tests green; holdout green;
every question in `.1v1/questions.md` has an outcome. Nothing else counts.

## Limits
Rounds: 3 | No-new-failure streak: 2 | Cost: rough estimate only (not measured or capped by the skill)

## Waivers and feasibility
- U-rule waivers: <U-ID: reason, or "none"> (every waiver is shown on the approval screen)
- Each R rule: one line on how it can be met; flag any rule you are not sure is achievable
```

## Writing rules

- Rewrite any rule that uses "should", "properly", "robust", "clean". Replace with an observable behaviour.
- Never let the contract say how to implement. It says what must hold.
- A task rule or non-goal that conflicts with a U rule (for example "no dry-run flag" vs U8) is a waiver: list it under Waivers, never leave it implicit.
- Timing rules need a wide margin (3x or more over what a reasonable implementation needs) or a relative check (growth ratio), so a slower machine does not fail honest code.
- Do not promise what the platform cannot do (for example replacing two files in one atomic step). Say so at approval instead.
- If a rule cannot be checked by a command, move it to the user's question list as "needs your judgement".
- Do not copy test code into the contract; the builder would write to the test.

## Question list format (`.1v1/questions.md`, breaker-only)

```markdown
G1: <from universal-questions.md>
T1: <task-specific, derived from the Interface>
Q1: <user's own, verbatim>
```
Universal questions (G) and the universal contract (U) always apply; see `universal-contract.md` and `universal-questions.md`. Use `Q` only for questions the user wrote.

- Plain words, verbatim from the user, never reworded.
- IDs are assigned by the orchestrator in order and never reused.
- The breaker answers each with at least one runnable test and reports: `fails`, `holds`, or `cannot be tested` (with reason).
- Questions needing taste ("does this screen feel right?") go back to the user.
- The builder never reads this file. It sees a question only as a failing test named `test_Q<id>_...`, so it cannot special-case the answer in advance.
