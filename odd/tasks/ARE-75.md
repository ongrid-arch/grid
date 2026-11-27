# ARE-75 Measure and draw the building before the work

## Outcome

An agent working on a plan with phases can read the building as it stands before the work, as it
will be after it, or both, from the reading tools themselves, without copying the plan and
stripping it by hand:

- `grid_areas`, `grid_schedule`, `grid_describe`, `grid_find` and `grid_export` take `state`:
  `before` reads the building as it stands before the work (its existing and demolished parts),
  `after` as it will be (its existing and new parts), each as a plain plan with no phases, so every
  figure, row, sentence and part found is of that building alone. Left out, each answers as it did.
- `grid_areas state=both` gives the area table of the work: each room's net area before
  (existing), after (proposed) and the change, then the same by use, by floor and for the net and
  gross totals, as text, data and CSV.
- `grid_view` takes `state` too, with two named drawings besides: `demolition`, the plan before
  the work with the parts to be demolished drawn dashed, and `proposed`, the plan after it with the
  new parts marked. `before` and `after` draw each state plain; `both` (as left out) draws every
  part with its phase.
- `grid_export state=before` (or `after`) writes the file of that building, named
  `<plan>-before.<ext>` (or `-after`), beside the export of the whole plan, not over it.

## Design

- `packages/cli/src/quantities/phaseState.ts`: `planAsItStands(plan, state)`, the plan in one state
  (`planInState`) with every phase and the base taken off, so every reader reads it as a plan of
  one state; `loadedInState(loaded, state)` the loaded plan with it, its other fields kept. Both are
  new objects kept with the frozen plan version (`keptFor`), never a change to it (CMD-51), so a
  survey of a state is kept between calls as the plan's own is.
- `phaseAreas(stated, request)` in the same file: `planAreas` of the survey before and after,
  joined by floor and room id (a room keeps its id through the work), by use and by floor, with the
  change as after less before, and null where one side has no figure.
- `packages/cli/src/mcp/stateArg.ts`: the one `state` argument the tools share, its reading, and
  the view's two named drawings. The tools in `readTools.ts` and `writeTools.ts` only read the plan
  through it; `grid_find`'s view carries the state on to `grid_view`.
- `command/export.ts`: `exportsIntoProject` takes the state and names the file for it. The CLI's
  own commands are not changed.
- Words: the answers' new sentences are keys in the message files; argument descriptions stay in
  the tool files, as every tool's do.
- No new convention in `types/floorplan.ts`, no new tolerance, no new message code.

## Done

- `phaseState.test.ts`: a plan with a demolished wall and room and a new room: the plan as it
  stands before and after holds the right parts and no phase; a frozen plan is not changed and
  gives the same object twice; the area table pairs rooms, uses and totals with the right change.
- Tool tests: `grid_areas` before, after and both (text, data, CSV); `grid_view` demolition,
  proposed, before; `grid_schedule`, `grid_describe`, `grid_find` with a state; `grid_export
  state=before` writes the named file holding only the existing building; a plan with no phases
  answers the same with every state.
- The checks: build, type check, lint, the tests of the folders changed, the words and tolerance
  tests, the tool list test.
