# VEW-24: walls and slab carried down round a sunken room in section

## Outcome

A section through a room set below its storey (`floorOffset` below zero) draws one connected solid:
the storey's slab, a step up from the lowered slab, the lowered slab, and the walls round the room
standing on it. No free plank under the room, and no gap at the foot of a wall beside it, however far
the room is lowered.

## Design

- `packages/floorplan/src/geometry/section.ts`, `planSection` only. Nothing else reads the cut rings
  differently, so the viewer's section picture draws the new rings as it draws every other.
- Walls: for each floor, the stretches of the line across its sunken rooms are taken from the
  envelope's `slab.sunken`. A wall rectangle whose foot is at the floor (`zFrom` 0) and whose span
  meets or touches one of them is carried down by that room's offset, to the top of the lowered slab.
  A piece above a door or window is not.
- Slab: each lowered slab gets a step of slab thickness at both its ends, from its own underside up
  to the floor level, so it joins the storey's slab even when it is lowered by more than the slab is
  thick. Where a wall stands there the step is hidden in it.
- Not done: ground lowered by the site beyond the building (driveway, bank) is the ground line's
  business, not the slab's, and is left as it is.

## Done

- `geometry/__tests__/sunkenSection.test.ts`: a flat with a sunken genkan, lowered 0.18, 0.6 and
  1.5 m, cut as one connected piece, its outside wall reaching the lowered slab's top.
- The geometry and viewer test folders pass; typecheck and lint pass; scoreboard does not move.
