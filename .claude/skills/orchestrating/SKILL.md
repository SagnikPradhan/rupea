---
name: orchestrating
description: Use when the user wants a multi-step feature or change planned, then built by delegated agents, tracked in tasks.md. Triggers on "orchestrate", "plan then build", "delegate this", or resuming work from tasks.md.
---

# Orchestrating

You coordinate. You do not write code or change files other than `tasks.md`. Opus plans, Sonnet codes, Haiku researches and runs checks. `tasks.md` is the only record of where the work stands.

## Agents

| Work | Agent `model` |
|---|---|
| Plan, only when this session is not Opus | `opus` |
| Write code, tests, docs, fixes, and the checkpoint commit | `sonnet` |
| Research that needs more than a few lookups, and run `Done when` commands | `haiku` |

Set `model` on every Agent call you make. Never leave it unset.

Spawn an agent only for the work in the table. Do small lookups yourself: read a file or a few lines, search, `git status`, `git diff`. If a lookup grows past a few of these, hand it to Haiku.

## Steps

1. **Resume.** Read `tasks.md` if it exists. If its goal differs from the request, ask the user before touching it. If it matches, continue from the first task that is not `done`:
   - `blocked`: ask the user how to proceed.
   - `doing`: treat as `todo`, and check `git status` for partial changes first. Pass them to the Sonnet agent.
2. **Grill.** Invoke the `grilling` skill with the user. Run it yourself, since subagents cannot ask the user. Look up facts it needs yourself. If this session is not Opus, tell the user to switch with `/model` before grilling.
3. **Plan.** Write `tasks.md` in the format below. If this session is not Opus, spawn one Opus agent with the request and the decisions from step 2, and have it write the file.
4. **Approve.** Check that each `Done when` command exists (for example in `package.json` scripts). Show the user the task list. Do not build until they agree.
5. **Run.** Take the tasks in order, one at a time.
   - Set `Status` to `doing`.
   - If the task has a `Research` line, answer it yourself, or with Haiku if it is big. Put a few lines with sources in `Notes`.
   - Spawn a Sonnet agent with the task text, its `Notes`, and the repo rules from `AGENTS.md` or `CLAUDE.md` if they exist. It reports what it changed.
   - Spawn a Haiku agent to run the task's `Done when` command. It returns the command, the exit code and the last lines of output. Judge from that, not from Sonnet's report.
   - Passed: set `Status` to `done` and tick the box. Failed: see Failures.
6. **Checkpoint.** A `Checkpoint` task is not delegated. Follow Checkpoints below.
7. **Finish.** When every box is ticked, delete `tasks.md` and tell the user what was built. Never push.

## Failures

1. Check `git status` for the failed attempt's partial changes. Retry once with a fresh Sonnet agent, giving it the failure output and the partial changes.
2. If it fails again, set `Status` to `blocked` with the reason and stop. Tell the user.
3. If a report says the task contradicts a decision in `tasks.md`, skip the retry and stop at once. Put the change to the user through the `grilling` skill. Never re-plan silently.

## Checkpoints

The plan puts a `Checkpoint` task after each group of tasks that leaves the code working, and always last. At one:

1. Invoke the `arch-review` skill, then the `code-review` skill, on the uncommitted changes against `HEAD`. Never pass `--fix`.
2. Write the findings under the checkpoint's `Notes`.
3. No findings: spawn a Sonnet agent to commit locally. It runs the checks the repo requires first, and leaves `tasks.md` out of the commit. Tick the checkpoint and go on without pausing.
4. Findings: invoke the `grilling` skill with the user on those that need a decision. Add each accepted fix as a task titled `Fix: ...`, with `Files` and `Done when`, before the next group. Run them, and repeat from 1.
5. After two fix rounds on one checkpoint, set it to `blocked` and ask the user.

## tasks.md format

```markdown
# Tasks

Goal: <one sentence>

## Decisions
- <settled in grilling, one line each>

## Tasks
- [ ] <imperative title>
  - Status: todo | doing | done | blocked
  - Files: <paths>
  - Research: <question, or omit>
  - Done when: <one command that proves it>
  - Notes: <filled in while running>
- [ ] Checkpoint: <what the group delivered>
  - Status: todo | doing | done | blocked
  - Notes: <review findings and the decisions taken>
```

One task is one Sonnet run, touching a handful of files.

## Rules

- Update `tasks.md` before and after every agent call, so a lost session resumes cleanly.
- Pass each agent only what its task needs. Do not forward the whole conversation.
- A change the plan did not cover goes to the user as a proposal. It does not become a new task on your own.
