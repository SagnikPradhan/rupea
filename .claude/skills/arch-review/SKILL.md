---
name: arch-review
description: Staff-level design review of a directory, a branch or a diff. Three reviewer agents cover six lenses (shape, reading, concepts, edges, failure, cost). A verifier checks the concrete claims. The report gives findings by lens and a ranked fix list.
argument-hint: '[directory | branch | nothing for the current diff]'
disable-model-invocation: true
---

# Architecture review

Review the design of a target through six lenses. Each lens has a persona in `personas/`. Three reviewer agents run two lenses each. A verifier checks each concrete claim. You make the map, and you merge the results into one report.

This review is about design. It does not look for security problems (use `/security-review`), style problems (use the linters), or line-level bugs (use `/code-review`).

## Agents

The agents are in `agents/` and load as the `arch-review` plugin. Spawn each agent with its namespaced type, for example `arch-review:tracer`. Each agent can only read files.

| Agent | Lenses (personas) | Model | Effort |
|---|---|---|---|
| `recognizer` | Shape (`architect.md`), Reading (`reader.md`) | haiku | default |
| `comparer` | Concepts (`designer.md`), Edges (`systems.md`) | sonnet | default |
| `tracer` | Failure (`adversary.md`), Cost (`operator.md`) | inherit | default |
| `verifier` | none. It checks claims. | inherit | high |

Choose the model by what the lens does:

- To recognize a pattern (do these look alike, does this name read), use haiku.
- To compare options (is this concept worth its cost, is this boundary in the right place), use sonnet.
- To trace a path through calls and queries, use the session model.

Use high effort only for the verifier. A wrong verdict there passes the filter. Apply this rule when you add a lens. Give a new lens to the agent that does its kind of work.

If the `arch-review:*` types are not available, spawn `general-purpose` agents. Give each agent the body of its file as the prompt, and the model and effort from its frontmatter. Tell each agent that it must not edit files.

## Process

1. **Resolve the target.** Use the argument.
   - A directory: the target is every source file under it.
   - A branch: run `git diff <main>...<branch>`. The target is every file the diff touches, the whole file.
   - No argument: use the uncommitted diff. If there is none, use the current branch against the main branch.
2. **Map.** Write the map to a file in your scratchpad. The agents cannot run commands, so the map gives them what a command would. Keep it under 400 words.
   - **Guide:** find `AGENTS.md`, `CLAUDE.md`, `CONTRIBUTING.md`, `GLOSSARY.md` and an ADR folder such as `docs/adr`. List the rules that apply to the target, one line each, with the rule's location.
   - **Modules:** each target file, its line count, what it holds in 10 words or fewer, and the target files it imports.
   - **Entry points:** the functions that code outside the target calls, each with its callers.
   - **Diff:** if the target is a diff, write the diff to a second file and give its path.
3. **Review.** Spawn `recognizer`, `comparer` and `tracer` in one message, so they run in parallel. Give each agent the map path, the path of its two persona files, and the target. Keep each agent ID. You need it for step 5.
4. **Check.** Collect the concrete findings (the ones with `→`). Give them all to one `verifier` agent. The verifier returns `confirmed`, `refuted` or `unsure` for each, with evidence.
5. **Resolve disputes.** For each `refuted` or `unsure` finding, send the verifier's evidence to the agent that made the finding. Use SendMessage with the agent ID from step 3. Do this one time only.
   - If the agent withdraws the finding, remove it.
   - If the agent gives new evidence, send it to the verifier one time.
   - If they still disagree, mark the finding `contested` and keep both arguments.
6. **Merge.** Sort the findings by the fix table below. Two findings with the same location and the same fix are one finding. Keep the higher severity.
7. **Report.** Use the report format below. Then offer to post the report as a GitHub issue, or to publish it as a page.
   - Do not create the issue until the user agrees.
   - When the user agrees, use `gh issue create`. Make the title `Architecture review: <target>`, and make the body the report.
   - Give the user the issue URL.

## Which lens owns a finding

Sort each finding by the fix it needs, not by the problem it describes.

| Lens | The fix |
|---|---|
| Shape | makes siblings alike |
| Concepts | adds, removes, merges or renames a concept. The list of concepts changes. |
| Reading | changes one function or one name in its place |
| Edges | moves code or changes a dependency. The list of concepts stays the same. |
| Failure | adds a guard, an invariant or a test |
| Cost | changes what runs, when it runs or where it runs |

## Finding format

Each agent returns at most five findings, the most severe first.

```
[edges · high] TypeScript and SQL each convert to rupees.
  holdings.ts:5, database-prices.ts:15
  → The accounts table and the worth chart can show different values. No test compares them.
  fix: Keep one conversion, or test both against one fixture.

[shape · medium] File writes settle in three ways.
  files.ts:142, :147, :221 vs renameFiles, deleteFiles
  fix: Make each write return Changed<T>. Settle all writes in one function.
```

1. Write the claim as one sentence of 20 words or fewer.
2. Give each location as `file:line`.
3. For a concrete finding, write `→` and the failure. The verifier checks it.
4. For a judgement finding, write `vs` and the code you compare with.
5. Write `fix:` and one direction. Do not write a patch.

Severity:

- **high**: the code gives wrong results, loses data, or does work that grows with history.
- **medium**: the code misleads a reader, or makes the next change harder.
- **low**: the problem is cosmetic.

## Report format

```
# Architecture review: <target>

<Two or three sentences. Say what is good and where the main problem is.>

## Shape
<findings, each with one tag: confirmed, judgement or contested>

## Concepts
...

## Reading
## Edges
## Failure
## Cost

## Fixes, in order
1. <fix> — <findings it closes>
```

- Write a lens with no findings as `Nothing found.` Do not invent findings to fill a lens.
- For a `contested` finding, give the agent's argument and the verifier's argument in one line each.
- Rank the fixes by severity first. Rank equal fixes by how many findings each closes.
