# VEW-12: roof planes drawn in elevation as roofs

## Outcome

On a facade, a sloped roof's plane that turns toward the viewer reads as a roof, never as a
blank box that looks like one more storey. The plane carries its covering, drawn as courses
along its eaves, and its lines are named for what they are: the eaves at its foot, the ridge at
its top, a hip where it meets another plane on a slope, a verge where it ends at a gable, and
an abutment where it meets the building above. Each band along a roof's edge says which edge
it is, and the eaves carry a gutter. An agent reading `planFacade` gets those lines; a person
reading the picture sees them.

## Design

- `packages/floorplan/src/geometry/facade.ts` (the core): every face gains `edge` (for a band
  along a sloped roof's edge: `eaves`, `ridge`, `hip`, `verge` or `abutment`, else null) and
  `roofLines` (for a roof plane: each of its edges, with its kind, in `[u, z]`; else empty).
  An edge is classified on the plan, from its two ends' heights on the plane and where it lies:
  - level and at the plane's lowest: eaves; level and higher: ridge (the top of a mono-pitch
    roof too);
  - sloped and on the floor's outline: verge; sloped and inside the roof: hip;
  - on the roof's edge but not on the floor's outline (the roof cut by a floor above): abutment.
  A level roof plane (a flat roof the floor states, or the flat top of a ridge-limited roof)
  gets no edge kinds. No new tolerance: the checks use `facadeOnFace` and `noLength`.
- `packages/viewer/src/picture/facade.ts` (the drawing): a roof plane is drawn with its covering,
  level lines clipped to the plane by the core's `hatchLines` (the same as a wall material's
  hatch), at a spacing on paper (1.5 mm in a paper look, 6 px on screen) like the other hatches;
  each roof line drawn and named `facade-roof-<kind>` (ridge and hips with the near pen, as the
  roof's main lines); each eaves band gets a gutter, a band 0.12 m deep at the top of the fascia,
  drawn in the band's own group so a nearer face still hides it.
- Not built: an eaves overhang. The plan states none: the roof ends at the outside face of its
  walls, and the 3D model, the section and the IFC read it that way. Drawing one only in
  elevation would make the facade disagree with them; stating one needs a new field on `Roof`,
  a convention of `types/floorplan.ts`, whose number is for the coordinator to give. Left for a
  person to decide.
- Not changed: the section code, the roof's own geometry (`roofs.ts`, `envelope.ts`).

## Done

- `packages/floorplan/src/geometry/__tests__/facade.test.ts`: a two-storey gable house from the
  south has one roof plane with eaves, ridge and two verges, its eaves band says `eaves`; a hip
  roof's plane has hips; a roof under a floor above has an abutment; a flat roof's bands say
  nothing.
- `packages/viewer/src/picture/__tests__/facade.test.ts`: that house's south facade draws the
  plane's courses inside it, its ridge, verges and eaves, and a gutter on the eaves band.
- `npm run typecheck`, `npm run lint`, `npm test`, `npm run scoreboard`.
