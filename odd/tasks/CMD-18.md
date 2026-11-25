# CMD-18: the first call works in any folder

## Outcome

An agent that starts `grid serve` or runs `grid` in a folder with no `grid.json` and names no plan
no longer meets a refusal. Grid uses `plan.json` in that folder, for reading and for writing
(`write`, `mark`, `check`, `describe`, `draw`, `export`, `sheet`, every tool), and says so where
it matters: when that `plan.json` is not there, the refusal names the folder, the file it looked
for and what to do (pass a plan, write one, or `grid init`). A new tool, `grid_project`, tells an
agent what the folder holds before anything else: the default plan and how it was chosen, every
plan file, and the files kept beside each (brief, markers, seen marks, preview record, scan,
occupancy, firm standards). `grid_write_brief` no longer replaces a brief that is already there
unless asked (`replace: true`): the first call cannot silently lose what the person said earlier.
`grid init` keeps writing a starter plan, which the first write already replaces (WRT-9), so
nothing about it changes.

## Design

- `packages/cli/src/command/init.ts`: `projectPlanFile` returns `plan.json` for any folder, not
  only a project; a new `defaultPlanOrigin(project)` says `project` (holds `grid.json`) or
  `folder` (it does not). The CLI (`command/main.ts`) and `planFileOf` (`mcp/toolkit.ts`) use it
  unchanged in shape: the null branch is gone. A plan that is not there on a read says, by
  `missingDefaultPlan`, which folder and file it looked in and why (no `grid.json`, so the default
  is `plan.json`).
- `packages/cli/src/mcp/projectTool.ts` (new): `grid_project`, read-only, one call, no arguments.
  It lists the folder's top-level `*.json` files that read as plans (a `version` and `rooms` or
  `walls`), the default plan, and for each plan the sidecars beside it by suffix. It reads the
  folder only, never walks down, and reads each candidate file only as far as needed.
  Placed first in `GRID_TOOLS`, because it is the first call an agent should make; the count is
  34 now (`tools.test.ts` order and cap change with it).
- `packages/cli/src/brief/brief.ts` `writeBrief` takes `{ replace }`; with a brief already there
  and no `replace` it refuses, naming the file and what it holds (wish count), and says to pass
  `replace: true` or read it first. `briefTool.ts` gets the `replace` argument and its
  description changes from "replacing the one there".
- Decision: no starter plan is dropped from `init`; it already counts as no plan for the first
  write. Decision: no extra "using plan.json" line on every successful answer; it would change
  every tool's text. The line is said where it helps: the refusal for a missing plan, and
  `grid_project`.
- No new convention and no new message code (the tool's and the CLI's own refusals are plain
  `ToolRefusal`/`UsageError` text).

## Done

- `packages/cli/src/command/__tests__`: `check`, `describe`, `write` and `mark` in a folder with a
  `plan.json` and no `grid.json` work with no plan named; a missing one is refused with the
  folder and file named.
- `packages/cli/src/mcp/__tests__/projectTool.test.ts`: lists plans, default plan and origin,
  sidecars; empty folder; a non-plan json is not listed.
- `packages/cli/src/mcp/__tests__/tools.test.ts`: order, count, example call and output schema.
- Brief tool test: a second `grid_write_brief` without `replace` is refused and the file is
  unchanged; with `replace: true` it is written.
- `docs/commands.md`, `docs/tool-server.md` updated; `changes/CMD-18.md`.
- typecheck, lint, `packages/cli` tests, ownWords and contract tests, scoreboard unchanged.
