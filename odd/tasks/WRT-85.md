# WRT-85: a base plan's structure, stairs, fixtures and floor levels read into its fit-out

## Outcome

A fit-out on a base plan (CNT-10, WRT-75) shows and measures the whole shell, not only its walls
and doors. The base's columns, structural grids, stairs and fixtures are read in with its walls,
as existing parts of the shell: they are drawn in the fit-out's pictures and sheets, a column's
floor is taken off the room it stands in, a fixture takes its free floor, and every export
carries them. A floor the fit-out lists by the base's id keeps the base's level, height, slab,
outline and roof wherever the fit-out states none, so the shell stands at the base's levels and
its slab keeps its edge. None of it is written into the fit-out's file, and a change that would
move, change or take out one of these base parts is refused, as one touching a base wall is.

Before this, a shell's columns and grid vanished from its fit-out, and a survey base lost its
stair and its chimney breasts (fixtures) in the fit-out drawn on it.

## Design

- `packages/floorplan/src/geometry/phases.ts`, `mergeBase`: after the walls and openings, the
  base's `columns`, `grids`, `stairs` and `items` are added after the fit-out's own, as the base
  states them. None of these parts carries a phase (C16 names walls, openings and rooms only), so
  each stands before and after the work, which is what existing means for them; no convention is
  added. Their ids join `BaseMerge` (`columns`, `grids`, `stairs`, `items`), and a base part of
  these kinds whose id the fit-out uses for a part of its own is a clash, refused as a wall's is
  (the ids of columns, stairs and fixtures are one namespace in the drawing's checks).
  Decision: refuse rather than let the fit-out's part win silently, matching walls and openings.
- Floors: a floor the fit-out lists with a base floor's id takes each of `elevation`, `height`,
  `slab`, `parapet`, `roof`, `outline`, `above` and `below` the fit-out leaves unstated from the
  base's, and the base's `level` when the fit-out's reads 0 (its default) and the base's does not.
  The fit-out's floor as it was is kept in `BaseMerge.ownFloors`, so whatever writes the
  fit-out's own parts back (`ownParts`) writes its floor as it stated it. The base's floors the
  fit-out does not list come in whole, as before.
- `packages/floorplan/src/rooms/base.ts`: `ownParts` also takes out the base's columns, grids,
  stairs and items and gives back the fit-out's own floors; `fitOutReading` reads back through it,
  so `grid describe --as rooms` of a fit-out never writes a base part as its own.
- `packages/cli/src/command/plan.ts`: `LoadedBase` carries the new id sets and own floors; the
  clash refusal names "parts" rather than "walls and openings".
- `packages/cli/src/edit/phases.ts`, `baseTouched`: also refuses a patch that moves, changes or
  takes out a base fixture, column, stair or grid (`items`, `removeItems`, `parts`, `lists`).
- The base's bays and ramps are left as they were: not in this change.
- `docs/` page for fit-outs updated with what a base gives its fit-out.

## Done

- `packages/floorplan/src/geometry/__tests__/phases.test.ts`: a shell with columns, a grid, a
  stair between two floors, a fixture and floors with levels and a slab gives its fit-out all of
  them; the column's area comes off the fit-out room's floor; a fit-out floor with the base's id
  takes the base's elevation, slab and outline and keeps what it states; a clash on a column id is
  named; the base plan object is not changed.
- `packages/floorplan/src/rooms/__tests__/base.test.ts`: `ownParts` gives back none of the base's
  new parts and the fit-out's floors as stated.
- `packages/cli/src/edit/__tests__`: `baseTouched` names a base fixture moved or removed.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders touched, and the
  tolerances test (no new tolerance).
