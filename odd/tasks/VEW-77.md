# VEW-77: openings on curved walls follow the curve

## Outcome

A window or door on a curved wall (C21) is drawn and built along the curve, not as a straight
slab across its chord:

- In plan, a window's two face lines and its glass follow the wall's faces round the curve, and
  the gap it leaves is filled along the curve, edge to edge, so a wide window in a bay no longer
  flattens it.
- In 3D (the view, the OBJ and the GLB, which all take the scene), the lintel and the sill over
  and under an opening on a curve follow the curve in facets, as the solid wall does, and a
  window's frame and glass are split into the same facets, each inside the wall's faces. A
  door's leaves stay one straight piece across the chord, since a leaf is rigid and swings.
- An opening may run past the end of its wall onto the next wall when the two carry on as one
  smooth run: they meet end to end with no other wall at the joint, turn by no more than
  `smoothRunTurn` there, and are as thick and as high and both solid or both dividing lines. Its
  `offset` and `width` are measured along the run from its own wall's start. So a 0.9 m door
  fits on an outline of many short curved walls, and a window centred where two arcs of an oval
  meet crosses the joint. Each wall of the run leaves its gap; the opening is drawn once.
- An opening on a whole circle (a curved wall whose start and end are one point) may straddle
  the point where the circle starts: an `offset` plus `width` past the circle's length carries on
  round from its start, and a negative `offset` is measured back from it. Only an opening wider
  than the whole circle is refused.

## Design

- `packages/floorplan/src/geometry/openingRun.ts` (new): the smooth run an opening lies along.
  `smoothNext` finds the wall that carries a wall on past one end; `openingReach` lists the
  stretches of each wall an opening covers (none past the run, so validation can refuse what does
  not fit); `openingAxis` the points along the axis from edge to edge with the normal at each
  (the curve's stations on a curved wall), the chord between its edges and their length; and
  `runGuests` the copies of an opening clipped to each further wall of its run, for the code that
  cuts gaps. The copies keep the opening's id and its own `wall`, so a caller that draws the
  opening once skips them (`opening.wall !== wall.id`). No change to the plan's schema.
- `wall.ts`: `wallParts` on a whole circle splits an opening past the circle's length (or before
  its start) into two spans, one each side of the start, so the gaps and lintels are right
  there; `openingChord` already carries round.
- `validate.ts`: `opening/out-of-wall` holds an opening to its run (or to the circle's whole
  length), not only to its wall; `opening/overlap` sees an opening that runs onto a wall beside
  the wall's own openings. No new code.
- `floorplan.ts`: each wall leaves the gaps of its own openings and of those that run onto it;
  a `PlanOpening` gives the chord across its whole run (`from`, `to`, `normal`) and, when it is
  on a curve or crosses a joint, `path`, the points along the axis with their normals.
- `openingSymbol.ts`: a window with a `path` draws its faces, glass and panes along it, one line
  per facet. A door keeps its straight symbol on the chord.
- `scene3d.ts`: `curvedWallPieces` follows the curve's stations for lintels and sills too;
  `sceneOpening` places a window's boxes facet by facet along the path, and a door's on the
  chord of its whole run; the walls of a run cut the gaps of the openings that run onto them.
- `packages/viewer/src/canvas2d/strip.ts`: `openingStrip`, the gap's fill along the path when
  there is one; `picture/scene.ts` draws the gaps with it.
- `tolerances.ts` and `docs/tolerances.md`: `smoothRunTurn`, 5 degrees: the most two walls may
  turn where they meet and still carry one opening across the joint. A piece traced at Grid's
  fixed turn of 2.5 degrees is well inside it; a corner is far outside it.
- C21's text in `types/floorplan.ts` says that a window's hole follows the curve and a door's
  leaf is straight across the chord, and that an opening may run on along a smooth run and round
  a whole circle's start. No new convention and no new number.
- Not here: the rooms-text compiler (another change owns it), the GLB writer and the eye camera.
  The IFC export cuts its void in the opening's own wall only.

## Done

- `geometry/__tests__/openingRun.test.ts`: the run is found across arcs that meet smoothly and
  not across a corner, a T-junction, a change of thickness; a 0.9 m door on a ring of short
  curved walls validates and leaves a gap in each wall it crosses; a window over the seam of a
  whole circle validates and the circle has two gaps either side of its start; one wider than the
  circle is refused.
- The plan drawing: a window on an arc has a `path` whose points lie on the curve; its symbol's
  face lines lie on the wall's faces (within a millimetre); a door's symbol is unchanged.
- The scene: a wide window's glass boxes all lie between the wall's two faces; the lintel over a
  curved opening is in several pieces, each on the curve.
- The viewer's strip follows the path.
- Checks: build, typecheck, lint, vitest on the folders changed, the scoreboard.
