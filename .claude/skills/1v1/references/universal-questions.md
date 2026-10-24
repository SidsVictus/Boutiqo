# Universal questions (breaker-only, every task)

The orchestrator copies these into `.1v1/questions.md` as G1-G16, then adds the user's own questions (Q1...) and any task-specific ones it derives (T1...) by applying these generic probes to the Interface in the contract. The builder never sees this file.

For each question the breaker writes at least one runnable test, named `test_<ID>_...`, and reports `fails`, `holds` or `cannot be tested` with a reason. Free tools first: hypothesis, fuzzing, mypy, ruff.

`N/A` is not an outcome for G1, G2, G3, G12, G13 or G14. For the others, "cannot be tested" needs a one-line reason tied to the contract's Interface; the orchestrator rejects vague reasons and sends the question back.

## Inputs
- **G1** What happens with empty, None, zero, negative, or huge input?
- **G2** What happens with wrong types, malformed data, unicode, or very long values?
- **G3** What happens at every limit and boundary, one below, at, and one above?
- **G8** Does the result change when only irrelevant things change (order, case, whitespace, timezone, locale)?

## State and time
- **G4** What happens if the same operation runs twice, or a client retries?
- **G5** What happens if two operations run at the same time on the same data?
- **G6** If it fails halfway (exception, killed process, full disk), is state still consistent?
- **G9** Does it depend on the clock, randomness, environment variables, working directory, or machine?
- **G15** Does it behave identically after a restart and in a fresh environment?

## Data and access
- **G7** Can any caller see or change something they were not granted, including through error messages or logs?
- **G10** Does any path lose, corrupt, truncate or silently alter data? Check by round trip.
- **G16** Can an irreversible effect happen without an explicit confirmation?

## Honesty of the implementation
- **G12** Is every error path reachable, and is each error reported truthfully rather than swallowed?
- **G13** Replace every input with unseen values. Does anything still pass because of hard-coding, a stub, or a mock?
- **G14** Can the interface be driven in a way that breaks a contract rule that no test covered (adversarial input, injection, malformed sequences of calls)?

## Scale
- **G11** At 100x the expected load or data size, do time and memory stay within bounds?

## Deriving task-specific questions (T1...)
For each public function, route or command in the Interface, apply every G question that touches it and write the concrete version in plain words, for example: "What if `<operation>` runs twice with the same `<input>`?" Add them to `.1v1/questions.md`. Cap at 12 task-specific questions, choosing those where failure would be most costly or irreversible.
