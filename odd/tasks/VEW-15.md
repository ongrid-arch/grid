# VEW-15: a drawing's notes are the check's notes

## Outcome

- The numbered notes on `grid draw`, `grid_view` and the sheet are exactly the lines `grid check`
  lists. No wall, door, fixture or floor is marked "has a field Grid does not know" for a field
  Grid wrote itself: `unstated`, `typed`, `fromLibrary` or `placedBy`.
- `grid diff` does not open with issues for those fields: the notes that came and went are the
  check's notes of each version.
- A file that really writes one of those fields is still told it is not read, by `grid check`.

## Design

- The reading adds `unstated`, `typed`, `fromLibrary` and `placedBy` to the parts it hands on
  (`READING_ONLY` in `packages/floorplan/src/types/reading.ts`), and the field check names them
  only when a *file* states them. The drawing and diff paths handed `inspectPlan` the plan
  already read, so the reading's own fields looked like the file's. `grid check` hands it the
  file's text (`loaded.text`) and its base.
- Fix: the three call sites (`command/draw.ts`, `grid_view` in `mcp/readTools.ts`,
  `versions/diff.ts`) hand `inspectPlan` the file's text as `grid check` does, with the base
  plan of a fit-out. The field list in the core is not touched: it is already right.
- Decision: no new option on `inspectPlan` and no change in `packages/rules`; the three paths
  use the same input as the check, so their numbering cannot drift from it.
- Decision: an earlier version in `grid diff` is its text too (`text` of the marker or commit).

## Done

- Tests that fail before: a plan whose floor states a height, with a typed wall and a
  library item, drawn with `grid draw`, `grid_view` and compared with `grid diff`: the notes
  are those of `grid check` (none).
- A file that writes `unstated` itself is still named by `grid check`.
- Typecheck, lint, the whole `packages/cli` folder, `ownWords` and `contract` tests, scoreboard.
