# VEW-33: a storey's walls meet the slab over them

## Outcome

Under another floor, a storey's top is that floor's slab. A basement or a car park whose walls,
by the heights and elevations the plan states, stop short of the slab of the floor over it is no
longer drawn with a white band through every wall: in a section and in a facade, its full-height
walls rise to the slab's underside, and the section lists what it drew that the plan does not
state. `grid check` says it, once per pair of floors: the walls of a floor stop so far under the
slab of the floor over it (`floor/gap-under-slab`), or rise so far past that floor's level, into
the storey above (`floor/walls-past-floor`). Each line names both floors and the figures, and the
fix: a wall height or an elevation that meets the slab. A plan that states nothing, or whose
levels meet, gets no line and draws as before.

## Design

- `packages/floorplan/src/geometry/elevations.ts`: `wallTopsUnder(plan, envelope, elevations)`,
  one rule for both drawings. For a wall of a floor, what is over it is the lowest underside,
  above the wall's foot, of every slab of another floor (and its sunken parts) and every flat roof
  Grid lays (`planEnvelope`) whose pieces hold the middle of the wall on plan. Where that underside
  lies above the wall's top, a wall at its storey's full height (its floor's tallest drawn wall,
  or one whose height nothing states) rises to it. A lower wall (a dwarf wall, a parapet), a wall
  through floors (C19) and a wall under a sloped roof keep their own tops. The envelope is a type
  import only, so no module cycle is added.
- `section.ts`: the cut rings at a wall's top and its faces beyond the cut rise to that top. A
  new assumption, `wall-top`, lists each floor's raised walls, what is over them and by how much,
  and marks the raised strips (tinted and dashed, as every assumption is), not the whole wall.
- `facade.ts`: a wall's face along the outline rises the same way, where its top is level (a
  roof the floor states keeps its own profile).
- `stacking.ts` (outside the card's three files, kept small): the check reuses the pairs
  `stackingIssues` already finds, each floor and the floors under it, and sets the tallest drawn
  wall of each lower floor against the underside of the upper floor's slab (its stated slab, else
  `SLAB_THICKNESS`), from `floorElevations`. It runs for a floor marked `overhang: "meant"` too:
  that mark is about outlines, not heights. The words live in `messages/en.ts` and `es.ts`; the
  codes get their catalogue entries in `packages/rules/src/result/catalogue.ts`.
- Decision: walls that rise into the slab but not past the upper floor's level are not said.
  Stating each storey's walls floor to floor, slab included, is a common way to write heights,
  and the drawing joins the wall and the slab there. Only a wall past the slab's top stands in
  the storey above.
- Decision: the two lines are warnings, never errors: the drawing is still read and drawn.
- Decision: the floor's own flat roof is part of the drawing rule, since a floor stating a height
  its walls do not reach drew the same band under it, but not of the check, which the card
  limits to another floor over it.
- No new convention in `types/floorplan.ts`. Tolerance: `sameFloorLevel`, from the table.

## Done

- Tests that fail before: a car park under a ground floor, by stated elevations, cuts its walls
  up to the slab's underside, its facade walls reach it, and the section lists the raised walls;
  `validatePlan` gives `floor/gap-under-slab` for it and `floor/walls-past-floor` for walls that
  pass the upper floor's level, and neither for walls that meet or run into the slab, nor for a
  plan with nothing stated; a dwarf wall keeps its height.
- `changes/VEW-33.md` with both codes' rows; `docs/plan-file.md` says the check.
- `npm run typecheck`, `npm run lint`, the floorplan, rules and viewer test folders,
  `ownWords.test.ts`, `contract.test.ts`, and `npm run scoreboard`.
