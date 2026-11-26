# 2026-11-26: sloped roofs cut in sections, dormers, and outside walls that meet the roof (LVL-20)

## For people

- A section through a floor that states a sloped roof (mono-pitch, gable or hip) cuts the roof
  along its slopes, from the eaves to the ridge, and the walls under it up to the roof: a loft is
  no longer drawn as a box with a flat slab at its eaves and its gable walls standing above it.
  The picture marks the eaves and the ridge, and draws each room's headroom bands (1.5 m and
  2.2 m, Grid's own) where the room has that much height (LVL-20).
- A roof can list box and gable dormers (`floors[].roof.dormers`): sections draw them and the
  headroom counts the floor under them. The 3D model, elevations, exports and take-off do not show
  them yet, and `grid check` says so.
- An outside wall (stated `exterior`) under a roof its floor states rises to meet the roof whatever
  height it states, in the 3D model, the IFC, the take-off and the checks as in the drawings: a
  gable end is closed by default, and a mono-pitch extension's walls no longer stop short of their
  roof. A wall on the outside that is not stated exterior keeps its height, and `grid check` names
  the gap over it.
- `grid_measure what=wall` gives a wall's height along its length under such a roof.

## For agents

- `grid_view kind=section` (and `planSection`): under a sloped roof the floor states, the roof's
  cut parts follow its underside and dormers (a band 0.25 m thick, square to the slope), walls are
  cut and seen up to the top the roof leaves them, and roof edges beyond are drawn along the slope.
  `roofs[]` entries gain `shape`, `pitch` (degrees), `eaves` and `ridge` (levels of the underside)
  for a roof the floor states; `level` stays the top of the roof's cut. A room under a sloped roof
  that states no height has `height` = its highest headroom (the figure `grid_measure what=room`
  gives) and `headroom`: `[{ height, from, to }]`, the stretches across the section with at least
  each band over its floor. The `roof` note for a sloped roof now says it is drawn on its slopes.
  New `assumed` kind `wall-roof` (marked): the outside walls cut past the height they state, up to
  the roof.
- The wall rule, for every reader (`wallTopProfile`, the 3D model, the IFC, `grid_takeoff`, the
  estimate, the opening checks and the storey's height): a solid wall stated `exterior`, on its own
  floor and not round outdoor space alone, under a roof its floor states, rises to the roof's
  underside over its line. Its stated `height` is kept in the file. An opening in such a wall is
  checked against the wall's top as raised (`opening/too-tall` reads the wall's peak).
- `floors[].roof.dormers`: each `{ id, shape: "box" | "gable", at: [x, y] (the middle of its front),
  width, height (above the floor's level: a box dormer's ceiling, the top of a gable dormer's
  sides), depth? (on plan up the slope; unstated, until it meets the roof), pitch? (a gable
  dormer's own; unstated, the roof's) }`. A dormer written in any other form is refused by the
  schema, naming the field. `roomHeadroom` (the headroom bands of `grid_areas` and `grid_measure`)
  counts the floor under a dormer.
- `grid_measure what=wall`: the answer gains `cut` (`"roof"`, `"raised"` or null), `top` (the points
  where its top turns, `{ at, height }`, metres along it from its start; null when level), `low` and
  `high`, and the text says them.
- New code `floor/dormer-misplaced` (`worth-a-look`): a dormer whose front does not stand inside
  the roof on one sloped plane, higher than the roof there, or that runs back past a ridge or a hip
  or off the roof; it is left out. `floor/dormers-not-drawn` now says the dormers are drawn in
  sections and the headroom only; its `says` and `needed` changed. `opening/missing-wall`'s words for
  a wall named like the roof now say a dormer is stated in the floor's roof.
- New code `wall/under-roof` (`worth-a-look`): a solid wall on the building's outside (its sides
  worked out as outside), not stated exterior, under the roof's rectangle, whose top stops more than
  `joint` under the roof's underside somewhere along it. The line names the wall, its height, the
  underside's range over it and the largest gap.

## Codes

| `floor/dormer-misplaced` | {thing} has a dormer that does not stand on one slope of its roof | a dormer whose front stands on one slope of the roof, higher than the roof there, running back up that slope inside the roof |
| `wall/under-roof` | {thing} stops under the roof over it | an outside wall that meets the roof over it |
