# ARE-23: a room's true width and depth in the walk

## Outcome

`grid describe --length walk` (and `grid_describe length=walk`) says each room's width and depth
as the room is drawn, so the two figures agree with its area. A hall drawn 40 by 16 is not said
to be 26.8 across and 21.5 deep when it is entered through a wall that is not square to the room.

## Design

- Cause: `stopAt` in `packages/cli/src/describe/walk.ts` measures `across` and `deep` as the
  room's extent along the doorway's inward direction and its left. For a doorway in a wall at an
  angle to the room's sides that direction is skewed, so a rectangle's extent along it is the sum
  of both sides' projections, not a side.
- Fix: the figures are measured in the room's own frame. When the way you face is square to the
  room's longest side (within a degree) nothing changes. Otherwise the figures are taken along
  the room's own side nearest to the way you face (`squareFacing`), so a rectangle gives its two
  sides. The things on the walls, the facing and the reach are unchanged.
- Decision: no new word, no new code. The doorway's clamp on depth (a room's depth is counted
  from the doorway) is kept, in the room's frame.

## Done

- A test in `packages/cli/src/describe/__tests__/walk.test.ts`: a rectangular hall with a
  doorway in an angled wall says its sides and across x deep matches its area; it fails before.
- Existing walk tests and `walkAgrees` still pass; `npm run typecheck`, `npm run lint`,
  the cli package tests and the scoreboard do not get worse.
