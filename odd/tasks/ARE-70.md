# ARE-70: a flat's front door onto the common landing is its way out

## Outcome

A flat drawn on its own, up in a building, leaves by its front door onto the building's common
landing. Grid reads it that way:

- `grid check` follows the way out of such a floor from the doors (and open sides) onto the
  common parts: every room is checked to reach one, and the floor is said to go on through the
  building's common parts, which are not drawn (`way_out_through_common_parts`), as a flat on the
  ground floor already is. It no longer says "no stair joins it to the ground floor" for a floor
  whose way on is onto the common parts, and no longer finds `no_stair` there.
- `grid_measure what=route to=outside` from a room of such a flat finds the way to the front door
  and says it ends on the building's common parts, which the plan does not draw: the way on from
  there is not followed. It is used only when no door to the open air at the ground is reached,
  as the check does. A body or trolley width is set against that way too.
- When the front door is in a wall nothing marks, so Grid reads it as a door to the outside high
  above the ground, the check's fix and the route's answer say in one line how to mark it: the
  wall as `separating` (a party wall, or a wall to the common parts) or `beyond: common`, for any
  number of walls in one `grid_set` call. The door is then the flat's way out.

Nothing is inferred: a door is onto the common parts only when the plan says so (C23).

## Design

- `packages/floorplan/src/geometry/rules/check.ts`: a group of floors that a stair joins to no
  ground floor, whose ways on reach the common parts (`graph.common`, or an open edge with
  `beyond: common`), is checked as one, from those ways (`routeFindings` with those floors as its
  start floors). Its `no_stairs` notice and `no_stair` finding go, its
  `way_out_through_common_parts` notice comes. Doors to the outside above the ground stay said.
- `packages/cli/src/quantities/measure.ts`: `wayGraph` also returns the ways onto the common
  parts. `routeBetween` to `outside`, when it finds no way out, looks again with those ways as
  the end: the last step goes into `common parts` (`COMMON_PARTS`) and the route carries
  `onto: 'common parts'`; the nearest of several is chosen by walked length as ARE-21 does.
- `packages/cli/src/quantities/use.ts`: `wideRoute` takes the same ways as the end when the
  route it measures ends on the common parts.
- `packages/cli/src/mcp/readTools.ts`: the route answer names the common parts, says the way on
  is not followed, and, when no way out is found and a door leads outside above the ground, says
  how to mark it. The tool's description is left as it is.
- Words in `packages/floorplan/src/messages/en.ts` (and the draft `es.ts`); the check's fix for
  `opening/door-out-above-ground` gains the marking.
- Docs: `docs/tool-server.md` (the route) and `docs/plan-file.md` (C23's reading).
- No new convention, no new code, no new tolerance.

## Done

- `packages/floorplan/src/geometry/__tests__/commonWayOut.test.ts`: a flat on a floor 9 m up with
  its front door in a separating wall, or a wall with `beyond: common`, or an open edge onto the
  common parts, has no `no_stairs` notice, a `way_out_through_common_parts` one, and a room cut
  off from the front door is found; a plain door there is still `door_to_outside_above_ground`;
  a drawn ground floor with such a flat and no stair has no `no_stair` finding.
- `packages/cli/src/quantities/__tests__/commonRoute.test.ts`: the route to `outside` ends on the
  common parts through the front door, with its walked length; a door to the open air at the
  ground is still preferred; `grid_measure` says it, sets a body against it, and says how to
  mark an unmarked front door up in the air.
- `npm run build`, `npm run typecheck`, `npm run lint`, vitest on the folders changed, the
  tolerances test, `ownWords.test.ts` and the result contract test.
