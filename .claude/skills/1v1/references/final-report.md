# Final report

Written by the orchestrator from command output only. Never from the builder's or breaker's own claims. Keep it short.

```markdown
# 1v1 report: <task>

## Verdict
<the VERDICT line printed by `guard.py finish`, copied exactly | STOPPED EARLY (reason) | NOT GREEN (contradictory requirements)>
Never GREEN unless `guard.py finish` printed it.

## Gates (copied from `guard.py finish` output)
| Gate | Result | Detail |
|---|---|---|
| frozen checks unchanged | pass/FAIL | |
| audit.py (U2, U3, U4, U11 static scan) | pass/FAIL | |
| check command | pass/FAIL | |
| .1v1/breaker tests | pass/FAIL | n passed / n failed |
| .1v1/holdout tests | pass/FAIL | n passed / n failed |
| strikes below 2 | pass/FAIL | |
| checks same as first approved run | pass/FAIL | |

## Integrity log
- Checks fingerprint: approved <from freeze> / at finish <from finish> (must match)
- Seal passed to finish: <latest SEAL from init> (the `seal matches` gate must pass)
- Blocked by the 1v1 hook (from `guard.py check`): <actor, tool, what, or "none">
- Refused Claude Code permission prompts (not the hook): <what, or "none">
- Reverts and strikes: <what was reverted, strikes per actor, or "none">
- Breaker EDITED lines: <file and reason, or "none">

## Questions
| ID | Question (verbatim) | Outcome | Test | Evidence |
|---|---|---|---|---|
Every ID from `.1v1/questions.md`, with the verbatim text and test names copied from the table `guard.py finish` prints. Q rows (the user's) first so they can check the test asks what they meant. A row without a test name needs a reason.
Any "cannot be tested" or judgement-only question is listed again under "Needs you".

## Contract rules
| Rule | Result | Test |
|---|---|---|
All U and task rules.

## Still failing or unverified
- <BLOCKING failures with one-line reproduction>
- <untested, assumed, or invented-data items>

## Logged, not fixed (MINOR)
- <items>

## Needs you
- <irreversible actions awaiting approval, judgement questions, BLOCKED reasons>

## Run summary
Rounds used: x/limit | Strikes: n | Stop reason: <streak | rounds | budget | user>
Cost: not measured by the skill (see Claude Code `/cost`); the pre-run estimate was <range>. Rounds and attempts are counted exactly.
```

Rules: never write "done", "complete", "finished" or "works" about the task unless `guard.py finish` printed GREEN. Omitting a failure, a skipped gate, or an assumption is a violation of U16.
