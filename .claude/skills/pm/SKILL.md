---
name: pm
description: Product manager for Rupea. Judges an idea against the personas, the research and the competitors, cuts it to the smallest slice worth doing well, and keeps ROADMAP.md and its issues in order. With a question or idea, it answers only that. With research, it runs one research pass. It grooms the roadmap only when asked to groom, or when given no question at all.
argument-hint: '[idea | path to a plan | research [question] | groom]'
disable-model-invocation: true
---

# Product manager

Decide what Rupea builds next, and what it leaves out. A planner agent judges the idea, a checker agent finds the facts for a groom, and a researcher agent learns more about people and competitors. You make the map, show the user what the agent found, and change files only after the user agrees.

This skill is about direction. It does not design the code (use `/grilling`) or review it (use `/arch-review` or `/code-review`).

## Files

| File | What it holds |
|---|---|
| `person.md` | Who Rupea is for: four personas, how people move between them, and what is not now |
| `judging.md` | How to decide: the goal, the stance, the gates, growth, and how to write roadmap items and issues |
| `research.md` | Why we believe it: findings by question, the gaps, the next questions, and the sources |
| `competitors.md` | What people use instead, when each was checked, and what Rupea could do better than all of them |
| `groom-log/` | One file per month, such as `2026-10.md`, with an entry for each groom |
| `agents/planner.md` | The planner agent. It can only read files. |
| `agents/checker.md` | The checker agent, on a cheap model. It can only read files. |
| `agents/researcher.md` | The researcher agent. It searches the web and writes only to a scratch folder. |

The agents load as the `pm` plugin. Spawn them as `pm:planner`, `pm:checker` and `pm:researcher`. If a type is not available, spawn a `general-purpose` agent, give it the body of the agent's file as the prompt, and tell it that it must not edit files in the repo.

## Process

1. **Resolve the mode.** Answer only what was asked. `groom` alone, or no argument, means groom. `research`, with or without a question, means research. Any other argument is a question, an idea, or the path of a plan to read: answer it and do not groom, even if grooming looks overdue. Mention that it is overdue in one line at most.
2. **Map.** Write the map to a file in your scratchpad. The planner cannot run commands, so the map gives it what a command would. Keep it under 600 words.
   - **Roadmap:** the path of `ROADMAP.md`.
   - **Issues:** `gh issue list --label roadmap --state all --limit 100 --json number,title,state,labels`. One line each.
   - **Built lately:** `git log --oneline -40` on the main branch.
   - **Pages:** the manual pages in `packages/site/src/content/manual` that touch the idea, one line each.
3. **Judge.** Spawn the planner. Give it the map path, the paths of `person.md`, `judging.md` and `research.md`, and the idea or the mode.
4. **Show.** Give the user the verdict as the planner wrote it, answering the question asked. Add the roadmap and issue changes it proposes only when the question was about an idea or plan, and ask whether to apply them. Change nothing before the user agrees.
5. **Apply.** When the user agrees:
   - Edit `ROADMAP.md` as proposed. It is published as the manual's roadmap page, so it follows the copy rules in `judging.md`.
   - Create or edit each issue with `gh issue create` or `gh issue edit`. Add the `roadmap` label and one persona label. Create a label with `gh label create` if it is missing.
   - Put each new issue's link on its roadmap item.
6. **Report.** List what changed, with each issue's URL.

## Groom

Grooming keeps the roadmap true and says how things are going. It runs only when the user says `groom` with nothing else, or gives no argument. A question is never a reason to groom. Cheap facts first, judgement last, and the user is grilled on the proposals rather than handed them.

1. **Map.** As in the process, but **Built lately** is every commit on the main branch since the last groom. The last groom is the commit in the newest entry of `groom-log/`. With no log yet, it is the last commit that changed `ROADMAP.md`.
2. **Check.** Spawn the checker with the map, `ROADMAP.md`, `competitors.md`, `research.md` and today's date. It returns sync, flags and staleness.
3. **Plan.** Spawn the planner in groom mode with the map and the checker's facts. It proposes the changes, re-sorts **Planned**, and drafts the update.
4. **Grill.** Invoke the `grilling` skill on the proposed changes. Put the numbered changes to the user one at a time, with the planner's recommendation and the evidence under each, and settle each before the next. Then show the draft update, and offer to start the next research pass in the background.
5. **Apply.** Make the accepted changes to `ROADMAP.md`, the issues and `competitors.md`, as in step 5 of the process. Start the research pass if accepted, as below.
6. **Log.** Add the update to `groom-log/YYYY-MM.md` for this month, creating the file if needed. It records what was applied, not what was proposed. Do not commit: the user does.

A log entry is about 150 words:

```
## 2026-10-29

From <short commit hash>.

**Going well:** <up to three bullets: what shipped, and the personas it served>
**Could do better:** <up to three bullets: stalled items, needs that are not built, where competitors are ahead>
**Risks:** <up to three bullets: weak evidence under items near the top>
**Next:** <the top three items, and the next research question>
**Pace:** <items done since the last groom>
```

## Research

Research is iterative: each pass answers one question and leaves the next ones. It runs only when asked.

1. **Pick the question.** Use the question given. With none, take the first of the next questions in `research.md`, or refresh the competitors checked longest ago in `competitors.md`. Tell the user which, and why.
2. **Research.** Spawn the researcher in the background. Give it the paths of `person.md`, `research.md` and `competitors.md`, a scratch folder, and the question. A pass can take an hour. Tell the user it is running.
3. **Show.** Give the user the findings, what they confirm or change, and what Rupea could do better. Propose the edits to `research.md`, `competitors.md` and `person.md`, and any roadmap changes they lead to. Ask whether to apply them.
4. **Apply.** When the user agrees:
   - Add the source to the sources table in `research.md`, with its date and size.
   - Fold the findings into the findings by question, and say where a finding disagrees with what was there. Never drop a finding that was contradicted: note the disagreement.
   - Update the gaps, and replace the next questions with the queue the pass returned, sorted by how much each would change the roadmap.
   - Write each checked competitor's entry in `competitors.md`, set its date, and update **Better than everyone**.
   - Update the evidence lines in `person.md`.
   - Apply roadmap changes as in step 5 of the process.
5. **Report.** List what changed, and the next question.

Raw data stays in the scratch folder. Never commit it.
