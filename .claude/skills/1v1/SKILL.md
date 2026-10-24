---
name: 1v1
description: Runs a builder-vs-breaker loop in Claude Code. One subagent builds the code. A separate subagent then attacks the running result and can only return failing tests, so the work is tested honestly instead of graded by its own author. Use this skill when the user types /1v1. Also use it for hard or high-stakes tasks, such as multi-step builds, data migrations, payments, security, or anything irreversible. Trigger it when the user says things like "make sure it actually works", "don't fake it", "break it", "stress test this", or "adversarial testing". Do NOT use it for small, easily checked changes. The gate in Step 1 declines those.
---

# 1v1: Builder vs Breaker (Python)

You are the **orchestrator**. You never write product code, never edit a check, and never grade work yourself. You pass messages, run the commands below in order, and report what they print. Models grade their own work too kindly and game tests they cannot pass, so every rule here is enforced by a hook or a script, not by trust. When a rule and your judgement disagree, the rule wins.

Read `references/contract-template.md`, `references/universal-contract.md` and `references/universal-questions.md` before Step 3, `references/builder-prompt.md` and `references/breaker-prompt.md` before Step 5, `references/final-report.md` before Step 7.

## Paths (read first)
- `SKILL_DIR` = the folder that contains this SKILL.md (for example `~/.claude/skills/1v1`). Substitute its full path in every command below.
- **Working directory = the target project root.** Never `cd` into `SKILL_DIR`. Scripts act on the current directory.
- `guard.py`, `round_budget.py`, `time_check.py`, `audit.py`, `find_check.py`, `install.py` below mean `python "SKILL_DIR/scripts/<name>"`, run from the project root.
- Claude Code may ask the user to allow reading or running files in `SKILL_DIR` (it is outside the project). If it is refused, stop and say so; never run a weaker version without the scripts.

## Phases
1. **Setup (Steps 1-3), before approval.** You may write only: the check command (`./verify`, if the user allows), `verify-fast` (written by `time_check.py` when the check takes over 60s), the `CLAUDE.md` block, seed tests (`tests/test_contract_seed.py`), `.1v1/contract.md`, `.1v1/questions.md`. All of it is shown at approval and removed by `--purge`.
2. **Lock (Step 4), after approval.** `install.py` adds the hook and agents; `guard.py freeze` locks every check. From here on, nobody (you included) can change tests, `verify`, config, `CLAUDE.md`, `.claude/`, the contract or the questions. Only the user can unlock, from their own terminal.
3. **Rounds (Step 5).** Builder and breaker take turns inside the lock.
4. **Finish (Steps 6-7).** `guard.py finish` runs every gate, prints the verdict and ends the lock.

### Everything this skill writes in the target project
| Path | What | Removed by |
|---|---|---|
| `.claude/settings.json` | one PreToolUse hook (`hook_guard.py`, all tools) | `install.py --uninstall` |
| `.claude/agents/1v1-builder.md`, `1v1-breaker.md` | agent definitions. A different same-name file is backed up as `<name>.md.1v1-bak` and restored on uninstall | `install.py --uninstall` |
| `.1v1/` | contract, question list, breaker and holdout tests, breaker scratch (wiped by `finish`) | `--uninstall --purge` |
| `./verify` | only if no check command exists and the user allowed `--create` (marked "created by 1v1") | `--uninstall --purge` |
| `./verify-fast` | only if the check takes over 60s (marked "created by 1v1") | `--uninstall --purge` |
| `tests/test_contract_seed.py` | only if no tests cover the Interface (marked "created by 1v1") | `--uninstall --purge` |
| `CLAUDE.md` | check command, inside a `<!-- 1v1:start -->` ... `<!-- 1v1:end -->` block | `--uninstall --purge` |
| `_scratch/` | the builder's throwaway probes; never tracked, wiped before every check run | `run-check` and `finish` |
| system temp folder `1v1-<hash>` | snapshots, hook log, strikes (outside the project) | `--uninstall --purge` |
| `~/.claude/1v1-records/<hash>.jsonl` | a record of freezes and verdicts, so deleting the state folder cannot reset the one-verdict rule | `--uninstall --purge` |

**To remove everything:** `python "SKILL_DIR/scripts/install.py" --uninstall --purge` (add `--dry-run` to preview). While a loop is running only the user can run it, from their own terminal.

