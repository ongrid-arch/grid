# VEW-16: the walls carried down to the ground the site states

## Outcome

A plan whose site states a ground below the foot of its ground floor (`site.ground` lower than
the underside of the floor's ground slab) is drawn standing on that ground, in every facade and
every section:

- A facade shows a plinth under the floor that stands on the ground: a band along every edge of
  its outline that faces the side, from the ground up to the underside of its slab, so the
  building's face runs unbroken from the ground line to its roof. No white strip is left between
  the ground line and the slab.
- A section cuts the same plinth under each outside wall it crosses on that floor, from the ground
  up to the slab, joined to the wall and the slab it carries, and shows the plinth's faces beyond
  the cut. The ground line runs on under the floor that stands clear of it, so the plinths stand
  on it and the space under the slab is closed.
- A plan with no ground stated, or with the ground at or above the foot of its slab, is drawn
  exactly as before: no plinth, the ground line stopping at the building.
- A floor that states it stands on something other than the ground (`below`, C23), and every
  floor that is not on the lowest level, gets no plinth: the plinth is under the base slab only.

## Design

- `packages/floorplan/src/geometry/ground.ts`: `plinthUnder(slab, ground)`, the one rule both
  drawings read: a floor's plinth runs from the ground to the underside of its slab when the slab
  is the floor's base slab (`kind: 'base'`, LVL-4: the lowest level, on the ground) and that
  underside stands more than `plinthLeast` above the ground; else none.
- `packages/floorplan/src/geometry/tolerances.ts`: `plinthLeast` (0.005 m), with its row in
  `docs/tolerances.md` (outside the area, one row, required by the tolerance test): under it, the
  floor stands at the ground and no plinth is drawn.
- `packages/floorplan/src/geometry/facade.ts`: a new face kind, `plinth`, a band along each edge of
  the outline that faces the side (the same edges as the slab's band), from the ground to the
  slab's underside. It is drawn first of the faces at a depth (`KIND_ORDER`), carries no wall, and
  is in the silhouette, so the outline reaches the ground. The viewer draws faces by their outline
  and needs no change.
- `packages/floorplan/src/geometry/section.ts`: a new part and face kind, `plinth`. Under each
  floor with a plinth, the band of its outside walls (`outerWallBand`, the same band a parapet
  rises on) is cut where the line crosses it, from the ground to the slab's underside, and its
  faces are seen beyond. The ground line no longer stops under a floor that stands clear of the
  ground on its plinth: only floors that reach the ground interrupt it.
- Decisions:
  - A plinth, not a deeper slab or longer walls: the slab keeps its thickness (its hatch and its
    "taken" note stay true), the walls keep their stated height (heights, areas and the take-off
    read them), and the plinth is a drawing part of its own that an agent can tell apart.
  - Only the base slab: a floor with more of the building below stands on that, and a floor off
    the lowest level is over something else. No height limit: a floor that stands on stilts says
    so with `below: "outside"`.
  - The 3D view, the IFC and the exports are not changed here: the card is the sections and
    elevations. Said in the report.

## Done

- `packages/floorplan/src/geometry/__tests__/plinth.test.ts`: with the ground at -0.45 and a
  0.2 m slab, the south facade has a plinth face from -0.45 to -0.2 along the whole front, its
  silhouette reaches -0.45 and nothing is left open between the ground and the slab; a section
  across the house cuts a plinth under both outside walls, its cut is one piece reaching the
  ground, and its ground line runs unbroken under the house; with the ground unstated, at -0.2,
  or with the floor stating `below: "outside"`, there is no plinth and the drawings are as before.
- A viewer test: the section and facade pictures of that house draw the plinth.
- The existing facade, section and viewer tests pass unchanged; type check, lint, the floorplan
  and viewer test folders and the scoreboard.
