# LVL-20: sloped roofs cut in sections, and walls that meet them

## Outcome

On a floor that states a sloped roof (LVL-6: mono-pitch, gable or hip), a section shows the roof as
it is built and the walls as the roof leaves them, so the head height in a loft can be read off the
drawing:

- the roof is cut along its slopes, a band as thick as the roof following its underside from the
  eaves to the ridge, never a flat slab at the eaves; the walls under it, cut and seen beyond, stop
  at the roof's underside over their line, so a gable end is a gable and no wall stands above the
  roof;
- a roof may list box and gable dormers; the section cuts them, and the headroom bands count the
  floor under them;
- the rooms under the roof are given their headroom on the line (the stretches with at least
  1.5 m and at least 2.2 m over them, Grid's own bands) and one height, the same `grid_measure`
  gives, and the picture draws the bands;
- the section's `roofs` list gives each roof's shape, pitch, eaves and ridge levels, and the
  picture marks the eaves and the ridge.

An outside wall under a stated roof meets it. A wall stated `exterior` rises to the roof's
underside over its line whatever height it states (as the facade drew it since VEW-61), so a gable
end is closed by default in the 3D model, the IFC and the take-off as well as in the drawings, and a
mono-pitch extension's side walls no longer stop under the roof. A wall on the building's outside
that is not stated exterior keeps its height, and `grid check` names the gap over it
(`wall/under-roof`). `grid_measure what=wall` gives a wall's height along its length: where its top
turns, its lowest and highest points, and whether the roof cut or raised it.

## Design

- `packages/floorplan/src/types/floorplan.ts`: `DormerSchema` replaces the `dormers: unknown[]`
  placeholder of the roof (LVL-6's own field, no new convention): `id`, `shape` (`box` or
  `gable`), `at` (the middle of its front on plan), `width` (across its front), `height` (above
  the floor's level: a box dormer's flat ceiling, the top of a gable dormer's sides), and optional
  `depth` (on plan, up the slope from its front; unstated, until it meets the roof) and `pitch` (a
  gable dormer's own; unstated, the roof's). A file that wrote anything else under `dormers` is
  refused by the schema with the field named; none was ever drawn.
- `packages/floorplan/src/geometry/roofs.ts`:
  - `dormerPlace`: a dormer on the plane of the roof its front stands on, as a rectangle running up
    that slope, with its planes (a box dormer one level plane, a gable dormer two from its sides to
    its ridge); or why it has none (outside the roof, on a flat roof or across two slopes, no higher
    than the roof at its front).
  - `roofUnderside(shape, p)`: the roof's underside over a point, the dormers raising it where they
    stand; `undersideAlong(shape, a, b)`: that underside along a line, as straight pieces each under
    one plane, for the section. `regionsAtLeast` adds the dormers' floor to a headroom band.
  - `wallTopProfile` (one rule for every reader: the views, the 3D model, the IFC, the take-off and
    the checks): a wall stated `exterior`, standing on its own floor and not round outdoor space
    alone (VEW-35), is read as rising to the roof's top, then cut to the roof, so its top is the
    roof's underside over its line whatever height it states. Every other wall is as before: the
    lower of its height and the roof. Dormers do not cut or raise walls yet.
- `packages/floorplan/src/geometry/section.ts`: a wall's cut and its faces beyond take the top its
  profile gives along its line (a face is its rectangle under that top); the roof of a floor that
  states a sloped one is cut as quadrilaterals along `undersideAlong`, a vertical strip where a
  dormer's front rises from the slope, and its edges beyond are drawn along its slope. The `roof`
  note says the roof is drawn on its slope; a new `wall-roof` note lists the outside walls raised
  past the height they state. `roofs` gains `shape`, `pitch`, `eaves` and `ridge`; a room under a
  stated roof takes `roomHeadroom`'s highest height (the one `grid_measure` gives) and `headroom`,
  its stretches on the line with at least each band over them.
- `packages/viewer/src/picture/section.ts`: the eaves and ridge levels on the right; each headroom
  band a dashed line over the room's floor at its height across its stretch, with its figure.
- `packages/floorplan/src/geometry/validate.ts`: `wall/under-roof` (warning): a solid wall on the
  building's outside, not stated exterior, under the roof's rectangle, whose top stops more than
  `joint` under the roof's underside somewhere along it; it names the wall, its height, the
  underside's range and the gap. `floor/dormer-misplaced` (warning) for a dormer with no place. The
  dormers' own line, `floor/dormers-not-drawn`, now says they are drawn in sections and counted in
  headroom, and not yet in 3D, elevations, the exports or the take-off. An opening in a raised wall
  is checked against the wall's top as raised (its peak), not the height the wall states.
- `packages/cli/src/quantities/measure.ts` and `grid_measure what=wall`: the wall's `top` (the
  points where it turns, along it), `low`, `high` and `cut` (`roof`, `raised` or null), in words
  through the message file.
- Words in `packages/floorplan/src/messages/en.ts` (and a draft in `es.ts`); catalogue entries for
  the two new codes; docs in `docs/plan-file.md` (dormers, the wall rule) and
  `docs/commands.md` (the section); the fragment `changes/LVL-20.md`.

Decisions:

- The rise is by the stated kind, not the worked-out one: it is what the roof's own frame reads
  (`roofFrame` stands the eaves on the exterior walls), it is cheap and the same in every reader,
  and a plan written rooms first states every outside wall's kind. A wall the plan leaves
  `interior` on the outside is the case the check names, so nothing is raised that the plan did
  not say is outside.
- A wall raised past its stated height keeps that height in the file; only its top as read
  changes, as a wall that states none already rose to the roof (LVL-6).
- Not built: dormers in the 3D model, the facade, the IFC and the take-off (the check still says
  so); dormers cutting walls; the roof's sloped surfaces seen beyond the cut (only its edges);
  valleys over an L or a T (LVL-6's "not built").

## Done

- `packages/floorplan/src/geometry/__tests__/roofSection.test.ts`: a gable loft cut across its
  ridge is cut as a slope from the eaves to the ridge, with no roof part flat at the eaves and no
  wall above the roof; the gable end beyond is a pentagon; cut along the ridge the roof is level at
  the ridge; a hip and a mono-pitch roof are cut on their slopes; a box and a gable dormer raise
  the cut and the headroom; the rooms' headroom stretches and height; the `roofs` entry.
- `packages/floorplan/src/geometry/__tests__/roofs.test.ts`: walls stated exterior at the eaves
  rise to close the gable (profile, peak), a mono-pitch extension's side walls meet the roof,
  interior walls keep their height; `wall/under-roof` names the gap over a wall left interior on the
  outside; dormers' places and problems; `roomHeadroom` counts a dormer.
- `packages/viewer/src/picture/__tests__/section.test.ts`: eaves and ridge marks, headroom bands.
- `packages/cli` measure test: `grid_measure what=wall` gives the top along a gable end.
- Updated tests whose figures change because a gable end now closes.
- `npm run typecheck`, `npm run lint`, the floorplan, viewer, cli and rules packages' tests,
  `ownWords.test.ts`, `contract.test.ts`, and `npm run scoreboard`.
