# WRT-13: a plan is recognised by what it holds, and Grid's own files are never written as a plan

## Outcome

- `grid write` and `grid_write_rooms` (rooms text, `--layout` and `--scan` alike) refuse to write a
  plan into `grid.json` or into a file Grid keeps beside a plan (`<plan>.markers.json`,
  `.seen.json`, `.brief.json`, `.preview.json`, `.scan.json`), whatever the file holds, and
  `--replace` does not change that. Nothing is written.
- They also refuse to write over any existing JSON file that holds nothing a plan holds (a
  `tsconfig.json`, say): `--replace` does not change that either, because it only means "lose
  the plan's changes", and such a file has none.
- `grid draw`, `check`, `describe`, `export`, `sheet` and their tools refuse such a file in one
  line, instead of drawing a blank page at an absurd scale.
- A plan is told by its parts: a list `walls`, `rooms` or `openings` (empty is fine), or a
  `written` stamp. A missing `version` no longer decides anything (it already defaulted).

## Design

- New `packages/cli/src/command/planFile.ts`: `holdsAPlan(raw)` and `refuseGridFile(project, file)`
  (the name rule, from the suffix constants the sidecar modules already export).
- `loadPlanText` (`command/plan.ts`) refuses an object that holds no plan part, before the schema
  (which defaults everything, so `{}` parsed as an empty plan). Every reader goes through it.
  This is the one edit outside write.ts; it is a few lines.
- `writeRoomsIntoProject` and `writeScanIntoProject` call `refuseGridFile` first. The layout and
  the tool server go through `writeRoomsIntoProject`, so the tool needs no change of its own.
- Refusal is `PlanRefused` (one line, nothing written), as for any file that is there but not a plan.
- Decision: a name rule and a content rule, not content alone, because a sidecar such as
  `plan.brief.json` could hold anything a person put in it and `grid.json` holds a project id.

## Done

- `command/__tests__/planFile.test.ts`: each name refused with and without `--replace` and the file
  unchanged; a tsconfig-like file refused and unchanged; the same through the tool; draw/check of a
  non-plan file refused; an empty-lists plan and a `written`-only plan still read; no `version` still reads.
- typecheck, lint, tests, scoreboard.
