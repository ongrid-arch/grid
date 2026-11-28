# ARE-82: each floor's depth below the ground, its formation level, retained height and dig

## Outcome

An agent asked how deep a basement or a car park under a building is, what its formation level
is, how much earth its walls hold on each side and how much is dug out gets it in one call,
`grid_measure what=ground`, with each figure's rule, and never builds a depth table by hand. For
every floor that stands below the ground somewhere it gives: the ground over it (the lowest and
the highest under its walls, its building's own ground), its floor's depth below that ground,
its formation level (the underside of the slab it rests on the ground by) and how far that is
below the ground, the most earth its walls hold on each side by compass, its area below the
ground and the volume dug out under it, and the excavation in all. `grid describe` says a floor
is below the ground and how deep, for a person and for an agent.

## Design

- `packages/cli/src/quantities/depth.ts` (new): `planDepths(plan)` reads only what is worked
  out already: the ground (`groundLevel`: the site's ground, a slope, a building's pad, `under`
  for the lowest and the highest ground under a floor's walls), the floors' levels
  (`floorElevations`), and ARE-77's `planEarth` (retaining faces, ground-bearing slabs and the
  dig). Per floor: `ground` low and high, `depth` low and high (ground less floor level, held at
  0), `below` (`wholly` when the floor is under the lowest ground, `partly` when only under the
  highest, as a floor cut into a slope), `formation` (the underside of its ground-bearing slab,
  null with none) and its depth below the ground, `retained` per compass side (the most earth any
  of its retaining faces on that side holds, the side from `planFacing`), `area` (the floor's
  gross external area, `planShell`) and the dig's `area`, `depth` and `volume`. A depth within
  `sameFloorLevel` is no depth, as ARE-77 has it, so no new tolerance.
- `packages/cli/src/mcp/readTools.ts`: `what=ground` in grid_measure, worded floor by floor, with
  its rule; a plan with no floor below the ground says so.
- `packages/cli/src/describe/`: a floor below the ground carries `belowGround` (depth low and
  high) in its facts; the person's floor head adds "its floor 3.20 m below the ground" (a range on
  a slope), the agent's `below-ground 3.2` (or `1.0-3.2`).
- Words in `messages/en.ts` and `es.ts`. Docs: grid_measure in `docs/tool-server.md`.
- Decisions: the formation level is the slab's underside, the level the dig is taken down to in
  ARE-77 (a blinding or sub-base under it is not in the plan). Area below the ground is the
  floor's gross external area for a floor wholly below, and the same with `partly` for one cut
  into a slope (the plan cannot say where along the slope the ground meets the floor). Sides are
  by the plan's north (the top of the drawing when it states none, and the answer says so).

## Done

- `packages/cli/src/quantities/__tests__/depth.test.ts`: a basement under a ground floor on a
  stated ground, a plan on a slope with a floor cut into it, and a plan with nothing in the earth;
  figures by hand: depth, formation and its depth, retained per side, dig volume.
- `packages/cli/src/mcp/__tests__`: grid_measure what=ground answers text, data and rule, and
  refuses stray arguments.
- `packages/cli/src/describe/__tests__`: the floor head says below the ground and how deep.
- build, typecheck, lint, vitest on the folders touched and the shared ones, scoreboard.
