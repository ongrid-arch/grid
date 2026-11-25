# WRT-40: the read-back writes the height the walls state, never a roof's ridge

## Outcome

`grid describe --as rooms` (and `grid_describe` as rooms) writes on its `walls` line only a
height that walls state in the plan file themselves. A wall that takes its height from its
floor, or rises to its floor's roof, is not counted: the floor line, and the floor's roof in
`raw floor`, already give it that height when the text is written again. So on a plan whose
nave rises to a roof with a 38 m ridge, the read-back no longer writes `height 38` for every
wall, and a floor beside it whose walls state no height is not given the ridge either: writing
the read-back again changes no wall, and that floor stays in rooms text instead of falling back
to Grid's own terms.

## Design

- `packages/floorplan/src/rooms/read.ts`, `ruleOf`: the walls line's height is the most common
  height among the solid walls whose own height is stated (`heightStated`), not among every wall
  whose height is not Grid's default (`heightByDefault`). A height taken from the floor or its
  roof is the floor's, and the writing gives it from the floor line.
- `reconcileWalls`: a height is said on a wall line only when the original wall states it
  (`heightStated`), for the same reason: saying a floor's or roof's height on a wall would make
  the written wall state it, which the original does not.
- No change to `rooms/compile.ts` (another change is there) nor to the plan schema.
- Decision: a plan whose walls state no height of their own now has no height on the walls line
  even when its floors state theirs. The floor lines carry it, and the writing already left the
  walls line's height out on a floor that states one, so nothing written changes.

## Done

- A test in `packages/floorplan/src/rooms/__tests__/` with a roofed nave (floor height 14, gable
  ridge 38) and a crypt floor whose walls state no height: before, the walls line says
  `height 38` and the crypt goes raw; after, the walls line states no height, no floor is raw,
  and writing the text again gives every wall the same height and the same stated or unstated
  height as the plan.
- A plan whose walls state their own height still has it on the walls line.
- `npx vitest run packages/floorplan`, `npm run typecheck`, `npm run lint`, the ownWords and
  tolerances tests, `npm run scoreboard`.
