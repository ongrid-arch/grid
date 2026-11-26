# CMD-45: a plan is never written over a file that is not a plan

## Outcome

- No command or tool writes a plan into `grid.json`, into a file Grid keeps beside a plan
  (`<plan>.brief.json`, `.markers.json`, `.seen.json`, `.preview.json`, `.scan.json`,
  `.occupancy.json`, `.sheet.json`) or into `firm-standards.json`, whatever `replace` says.
- No change written to another file (`out`, `--out`, a fit-out's `plan`) writes over a file that
  is there and holds nothing a plan holds, such as `tsconfig.json`. A plan is told by its walls,
  rooms, openings or written stamp (`holdsAPlan`), never by a missing version. Nothing is
  written then, and the answer says why.
- A plan with nothing in it to draw (no walls, rooms, openings or items, no floor outline, no
  plot, columns, bays or trace image) is not drawn as a blank page at a scale of hundreds of
  thousands of pixels a metre: `grid_view kind=plan` and `grid draw` refuse it with one line.
  `grid check` already says such a plan is empty (`plan/empty`) and is left as it is.

## Design

- `packages/cli/src/command/planFile.ts`: `gridFileKind` also knows `.occupancy.json`,
  `.sheet.json` and `firm-standards.json`. A new `refusePlanTarget(project, file)` refuses a file
  a plan is about to be written into: one of Grid's own by its name, or a file there already
  whose text is not a JSON object that holds a plan. Read as text and parsed, not through
  `loadPlan`: an older plan with a fault is still a plan, and may be written over.
  `nothingToDraw(plan, lines)` says whether a plan holds nothing a plan picture draws, from the
  record's own `plan/empty` line and the parts that line does not count.
- Called where a plan is written to a file other than the one just read: `writeChange`'s `out`
  (every edit tool and `grid edit --out`), `grid_tidy`'s and `grid tidy`'s out, `grid_phase_from`'s
  out and `grid_start_fit_out`'s plan. `grid write` already reads an existing plan file whole,
  so it refuses a non-plan through `loadPlan`; it gains the new names through `gridFileKind`.
- The view refusal is in `grid_view` (kind=plan) and `grid draw`'s 2D plan, before drawing.
- Words in `packages/floorplan/src/messages/en.ts` (and the draft `es.ts`). No new result code.
- Kept to the refusal: no change to the revision and history path the edits share.

## Done

- `packages/cli/src/command/__tests__/planFile.test.ts`: the new names; `refusePlanTarget`
  refuses `grid.json`, a sidecar, `tsconfig.json` and a file that is not JSON, and lets a new
  file and an existing plan through.
- A tool test: an edit with `out` naming `grid.json` or `tsconfig.json` is refused and leaves the
  file as it was; `grid_view` of `{"rooms": []}` is refused.
- `npm run build`, `typecheck`, `lint`, the cli package's tests, `ownWords` and `npm run scoreboard`.
