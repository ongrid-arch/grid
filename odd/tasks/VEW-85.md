# VEW-85: a site plan view

## Outcome

An agent asked for a site plan, a lot map or a plan of the plot gets a real one from Grid:
`grid_view kind=site` and `grid draw --site` draw the plot seen from above, with every building
of the plan on it (not just the lowest floor's), each footprint in solid poche with its name,
its storeys and its height written on it, the site's things with the labels the person gave
them, the set-back lines the person asked for, the street edges marked, a scale bar and the north
arrow. The picture is framed to the whole site: on a plan of many buildings it frames them all
and the plot, never one building's outline as if it were the plot.

Any floor plan can also show the site faint under it (`grid_view kind=plan` with `with_site`,
`grid draw --with-site`), so an upper floor's evacuation map shows where the assembly point is
across the street.

## Design

- `packages/floorplan/src/geometry/sitePlan.ts` (new, pure): `sitePlan(plan)` works out what a
  site plan draws from what the core already measures: the plot and its things (`planSite`), each
  building's footprint (`siteMeasures(...).buildings`, or the one footprint on a plan that names no
  buildings), its storeys and height (`buildingHeights`, `planStoreys`, `buildingHeight`), where
  its words go (`poleOfInaccessibility`), each set-back line (the boundary edge moved in by the
  person's figure, trimmed where it meets its neighbours' lines), the street edges with the way
  out of the plot, the context shapes drawn round the plan, and the frame round all of it. Nothing
  is drawn here.
- `packages/viewer/src/picture/sitePlan.ts` (new): `sitePlanPicture(plan, options)` draws it
  through the plan's looks: the context dashed, the site's things and boundary as the ground
  floor's plan draws them (`siteNodes`), the set-back lines dashed, each footprint filled with the
  look's outside-wall colour, its words over it with a paper halo, the word for a street outside
  each street edge, a scale bar bottom left and the north arrow when the plan states north.
  `sitePlanNodes` is also what `planPicture` draws faint under a floor when `site: true` is
  asked (`PictureOptions.site`), framed with the floor.
- `grid_view kind=site` (in `mcp/readTools.ts`, its answer in a new `mcp/siteAnswer.ts`) and
  `grid draw --site` / `--with-site` (`command/draw.ts`, `command/main.ts` for the flag reading).
  The answer lists the buildings drawn with their storeys and heights, the buildings that could
  not be drawn and why, the labelled things, the set-back lines and the scale bar's length.
- Words on the drawing go in the message files (`drawing.site.*`).
- Decisions:
  - Street names: the plan holds none (C13 has only the street edges' numbers). Storing them
    would change the schema in `types/floorplan.ts`, outside this change's area, so the street
    edges are drawn heavier and labelled with the word for a street, and the report says so.
  - North: the arrow is drawn only when the plan states north, as the floor plan does; the answer
    says the top of the drawing is taken as north otherwise. No north is invented.
  - The scale bar's length is a round figure (1, 2 or 5 times a power of ten) near a fifth of the
    drawing's width: a drawing choice in pixels, not a tolerance.
  - The footprint is the core's: enclosed floors at or above each building's ground floor; open
    outdoor space is no building, as in `grid_measure what=site`.
  - A set-back line runs inside the plot parallel to its edge at the person's own figure; Grid
    adds no figure of its own.

## Done

- `packages/floorplan/src/geometry/__tests__/sitePlan.test.ts`: every building of a plan of
  several gets its footprint, name, storeys and height; the frame holds the plot and all
  buildings; set-back lines lie at the person's figure inside the plot; a plan with no buildings
  is one footprint.
- `packages/viewer/src/picture/__tests__/sitePlan.test.ts`: the picture draws each building in
  poche with its words, the things' labels, the set-back lines, the street word, the scale bar
  and the north arrow; a floor plan with `site: true` draws the site faint under an upper floor.
- `packages/cli/src/mcp/__tests__/siteView.test.ts`: `grid_view kind=site` answers with the
  buildings and the picture; `kind=plan` with `with_site` frames the site; stray arguments are
  refused; `grid draw --site` writes the SVG.
- `npm run build`, `npm run typecheck`, `npm run lint`, the touched folders' tests, the tool
  server's tests, the own-words test and `npm run scoreboard`.
