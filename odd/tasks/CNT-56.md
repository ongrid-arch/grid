# CNT-56: measure the site per building, with density and the floor area ratio always given

## Outcome

An agent asking `grid_measure what=site` about a site of several buildings (a house with a
garden studio and a garage, a campus, four blocks on one plot) gets each building measured on
its own and the whole site beside it, and never has to work a density figure out by hand:

- Each face of each building is measured square to it, along its outward normal, to the edge of
  the boundary in front of it, and the tape stops at the first other building it meets: the face
  is then said to be that far from that building, with the edge beyond it named. A distance never
  passes through another building, and no building is measured against the others merged.
- Every face line, edge line and figure names the building it is about. A whole-site edge names
  the building nearest it.
- A curved face (a bay, a round tower) is one face, reported once with its radius and the ways it
  turns through, not one line per straight piece it is drawn with.
- The buildings are measured to each other: the least distance between each pair.
- For the whole site and for each building, these are always given, measured or with why not:
  the plot coverage, the gross external area of the floors at or above the ground floor, the floor
  area ratio, the homes, the homes per hectare and the parking per home. An outbuilding is its own
  building on the same ground, so its area, coverage and parking are its own and are left out of
  the house's figures (they stay in the whole site's).
- Floors in no named building, on a plan that names some, are measured together as one more
  building, named as the floors in no building.

A plan that names no building is answered as before, plus the figures, and its curved faces
once each.

## Design

- `packages/floorplan/src/geometry/site.ts` (the core, which every site answer reads): per-building
  faces with the other buildings' outlines as stops; a face records the building, what it is
  measured to (`edge` or `building`), the building it stops at and the edge beyond it; curved runs
  of the outline joined into one face (`curve`: radius, pieces, the ways it turns from and to);
  the whole-site edges and faces, on a plan naming buildings, are the buildings' own, each
  edge's nearest building named; `apart`, the least distance between each pair of buildings; the
  floors in no building measured as one more building. This file is outside the brief's stated
  area (the CLI only words what the core measures), and it is the smallest place the geometry can
  change; it is named in the report.
- The curved runs are found by the same rule the dimensions use for a room's curved sides
  (VEW-79, `curvePieceTurn` and `curveFit`), so no new tolerance: `curveRuns` in `dimensions.ts`
  is exported and takes any outline's sides. Its two tolerances' wording in the table says they
  now also decide a site face.
- `packages/cli/src/quantities/siteFigures.ts` (new): the always-given figures, for the whole site
  and each building. Homes are what the floors state (`floors[].homes`), else the flats the plan
  lists; parking is what the floors state (`floors[].parking`), else the bays drawn. Each figure is
  null with its reason when it cannot be measured. Homes per hectare are over the plot's area.
- `packages/cli/src/quantities/site.ts`: the lines and data; new sentences in the message files
  (`en.ts`, `es.ts`), so the own-words counts do not rise.
- `docs/areas.md`: the site section says the per-building measure and the figures.

## Done

- `packages/floorplan/src/geometry/__tests__/sitePerBuilding.test.ts`: a house, a studio between
  it and the rear edge, and a garage: the house's rear face stops at the studio and names it; a
  face with nothing in front reaches its edge; the edges name the nearest building; the
  buildings' distances to each other; a round tower's face is one face.
- `packages/cli/src/quantities/__tests__/siteFigures.test.ts`: coverage, gross external area,
  floor area ratio, homes, homes per hectare and parking per home for the site and each
  building; a plan stating no homes says why; the studio's parking is not the house's.
- Checks: build, typecheck, lint, vitest on the folders changed, the own-words and tolerance
  tests, the scoreboard.