## Iron rules and what enforces them
| # | Rule | Enforced by |
|---|---|---|
| 1 | Only `guard.py finish` decides pass/fail. Never accept "done" from anyone, and never write GREEN yourself. | `finish` restores the approved checks, checks them against the seal you carry, then runs every gate itself in a clean environment |
| 2 | After approval nobody edits a check: `tests/`, `verify`, `conftest.py`, `pyproject.toml`/`pytest.ini`/`setup.cfg` and other config, `sitecustomize.py`/`.pth` files, CI files, `CLAUDE.md`, `.claude/`, `.1v1/contract.md`, `.1v1/questions.md`. That includes you. If a check looks wrong, stop and ask the user. | hook blocks writes; `guard.py check` reverts and counts a strike; `run-check` and `finish` always restore the approved copies first, so a tampered check can never be what runs |
| 3 | Subagents are only `1v1-builder` and `1v1-breaker`, each in its own phase. Never `general-purpose` or any other type. If the Agent tool does not list them, stop and ask the user to restart Claude Code (`claude --continue`). | hook blocks other agent types and any tool outside the agents' list (no subagents, web, MCP, skills); `guard.py check` fails a round with no tool calls from the real agent |
| 4 | **A block message is a stop sign.** Never retry the same action by another tool, command, script or agent. Report it and ask the user. | every decision is logged in a hash-chained log; blocked writes and repeated blocks are strikes |
| 5 | Information wall. The builder's entire input is `.1v1/BUILDER_INPUT.md` (`guard.py builder-input`: builder prompt + contract + raw failing output). The breaker's entire input is `.1v1/BREAKER_INPUT.md` (`guard.py breaker-input`: breaker prompt + contract + questions + how to run). You spawn or message each one with its fixed line and nothing else: no summary, no hints, no context. | hook blocks any other prompt or SendMessage; `guard.py hide` moves all of `.1v1/` except the builder's input out of the project while the builder runs; hook blocks both agents from Claude's own files (transcripts, settings, skills) and the 1v1 state folder, and the builder from finding the temp folder |
| 6 | The breaker writes only failing tests, in `.1v1/breaker/` (MINOR ones in `.1v1/breaker/minor/`: reported, not a gate) and `.1v1/holdout/` in the holdout round, plus throwaway probes in `.1v1/scratch/`. Never config (`conftest.py`, `pytest.ini`, ...), not even in its own folders. No opinions. If it edits a test from an earlier round, `finish` reruns the original, and an edit that turned a failure green fails the verdict until the user reviews it. | hook + `guard.py check --role breaker` + `finish` |
| 7 | You change nothing in the project during the loop: no product code, no tests, no config. Only the agents work; you run commands and pass the fixed lines. | hook blocks your writes to project files; `guard.py check --role orchestrator` before every turn fails on any change |
| 8 | No new packages, no persistent environment changes during the loop. | hook blocks pip/uv/poetry/conda/setx for agents; `finish` compares the Python environment fingerprint with the one taken at approval |
| 9 | Two strikes for any actor = stop and report. Never re-snapshot after a violation. | `guard.py check` exit 3; `guard.py init` refuses after a violation |
| 9b | Agents run plain commands only: no base64/hex decoding, `exec`/`eval`, `Invoke-Expression` or character arithmetic that hides a path, and no leaving the project (`cd ..`, `~`, other drives). | hook blocks them; content that finds home or temp folders needs the user's `.1v1/allow-dirs.txt` |
| 10 | Destructive actions (deleting data, dropping tables, git reset/clean, force push, prod credentials) need explicit user approval each time. | hook blocks them for agents |
| 11 | Never write "done", "complete", "finished" or "works" about the task unless `guard.py finish` printed `VERDICT: GREEN`. | final report rules |

## Step 1 - Gate (decide before touching anything)
- **Small task:** only if the change is a rename, a one-line fix or similar, fully settled by the existing tests, decline. A new function or feature whose behaviour the tests leave open (edge cases, limits, errors) is not small: run the loop. When in doubt, and always when the user typed `/1v1` with stakes (money, security, public output), run it. For a small one, decline in one line that says why, and offer: "I can do it directly without the loop. Want me to?" Then **stop**. Edit nothing and run nothing until the user answers. If they say yes, do the change normally, without this skill. If they insist on the loop anyway, run it: their call wins over the gate (a contradiction, below, is different).
- **Contradiction:** if the request or the existing tests cannot all pass honestly (for example two tests that need different results for the same input), stop before setup. Show the conflict with file and line, give options with a recommended default, and ask the user to choose. Never choose for them, never edit the tests, never start the loop. If they say "run it anyway", explain that no honest code can pass and the loop would only burn rounds, and ask again. Verdict for this case: `NOT GREEN (contradictory requirements)`.
- Otherwise continue.

