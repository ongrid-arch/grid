# VEW-25: every wall that faces the viewer, porches and roof enclosures included

## Outcome

A facade (`planFacade`, `grid draw --view elevation`, the sheet's elevations) draws every wall that
turns toward the side it is seen from and that no nearer face hides, with its doors and windows:

- the front wall of a porch or another outdoor space, and its door, under the porch's roof, so the
  roof no longer floats;
- a stair or lift enclosure standing on a roof terrace, as walls with their door under its roof,
  not as a bar in the sky;
- the front of a floor set back behind a terrace on the floor below's roof (a stepped block), with
  its windows and doors, above the terrace's parapet, and the parapet itself.

A wall a nearer face hides completely is no longer drawn or listed in the facade's `walls`, nor an
opening a nearer face hides completely in `openings`.

## Design

All in `packages/floorplan/src/geometry/facade.ts`; the viewer's facade picture already draws every
face it is given, farthest first and filled, so it needs no change, only a test.

- Today the walls come from the edges of one outline per floor, the slab's (`planEnvelope`). On a
  floor with outdoor space (C26) that outline leaves the walls that bound outdoor space alone out
  (a porch front, a terrace's parapet), and on an upper floor it takes the terrace in, so the
  building's own front behind the terrace lies inside it. On such a floor the facade now also
  reads the walls along two more outlines, both the core's own (`slabOutline`): the floor with
  every wall, outdoor ones too, and the building alone (`buildingPlan`). A floor with no outdoor
  space reads as before. Decision: no new outline worked out here; both come from `outline.ts`
  and `outdoor.ts`, as the header says.
- The same wall can now be found along more than one outline. A wall's face that lies within
  another of the same wall, floor and depth is left out, so each wall is drawn once, whole.
- A wall's face that the nearer faces hide whole (their union cut from it leaves no area above
  `areaReported`) is left out, and so is an opening they hide whole. Decision: this holds for every
  wall face, not only the new ones, so the lists say what is seen; faces are still drawn farthest
  first, so a face partly hidden stays and the nearer face covers its part. Slabs, roofs, parapets
  and plinths are never left out.
- The tiers (line weights) are given after the hidden faces are left out, so the front is tier 0.
- No new tolerance, convention or message code.

## Done

- `packages/floorplan/src/geometry/__tests__/facade.test.ts`: a porch's front wall and door are
  drawn and the house wall behind it is not; a stair enclosure on a roof terrace is drawn with its
  door, and the parapet; a stepped block's set-back front is drawn with its window and door, and
  the terrace's parapet in front of it. Each fails before the change.
- `packages/viewer/src/picture/__tests__/facade.test.ts`: the porch's door is in the picture.
- Every existing facade, section, plinth and curved-wall test passes unchanged.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer and cli test folders, the
  own-words test and the scoreboard.
