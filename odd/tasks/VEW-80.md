# The plan's geometry as data

## Outcome

- `grid export --format geojson` and `--format json` (and `grid_export format=geojson|json`) write
  the plan's geometry as data a program reads without working anything out: every floor in one
  frame (the plan's own x and y, in metres, y up, the same on every floor), each part tagged with
  its floor, the floor's level and its elevation. A floor named writes that floor alone, and
  `floor all` one file per floor, as the other formats do.
- Each room carries its outline and holes as coordinates, a point on its floor (`centre`), its
  centroid and its net area (the area `grid_areas` and `grid_find` give). Each door, window and
  doorless opening carries its centre on the wall, the direction along its wall and across it,
  its hole as a polygon, its width, its clear width (the one `grid_measure what=access` and the
  brief read), the rooms on each side, its sill and height, its kind, hinge and swing, the room it
  opens into and the floor its leaves sweep as polygons. Each wall carries its solid runs as
  polygons (the openings taken out), its centre line, thickness, height, kind and whether it is
  glass. Each fixture, piece of furniture and point carries its footprint, its centre and its
  room. Every part carries its facts of the person's own.
- `grid_find`, `grid_count` and `grid_fields` know `polygon`, `centre`, `centroid`, `clear width`,
  `glazed` and `door state` as fields: a part's geometry is asked for by name, never refused, and
  the glass walls and doors are found with `glazed = yes`.
- A door's state (normally open, closed, automatic, held open) and a keep-out zone are facts the
  person keeps, set with `grid_set_facts` (`door state`, `keep out`): Grid checks nothing against
  them and writes them into the data as `state`, `automatic` and `keepOut`.
- `docs/plan-data.md` gives the frame, every member and its meaning; the GeoJSON's coordinates are
  said to be the plan's metres, not longitude and latitude.

## Design

- `packages/cli/src/export/planData.ts` (new): `DATA_FORMATS`, `planData(survey, floors)`, the
  record, and `planDataText(record, format)`, its text. It reads the survey every measure reads
  (rooms and their outlines, an opening's sides, `doorClearanceOf`), each floor's drawing
  (`buildFloorPlan`, the same openings, walls and items the views draw) and the core's own door
  sweeps (`doorSweeps`), an arc traced with `curvePieceCount`, the pieces a curved wall is traced
  with, so no new tolerance is needed. Its parts are listed in id order, so the same plan writes
  the same bytes. The geometry of one part is `partGeometry.ts` beside it, which the query reads
  too, so `grid_find` and the export never give two answers.
- The record is Grid's own (`json`); `geojson` writes the same members as a FeatureCollection:
  a room a Polygon with its holes, a wall a MultiPolygon of its runs, an opening the Polygon of
  its hole, an item its footprint, each feature's `properties` the record's members. The frame is
  a foreign member, `grid`, beside `features`.
- `packages/cli/src/command/export.ts`: the export formats are the core's four and the two data
  formats; `exportFile` hands a data format to `planData` and keeps the core's `leftOut`, `empty`
  and `floors` reading, so a data file is refused, named and split by floor as every other file.
  The core's exporters and `compile.ts` are not changed. `--scale`, `--no-roofs`,
  `--arc-segments` and `--date` stay refused for formats they do not apply to.
- `packages/cli/src/quantities/query.ts`: the fields `polygon`, `centre`, `centroid` (geometry,
  shown as numbers, which only `is set` and `is missing` test and nothing groups or sums),
  `clear width` (a length), `glazed` (yes or no) and `door state` (text, the fact). Their words
  are keys of the message files. A fact the data reads (`door state`, `keep out`) is not shadowed
  by the field that reads it.
- No new convention in `types/floorplan.ts`: the state and the keep-out zone stay facts.

## Done

- `packages/cli/src/export/__tests__/planData.test.ts`: a two-floor plan with a door, a window,
  a sliding door, an item, a glass wall type and facts: the rooms' polygons, centroids and areas,
  the door's centre, direction, hole, clear width, sides, sill and swing polygon, the walls' runs,
  the item's footprint, both floors in one frame with their elevations, keep out and door state,
  the GeoJSON's features, and the same bytes for the plan written in another order.
- `packages/cli/src/mcp/__tests__/planDataExport.test.ts`: `grid_export format=geojson` writes the
  file and answers as the other formats do; `floor` writes one floor; a refused option is named;
  `grid_find fields=[centre, polygon, clear width, glazed, door state]` answers them;
  `where=["centre = 1"]` is refused with the tests that apply.
- The tool and command tests that list formats and fields, `ownWords.test.ts`, the message
  tests and `tolerances.test.ts`; `npm run build`, `typecheck`, `lint`.