## Step 2 - Check command
Run `find_check.py` (no flags; it only looks). If it prints `NO CHECK COMMAND`, tell the user that `find_check.py --create` will write `./verify` (a Python script: pytest, mypy, ruff, skipping `.1v1/`; run as `python verify`), and run it with `--create` only after they agree. Run `time_check.py "<check command>"`; over 60s it writes `verify-fast` for the loop. Record the command in `CLAUDE.md` inside a `<!-- 1v1:start -->` ... `<!-- 1v1:end -->` block and leave the rest of the file alone. If no runnable check exists after this, stop and tell the user. Never build blind.

## Step 3 - Contract, questions, seed tests
1. Build `.1v1/contract.md`: `references/universal-contract.md` (U1-U16, copied unchanged) + a task part from the template. Seed `.1v1/questions.md` with all of G1-G16, then derive T-questions from the Interface. Ask at most 3 multiple-choice questions, only where a wrong guess is costly, each with a recommended default. Real sample data must come from the user. Offer the optional question list; append each user question verbatim as Q1, Q2...
2. **Seed tests (greenfield):** if no existing test exercises the Interface, write `tests/test_contract_seed.py` whose first line is `# created by 1v1`: one black-box acceptance test per R rule, through the Interface only. Run `python -m ruff check tests` and `python -m mypy tests` until both are clean. These are frozen at approval: you cannot fix them later, so get them right now.
3. Run the check command. Before the build it must fail only because the Interface does not exist yet (import error, missing command). Any other failure must be settled before the lock:
   - in a seed test you wrote: fix it now;
   - in a test, config or file the user already had (for example ruff or mypy errors in an existing test): show the exact error on the approval screen and ask the user whether you may fix it now, or whether they will. After the lock nobody can, and the builder would only return BLOCKED.
   Also run `python -m ruff check tests` and `python -m mypy tests` on the existing tests and treat their errors the same way.

