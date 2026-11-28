# ARE-79: measures of the work, and the area figures a country quotes

## Outcome

- An agent asked "how deep is the extension", "how high are its eaves", "how much does it add",
  "how much garden is left" or "how far is it from the boundary" gets those numbers from Grid,
  for any country, as measures that apply no rule: `grid_measure what=work` on a plan whose parts
  carry phases. It gives, for the new parts against the building before the work:
  - how far the building reaches past its old outline on each side, by compass, and how wide the
    new part is there;
  - the eaves and the highest point of the new parts, above the ground: the lowest and the
    highest top of the new walls, and the highest point under the roof over the new rooms;
  - the floor added (gross external, before, after and the change) and the volume of the new
    rooms inside their walls, ceilings and roof;
  - the plot left unbuilt before and after the work, and its share of the plot;
  - the least distance from the new parts to each edge of the boundary, beside the building's
    before the work.
  Every line says it is a measure, and no line says whether permission is needed.
- `grid_areas` gives the figures people quote where the plan will be built, beside the net and
  gross ones, each with its rule in Grid's own words:
  - Spain: the useful area (the net, less floor with under the low headroom band over it), and the
    built area without and with the shared parts (each flat to the middle of its party walls and
    the outside face of its outer walls; with the common parts shared out by that built area).
  - The US: the living area under air above the ground, so a heated basement is not in the
    headline, beside the area under air with it.

## Design

- `packages/floorplan/src/geometry/workMeasures.ts` (new, pure): `workMeasures(plan)`. The
  building before and after the work is `planInState`; each footprint is `siteMeasures`' (floors
  at or above the ground floor, open outdoor space out). Depth past the old outline is read along
  the two axes of the old footprint's longest face, each way: how far the new footprint's extent
  passes the old one's, and how wide the added piece is across it; named by compass through
  `bearingOf`. Heights: each new wall's top (`wallTopProfile`, else its height) on its floor's
  level above the ground (`floorElevations`, `groundLevel`), and over each new room the highest
  point of its ceiling or roof underside (`roomHeadroom`). Volume: each new room's floor times the
  height over it, under the roof's planes where the floor states a roof (`volumeUnder`). The plot
  left is the boundary's area less the footprint before and after. Boundary distances are the
  least distance from the added footprint (after less before) to each edge.
  No new tolerance: a depth under `lengthEqual` is no depth.
- `packages/cli/src/quantities/work.ts` (new): words it, data and text, in the display's units;
  `WORK_RULE`. `grid_measure` takes `what=work` (`readTools.ts`: the enum, the description's one
  sentence, the branch).
- `packages/cli/src/quantities/localAreas.ts` (new): `localAreas(areas)` from `planAreas`' own
  figures, by the country the answer reads (`reader.country`): ES and US only. `grid_areas` adds
  `local` to its data and its lines before the net line.
- Words in `messages/en.ts` and a draft in `es.ts`.
- Decided: Grid names no law or standard for these figures; they are Grid's own reading of what
  is usually quoted, and the rule says a local rule may count differently (a covered terrace, for
  one, which only `outdoor_rules` counts). The shared parts are shared in proportion to each
  flat's built area, said as an assumption, since the plan holds no shares. "Above the ground" is
  `footprintFloors`, the floors at or above the ground floor.
- Decided: depth is measured on the old footprint's axes, not from a named rear wall, since the
  plan does not say which side is the rear; each side is named by compass and the agent says which
  one the person means.

## Done

- Core tests: a house with a new rear extension: its depth on one side only, its width, the
  eaves and highest points of its walls above the ground, its inside volume, the plot left before
  and after, and its distances to the boundary; a plan with no phases says so.
- CLI tests: `grid_measure what=work` text and data; refused arguments; `grid_areas` with
  country ES gives useful and built areas (with and without shared parts) on a plan of flats, and
  with US the area under air above the ground with a heated basement.
- Build, type check, lint, the touched folders' tests, `ownWords.test.ts`, `tolerances.test.ts`,
  the tool list's ceilings, the scoreboard.
