# CNT-49: the ground on each side, or a stated fall, read at every wall

## Outcome

A plan on a slope can say where the ground is round the building, and every check, the site
measure and the pictures read the ground at the wall in question instead of one level for the
whole site:

- The plan states the ground per side of the building (`ground north 0 south -4.6`), a fall
  (`ground slope 30% toward south`, through the stated ground level, or 0, at the middle of the
  building), or the levels along edges of the plot, a street that falls along its edge
  (`ground edge 2 0 -3`: edge 2 at 0 at its start, -3 at its end). `grid_set_site` sets the same
  fields. One `ground <m>` stays exactly what it was.
- Grid takes the one even slope that fits every stated level (a plane over the plan). When the
  levels lie on one even slope they are met exactly; when they do not, Grid says how far the
  slope it took is off the furthest one, so no figure is silently bent.
- A door or window is below the ground by the ground at its own place on its wall: a bedroom
  window dug 5 m into the hill is named, the walk-out garden door on the downhill side is not.
- A door to the outside opens in mid-air by the ground at that door: the walk-out door at the
  foot of the slope is a way out, a terrace door 2.8 m over the falling garden is named and is
  not a way out, and each of a terrace's doors along a falling street is read against the street
  in front of it.
- A floor that meets the ground anywhere round it (its floor level between the lowest and the
  highest ground under its walls) is on the ground: a chalet's walk-out lower floor is a ground
  floor, so it is in the footprint and the storey count and its way out is checked. A floor is
  below the ground only where it is under the lowest ground round it.
- The building's height is measured from the lowest ground round it.
- Facades draw the ground along the face as a sloped line, sections draw the ground and the
  earth along the cut as sloped, and the 3D view tilts the ground sheet. A car park's depth below
  a falling street is read from the street at each wall, not worked out by hand.

A plan with one `ground <m>`, or none, reads exactly as before, figure for figure.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `SiteSchema` takes `groundSides` (a level for any
  of `north`, `east`, `south`, `west`), `fall` (`slope`, in percent, and `toward`, one of the
  eight compass points) and `groundEdges` (`edge`, `start`, `end`, the plot edge's levels at its
  first and second corner). This widens C7 (the site, where LVL-4 put `ground`); no new
  convention number. The sides are the drawing's, as the facades name them (C4: north is up the
  drawing), so `grid_facade side=south` shows the ground stated for the south.
- `packages/floorplan/src/geometry/groundSurface.ts` (new): `groundSurface(plan)` fits the plane
  to the stated levels by least squares (sides at the two ends of that face of the building's
  bounds, each plot edge at its two corners, `ground` at the middle of the building), with the
  slope fixed when a fall is stated, a line of levels alone taken as level across it. It returns
  `at(point)`, the gradient, the lowest ground under the building and how far it is off the
  furthest stated level. Null for a plan that states no slope, so nothing else changes then.
- `geometry/ground.ts`: `statedGround` is the lowest ground under the building on a slope.
  `groundLevel` reads, for every floor, the ground under its walls (lowest to highest) and
  `above` is how far its floor level stands past that range (0 inside it), so `aboveGround`, the
  ground floors, `footprintFloors` and the storeys read a walk-out floor as on the ground. It
  adds `at` (the ground at a point) and `aboveAt(floor, point)`. `openingsBelowGround` reads the
  ground at each opening's middle. `groundOf` is the lowest ground under a floor. A building's
  pad (LVL-23) stays a flat ground for its own floors.
- `geometry/rules/check.ts`: on a slope, each door out of a floor on the ground is read at its
  own place: one that stands more than `outsideDoorAboveGround` over the ground there is said as
  a door to the outside above the ground (the existing code, with its height) and is not a way
  out.
- `geometry/facade.ts`: `ground.fall` (the level at u = 0 and its change per metre across),
  `facadeGroundAt`; the silhouette is cut at the sloped line. `geometry/section.ts`: `ground.fall`
  along the line and `sectionGroundAt`; the earth, the dug part, the ground line and the retaining
  walls read it. `geometry/groundPlane.ts`: `tilt`, the gradient the 3D sheet is laid on.
- `packages/viewer`: the facade and section pictures draw the sloped ground line and earth;
  `Ground3D` tilts the sheet. They draw what the core gives, computing nothing.
- `packages/floorplan/src/rooms/ground.ts` and `rooms/site.ts`: the `ground` line's new forms,
  read and written back. The rooms-text compiler (`compile.ts`) is not touched.
- `packages/cli`: `grid_set_site` takes `ground_north` … `ground_west`, `slope` and `toward`, and
  `ground_edges`; `edit/site.ts` writes them; the step in at an entrance (`access.ts`,
  `brief/lines.ts`) reads the ground at the door. The facade and section answers say the ground
  falls and by how much.
- Words in `messages/en.ts` and `es.ts`.

## Done

- `geometry/__tests__/groundSurface.test.ts`: sides, a fall, a street edge, a mixed set off one
  slope said with its figure, nothing stated gives null.
- `geometry/__tests__/groundSlope.test.ts`: a walk-out chalet (both floors ground floors, in the
  footprint and the storeys, height from the low side); a hillside house (the window dug into
  the hill named, the garden door not; the terrace door over the garden named as above the
  ground and not a way out); a terrace along a falling street (every door read against its own
  street level); a car park under a falling street (its openings below the street named by
  their depth at each wall); a flat `ground` unchanged.
- Facade, section and 3D ground tests for a slope; rooms text read and written back;
  `grid_set_site` sets and removes the fields.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on floorplan, rules, viewer and cli
  with the excludes, `ownWords.test.ts`, `contract.test.ts`, and `npm run scoreboard` no worse.