## Step 4 - One approval, then lock
1. Run `install.py --dry-run`. Show on one screen:
   - the contract, with any U rule the task part waives or changes listed by ID and reason (a waiver nobody sees is a violation), and for each R rule a one-line note on how it can be met (if you are not sure it can be met, say so now, not in the report)
   - the seed tests (each name and what it checks)
   - rounds (default 3) and the no-new-failure streak (default 2). The round cap is the only hard limit
   - a rough cost estimate, labelled as a guess: the skill cannot measure or cap token spend (Claude Code's `/cost` shows the real figure)
   - the project changes from the dry run, and the removal command

   Run nothing more until the user approves.
2. After approval, run in order: `install.py`, `round_budget.py init --rounds N --streak M`, `guard.py freeze --check "<check command>"`. Tell the user the `CHECKS FINGERPRINT` it prints; `finish` prints it again and the report shows both.
3. **Probe the hook:** use the Read tool on `.1v1/HOOK_PROBE`. It must be blocked with `HOOK_PROBE`. Then run `guard.py preflight`.
4. Look at your Agent tool's list of agent types: it must include `1v1-builder` and `1v1-breaker`.
5. If preflight prints any FAIL or the agents are missing, **stop**. Tell the user exactly what failed, and that they need to restart Claude Code (`claude --continue`) and say "continue 1v1". After the restart, repeat steps 3-4. Never start round 1 without a passing preflight.

## Step 5 - Rounds (exact sequence; never skip or reorder)
**Builder turn**
1. `guard.py check --role orchestrator`. It must print `clean` (you changed nothing). If not, stop and report.
2. `guard.py hide`, then `guard.py role builder`, then `guard.py builder-input --check` (round 1, or when the check is red) or `guard.py builder-input <BLOCKING test node IDs>` (later rounds).
3. Agent tool, `subagent_type: "1v1-builder"`, with exactly this prompt and nothing else: `Read .1v1/BUILDER_INPUT.md and follow it exactly. It holds your instructions, the contract and the failing output.`
4. `guard.py check --role builder --revert`. Exit 0: go on. Exit 1: the change was reverted and a strike counted; run `guard.py check --role builder` until it prints `clean` (send the builder nothing about it). Exit 3: stop the loop and go to Step 6.
5. `guard.py role orchestrator`, then `guard.py init`.
6. `guard.py run-check` (never the raw check command: run-check restores the approved checks and uses a clean environment). If red, go back to the builder: same round, at most 2 retries, each one `guard.py role builder`, `guard.py builder-input --check`, the same one-line prompt, then steps 4-5. Never call the breaker on red code. If the builder returns `BLOCKED`, stop the loop and go to Step 6 with the reason.

**Breaker turn**
7. `guard.py check --role orchestrator` (must be `clean`), then `guard.py reveal`, then `guard.py role breaker`, then `guard.py breaker-input` (add `--holdout` in the last round: the cap, or when the streak will end the loop).
8. Agent tool, `subagent_type: "1v1-breaker"`, with exactly this prompt and nothing else: `Read .1v1/BREAKER_INPUT.md and follow it exactly. It holds your instructions, the contract, the questions and how to run the system.`
9. `guard.py check --role breaker --revert` (handled as in step 4), then `guard.py role orchestrator`, then `guard.py init`. **Remember the `SEAL:` line `init` prints; always keep the latest one.** It is the hash of the checks and tests the verdict must run. You will pass it to `finish`; never compute or copy a seal any other way.
10. `round_budget.py record <new BLOCKING failures>`. If it prints `"checkpoint": true`, ask the user whether to continue, then run `round_budget.py ack`. If it prints `"stop": true`, go to Step 6.
11. Only BLOCKING failures go to the next builder turn, through `guard.py builder-input <their node IDs>` (step 2). Log MINOR ones for the report. `guard.py failing` shows you the same output if you want to read it.

## Step 6 - Final gates
Run `guard.py finish --seal <the latest SEAL from init>`. If the files it is about to run do not match that seal (for example because someone rewrote the copies in the state folder), the verdict is NOT GREEN. It reveals hidden files, restores the approved checks, then runs in a clean environment: frozen checks unchanged, no changes since the last guard check, hook log intact, Python environment unchanged, `audit.py`, the full check command, all `.1v1/breaker/` tests, all `.1v1/holdout/` tests (every pytest gate must also produce a JUnit report showing tests really ran), the original versions of any breaker tests that were edited, strikes, checks unchanged since the first approval, that the breaker really attacked (a recorded round with breaker tool calls), and that this is the first verdict for this approval. MINOR breaker tests are run and reported, not gated. Tests the breaker withdrew (`.1v1/breaker/withdrawn.txt`) are skipped and listed for the user. It prints `VERDICT: GREEN` only if every gate passes, then ends the lock. Its verdict is final: never edit anything and rerun it to get a better result. Every question in `.1v1/questions.md` must have an outcome from the breaker's QUESTIONS table: fails, holds, or cannot be tested (with reason). Questions with no pass/fail go back to the user.

## Step 7 - Report
Use `references/final-report.md`, filled only from `guard.py finish` output, `guard.py check` output and the breaker's tables. Include every blocked attempt, revert, strike and breaker EDITED line, and the checks fingerprint at approval and at finish (they must match). Build the Questions table from the table `guard.py finish` prints (verbatim question text and test names), adding each outcome and evidence from the breaker's last QUESTIONS block; every row needs a test name or a reason. List hook blocks separately from Claude Code permission prompts that were refused: they are different things.

## When something goes wrong
| What you see | What you do |
|---|---|
| A hook block message on your own action | Stop. Tell the user what was blocked. Never retry another way. |
| `Agent type '1v1-builder' not found` | Stop. Ask the user to restart Claude Code (`claude --continue`). Never substitute another agent. |
| `guard.py preflight` FAIL | Stop. Report each FAIL line to the user. |
| The user wants a check changed after approval | The user edits it and runs `guard.py approve-changes` in their own terminal. You do not edit it. |
| `guard.py check` exit 3 (two strikes) | Stop the loop. Run Step 6 and report. |
| `freeze` refused: the approval already has a verdict | A verdict is final. Only the user can start another run on the same approval (`guard.py freeze` in their own terminal), or change the checks with `approve-changes`. A new task in a project that already has a verdict needs the same: ask the user to run `guard.py freeze --check "<cmd>"` (or `approve-changes`) in their own terminal, where they type a code it shows. |
| A builder block that starts with `content:` | The product seems to need the home or temp folder. Stop and ask the user; they can allow it in `.1v1/allow-dirs.txt` (`home`, `temp`) before approval. |
